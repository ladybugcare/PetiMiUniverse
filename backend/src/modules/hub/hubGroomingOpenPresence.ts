export const PET_OPEN_GROOMING_CODE = 'PET_OPEN_GROOMING_PRESENCE';

export const PET_OPEN_GROOMING_MSG =
  'Este pet já possui uma sessão ou encaixe de Banho & Tosa em aberto. Finalize ou cancele o atual antes de registrar outro.';

/** Estágios em que o pet ainda está no fluxo operacional do salão (não terminal). */
export const OPEN_GROOMING_SESSION_STAGES = [
  'checked_in',
  'queued',
  'in_service',
  'finishing',
] as const;

const OPEN_WALK_IN_APPOINTMENT_STATUSES = ['checked_in', 'in_progress'] as const;

export type OpenGroomingPresence = {
  kind: 'session' | 'appointment';
  id: string;
  status: string;
};

/** Decide a partir de linhas já carregadas (testável sem Supabase). */
export function pickOpenGroomingPresence(opts: {
  sessions: Array<{ id: string; grooming_stage: string }>;
  appointments: Array<{ id: string; status: string; appointment_kind: string | null }>;
  excludeAppointmentId?: string | null;
  excludeSessionId?: string | null;
}): OpenGroomingPresence | null {
  const excludeSess = opts.excludeSessionId ?? null;
  for (const sess of opts.sessions) {
    if (excludeSess && sess.id === excludeSess) continue;
    if ((OPEN_GROOMING_SESSION_STAGES as readonly string[]).includes(sess.grooming_stage)) {
      return { kind: 'session', id: sess.id, status: sess.grooming_stage };
    }
  }

  const excludeAppt = opts.excludeAppointmentId ?? null;
  for (const appt of opts.appointments) {
    if (excludeAppt && appt.id === excludeAppt) continue;
    if (!(OPEN_WALK_IN_APPOINTMENT_STATUSES as readonly string[]).includes(appt.status)) continue;
    if ((appt.appointment_kind ?? '') !== 'walk_in') continue;
    return { kind: 'appointment', id: appt.id, status: appt.status };
  }

  return null;
}

/** Busca sessão/encaixe B&T aberto do pet nesta clínica. */
export async function findOpenGroomingPresenceForPet(opts: {
  clinicId: string;
  petId: string;
  excludeAppointmentId?: string | null;
  excludeSessionId?: string | null;
}): Promise<OpenGroomingPresence | null> {
  const { supabaseAdmin } = await import('../../config/supabase.js');

  const { data: sessions, error: sessErr } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id, grooming_stage')
    .eq('clinic_id', opts.clinicId)
    .eq('pet_id', opts.petId)
    .in('grooming_stage', [...OPEN_GROOMING_SESSION_STAGES])
    .is('deleted_at', null)
    .limit(10);
  if (sessErr) throw new Error(sessErr.message);

  const { data: appointments, error: apptErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, status, appointment_kind')
    .eq('clinic_id', opts.clinicId)
    .eq('pet_id', opts.petId)
    .eq('appointment_kind', 'walk_in')
    .in('status', [...OPEN_WALK_IN_APPOINTMENT_STATUSES])
    .is('deleted_at', null)
    .limit(10);
  if (apptErr) throw new Error(apptErr.message);

  return pickOpenGroomingPresence({
    sessions: (sessions ?? []) as Array<{ id: string; grooming_stage: string }>,
    appointments: (appointments ?? []) as Array<{
      id: string;
      status: string;
      appointment_kind: string | null;
    }>,
    excludeAppointmentId: opts.excludeAppointmentId,
    excludeSessionId: opts.excludeSessionId,
  });
}

export function openGroomingPresenceConflictPayload(presence: OpenGroomingPresence) {
  return {
    error: PET_OPEN_GROOMING_MSG,
    code: PET_OPEN_GROOMING_CODE,
    open_kind: presence.kind,
    open_id: presence.id,
    open_status: presence.status,
  };
}
