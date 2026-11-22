import { supabaseAdmin } from '../../config/supabase';

/**
 * Expande chaves `appointment:` ↔ `grooming_session:` quando a sessão
 * está vinculada ao agendamento (hub_appointment_id). Espelha o padrão do hotel.
 */
export async function expandGroomingAppointmentOriginKeys(
  clinicId: string,
  keys: Set<string>,
): Promise<Set<string>> {
  if (!keys.size) return keys;

  const appointmentIds: string[] = [];
  const sessionIds: string[] = [];
  for (const key of keys) {
    if (key.startsWith('appointment:')) {
      appointmentIds.push(key.slice('appointment:'.length));
    } else if (key.startsWith('grooming_session:')) {
      sessionIds.push(key.slice('grooming_session:'.length));
    }
  }

  if (appointmentIds.length) {
    const { data, error } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('id, hub_appointment_id')
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', appointmentIds)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      keys.add(`grooming_session:${row.id as string}`);
    }
  }

  if (sessionIds.length) {
    const { data, error } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('id, hub_appointment_id')
      .eq('clinic_id', clinicId)
      .in('id', sessionIds)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const apptId = row.hub_appointment_id as string | null;
      if (apptId) keys.add(`appointment:${apptId}`);
    }
  }

  return keys;
}

/** Sessão ativa (não cancelada) ligada ao agendamento — origem canônica do banho. */
export async function findLinkedGroomingSessionIdForAppointment(
  clinicId: string,
  appointmentId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id, grooming_stage, created_at')
    .eq('clinic_id', clinicId)
    .eq('hub_appointment_id', appointmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string) ?? null;
}
