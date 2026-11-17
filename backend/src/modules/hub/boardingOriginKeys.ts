import { supabaseAdmin } from '../../config/supabase';

/**
 * Expande chaves `appointment:` ↔ `boarding_reservation:` quando a reserva
 * está vinculada ao agendamento. Usado no dedupe de unbilled / comandas abertas
 * e no day-board para estadias cobradas via comanda `origin_type=appointment`.
 */
export async function expandBoardingAppointmentOriginKeys(
  clinicId: string,
  keys: Set<string>,
): Promise<Set<string>> {
  if (!keys.size) return keys;

  const appointmentIds: string[] = [];
  const boardingIds: string[] = [];
  for (const key of keys) {
    if (key.startsWith('appointment:')) {
      appointmentIds.push(key.slice('appointment:'.length));
    } else if (key.startsWith('boarding_reservation:')) {
      boardingIds.push(key.slice('boarding_reservation:'.length));
    }
  }

  if (appointmentIds.length) {
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, hub_appointment_id')
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', appointmentIds)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      keys.add(`boarding_reservation:${row.id as string}`);
    }
  }

  if (boardingIds.length) {
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, hub_appointment_id')
      .eq('clinic_id', clinicId)
      .in('id', boardingIds)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const apptId = row.hub_appointment_id as string | null;
      if (apptId) keys.add(`appointment:${apptId}`);
    }
  }

  return keys;
}

/** Mapa reserva → agendamento (e o inverso) para alias de billing no day-board. */
export async function fetchBoardingAppointmentLinks(
  clinicId: string,
  opts: { boardingIds?: string[]; appointmentIds?: string[] },
): Promise<{
  appointmentByBoardingId: Map<string, string>;
  boardingIdsByAppointmentId: Map<string, string[]>;
}> {
  const appointmentByBoardingId = new Map<string, string>();
  const boardingIdsByAppointmentId = new Map<string, string[]>();
  const boardingIds = opts.boardingIds ?? [];
  const appointmentIds = opts.appointmentIds ?? [];
  if (!boardingIds.length && !appointmentIds.length) {
    return { appointmentByBoardingId, boardingIdsByAppointmentId };
  }

  const rows: Array<{ id: string; hub_appointment_id: string | null }> = [];
  if (boardingIds.length) {
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, hub_appointment_id')
      .eq('clinic_id', clinicId)
      .in('id', boardingIds)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      rows.push({
        id: row.id as string,
        hub_appointment_id: (row.hub_appointment_id as string | null) ?? null,
      });
    }
  }
  if (appointmentIds.length) {
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, hub_appointment_id')
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', appointmentIds)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      rows.push({
        id: row.id as string,
        hub_appointment_id: (row.hub_appointment_id as string | null) ?? null,
      });
    }
  }

  for (const row of rows) {
    const apptId = row.hub_appointment_id;
    if (!apptId) continue;
    appointmentByBoardingId.set(row.id, apptId);
    const list = boardingIdsByAppointmentId.get(apptId) ?? [];
    if (!list.includes(row.id)) list.push(row.id);
    boardingIdsByAppointmentId.set(apptId, list);
  }
  return { appointmentByBoardingId, boardingIdsByAppointmentId };
}
