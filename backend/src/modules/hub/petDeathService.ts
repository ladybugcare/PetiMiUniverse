/**
 * Domínio de óbito do pet — registro/correção/invalidação atômicos via RPC.
 * Óbito (clínico) é independente de arquivamento (deleted_at).
 * Após registro: cancela appointments futuros não iniciados e devolve revisão.
 */
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  applyOperationalCancelToAppointments,
  PET_DEATH_CANCEL_WAIVE,
} from './hubAppointmentOperationalCancel';
import { BOARDING_COMANDA_INCOMPLETE_STATUSES } from './boardingOperational';
import { syncSurgeryForAppointmentSafe } from './hubSurgeryFromAppointment';

export const DEATH_TYPES = ['euthanasia', 'natural', 'accidental', 'other', 'unknown'] as const;
export type PetDeathType = (typeof DEATH_TYPES)[number];

export const DEATH_SOURCES = ['manual', 'encounter', 'surgery', 'hospitalization'] as const;
export type PetDeathSource = (typeof DEATH_SOURCES)[number];

export const deathTypeSchema = z.enum(DEATH_TYPES);
export const deathSourceSchema = z.enum(DEATH_SOURCES);

export const registerPetDeathInputSchema = z.object({
  clinic_id: z.string().uuid(),
  pet_id: z.string().uuid(),
  deceased_at: z.string().datetime({ offset: true }),
  death_type: deathTypeSchema,
  death_cause: z.string().trim().max(2000).optional().nullable(),
  death_notes: z.string().trim().max(4000).optional().nullable(),
  death_source: deathSourceSchema,
  death_ref_id: z.string().uuid().optional().nullable(),
  archive: z.boolean().optional().default(false),
  hub_case_id: z.string().uuid().optional().nullable(),
  hub_encounter_id: z.string().uuid().optional().nullable(),
  created_by_staff_id: z.string().uuid().optional().nullable(),
  actor_user_id: z.string().uuid().optional().nullable(),
});

export const correctPetDeathInputSchema = z.object({
  clinic_id: z.string().uuid(),
  pet_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(2000),
  deceased_at: z.string().datetime({ offset: true }).optional(),
  death_type: deathTypeSchema.optional(),
  death_cause: z.string().trim().max(2000).optional().nullable(),
  death_notes: z.string().trim().max(4000).optional().nullable(),
  hub_case_id: z.string().uuid().optional().nullable(),
  hub_encounter_id: z.string().uuid().optional().nullable(),
  created_by_staff_id: z.string().uuid().optional().nullable(),
  actor_user_id: z.string().uuid().optional().nullable(),
});

export const invalidatePetDeathInputSchema = z.object({
  clinic_id: z.string().uuid(),
  pet_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(2000),
  amendment_status: z.enum(['discharged', 'transferred']).optional().nullable(),
  hub_case_id: z.string().uuid().optional().nullable(),
  hub_encounter_id: z.string().uuid().optional().nullable(),
  created_by_staff_id: z.string().uuid().optional().nullable(),
  actor_user_id: z.string().uuid().optional().nullable(),
});

export type RegisterPetDeathInput = z.infer<typeof registerPetDeathInputSchema>;
export type CorrectPetDeathInput = z.infer<typeof correctPetDeathInputSchema>;
export type InvalidatePetDeathInput = z.infer<typeof invalidatePetDeathInputSchema>;

export type HubPetDeathFields = {
  id: string;
  clinic_id: string;
  deceased_at?: string | null;
  death_type?: string | null;
  death_cause?: string | null;
  death_notes?: string | null;
  death_source?: string | null;
  death_ref_id?: string | null;
  death_recorded_at?: string | null;
  death_recorded_by?: string | null;
  death_invalidated_at?: string | null;
  death_invalidated_by?: string | null;
  death_invalidation_reason?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
};

export type PetDeathCancelledAppointment = {
  id: string;
  starts_at: string;
  status: string;
  service_name: string | null;
};

export type PetDeathPendingReviewKind =
  | 'appointment_in_progress'
  | 'boarding_reservation'
  | 'grooming_session'
  | 'surgery_scheduled';

export type PetDeathPendingReviewItem = {
  kind: PetDeathPendingReviewKind;
  id: string;
  status: string;
  starts_at?: string | null;
  expected_check_in?: string | null;
  expected_check_out?: string | null;
  service_name?: string | null;
  label?: string | null;
  grooming_stage?: string | null;
  hub_appointment_id?: string | null;
};

export type PetDeathPendingCounts = {
  future_appointments: number;
  active_boarding_reservations: number;
  cancelled_appointments: number;
  pending_review_count: number;
  cancelled_appointments_list: PetDeathCancelledAppointment[];
  pending_review: PetDeathPendingReviewItem[];
};

export type PetDeathResult =
  | { ok: true; pet: HubPetDeathFields; pending?: PetDeathPendingCounts; archived?: boolean }
  | { ok: false; error: string; code?: string; status: number };

const AUTO_CANCEL_STATUSES = ['pending_confirm', 'confirmed'] as const;
const IN_PROGRESS_APPT_STATUSES = ['checked_in', 'in_progress'] as const;
/** Reserva/custódia ainda aberta — alinhado a boardingOperational. */
const BOARDING_PENDING_STATUSES = [...BOARDING_COMANDA_INCOMPLETE_STATUSES] as const;
/** Sessões de grooming ainda operacionais (não entregues/encerradas). */
const GROOMING_OPEN_STAGES = [
  'scheduled',
  'checked_in',
  'queued',
  'in_service',
  'finishing',
  'ready',
] as const;

/** Óbito válido = falecido e não invalidado. */
export function hasValidPetDeath(pet: {
  deceased_at?: string | null;
  death_invalidated_at?: string | null;
}): boolean {
  return pet.deceased_at != null && pet.death_invalidated_at == null;
}

/** Elegível para novas operações de rotina. */
export function isPetEligibleForNewOp(pet: {
  deleted_at?: string | null;
  deceased_at?: string | null;
  death_invalidated_at?: string | null;
}): boolean {
  if (pet.deleted_at != null) return false;
  if (hasValidPetDeath(pet)) return false;
  return true;
}

export function mapPetDeathRpcError(message: string): { error: string; code?: string; status: number } | null {
  const msg = String(message || '');
  if (/already_deceased/i.test(msg)) {
    return { error: 'Pet já possui óbito registrado', code: 'already_deceased', status: 409 };
  }
  if (/não encontrado|Pet não encontrado/i.test(msg)) {
    return { error: 'Pet não encontrado', code: 'not_found', status: 404 };
  }
  if (/Data de óbito não pode ser futura/i.test(msg)) {
    return { error: 'Data de óbito não pode ser futura', code: 'future_death_date', status: 400 };
  }
  if (/Registro clínico de origem inválido/i.test(msg)) {
    return { error: 'Registro clínico de origem inválido para este pet', code: 'invalid_death_ref', status: 400 };
  }
  if (/amendment_status obrigatório/i.test(msg)) {
    return {
      error: 'Informe amendment_status (discharged|transferred) para invalidar óbito de internação',
      code: 'amendment_required',
      status: 400,
    };
  }
  if (/Justificativa obrigatória/i.test(msg)) {
    return { error: msg.includes('invalidação') ? 'Justificativa obrigatória para invalidação' : 'Justificativa obrigatória para correção', status: 400 };
  }
  if (/não possui óbito válido/i.test(msg)) {
    return { error: msg, code: 'no_valid_death', status: 409 };
  }
  if (/death_type inválido|death_source inválido|death_ref_id obrigatório/i.test(msg)) {
    return { error: msg, status: 400 };
  }
  return null;
}

async function resolveAppointmentServiceName(
  appointmentId: string,
  hubServiceTypeId: string | null | undefined,
): Promise<string | null> {
  if (hubServiceTypeId) {
    const { data } = await supabaseAdmin
      .from('hub_service_types')
      .select('name')
      .eq('id', hubServiceTypeId)
      .maybeSingle();
    const name = (data as { name?: string } | null)?.name;
    if (name) return name;
  }
  const { data: lines } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('hub_service_type_id, order_index')
    .eq('appointment_id', appointmentId)
    .order('order_index', { ascending: true })
    .limit(1);
  const first = (lines ?? [])[0] as { hub_service_type_id?: string } | undefined;
  if (!first?.hub_service_type_id) return null;
  const { data: st } = await supabaseAdmin
    .from('hub_service_types')
    .select('name')
    .eq('id', first.hub_service_type_id)
    .maybeSingle();
  return (st as { name?: string } | null)?.name ?? null;
}

type ApptRow = {
  id: string;
  starts_at: string;
  status: string;
  hub_service_type_id?: string | null;
};

/**
 * Cancela futuros pending_confirm/confirmed e monta payload de revisão
 * (boarding, appointments em andamento, grooming aberto, cirurgia scheduled).
 */
export async function cancelFutureOpsAfterPetDeath(
  clinicId: string,
  petId: string,
  opts?: { actorUserId?: string | null },
): Promise<PetDeathPendingCounts> {
  const nowIso = new Date().toISOString();

  const { data: futureRows, error: futureErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, starts_at, status, hub_service_type_id')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .gt('starts_at', nowIso)
    .in('status', [...AUTO_CANCEL_STATUSES]);

  if (futureErr) {
    console.error('[petDeath] list future appointments', futureErr.message);
  }

  const toCancel = (futureRows ?? []) as ApptRow[];
  const cancelledList: PetDeathCancelledAppointment[] = [];

  if (toCancel.length > 0) {
    try {
      await applyOperationalCancelToAppointments({
        clinicId,
        appointmentIds: toCancel.map((r) => r.id),
        terminalStatus: 'cancelled',
        waiveReason: PET_DEATH_CANCEL_WAIVE,
      });
      for (const row of toCancel) {
        await syncSurgeryForAppointmentSafe({
          clinicId,
          appointmentId: row.id,
          userId: opts?.actorUserId ?? null,
        });
        const service_name = await resolveAppointmentServiceName(row.id, row.hub_service_type_id);
        cancelledList.push({
          id: row.id,
          starts_at: row.starts_at,
          status: 'cancelled',
          service_name,
        });
      }
    } catch (e) {
      console.error('[petDeath] auto-cancel appointments', (e as Error)?.message);
    }
  }

  const pending_review: PetDeathPendingReviewItem[] = [];

  const { data: inProgressRows } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, starts_at, status, hub_service_type_id')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .in('status', [...IN_PROGRESS_APPT_STATUSES]);

  for (const row of (inProgressRows ?? []) as ApptRow[]) {
    const service_name = await resolveAppointmentServiceName(row.id, row.hub_service_type_id);
    pending_review.push({
      kind: 'appointment_in_progress',
      id: row.id,
      status: row.status,
      starts_at: row.starts_at,
      service_name,
      label: service_name,
    });
  }

  const { data: boardingRows } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('id, status, expected_check_in, expected_check_out')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .in('status', [...BOARDING_PENDING_STATUSES]);

  for (const row of boardingRows ?? []) {
    const r = row as {
      id: string;
      status: string;
      expected_check_in?: string | null;
      expected_check_out?: string | null;
    };
    pending_review.push({
      kind: 'boarding_reservation',
      id: r.id,
      status: r.status,
      expected_check_in: r.expected_check_in ?? null,
      expected_check_out: r.expected_check_out ?? null,
      label: 'Hotel / creche',
    });
  }

  const { data: groomingRows } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id, grooming_stage, hub_appointment_id, checked_in_at, created_at')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .in('grooming_stage', [...GROOMING_OPEN_STAGES]);

  for (const row of groomingRows ?? []) {
    const g = row as {
      id: string;
      grooming_stage: string;
      hub_appointment_id?: string | null;
      checked_in_at?: string | null;
      created_at?: string | null;
    };
    pending_review.push({
      kind: 'grooming_session',
      id: g.id,
      status: g.grooming_stage,
      grooming_stage: g.grooming_stage,
      hub_appointment_id: g.hub_appointment_id ?? null,
      starts_at: g.checked_in_at ?? g.created_at ?? null,
      label: 'Banho & tosa',
      service_name: 'Banho & tosa',
    });
  }

  const { data: surgeryRows } = await supabaseAdmin
    .from('hub_surgeries')
    .select('id, status, title, scheduled_at, hub_appointment_id, hub_encounter_id')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .eq('status', 'scheduled');

  for (const row of surgeryRows ?? []) {
    const s = row as {
      id: string;
      status: string;
      title?: string | null;
      scheduled_at?: string | null;
      hub_appointment_id?: string | null;
      hub_encounter_id?: string | null;
    };
    // Fichas já em atendimento (com encounter) ficam no fluxo clínico; só scheduled residual.
    if (s.hub_encounter_id) continue;
    pending_review.push({
      kind: 'surgery_scheduled',
      id: s.id,
      status: s.status,
      starts_at: s.scheduled_at ?? null,
      hub_appointment_id: s.hub_appointment_id ?? null,
      label: s.title?.trim() || 'Cirurgia agendada',
      service_name: s.title?.trim() || 'Cirurgia',
    });
  }

  const { count: remainingFuture } = await supabaseAdmin
    .from('hub_appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .gt('starts_at', nowIso)
    .not('status', 'in', '("cancelled","done","paid","no_show")');

  const boardingCount = pending_review.filter((i) => i.kind === 'boarding_reservation').length;

  return {
    future_appointments: remainingFuture ?? 0,
    active_boarding_reservations: boardingCount,
    cancelled_appointments: cancelledList.length,
    pending_review_count: pending_review.length,
    cancelled_appointments_list: cancelledList,
    pending_review,
  };
}

function parseRpcPet(data: unknown): HubPetDeathFields | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { ok?: boolean; pet?: HubPetDeathFields; archived?: boolean };
  if (!body.ok || !body.pet) return null;
  return body.pet;
}

export async function registerPetDeath(input: RegisterPetDeathInput): Promise<PetDeathResult> {
  const parsed = registerPetDeathInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos para registrar óbito', status: 400 };
  }
  const b = parsed.data;

  if (b.death_source !== 'manual' && !b.death_ref_id) {
    return { ok: false, error: 'death_ref_id obrigatório para origem clínica', status: 400 };
  }

  const deceasedAt = new Date(b.deceased_at);
  if (Number.isNaN(deceasedAt.getTime()) || deceasedAt.getTime() > Date.now() + 60_000) {
    return { ok: false, error: 'Data de óbito não pode ser futura', code: 'future_death_date', status: 400 };
  }

  try {
    const rpcRes = await supabaseAdmin.rpc('hub_register_pet_death', {
      p_clinic_id: b.clinic_id,
      p_pet_id: b.pet_id,
      p_deceased_at: b.deceased_at,
      p_death_type: b.death_type,
      p_death_source: b.death_source,
      p_death_cause: b.death_cause ?? null,
      p_death_notes: b.death_notes ?? null,
      p_death_ref_id: b.death_ref_id ?? null,
      p_archive: b.archive ?? false,
      p_actor_user_id: b.actor_user_id ?? null,
      p_hub_case_id: b.hub_case_id ?? null,
      p_hub_encounter_id: b.hub_encounter_id ?? null,
      p_created_by_staff_id: b.created_by_staff_id ?? null,
    });

    if (rpcRes.error) {
      const mapped = mapPetDeathRpcError(rpcRes.error.message);
      if (mapped) return { ok: false, ...mapped };
      return { ok: false, error: rpcRes.error.message || 'Falha ao registrar óbito', status: 500 };
    }

    const pet = parseRpcPet(rpcRes.data);
    if (!pet) {
      const mapped = mapPetDeathRpcError(String((rpcRes.data as { message?: string })?.message ?? ''));
      if (mapped) return { ok: false, ...mapped };
      return { ok: false, error: 'Resposta inválida ao registrar óbito', status: 500 };
    }

    const pending = await cancelFutureOpsAfterPetDeath(b.clinic_id, b.pet_id, {
      actorUserId: b.actor_user_id ?? null,
    });
    return {
      ok: true,
      pet,
      pending,
      archived: Boolean((rpcRes.data as { archived?: boolean })?.archived),
    };
  } catch (e: unknown) {
    const msg = (e as Error)?.message || 'Erro ao registrar óbito';
    const mapped = mapPetDeathRpcError(msg);
    if (mapped) return { ok: false, ...mapped };
    return { ok: false, error: msg, status: 500 };
  }
}

export async function correctPetDeath(input: CorrectPetDeathInput): Promise<PetDeathResult> {
  const parsed = correctPetDeathInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos para corrigir óbito', status: 400 };
  }
  const b = parsed.data;

  try {
    const rpcRes = await supabaseAdmin.rpc('hub_correct_pet_death', {
      p_clinic_id: b.clinic_id,
      p_pet_id: b.pet_id,
      p_reason: b.reason,
      p_deceased_at: b.deceased_at ?? null,
      p_death_type: b.death_type ?? null,
      p_death_cause: b.death_cause ?? null,
      p_death_notes: b.death_notes ?? null,
      p_actor_user_id: b.actor_user_id ?? null,
      p_created_by_staff_id: b.created_by_staff_id ?? null,
      p_hub_case_id: b.hub_case_id ?? null,
      p_hub_encounter_id: b.hub_encounter_id ?? null,
    });

    if (rpcRes.error) {
      const mapped = mapPetDeathRpcError(rpcRes.error.message);
      if (mapped) return { ok: false, ...mapped };
      return { ok: false, error: rpcRes.error.message || 'Falha ao corrigir óbito', status: 500 };
    }

    const pet = parseRpcPet(rpcRes.data);
    if (!pet) {
      return { ok: false, error: 'Resposta inválida ao corrigir óbito', status: 500 };
    }
    return { ok: true, pet };
  } catch (e: unknown) {
    const msg = (e as Error)?.message || 'Erro ao corrigir óbito';
    const mapped = mapPetDeathRpcError(msg);
    if (mapped) return { ok: false, ...mapped };
    return { ok: false, error: msg, status: 500 };
  }
}

export async function invalidatePetDeath(input: InvalidatePetDeathInput): Promise<PetDeathResult> {
  const parsed = invalidatePetDeathInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos para invalidar óbito', status: 400 };
  }
  const b = parsed.data;

  try {
    const rpcRes = await supabaseAdmin.rpc('hub_invalidate_pet_death', {
      p_clinic_id: b.clinic_id,
      p_pet_id: b.pet_id,
      p_reason: b.reason,
      p_actor_user_id: b.actor_user_id ?? null,
      p_created_by_staff_id: b.created_by_staff_id ?? null,
      p_amendment_status: b.amendment_status ?? null,
      p_hub_case_id: b.hub_case_id ?? null,
      p_hub_encounter_id: b.hub_encounter_id ?? null,
    });

    if (rpcRes.error) {
      const mapped = mapPetDeathRpcError(rpcRes.error.message);
      if (mapped) return { ok: false, ...mapped };
      return { ok: false, error: rpcRes.error.message || 'Falha ao invalidar óbito', status: 500 };
    }

    const pet = parseRpcPet(rpcRes.data);
    if (!pet) {
      return { ok: false, error: 'Resposta inválida ao invalidar óbito', status: 500 };
    }
    return { ok: true, pet };
  } catch (e: unknown) {
    const msg = (e as Error)?.message || 'Erro ao invalidar óbito';
    const mapped = mapPetDeathRpcError(msg);
    if (mapped) return { ok: false, ...mapped };
    return { ok: false, error: msg, status: 500 };
  }
}

/** Payload opcional de óbito embutido em PATCH clínico. */
export const clinicalDeathPayloadSchema = z
  .object({
    deceased_at: z.string().datetime({ offset: true }).optional(),
    death_type: deathTypeSchema,
    death_cause: z.string().trim().max(2000).optional().nullable(),
    death_notes: z.string().trim().max(4000).optional().nullable(),
    archive: z.boolean().optional().default(false),
  })
  .optional();

export type ClinicalDeathPayload = z.infer<typeof clinicalDeathPayloadSchema>;
