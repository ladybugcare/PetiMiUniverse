import { supabaseAdmin } from '../../config/supabase';

/**
 * Espelha quitação financeira na agenda: `appointment.status = paid` só após o recebível
 * ficar pago — não no encerramento operacional (grooming closed, encounter completed, checkout hotel).
 *
 * Estorno / recálculo: se não houver recebível `paid` vinculado, volta `paid` → `done`.
 *
 * Origens resolvíveis → `hub_appointments`:
 * - `appointment` (direto)
 * - `grooming_session` / `encounter` / `boarding_reservation` via `hub_appointment_id`
 * - comanda com esses `origin_type` (recebível `manual` do checkout)
 */
async function resolveAppointmentIdFromOrigin(
  clinicId: string,
  originType: string,
  originId: string,
): Promise<string | null> {
  if (originType === 'appointment') return originId;

  if (originType === 'grooming_session') {
    const { data: session } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('hub_appointment_id')
      .eq('id', originId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    return (session?.hub_appointment_id as string | null) ?? null;
  }

  if (originType === 'encounter') {
    const { data: enc } = await supabaseAdmin
      .from('hub_encounters')
      .select('hub_appointment_id')
      .eq('id', originId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    return (enc?.hub_appointment_id as string | null) ?? null;
  }

  if (originType === 'boarding_reservation') {
    const { data: reservation } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('hub_appointment_id')
      .eq('id', originId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    return (reservation?.hub_appointment_id as string | null) ?? null;
  }

  return null;
}

async function resolveAppointmentIdFromReceivable(
  clinicId: string,
  receivableId: string,
): Promise<string | null> {
  const { data: rec, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, clinic_id, source_type, source_id, comanda_id')
    .eq('id', receivableId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error || !rec) return null;

  let appointmentId: string | null = null;
  const sourceType = String(rec.source_type ?? '');
  const sourceId = (rec.source_id as string | null) ?? null;

  if (sourceId) {
    appointmentId = await resolveAppointmentIdFromOrigin(clinicId, sourceType, sourceId);
  }

  if (!appointmentId && rec.comanda_id) {
    const { data: comanda } = await supabaseAdmin
      .from('hub_comandas')
      .select('origin_type, origin_id')
      .eq('id', rec.comanda_id as string)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const originType = String(comanda?.origin_type ?? '');
    const originId = (comanda?.origin_id as string | null) ?? null;
    if (originId) {
      appointmentId = await resolveAppointmentIdFromOrigin(clinicId, originType, originId);
    }
  }

  return appointmentId;
}

async function listOriginKeysForAppointment(
  clinicId: string,
  appointmentId: string,
): Promise<Array<{ origin_type: string; origin_id: string }>> {
  const keys: Array<{ origin_type: string; origin_id: string }> = [
    { origin_type: 'appointment', origin_id: appointmentId },
  ];

  const [groomRes, encRes, boardRes] = await Promise.all([
    supabaseAdmin
      .from('hub_grooming_sessions')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('hub_appointment_id', appointmentId),
    supabaseAdmin
      .from('hub_encounters')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('hub_appointment_id', appointmentId)
      .is('deleted_at', null),
    supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('hub_appointment_id', appointmentId),
  ]);

  for (const row of groomRes.data ?? []) {
    keys.push({ origin_type: 'grooming_session', origin_id: row.id as string });
  }
  for (const row of encRes.data ?? []) {
    keys.push({ origin_type: 'encounter', origin_id: row.id as string });
  }
  for (const row of boardRes.data ?? []) {
    keys.push({ origin_type: 'boarding_reservation', origin_id: row.id as string });
  }
  return keys;
}

async function appointmentHasPaidReceivable(clinicId: string, appointmentId: string): Promise<boolean> {
  const origins = await listOriginKeysForAppointment(clinicId, appointmentId);

  for (const o of origins) {
    const { data } = await supabaseAdmin
      .from('hub_receivables')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('source_type', o.origin_type)
      .eq('source_id', o.origin_id)
      .eq('status', 'paid')
      .is('deleted_at', null)
      .limit(1);
    if ((data ?? []).length > 0) return true;
  }

  for (const o of origins) {
    const { data: comandas } = await supabaseAdmin
      .from('hub_comandas')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('origin_type', o.origin_type)
      .eq('origin_id', o.origin_id)
      .is('deleted_at', null);
    for (const c of comandas ?? []) {
      const { data: recs } = await supabaseAdmin
        .from('hub_receivables')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('comanda_id', c.id as string)
        .eq('status', 'paid')
        .is('deleted_at', null)
        .limit(1);
      if ((recs ?? []).length > 0) return true;
    }
  }

  return false;
}

/**
 * Mantém `hub_appointments.status` alinhado ao financeiro:
 * - há recebível pago vinculado → `paid`
 * - não há → se estava `paid`, volta para `done`
 */
export async function syncHubAppointmentPaidFromReceivable(opts: {
  clinicId: string;
  receivableId: string;
}): Promise<void> {
  const { clinicId, receivableId } = opts;
  const appointmentId = await resolveAppointmentIdFromReceivable(clinicId, receivableId);
  if (!appointmentId) return;

  const hasPaid = await appointmentHasPaidReceivable(clinicId, appointmentId);
  if (hasPaid) {
    await supabaseAdmin
      .from('hub_appointments')
      .update({ status: 'paid' })
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .neq('status', 'cancelled')
      .neq('status', 'paid');
    return;
  }

  await supabaseAdmin
    .from('hub_appointments')
    .update({ status: 'done' })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .eq('status', 'paid');
}

/** @deprecated Preferir `syncHubAppointmentPaidFromReceivable` (também trata estorno). */
export async function markHubAppointmentPaidFromReceivable(opts: {
  clinicId: string;
  receivableId: string;
}): Promise<void> {
  await syncHubAppointmentPaidFromReceivable(opts);
}
