export const PET_OPEN_CLINICAL_CODE = 'PET_OPEN_CLINICAL_PRESENCE';

export const PET_OPEN_CLINICAL_MSG =
  'Este pet já possui um atendimento ou encaixe clínico em aberto. Finalize ou cancele o atual antes de registrar outro.';

const OPEN_ENCOUNTER_STATUSES = ['waiting', 'in_progress'] as const;
const OPEN_APPOINTMENT_STATUSES = ['checked_in', 'in_progress'] as const;
const CLINICAL_QUEUE_APPOINTMENT_KINDS = new Set([
  'clinical_walk_in',
  'clinical_emergency',
  'standard',
]);

export type OpenClinicalPresence = {
  kind: 'encounter' | 'appointment';
  id: string;
  status: string;
};

/** Decide a partir de linhas já carregadas (testável sem Supabase). */
export function pickOpenClinicalPresence(opts: {
  encounters: Array<{ id: string; status: string }>;
  appointments: Array<{ id: string; status: string; appointment_kind: string | null }>;
  excludeAppointmentId?: string | null;
  excludeEncounterId?: string | null;
}): OpenClinicalPresence | null {
  const excludeEnc = opts.excludeEncounterId ?? null;
  for (const enc of opts.encounters) {
    if (excludeEnc && enc.id === excludeEnc) continue;
    if ((OPEN_ENCOUNTER_STATUSES as readonly string[]).includes(enc.status)) {
      return { kind: 'encounter', id: enc.id, status: enc.status };
    }
  }

  const excludeAppt = opts.excludeAppointmentId ?? null;
  for (const appt of opts.appointments) {
    if (excludeAppt && appt.id === excludeAppt) continue;
    if (!(OPEN_APPOINTMENT_STATUSES as readonly string[]).includes(appt.status)) continue;
    const kind = appt.appointment_kind ?? 'standard';
    if (!CLINICAL_QUEUE_APPOINTMENT_KINDS.has(kind)) continue;
    return { kind: 'appointment', id: appt.id, status: appt.status };
  }

  return null;
}

/** Busca atendimento/encaixe clínico aberto do pet nesta clínica. */
export async function findOpenClinicalPresenceForPet(opts: {
  clinicId: string;
  petId: string;
  excludeAppointmentId?: string | null;
  excludeEncounterId?: string | null;
}): Promise<OpenClinicalPresence | null> {
  const { supabaseAdmin } = await import('../../config/supabase.js');

  const { data: encounters, error: encErr } = await supabaseAdmin
    .from('hub_encounters')
    .select('id, status')
    .eq('clinic_id', opts.clinicId)
    .eq('pet_id', opts.petId)
    .in('status', [...OPEN_ENCOUNTER_STATUSES])
    .is('deleted_at', null)
    .limit(10);
  if (encErr) throw new Error(encErr.message);

  const { data: appointments, error: apptErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, status, appointment_kind')
    .eq('clinic_id', opts.clinicId)
    .eq('pet_id', opts.petId)
    .in('status', [...OPEN_APPOINTMENT_STATUSES])
    .in('appointment_kind', [...CLINICAL_QUEUE_APPOINTMENT_KINDS])
    .is('deleted_at', null)
    .limit(10);
  if (apptErr) throw new Error(apptErr.message);

  return pickOpenClinicalPresence({
    encounters: (encounters ?? []) as Array<{ id: string; status: string }>,
    appointments: (appointments ?? []) as Array<{
      id: string;
      status: string;
      appointment_kind: string | null;
    }>,
    excludeAppointmentId: opts.excludeAppointmentId,
    excludeEncounterId: opts.excludeEncounterId,
  });
}

export function openClinicalPresenceConflictPayload(presence: OpenClinicalPresence) {
  return {
    error: PET_OPEN_CLINICAL_MSG,
    code: PET_OPEN_CLINICAL_CODE,
    open_kind: presence.kind,
    open_id: presence.id,
    open_status: presence.status,
  };
}
