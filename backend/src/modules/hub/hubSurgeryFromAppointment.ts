import { supabaseAdmin } from '../../config/supabase';
import { isMissingPostgrestRelation } from '../../utils/supabaseSchemaErrors.js';
import { insertSurgeryServicesBatch } from './hubClinicalBillableServicesController';
import { recordTimelineEvent } from './hubClinicalTimelineController';

/**
 * Espelha o slot da agenda numa ficha cirúrgica (`hub_surgeries`).
 *
 * A cirurgia agendada pela recepção nasce sem caso clínico e sem atendimento: o
 * atendimento só é aberto quando o pet chega (`openHubEncounterFromAppointment`),
 * e é lá que o caso é resolvido. Enquanto isso a ficha já aparece no Consultório
 * com o selo «Sem caso».
 */

const SURGERY_SERVICE_GROUP = 'cirurgia';

type ApptRow = {
  unit_id: string | null;
  pet_id: string | null;
  guardian_id: string | null;
  hub_staff_member_id: string | null;
  starts_at: string;
  status: string | null;
  title: string | null;
  intake_hub_case_id: string | null;
  deleted_at: string | null;
};

type SurgeryLine = { hub_service_type_id: string; name: string; sale_amount: number | null };

async function loadSurgeryLines(clinicId: string, appointmentId: string): Promise<SurgeryLine[]> {
  const { data: lines, error } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('hub_service_type_id, sale_amount_applied, order_index')
    .eq('appointment_id', appointmentId)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (lines ?? []) as Array<{ hub_service_type_id: string; sale_amount_applied: number | null }>;
  if (rows.length === 0) return [];

  const typeIds = [...new Set(rows.map((r) => r.hub_service_type_id))];
  const { data: types, error: typeErr } = await supabaseAdmin
    .from('hub_service_types')
    .select('id, name, service_group')
    .eq('clinic_id', clinicId)
    .in('id', typeIds);
  if (typeErr) throw new Error(typeErr.message);
  const byId = new Map(
    ((types ?? []) as Array<{ id: string; name: string; service_group: string | null }>).map((t) => [t.id, t]),
  );

  const out: SurgeryLine[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const type = byId.get(row.hub_service_type_id);
    if (!type || type.service_group !== SURGERY_SERVICE_GROUP) continue;
    if (seen.has(row.hub_service_type_id)) continue;
    seen.add(row.hub_service_type_id);
    out.push({
      hub_service_type_id: row.hub_service_type_id,
      name: type.name,
      sale_amount: row.sale_amount_applied == null ? null : Number(row.sale_amount_applied),
    });
  }
  return out;
}

type LinkedSurgery = { id: string; status: string; hub_encounter_id: string | null };

async function findLinkedSurgery(clinicId: string, appointmentId: string): Promise<LinkedSurgery | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_surgeries')
    .select('id, status, hub_encounter_id')
    .eq('clinic_id', clinicId)
    .eq('hub_appointment_id', appointmentId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingPostgrestRelation(error)) return null;
    throw new Error(error.message);
  }
  return (data as LinkedSurgery | null) ?? null;
}

/** Pet chegou (atendimento aberto) ou cirurgia iniciada: dali em diante quem manda é o vet. */
function isSurgeryStillOwnedByAgenda(surgery: LinkedSurgery): boolean {
  if (surgery.hub_encounter_id) return false;
  return surgery.status === 'scheduled' || surgery.status === 'cancelled';
}

/**
 * Cria, atualiza ou cancela a ficha cirúrgica do agendamento conforme o estado
 * atual do slot. Idempotente: pode ser chamada a cada alteração do agendamento.
 */
export async function syncSurgeryForAppointment(opts: {
  clinicId: string;
  appointmentId: string;
  userId?: string | null;
}): Promise<void> {
  const { clinicId, appointmentId, userId } = opts;

  const { data: appt, error: apptErr } = await supabaseAdmin
    .from('hub_appointments')
    .select(
      'unit_id, pet_id, guardian_id, hub_staff_member_id, starts_at, status, title, intake_hub_case_id, deleted_at',
    )
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (apptErr) throw new Error(apptErr.message);
  if (!appt) return;
  const row = appt as ApptRow;

  const linked = await findLinkedSurgery(clinicId, appointmentId);
  const slotActive = !row.deleted_at && row.status !== 'cancelled';
  const lines = slotActive && row.pet_id ? await loadSurgeryLines(clinicId, appointmentId) : [];

  if (lines.length === 0) {
    if (linked && linked.status === 'scheduled' && !linked.hub_encounter_id) {
      await supabaseAdmin
        .from('hub_surgeries')
        .update({
          status: 'cancelled',
          ...(row.deleted_at ? { deleted_at: row.deleted_at } : {}),
        })
        .eq('id', linked.id)
        .eq('clinic_id', clinicId);
    }
    return;
  }

  if (linked) {
    if (!isSurgeryStillOwnedByAgenda(linked)) return;
    await supabaseAdmin
      .from('hub_surgeries')
      .update({
        status: 'scheduled',
        scheduled_at: row.starts_at,
        unit_id: row.unit_id ?? null,
        guardian_id: row.guardian_id ?? null,
        hub_staff_member_id: row.hub_staff_member_id ?? null,
      })
      .eq('id', linked.id)
      .eq('clinic_id', clinicId);
    return;
  }

  const title = row.title?.trim() || lines.map((l) => l.name).join(' + ');
  const { data: created, error: insErr } = await supabaseAdmin
    .from('hub_surgeries')
    .insert({
      clinic_id: clinicId,
      unit_id: row.unit_id ?? null,
      pet_id: row.pet_id,
      guardian_id: row.guardian_id ?? null,
      hub_appointment_id: appointmentId,
      hub_case_id: row.intake_hub_case_id ?? null,
      hub_staff_member_id: row.hub_staff_member_id ?? null,
      title,
      scheduled_at: row.starts_at,
      status: 'scheduled',
    })
    .select('id')
    .single();
  if (insErr) throw new Error(insErr.message);

  const surgeryId = (created as { id: string }).id;
  await insertSurgeryServicesBatch({
    clinicId,
    surgeryId,
    appointmentId,
    userId,
    services: lines.map((l) => ({ hub_service_type_id: l.hub_service_type_id, unit_amount: l.sale_amount })),
  });

  // Agendamento usa `note`; `surgery_performed` fica reservado para a conclusão.
  await recordTimelineEvent({
    clinic_id: clinicId,
    pet_id: row.pet_id as string,
    hub_case_id: row.intake_hub_case_id ?? null,
    event_type: 'note',
    ref_type: 'surgery',
    ref_id: surgeryId,
    title: `Cirurgia agendada: ${title}`,
    created_by: row.hub_staff_member_id ?? null,
  });
}

/**
 * Versão «best-effort»: um problema ao espelhar a cirurgia nunca deve derrubar o
 * agendamento em si (inclusive quando a migration 107 ainda não foi aplicada).
 */
export async function syncSurgeryForAppointmentSafe(opts: {
  clinicId: string;
  appointmentId: string;
  userId?: string | null;
}): Promise<void> {
  try {
    await syncSurgeryForAppointment(opts);
  } catch (e: unknown) {
    console.error('syncSurgeryForAppointment', opts.appointmentId, (e as Error)?.message);
  }
}

export type DayBoardSurgeryRow = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  pet_id: string;
  guardian_id: string | null;
  hub_staff_member_id: string | null;
  hub_appointment_id: string | null;
  hub_encounter_id: string | null;
};

function dayBoardSurgeryQuery(clinicId: string, staffMemberId?: string) {
  let query = supabaseAdmin
    .from('hub_surgeries')
    .select(
      'id, title, status, scheduled_at, started_at, pet_id, guardian_id, hub_staff_member_id, hub_appointment_id, hub_encounter_id',
    )
    .eq('clinic_id', clinicId)
    .is('deleted_at', null);
  if (staffMemberId === '__na__') query = query.is('hub_staff_member_id', null);
  else if (staffMemberId) query = query.eq('hub_staff_member_id', staffMemberId);
  return query;
}

/**
 * Cirurgias que devem aparecer na fila do consultório: as do dia + as já
 * iniciadas (mesmo que o slot original ainda esteja em outra data).
 */
export async function listOperationalSurgeriesForDayBoard(opts: {
  clinicId: string;
  from: string;
  to: string;
  staffMemberId?: string;
}): Promise<DayBoardSurgeryRow[]> {
  const [{ data: dueRows, error: dueErr }, { data: activeRows, error: activeErr }] = await Promise.all([
    dayBoardSurgeryQuery(opts.clinicId, opts.staffMemberId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', opts.from)
      .lt('scheduled_at', opts.to),
    dayBoardSurgeryQuery(opts.clinicId, opts.staffMemberId).eq('status', 'in_progress'),
  ]);
  if (dueErr || activeErr) {
    const err = dueErr ?? activeErr;
    if (err && isMissingPostgrestRelation(err)) return [];
    if (err) throw new Error(err.message);
  }

  const byId = new Map<string, DayBoardSurgeryRow>();
  for (const row of [...(dueRows ?? []), ...(activeRows ?? [])] as DayBoardSurgeryRow[]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

function appointmentDurationMs(startsAt: string, endsAt: string | null): number {
  const startMs = new Date(startsAt).getTime();
  const endMs = endsAt ? new Date(endsAt).getTime() : NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) return endMs - startMs;
  return 60 * 60 * 1000;
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Ao iniciar a cirurgia, o slot da agenda acompanha o vet: se não era hoje,
 * o horário vai para agora (mantém a duração). Status passa a `in_progress`
 * para o pet entrar na fila do dia.
 */
export async function advanceLinkedAppointmentOnSurgeryStart(opts: {
  clinicId: string;
  appointmentId: string | null | undefined;
  staffMemberId?: string | null;
  now?: Date;
}): Promise<{ starts_at: string; ends_at: string; moved: boolean } | null> {
  if (!opts.appointmentId) return null;
  const now = opts.now ?? new Date();

  const { data: appt, error } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, starts_at, ends_at, status, hub_staff_member_id, deleted_at')
    .eq('id', opts.appointmentId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!appt || (appt as { deleted_at?: string | null }).deleted_at) return null;

  const row = appt as {
    starts_at: string;
    ends_at: string | null;
    status: string | null;
    hub_staff_member_id: string | null;
  };
  if (row.status === 'cancelled') return null;

  const sameDay = isSameLocalDay(row.starts_at, now);
  const starts_at = sameDay ? row.starts_at : now.toISOString();
  const ends_at = sameDay
    ? row.ends_at ?? new Date(new Date(row.starts_at).getTime() + appointmentDurationMs(row.starts_at, row.ends_at)).toISOString()
    : new Date(now.getTime() + appointmentDurationMs(row.starts_at, row.ends_at)).toISOString();

  const patch: Record<string, unknown> = {
    starts_at,
    ends_at,
    status: 'in_progress',
  };
  if (opts.staffMemberId && row.hub_staff_member_id !== opts.staffMemberId) {
    patch.hub_staff_member_id = opts.staffMemberId;
  }

  const { error: updErr } = await supabaseAdmin
    .from('hub_appointments')
    .update(patch)
    .eq('id', opts.appointmentId)
    .eq('clinic_id', opts.clinicId);
  if (updErr) throw new Error(updErr.message);

  return { starts_at, ends_at, moved: !sameDay };
}

/**
 * Ao abrir o atendimento do slot, a ficha cirúrgica herda caso e atendimento —
 * é o que liga a cobrança da cirurgia à comanda do atendimento.
 */
export async function attachEncounterToAppointmentSurgery(opts: {
  clinicId: string;
  appointmentId: string;
  encounterId: string;
  caseId: string | null;
}): Promise<void> {
  try {
    const linked = await findLinkedSurgery(opts.clinicId, opts.appointmentId);
    if (!linked) return;
    const patch: Record<string, unknown> = { hub_encounter_id: opts.encounterId };
    if (opts.caseId) patch.hub_case_id = opts.caseId;
    await supabaseAdmin
      .from('hub_surgeries')
      .update(patch)
      .eq('id', linked.id)
      .eq('clinic_id', opts.clinicId)
      .is('hub_encounter_id', null);
  } catch (e: unknown) {
    console.error('attachEncounterToAppointmentSurgery', opts.appointmentId, (e as Error)?.message);
  }
}
