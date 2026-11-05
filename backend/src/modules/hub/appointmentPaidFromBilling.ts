import { supabaseAdmin } from '../../config/supabase';

/**
 * Espelha quitação financeira na agenda: `appointment.status = paid` só após o recebível
 * ficar pago — não no encerramento operacional da sessão de Banho & Tosa.
 */
export async function markHubAppointmentPaidFromReceivable(opts: {
  clinicId: string;
  receivableId: string;
}): Promise<void> {
  const { clinicId, receivableId } = opts;

  const { data: rec, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, clinic_id, status, source_type, source_id, comanda_id')
    .eq('id', receivableId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error || !rec) return;
  if (String(rec.status) !== 'paid') return;

  let appointmentId: string | null = null;
  const sourceType = String(rec.source_type ?? '');
  const sourceId = (rec.source_id as string | null) ?? null;

  if (sourceType === 'appointment' && sourceId) {
    appointmentId = sourceId;
  } else if (sourceType === 'grooming_session' && sourceId) {
    const { data: session } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('hub_appointment_id')
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    appointmentId = (session?.hub_appointment_id as string | null) ?? null;
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
    if (originType === 'appointment' && originId) {
      appointmentId = originId;
    } else if (originType === 'grooming_session' && originId) {
      const { data: session } = await supabaseAdmin
        .from('hub_grooming_sessions')
        .select('hub_appointment_id')
        .eq('id', originId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
      appointmentId = (session?.hub_appointment_id as string | null) ?? null;
    }
  }

  if (!appointmentId) return;

  await supabaseAdmin
    .from('hub_appointments')
    .update({ status: 'paid' })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .neq('status', 'cancelled')
    .neq('status', 'paid');
}
