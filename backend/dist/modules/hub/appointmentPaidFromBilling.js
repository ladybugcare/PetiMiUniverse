"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markHubAppointmentPaidFromReceivable = markHubAppointmentPaidFromReceivable;
const supabase_1 = require("../../config/supabase");
/**
 * Espelha quitação financeira na agenda: `appointment.status = paid` só após o recebível
 * ficar pago — não no encerramento operacional da sessão de Banho & Tosa.
 */
async function markHubAppointmentPaidFromReceivable(opts) {
    const { clinicId, receivableId } = opts;
    const { data: rec, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, clinic_id, status, source_type, source_id, comanda_id')
        .eq('id', receivableId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error || !rec)
        return;
    if (String(rec.status) !== 'paid')
        return;
    let appointmentId = null;
    const sourceType = String(rec.source_type ?? '');
    const sourceId = rec.source_id ?? null;
    if (sourceType === 'appointment' && sourceId) {
        appointmentId = sourceId;
    }
    else if (sourceType === 'grooming_session' && sourceId) {
        const { data: session } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('hub_appointment_id')
            .eq('id', sourceId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        appointmentId = session?.hub_appointment_id ?? null;
    }
    if (!appointmentId && rec.comanda_id) {
        const { data: comanda } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('origin_type, origin_id')
            .eq('id', rec.comanda_id)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        const originType = String(comanda?.origin_type ?? '');
        const originId = comanda?.origin_id ?? null;
        if (originType === 'appointment' && originId) {
            appointmentId = originId;
        }
        else if (originType === 'grooming_session' && originId) {
            const { data: session } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('hub_appointment_id')
                .eq('id', originId)
                .eq('clinic_id', clinicId)
                .maybeSingle();
            appointmentId = session?.hub_appointment_id ?? null;
        }
    }
    if (!appointmentId)
        return;
    await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .update({ status: 'paid' })
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelled')
        .neq('status', 'paid');
}
