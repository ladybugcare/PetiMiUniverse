"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.waiveOriginAndCancelOpenComanda = waiveOriginAndCancelOpenComanda;
exports.handleComandaAfterOperationalCancel = handleComandaAfterOperationalCancel;
/**
 * Cancelamento operacional → comanda:
 * - sem pagamento: anula comanda aberta (waive + cancelada)
 * - com pagamento: delega a maybeFlagComandaCancellationPending
 */
const supabase_1 = require("../../config/supabase");
const hubPackagesService_1 = require("./hubPackagesService");
async function findOpenComandaIdByOrigin(clinicId, originType, originId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('origin_type', originType)
        .eq('origin_id', originId)
        .eq('status', 'aberta')
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    return data?.id ?? null;
}
async function findOpenGroomingComandaIdForAppointment(clinicId, appointmentId) {
    const { data: sessions } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('hub_appointment_id', appointmentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
    for (const sess of sessions ?? []) {
        const bySess = await findOpenComandaIdByOrigin(clinicId, 'grooming_session', sess.id);
        if (bySess)
            return bySess;
    }
    return null;
}
async function findAnyBoardingReservationForAppointment(clinicId, appointmentId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('hub_appointment_id', appointmentId)
        .is('deleted_at', null)
        .not('status', 'in', '("cancelled")')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    return data?.id ?? null;
}
async function findOpenEncounterComandaIdForAppointment(clinicId, appointmentId) {
    const { data: encs } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('hub_appointment_id', appointmentId)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
    for (const enc of encs ?? []) {
        const byEnc = await findOpenComandaIdByOrigin(clinicId, 'encounter', enc.id);
        if (byEnc)
            return byEnc;
    }
    return null;
}
/** Mesma ordem de resolveExistingOpenComandaIdForOpen (appointment). */
async function resolveOpenComandaIdForAppointment(clinicId, appointmentId) {
    const byAppt = await findOpenComandaIdByOrigin(clinicId, 'appointment', appointmentId);
    if (byAppt)
        return byAppt;
    const byGroom = await findOpenGroomingComandaIdForAppointment(clinicId, appointmentId);
    if (byGroom)
        return byGroom;
    const boardingId = await findAnyBoardingReservationForAppointment(clinicId, appointmentId);
    if (boardingId) {
        const byBoard = await findOpenComandaIdByOrigin(clinicId, 'boarding_reservation', boardingId);
        if (byBoard)
            return byBoard;
    }
    return findOpenEncounterComandaIdForAppointment(clinicId, appointmentId);
}
async function resolveOpenComandaIdForCancellation(clinicId, operationalType, operationalId) {
    if (operationalType === 'appointment') {
        return resolveOpenComandaIdForAppointment(clinicId, operationalId);
    }
    // Demais origens: resolução direta por origin_type (escopo appointment no plano).
    return findOpenComandaIdByOrigin(clinicId, operationalType, operationalId);
}
async function computePaidTotalForComanda(clinicId, comandaId) {
    const { data: recs, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (error)
        throw new Error(error.message);
    const ids = (recs ?? []).map((r) => r.id);
    if (ids.length === 0)
        return 0;
    const { data: pays, error: pErr } = await supabase_1.supabaseAdmin
        .from('hub_payments')
        .select('amount')
        .in('receivable_id', ids)
        .eq('status', 'posted');
    if (pErr)
        throw new Error(pErr.message);
    return Math.round(((pays ?? []).reduce((s, row) => s + Number(row.amount ?? 0), 0) + Number.EPSILON) * 100) / 100;
}
async function fetchActiveReceivableKeys(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('source_type, source_id')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (error)
        throw new Error(error.message);
    const set = new Set();
    for (const row of data ?? []) {
        set.add(`${row.source_type}:${row.source_id}`);
    }
    return set;
}
/** Waive na origem operacional + anula comanda aberta (núcleo do checkout cancel). */
async function waiveOriginAndCancelOpenComanda(opts) {
    const { clinicId, comandaId, originType, originId, waiveReason } = opts;
    const now = new Date().toISOString();
    if (originId) {
        if (originType === 'grooming_session') {
            await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', clinicId);
        }
        else if (originType === 'encounter') {
            await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', clinicId);
        }
        else if (originType === 'appointment') {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', clinicId);
        }
        else if (originType === 'quote') {
            await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', clinicId);
        }
        else if (originType === 'boarding_reservation') {
            await supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', clinicId);
        }
    }
    await (0, hubPackagesService_1.reversePackageRedemptionsForComanda)(clinicId, comandaId);
    await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .update({ status: 'cancelada', closed_at: now, financial_status: 'balanced' })
        .eq('id', comandaId)
        .eq('clinic_id', clinicId);
}
async function cancelUnpaidReceivablesForComanda(clinicId, comandaId, reason) {
    const { data: recs, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, status, final_amount')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (error)
        throw new Error(error.message);
    const cancelledIds = [];
    let blockedByPayment = false;
    for (const row of recs ?? []) {
        const rid = row.id;
        const { data: pays, error: pErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('id')
            .eq('receivable_id', rid)
            .eq('status', 'posted')
            .limit(1);
        if (pErr)
            throw new Error(pErr.message);
        if ((pays ?? []).length > 0) {
            blockedByPayment = true;
            continue;
        }
        const finalAmt = Number(row.final_amount ?? 0);
        if (finalAmt > 0.009) {
            await supabase_1.supabaseAdmin.from('hub_financial_adjustments').insert({
                clinic_id: clinicId,
                receivable_id: rid,
                adjustment_type: 'write_off',
                amount: finalAmt,
                reason: `Cancelamento operacional — comanda ${comandaId}: ${reason}`.slice(0, 2000),
            });
        }
        const upd = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .update({ status: 'cancelled', cancel_rebill: false })
            .eq('id', rid)
            .eq('clinic_id', clinicId);
        if (upd.error && String(upd.error.message || '').includes('cancel_rebill')) {
            await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .update({ status: 'cancelled' })
                .eq('id', rid)
                .eq('clinic_id', clinicId);
        }
        else if (upd.error) {
            throw new Error(upd.error.message);
        }
        cancelledIds.push(rid);
    }
    return { cancelledIds, blockedByPayment };
}
/** Marca pendência na comanda já resolvida (evita re-resolve que perde grooming/boarding). */
async function flagKnownComandaCancellationPending(opts) {
    const { clinicId, comandaId, operationalType, operationalId, paidAmount } = opts;
    const now = new Date().toISOString();
    const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, cancellation_pending_at, cancellation_resolved_at, unit_id, guardian_id')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (exErr || !existing || existing.cancellation_resolved_at)
        return;
    const patch = {
        cancellation_operational_at: now,
        cancellation_operational_type: operationalType,
        cancellation_operational_id: operationalId,
        financial_status: 'awaiting_balance',
    };
    const isNewPending = !existing.cancellation_pending_at;
    if (isNewPending) {
        patch.cancellation_pending_at = now;
    }
    await supabase_1.supabaseAdmin.from('hub_comandas').update(patch).eq('id', comandaId).eq('clinic_id', clinicId);
    if (isNewPending) {
        const { notifyHubCancellationPending } = await Promise.resolve().then(() => __importStar(require('./hubNotifyEvents.js')));
        void notifyHubCancellationPending({
            clinicId,
            unitId: existing.unit_id ?? null,
            comandaId,
            guardianId: existing.guardian_id ?? null,
            paidAmount,
        });
    }
}
/**
 * Após cancel/falta operacional: comanda sem pagamento é anulada;
 * com pagamento antecipado marca pendência de ajuste.
 */
async function handleComandaAfterOperationalCancel(clinicId, operationalType, operationalId, opts) {
    try {
        const comandaId = await resolveOpenComandaIdForCancellation(clinicId, operationalType, operationalId);
        if (!comandaId)
            return { kind: 'none' };
        const paidTotal = await computePaidTotalForComanda(clinicId, comandaId);
        if (paidTotal > 0.009) {
            await flagKnownComandaCancellationPending({
                clinicId,
                comandaId,
                operationalType,
                operationalId,
                paidAmount: paidTotal,
            });
            return { kind: 'pending_adjustment', comandaId };
        }
        const { data: comandaRow, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id, origin_type, origin_id, status')
            .eq('id', comandaId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        if (cErr || !comandaRow || String(comandaRow.status) !== 'aberta') {
            return { kind: 'none' };
        }
        const waiveReason = opts?.waiveReason?.trim() ||
            (operationalType === 'appointment'
                ? 'Cancelamento operacional do agendamento'
                : 'Cancelamento operacional');
        const unpaidCancel = await cancelUnpaidReceivablesForComanda(clinicId, comandaId, waiveReason);
        if (unpaidCancel.blockedByPayment) {
            console.error('handleComandaAfterOperationalCancel: recebível com pagamento posted e paid_total≈0', comandaId);
            return { kind: 'none' };
        }
        const originType = String(comandaRow.origin_type ?? '');
        const originId = comandaRow.origin_id ?? null;
        if (originType && originType !== 'manual' && originId) {
            const keys = await fetchActiveReceivableKeys(clinicId);
            if (keys.has(`${originType}:${originId}`)) {
                console.error('handleComandaAfterOperationalCancel: ainda há cobrança ativa após limpar recebíveis', comandaId);
                return { kind: 'none' };
            }
        }
        await waiveOriginAndCancelOpenComanda({
            clinicId,
            comandaId,
            originType,
            originId,
            waiveReason,
        });
        return { kind: 'cancelled', comandaId };
    }
    catch (e) {
        console.error('handleComandaAfterOperationalCancel', e);
        return { kind: 'none' };
    }
}
