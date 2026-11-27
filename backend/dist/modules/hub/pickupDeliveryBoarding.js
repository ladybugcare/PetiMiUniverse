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
exports.ensureEmbarqueHandoffResolvedForBoardedStop = ensureEmbarqueHandoffResolvedForBoardedStop;
exports.recordCustodyDivergence = recordCustodyDivergence;
exports.confirmDeliveryBoarding = confirmDeliveryBoarding;
exports.findDeliveryStopForParentAppointment = findDeliveryStopForParentAppointment;
/**
 * Confirmação de embarque na devolução L&T (pet → motorista).
 * Ortogonal ao status de deslocamento da parada; autoria imutável após o primeiro registro.
 */
const supabase_1 = require("../../config/supabase");
const ACTIVE_BOARDING = new Set(['checked_in', 'checkout_preparing']);
const TERMINAL_APPT = new Set(['done', 'paid', 'cancelled', 'no_show']);
function isLateStatus(status) {
    return status === 'en_route' || status === 'arrived' || status === 'completed';
}
/** Serviços ainda abertos na mesma visita (visit_group / parent) — independentes do mesmo dia não entram. */
async function loadLinkedServiceBlock(clinicId, petId, parentAppointmentId) {
    if (!parentAppointmentId)
        return null;
    const { data: parent, error: parentErr } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, visit_group_id, starts_at')
        .eq('id', parentAppointmentId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (parentErr)
        throw new Error(parentErr.message);
    if (!parent)
        return null;
    const { ymdInSaoPaulo, todayYmdSaoPaulo } = await Promise.resolve().then(() => __importStar(require('./receptionCustody')));
    const dayYmd = todayYmdSaoPaulo(new Date());
    let query = supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, status, appointment_kind, starts_at, visit_group_id, parent_appointment_id, title')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .is('deleted_at', null);
    const visitGroupId = parent.visit_group_id ?? null;
    if (visitGroupId) {
        query = query.or(`visit_group_id.eq.${visitGroupId},parent_appointment_id.eq.${parentAppointmentId},id.eq.${parentAppointmentId}`);
    }
    else {
        query = query.or(`parent_appointment_id.eq.${parentAppointmentId},id.eq.${parentAppointmentId}`);
    }
    const { data: rows, error } = await query;
    if (error)
        throw new Error(error.message);
    const pending = (rows ?? []).filter((a) => {
        if (a.id === parentAppointmentId)
            return false;
        if (TERMINAL_APPT.has(String(a.status)))
            return false;
        if (a.appointment_kind === 'pickup_route')
            return false;
        if (a.appointment_kind === 'hotel_stay' || a.appointment_kind === 'daycare_block')
            return false;
        if (!a.starts_at)
            return false;
        if (ymdInSaoPaulo(String(a.starts_at)) !== dayYmd)
            return false;
        return true;
    });
    if (pending.length === 0)
        return null;
    const label = (typeof pending[0].title === 'string' && pending[0].title.trim()) || 'serviço vinculado';
    return {
        kind: 'linked_service',
        message: `Há ${label} pendente na mesma visita. Conclua antes de embarcar.`,
    };
}
async function loadHardBlocks(clinicId, petId) {
    const [{ data: hosps }, { data: surgeries }, { data: boarding }] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_hospitalizations')
            .select('id, status')
            .eq('clinic_id', clinicId)
            .eq('pet_id', petId)
            .eq('status', 'active')
            .limit(1),
        supabase_1.supabaseAdmin
            .from('hub_surgeries')
            .select('id, status')
            .eq('clinic_id', clinicId)
            .eq('pet_id', petId)
            .eq('status', 'in_progress')
            .is('deleted_at', null)
            .limit(1),
        supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, status')
            .eq('clinic_id', clinicId)
            .eq('pet_id', petId)
            .in('status', [...ACTIVE_BOARDING])
            .is('deleted_at', null)
            .limit(1),
    ]);
    if ((hosps ?? []).length > 0) {
        return { kind: 'clinical', message: 'Há internação ativa. Embarque autorizado exige alta clínica.' };
    }
    if ((surgeries ?? []).length > 0) {
        return {
            kind: 'clinical',
            message: 'Há cirurgia em andamento. Embarque autorizado exige conclusão clínica.',
        };
    }
    if ((boarding ?? []).length > 0) {
        return {
            kind: 'boarding',
            message: 'Pet ainda sob custódia do Hotel/Creche. Aguarde a liberação (ready_for_handoff).',
        };
    }
    return null;
}
async function resolveOpenEmbarqueHandoff(opts) {
    const resolution = opts.source === 'driver' ? 'motorista_embarcou' : 'embarquei';
    const now = new Date().toISOString();
    let query = supabase_1.supabaseAdmin
        .from('hub_reception_handoffs')
        .select('id, source_type, source_id, context')
        .eq('clinic_id', opts.clinicId)
        .eq('kind', 'embarque')
        .eq('status', 'open');
    if (opts.petId)
        query = query.eq('pet_id', opts.petId);
    const { data: openRows, error } = await query;
    if (error)
        throw new Error(error.message);
    if (!openRows?.length)
        return false;
    const parentId = opts.parentAppointmentId;
    const candidates = openRows.filter((row) => {
        const ctx = (row.context ?? {});
        // Sem pai: só resolve handoff sem appointment_id (evita fechar visita alheia).
        if (!parentId)
            return !ctx.appointment_id;
        // Com pai: exige vínculo explícito à visita — nunca fallback para outro embarque do pet.
        if (ctx.appointment_id)
            return ctx.appointment_id === parentId;
        if (row.source_type === 'appointment' && row.source_id === parentId)
            return true;
        return false;
    });
    const target = candidates[0];
    if (!target)
        return false;
    const { data: claimed, error: claimErr } = await supabase_1.supabaseAdmin
        .from('hub_reception_handoffs')
        .update({
        status: 'done',
        resolved_at: now,
        resolved_by_staff_id: opts.staffId,
        resolution,
        updated_at: now,
    })
        .eq('id', target.id)
        .eq('status', 'open')
        .select('id')
        .maybeSingle();
    if (claimErr)
        throw new Error(claimErr.message);
    return Boolean(claimed);
}
/** Garante handoff fechado quando boarded já existe (recuperação após falha parcial). */
async function ensureEmbarqueHandoffResolvedForBoardedStop(opts) {
    return resolveOpenEmbarqueHandoff({
        clinicId: opts.clinicId,
        petId: opts.petId,
        parentAppointmentId: opts.parentAppointmentId,
        staffId: opts.boardedByStaffId,
        source: opts.boardedSource,
    });
}
async function recordCustodyDivergence(opts) {
    const { error } = await supabase_1.supabaseAdmin.from('hub_custody_divergence_events').insert({
        clinic_id: opts.clinicId,
        hub_pickup_stop_id: opts.stopId,
        pet_id: opts.petId,
        reported_by_staff_id: opts.staffId,
        block_kind: opts.blockKind,
        detail: opts.detail ?? {},
    });
    if (error)
        console.error('[pickupDeliveryBoarding] divergence', error.message);
}
/**
 * Grava boarded_* (se ainda nulo) e resolve handoff embarque.
 * Idempotente: segunda chamada preserva autoria original e só recupera handoff órfão.
 */
async function confirmDeliveryBoarding(opts) {
    const { data: stop, error: stopErr } = await supabase_1.supabaseAdmin
        .from('hub_pickup_stops')
        .select('id, clinic_id, direction, status, hub_appointment_id, hub_pickup_route_id, boarded_at, boarded_by_staff_id, boarded_source, boarded_late')
        .eq('id', opts.stopId)
        .eq('clinic_id', opts.clinicId)
        .maybeSingle();
    if (stopErr)
        return { ok: false, status: 500, error: stopErr.message };
    if (!stop)
        return { ok: false, status: 404, error: 'Parada não encontrada', code: 'NOT_FOUND' };
    const row = stop;
    if (row.direction !== 'delivery') {
        return {
            ok: false,
            status: 400,
            error: 'Embarque só se aplica a paradas de devolução.',
            code: 'NOT_DELIVERY',
        };
    }
    if (opts.source === 'driver' && opts.requireDriverStaffId) {
        if (!row.hub_pickup_route_id) {
            return { ok: false, status: 403, error: 'Parada sem rota atribuída.', code: 'FORBIDDEN' };
        }
        const { data: route, error: routeErr } = await supabase_1.supabaseAdmin
            .from('hub_pickup_routes')
            .select('id, driver_staff_id, clinic_id')
            .eq('id', row.hub_pickup_route_id)
            .eq('clinic_id', opts.clinicId)
            .maybeSingle();
        if (routeErr)
            return { ok: false, status: 500, error: routeErr.message };
        if (!route || route.driver_staff_id !== opts.requireDriverStaffId) {
            return {
                ok: false,
                status: 403,
                error: 'Motorista só pode confirmar embarque da própria rota.',
                code: 'FORBIDDEN',
            };
        }
    }
    let petId = null;
    let parentAppointmentId = null;
    if (row.hub_appointment_id) {
        const { data: leg } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, pet_id, parent_appointment_id')
            .eq('id', row.hub_appointment_id)
            .eq('clinic_id', opts.clinicId)
            .maybeSingle();
        petId = leg?.pet_id ?? null;
        parentAppointmentId = leg?.parent_appointment_id ?? null;
    }
    if (petId) {
        const hard = await loadHardBlocks(opts.clinicId, petId);
        const linked = hard
            ? null
            : await loadLinkedServiceBlock(opts.clinicId, petId, parentAppointmentId);
        const block = hard ?? linked;
        if (block && !row.boarded_at) {
            let divergenceRecorded = false;
            if (opts.reportDivergenceIfBlocked) {
                await recordCustodyDivergence({
                    clinicId: opts.clinicId,
                    stopId: row.id,
                    petId,
                    staffId: opts.staffId,
                    blockKind: block.kind,
                    detail: { message: block.message, source: opts.source },
                });
                divergenceRecorded = true;
            }
            return {
                ok: false,
                status: 409,
                error: block.message,
                code: 'BLOCKED',
                block_kind: block.kind,
                divergence_recorded: divergenceRecorded,
            };
        }
    }
    // Já embarcado: preservar autoria; recuperar handoff se necessário.
    if (row.boarded_at) {
        const source = (row.boarded_source === 'driver' || row.boarded_source === 'reception'
            ? row.boarded_source
            : opts.source);
        let handoffResolved = false;
        try {
            handoffResolved = await ensureEmbarqueHandoffResolvedForBoardedStop({
                clinicId: opts.clinicId,
                petId,
                parentAppointmentId,
                boardedSource: source,
                boardedByStaffId: row.boarded_by_staff_id,
            });
        }
        catch (e) {
            console.error('[pickupDeliveryBoarding] recover handoff', e);
        }
        if (petId) {
            const { syncReceptionHandoffsForPet } = await Promise.resolve().then(() => __importStar(require('./receptionHandoffService')));
            void syncReceptionHandoffsForPet(opts.clinicId, petId);
        }
        return {
            ok: true,
            already_boarded: true,
            boarded_at: row.boarded_at,
            boarded_by_staff_id: row.boarded_by_staff_id,
            boarded_source: source,
            boarded_late: Boolean(row.boarded_late),
            handoff_resolved: handoffResolved,
        };
    }
    const now = new Date().toISOString();
    const boardedLate = Boolean(opts.forceLate) || isLateStatus(row.status);
    const { data: updated, error: upErr } = await supabase_1.supabaseAdmin
        .from('hub_pickup_stops')
        .update({
        boarded_at: now,
        boarded_by_staff_id: opts.staffId,
        boarded_source: opts.source,
        boarded_late: boardedLate,
        updated_at: now,
    })
        .eq('id', row.id)
        .eq('clinic_id', opts.clinicId)
        .is('boarded_at', null)
        .select('id, boarded_at, boarded_by_staff_id, boarded_source, boarded_late')
        .maybeSingle();
    if (upErr)
        return { ok: false, status: 500, error: upErr.message };
    // Corrida: outro processo ganhou o UPDATE.
    if (!updated) {
        const { data: again } = await supabase_1.supabaseAdmin
            .from('hub_pickup_stops')
            .select('boarded_at, boarded_by_staff_id, boarded_source, boarded_late')
            .eq('id', row.id)
            .maybeSingle();
        if (!again?.boarded_at) {
            return { ok: false, status: 409, error: 'Não foi possível registrar o embarque.', code: 'CONFLICT' };
        }
        const source = (again.boarded_source === 'driver' || again.boarded_source === 'reception'
            ? again.boarded_source
            : opts.source);
        let handoffResolved = false;
        try {
            handoffResolved = await ensureEmbarqueHandoffResolvedForBoardedStop({
                clinicId: opts.clinicId,
                petId,
                parentAppointmentId,
                boardedSource: source,
                boardedByStaffId: again.boarded_by_staff_id ?? null,
            });
        }
        catch (e) {
            console.error('[pickupDeliveryBoarding] recover after race', e);
        }
        return {
            ok: true,
            already_boarded: true,
            boarded_at: again.boarded_at,
            boarded_by_staff_id: again.boarded_by_staff_id ?? null,
            boarded_source: source,
            boarded_late: Boolean(again.boarded_late),
            handoff_resolved: handoffResolved,
        };
    }
    let handoffResolved = false;
    try {
        handoffResolved = await resolveOpenEmbarqueHandoff({
            clinicId: opts.clinicId,
            petId,
            parentAppointmentId,
            staffId: opts.staffId,
            source: opts.source,
        });
    }
    catch (e) {
        // boarded já gravado — sync posterior recupera o handoff.
        console.error('[pickupDeliveryBoarding] handoff after board', e);
    }
    if (petId) {
        const { syncReceptionHandoffsForPet } = await Promise.resolve().then(() => __importStar(require('./receptionHandoffService')));
        void syncReceptionHandoffsForPet(opts.clinicId, petId);
    }
    return {
        ok: true,
        already_boarded: false,
        boarded_at: updated.boarded_at,
        boarded_by_staff_id: updated.boarded_by_staff_id ?? null,
        boarded_source: opts.source,
        boarded_late: Boolean(updated.boarded_late),
        handoff_resolved: handoffResolved,
    };
}
/** Localiza a parada de devolução ligada a um agendamento pai (banho/hotel/consulta). */
async function findDeliveryStopForParentAppointment(clinicId, parentAppointmentId) {
    const { data: legs, error } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('parent_appointment_id', parentAppointmentId)
        .eq('appointment_kind', 'pickup_route')
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    const legIds = (legs ?? []).map((l) => l.id);
    if (legIds.length === 0)
        return null;
    const { data: stops, error: stErr } = await supabase_1.supabaseAdmin
        .from('hub_pickup_stops')
        .select('id, status, boarded_at')
        .eq('clinic_id', clinicId)
        .eq('direction', 'delivery')
        .in('hub_appointment_id', legIds);
    if (stErr)
        throw new Error(stErr.message);
    const live = (stops ?? []).filter((s) => s.status !== 'failed');
    const preferred = live.find((s) => !s.boarded_at) ?? live[0] ?? stops?.[0];
    return preferred ? preferred.id : null;
}
