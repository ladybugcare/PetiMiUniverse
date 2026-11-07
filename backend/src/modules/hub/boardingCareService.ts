/**
 * Acesso a banco de Hotel & Creche: ficha/plano de cuidados, geração de tarefas,
 * configurações da unidade e capacidade. Regras puras ficam em boardingCare.ts.
 */
import { supabaseAdmin } from '../../config/supabase';
import { isMissingPostgrestRelation } from '../../utils/supabaseSchemaErrors';
import {
  buildPlanFromProfile,
  diffPlanTasks,
  generatePlanTasks,
  normalizePlanBlocks,
  normalizeProfileBlocks,
  type BlockStatusMap,
  type CarePlanBlocks,
  type CareProfileBlocks,
  type ExistingTaskRow,
  type RecreationWindow,
} from './boardingCare';
import { boardingLocalParts } from './boardingBilling';
import { boardingStayWindow, reservationOverlapsRange } from './boardingOperational';

export const BOARDING_MIGRATION_HINT =
  'Execute as migrações 123 a 130 de backend/database_migrations/petimi_hub (Hotel & Creche) no Supabase.';

export class BoardingHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function missingTable(err: { message?: string; code?: string } | null | undefined): boolean {
  return isMissingPostgrestRelation(err) || Boolean(err?.message?.includes('does not exist'));
}

// ─── Configurações da unidade ─────────────────────────────────────────────

export type BoardingUnitSettings = {
  unit_id: string | null;
  hotel_slots: number | null;
  daycare_slots_per_shift: number | null;
  checkout_cutoff_time: string | null;
  daycare_shifts: Array<{ key: string; label: string; start: string; end: string }>;
  recreation_windows: RecreationWindow[];
  recreation_capacity: number | null;
  overbooking_policy: 'warn' | 'block';
};

export const EMPTY_UNIT_SETTINGS: BoardingUnitSettings = {
  unit_id: null,
  hotel_slots: null,
  daycare_slots_per_shift: null,
  checkout_cutoff_time: null,
  daycare_shifts: [],
  recreation_windows: [],
  recreation_capacity: null,
  overbooking_policy: 'warn',
};

export function normalizeUnitSettings(row: Record<string, unknown> | null | undefined): BoardingUnitSettings {
  if (!row) return { ...EMPTY_UNIT_SETTINGS };
  return {
    unit_id: (row.unit_id as string | null) ?? null,
    hotel_slots: (row.hotel_slots as number | null) ?? null,
    daycare_slots_per_shift: (row.daycare_slots_per_shift as number | null) ?? null,
    checkout_cutoff_time: (row.checkout_cutoff_time as string | null) ?? null,
    daycare_shifts: Array.isArray(row.daycare_shifts) ? (row.daycare_shifts as BoardingUnitSettings['daycare_shifts']) : [],
    recreation_windows: Array.isArray(row.recreation_windows) ? (row.recreation_windows as RecreationWindow[]) : [],
    recreation_capacity: (row.recreation_capacity as number | null) ?? null,
    overbooking_policy: row.overbooking_policy === 'block' ? 'block' : 'warn',
  };
}

export async function loadUnitSettings(clinicId: string, unitId: string | null | undefined): Promise<BoardingUnitSettings> {
  let q = supabaseAdmin.from('hub_unit_boarding_settings').select('*').eq('clinic_id', clinicId);
  if (unitId) q = q.eq('unit_id', unitId);
  const { data, error } = await q.limit(1);
  if (error) {
    if (missingTable(error)) return { ...EMPTY_UNIT_SETTINGS };
    throw new Error(error.message);
  }
  return normalizeUnitSettings((data?.[0] as Record<string, unknown> | undefined) ?? null);
}

// ─── Ficha de cuidados ────────────────────────────────────────────────────

export async function loadCareProfileRow(clinicId: string, petId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_pet_care_profiles')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return null;
    throw new Error(error.message);
  }
  return (data as Record<string, unknown> | null) ?? null;
}

export async function loadCareProfile(clinicId: string, petId: string): Promise<CareProfileBlocks | null> {
  const row = await loadCareProfileRow(clinicId, petId);
  return row ? normalizeProfileBlocks(row) : null;
}

// ─── Plano da estadia ─────────────────────────────────────────────────────

export type ReservationRow = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  pet_id: string;
  guardian_id: string | null;
  hub_appointment_id: string | null;
  mode: 'hotel' | 'daycare';
  status: string;
  expected_check_in: string | null;
  expected_check_out: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  daily_rate_cents: number | null;
  created_at: string;
  space_id?: string | null;
  daycare_shift_key?: string | null;
  daycare_period?: string | null;
  hub_service_type_id?: string | null;
  [k: string]: unknown;
};

export async function loadReservation(clinicId: string, reservationId: string): Promise<ReservationRow | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReservationRow | null) ?? null;
}

export async function loadCarePlanRow(clinicId: string, reservationId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_boarding_care_plans')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('hub_boarding_reservation_id', reservationId)
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return null;
    throw new Error(error.message);
  }
  return (data as Record<string, unknown> | null) ?? null;
}

/** Garante o plano da estadia; nasce herdando a ficha do pet. Retorna null se a migração não rodou. */
export async function ensureCarePlan(reservation: ReservationRow): Promise<Record<string, unknown> | null> {
  const existing = await loadCarePlanRow(reservation.clinic_id, reservation.id);
  if (existing) return existing;
  const profile = await loadCareProfile(reservation.clinic_id, reservation.pet_id);
  const { blocks, block_status } = buildPlanFromProfile(profile);
  const { data, error } = await supabaseAdmin
    .from('hub_boarding_care_plans')
    .insert({
      clinic_id: reservation.clinic_id,
      hub_boarding_reservation_id: reservation.id,
      pet_id: reservation.pet_id,
      ...blocks,
      block_status,
    })
    .select('*')
    .single();
  if (error) {
    if (missingTable(error)) return null;
    // Corrida: outro request criou o plano primeiro.
    if (error.code === '23505') return loadCarePlanRow(reservation.clinic_id, reservation.id);
    throw new Error(error.message);
  }
  return data as Record<string, unknown>;
}

export function planBlocksFromRow(row: Record<string, unknown> | null): CarePlanBlocks | null {
  return row ? normalizePlanBlocks(row) : null;
}

export function planStatusFromRow(row: Record<string, unknown> | null): BlockStatusMap {
  return ((row?.block_status as BlockStatusMap | null) ?? {}) as BlockStatusMap;
}

// ─── Tarefas ──────────────────────────────────────────────────────────────

function taskWindow(r: ReservationRow): { start: string; end: string | null } | null {
  const start = r.checked_in_at ?? r.expected_check_in ?? null;
  if (!start) return null;
  if (r.checked_out_at) return { start, end: r.checked_out_at };
  if (r.expected_check_out) return { start, end: r.expected_check_out };
  if (r.mode === 'daycare') {
    const ymd = boardingLocalParts(start)?.ymd;
    return { start, end: ymd ? new Date(`${ymd}T23:59:00-03:00`).toISOString() : null };
  }
  return { start, end: null };
}

/**
 * Reconcilia as tarefas da estadia com o plano atual.
 * Executadas nunca mudam; pendentes são atualizadas, criadas ou removidas.
 */
export async function syncReservationTasks(
  reservation: ReservationRow,
  opts?: { plan?: Record<string, unknown> | null; settings?: BoardingUnitSettings },
): Promise<{ inserted: number; updated: number; deleted: number } | null> {
  if (!['reserved', 'checked_in'].includes(reservation.status)) return null;
  const planRow = opts?.plan !== undefined ? opts.plan : await ensureCarePlan(reservation);
  if (!planRow) return null;
  const window = taskWindow(reservation);
  if (!window) return null;
  const settings = opts?.settings ?? (await loadUnitSettings(reservation.clinic_id, reservation.unit_id));

  const desired = generatePlanTasks({
    plan: normalizePlanBlocks(planRow),
    start: window.start,
    end: window.end,
    recreationWindows: settings.recreation_windows,
  });

  const { data: existingRows, error: exErr } = await supabaseAdmin
    .from('hub_boarding_tasks')
    .select('id, plan_key, task_date, status, source, title, scheduled_for, details')
    .eq('clinic_id', reservation.clinic_id)
    .eq('hub_boarding_reservation_id', reservation.id);
  if (exErr) {
    if (missingTable(exErr)) return null;
    throw new Error(exErr.message);
  }
  const { toInsert, toUpdate, toDelete } = diffPlanTasks((existingRows ?? []) as ExistingTaskRow[], desired);

  if (toDelete.length) {
    const { error } = await supabaseAdmin.from('hub_boarding_tasks').delete().in('id', toDelete).eq('status', 'pending');
    if (error) throw new Error(error.message);
  }
  for (const u of toUpdate) {
    const { error } = await supabaseAdmin
      .from('hub_boarding_tasks')
      .update({ title: u.spec.title, details: u.spec.details, scheduled_for: u.spec.scheduled_for })
      .eq('id', u.id)
      .eq('status', 'pending');
    if (error) throw new Error(error.message);
  }
  if (toInsert.length) {
    const { error } = await supabaseAdmin.from('hub_boarding_tasks').upsert(
      toInsert.map((s) => ({
        clinic_id: reservation.clinic_id,
        hub_boarding_reservation_id: reservation.id,
        pet_id: reservation.pet_id,
        kind: s.kind,
        source: 'plan',
        title: s.title,
        details: s.details,
        scheduled_for: s.scheduled_for,
        task_date: s.task_date,
        plan_key: s.plan_key,
      })),
      { onConflict: 'hub_boarding_reservation_id,plan_key,task_date', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
  await supabaseAdmin
    .from('hub_boarding_care_plans')
    .update({ tasks_generated_at: new Date().toISOString() })
    .eq('id', planRow.id as string);
  return { inserted: toInsert.length, updated: toUpdate.length, deleted: toDelete.length };
}

/** No check-out (ou cancelamento), remove as tarefas pendentes que ficaram para depois. */
export async function dropPendingTasksAfter(clinicId: string, reservationId: string, afterIso: string | null): Promise<void> {
  let q = supabaseAdmin
    .from('hub_boarding_tasks')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('hub_boarding_reservation_id', reservationId)
    .eq('status', 'pending');
  if (afterIso) q = q.gt('scheduled_for', afterIso);
  const { error } = await q;
  if (error && !missingTable(error)) throw new Error(error.message);
}

/** Plano + tarefas da estadia; falhas não interrompem o fluxo principal (check-in, reserva). */
export async function prepareStayCare(reservation: ReservationRow): Promise<void> {
  try {
    const plan = await ensureCarePlan(reservation);
    if (plan) await syncReservationTasks(reservation, { plan });
  } catch (e) {
    console.error('prepareStayCare', reservation.id, e);
  }
}

// ─── Capacidade ───────────────────────────────────────────────────────────

export type CapacityCheck = {
  mode: 'hotel' | 'daycare';
  current: number;
  max: number | null;
  over: boolean;
  policy: 'warn' | 'block';
  space?: { id: string; name: string; current: number; capacity: number; over: boolean } | null;
};

/** Ocupação simultânea depois de colocar esta estadia (pets presentes no momento). */
export async function checkCapacityForCheckIn(args: {
  clinicId: string;
  unitId: string | null;
  mode: 'hotel' | 'daycare';
  reservationId?: string | null;
  spaceId?: string | null;
  shiftKey?: string | null;
}): Promise<CapacityCheck> {
  const settings = await loadUnitSettings(args.clinicId, args.unitId);
  let q = supabaseAdmin
    .from('hub_boarding_reservations')
    .select('*')
    .eq('clinic_id', args.clinicId)
    .eq('status', 'checked_in')
    .is('deleted_at', null);
  if (args.unitId) q = q.eq('unit_id', args.unitId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const present = ((data ?? []) as ReservationRow[]).filter((r) => r.id !== args.reservationId);

  const sameMode = present.filter((r) => r.mode === args.mode);
  const sameShift =
    args.mode === 'daycare' && args.shiftKey
      ? sameMode.filter((r) => (r.daycare_shift_key ?? null) === args.shiftKey)
      : sameMode;
  const current = sameShift.length + 1;
  const max = args.mode === 'hotel' ? settings.hotel_slots : settings.daycare_slots_per_shift;

  let space: CapacityCheck['space'] = null;
  if (args.spaceId) {
    const { data: sp } = await supabaseAdmin
      .from('hub_boarding_spaces')
      .select('id, name, capacity')
      .eq('id', args.spaceId)
      .eq('clinic_id', args.clinicId)
      .maybeSingle();
    if (sp) {
      const inSpace = present.filter((r) => r.space_id === args.spaceId).length + 1;
      space = {
        id: sp.id as string,
        name: String(sp.name),
        current: inSpace,
        capacity: Number(sp.capacity ?? 1),
        over: inSpace > Number(sp.capacity ?? 1),
      };
    }
  }

  return {
    mode: args.mode,
    current,
    max,
    over: max != null && current > max,
    policy: settings.overbooking_policy,
    space,
  };
}

/** Aplica a política da unidade: "bloquear" impede; "alertar" exige confirmação explícita. */
export function assertCapacityAllowed(check: CapacityCheck, force: boolean | undefined): void {
  const over = check.over || Boolean(check.space?.over);
  if (!over) return;
  const where = check.space?.over
    ? `${check.space.name} está com ${check.space.capacity} de ${check.space.capacity} lugares ocupados`
    : `capacidade de ${check.mode === 'hotel' ? 'hotel' : 'creche'} (${check.max}) atingida`;
  if (check.policy === 'block') {
    throw new BoardingHttpError(409, `Check-in bloqueado: ${where}.`, { capacity: check, code: 'CAPACITY_BLOCKED' });
  }
  if (!force) {
    throw new BoardingHttpError(409, `Atenção: ${where}. Confirme para continuar.`, {
      capacity: check,
      code: 'CAPACITY_WARNING',
    });
  }
}

// ─── Estadias do intervalo ────────────────────────────────────────────────

/** Reservas que cobrem o intervalo (vários dias inclusos). */
export async function loadReservationsOverlapping(args: {
  clinicId: string;
  unitId?: string | null;
  from: string;
  to: string;
  includeInactive?: boolean;
}): Promise<{ rows: ReservationRow[]; tableExists: boolean }> {
  let q = supabaseAdmin
    .from('hub_boarding_reservations')
    .select('*')
    .eq('clinic_id', args.clinicId)
    .is('deleted_at', null)
    .or(`status.in.(reserved,checked_in),checked_out_at.gte.${args.from}`);
  if (!args.includeInactive) q = q.not('status', 'in', '("cancelled","no_show")');
  if (args.unitId) q = q.eq('unit_id', args.unitId);
  const { data, error } = await q;
  if (error) {
    if (error.message?.includes('hub_boarding_reservations')) return { rows: [], tableExists: false };
    throw new Error(error.message);
  }
  const nowIso = new Date().toISOString();
  const rows = ((data ?? []) as ReservationRow[]).filter((r) => reservationOverlapsRange(r, args.from, args.to, nowIso));
  return { rows, tableExists: true };
}

export { boardingStayWindow };
