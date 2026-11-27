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
exports.patchHubComanda = exports.postHubComandaCheckoutBulk = exports.postHubComandaSuggestItemPrice = exports.deleteHubComandaItem = exports.patchHubComandaItem = exports.postHubComandaAddItems = exports.postHubComandaResolveCancellation = exports.getHubComandaCancellationPendingCount = exports.listHubComandas = exports.getHubComandaByOrigin = exports.postHubComandaSyncFromOrigin = exports.postHubComandaCheckout = exports.postHubComandaApplyPackage = exports.getHubComandaDetail = exports.getHubComandaCupomPdf = exports.getHubComandaPdf = exports.getPublicComanda = exports.ensureComandaPublicToken = exports.postHubComandaOpen = exports.isSkippableLeavePendingHandoffError = void 0;
exports.refreshComandaFinancialStatus = refreshComandaFinancialStatus;
exports.tryVoidComandaAfterSaleFinanciallyEnded = tryVoidComandaAfterSaleFinanciallyEnded;
exports.countOpenComandasPendingCaixa = countOpenComandasPendingCaixa;
exports.tryAutoCloseComanda = tryAutoCloseComanda;
exports.resolveSurgeryMergeIntoComandaItems = resolveSurgeryMergeIntoComandaItems;
exports.applySurgeryServiceLinesToComandaItems = applySurgeryServiceLinesToComandaItems;
exports.applyEncounterServiceLinesToComandaItems = applyEncounterServiceLinesToComandaItems;
exports.leavePendingHandoffComanda = leavePendingHandoffComanda;
exports.leavePendingHandoffOpenComandasForUnit = leavePendingHandoffOpenComandasForUnit;
exports.syncOpenComandasAfterGroomingClosed = syncOpenComandasAfterGroomingClosed;
exports.syncOpenComandasAfterEncounterChargeableChange = syncOpenComandasAfterEncounterChargeableChange;
exports.isAppointmentTerminalCancelled = isAppointmentTerminalCancelled;
exports.syncOpenComandasAfterEncounterCompleted = syncOpenComandasAfterEncounterCompleted;
exports.syncOpenComandasAfterBoardingCheckedOut = syncOpenComandasAfterBoardingCheckedOut;
exports.syncOpenComandasAfterAppointmentOperationalComplete = syncOpenComandasAfterAppointmentOperationalComplete;
exports.maybeFlagComandaCancellationPending = maybeFlagComandaCancellationPending;
exports.openComandaIdsForAppointments = openComandaIdsForAppointments;
exports.financialAdjustmentFlagsForAppointments = financialAdjustmentFlagsForAppointments;
exports.financialAdjustmentFlagsForEncounters = financialAdjustmentFlagsForEncounters;
exports.fetchOpenComandaOriginKeysExported = fetchOpenComandaOriginKeysExported;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubPricingResolve_1 = require("./hubPricingResolve");
const hubQuoteDiscount_1 = require("./hubQuoteDiscount");
const auditLog_1 = require("../../utils/auditLog");
const hubComandaPdf_1 = require("./hubComandaPdf");
const hubComandaCupomPdf_1 = require("./hubComandaCupomPdf");
const hubClinicSettingsController_1 = require("./hubClinicSettingsController");
const hubPaymentMethods_1 = require("./hubPaymentMethods");
const hubCardMachineFees_1 = require("./hubCardMachineFees");
const comandaEvents_1 = require("./comandaEvents");
const comandaFinanceHandoff_1 = require("./comandaFinanceHandoff");
var comandaFinanceHandoff_2 = require("./comandaFinanceHandoff");
Object.defineProperty(exports, "isSkippableLeavePendingHandoffError", { enumerable: true, get: function () { return comandaFinanceHandoff_2.isSkippableLeavePendingHandoffError; } });
const hubNotifyEvents_1 = require("./hubNotifyEvents");
const supabaseSchemaErrors_js_1 = require("../../utils/supabaseSchemaErrors.js");
const comandaStockOut_1 = require("./comandaStockOut");
const hubTenantAsserts_1 = require("./hubTenantAsserts");
const hubPackagesService_1 = require("./hubPackagesService");
const hubInventoryStockUtils_1 = require("./hubInventoryStockUtils");
const productSalePriceRules_1 = require("./productSalePriceRules");
const appointmentPaidFromBilling_1 = require("./appointmentPaidFromBilling");
const hubCustomerCredit_1 = require("./hubCustomerCredit");
const hubCommissionAccrual_1 = require("./hubCommissionAccrual");
const hubStaffResolve_1 = require("./hubStaffResolve");
const hubSeriesBillingService_1 = require("./hubSeriesBillingService");
const hubReceivableCancelCoverage_1 = require("./hubReceivableCancelCoverage");
const uuidStr = zod_1.z.string().uuid();
/** Mapa item_id → cost_amount do catálogo (para snapshot unit_cost_amount nas linhas de produto). */
async function loadInventoryCostByItemId(clinicId, items) {
    const ids = [
        ...new Set(items
            .filter((it) => String(it.item_kind ?? '') === 'product' && it.hub_inventory_item_id)
            .map((it) => it.hub_inventory_item_id)),
    ];
    const map = new Map();
    if (ids.length === 0)
        return map;
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_inventory_items')
        .select('id, cost_amount')
        .eq('clinic_id', clinicId)
        .in('id', ids);
    for (const row of data ?? []) {
        if (row.cost_amount != null && Number.isFinite(Number(row.cost_amount))) {
            map.set(row.id, Number(row.cost_amount));
        }
    }
    return map;
}
function productUnitCostSnapshot(costByItem, item) {
    if (String(item.item_kind ?? '') !== 'product')
        return null;
    const invId = item.hub_inventory_item_id;
    if (!invId)
        return null;
    const cost = costByItem.get(invId);
    return cost != null ? round2(cost) : null;
}
async function resolveComandaItemPricingVariant(item) {
    const originType = String(item.origin_type ?? '');
    const originId = item.origin_id;
    if (originType === 'appointment_service' && originId) {
        const { data: svc } = await supabase_1.supabaseAdmin
            .from('hub_appointment_services')
            .select('pricing_variant')
            .eq('id', originId)
            .maybeSingle();
        const raw = svc?.pricing_variant;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return raw;
        }
    }
    return null;
}
const comandaEditScopes_1 = require("./comandaEditScopes");
const comandaEditContextSchema = zod_1.z.enum(['caixa', 'financeiro']).optional().default('caixa');
async function assertComandaEditAllowed(comandaId, clinicId, context) {
    const { data: comandaRow, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('*')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!comandaRow)
        throw new Error('NOT_FOUND');
    const { balance_due } = await computeComandaBalancePayload(comandaId, clinicId);
    const operational_complete = await isOperationalCompleteForComanda(comandaRow);
    const scopes = (0, comandaEditScopes_1.computeComandaEditScopes)(comandaRow, operational_complete, balance_due);
    if (!scopes[context]) {
        throw new Error((0, comandaEditScopes_1.editScopeErrorMessage)(scopes, context));
    }
}
/**
 * Valida FKs efetivas da comanda antes de qualquer INSERT.
 * Em `manual`/`package` (IDs vindos do body), também valida tutor/pets/vínculo.
 * Em origens operacionais, valida unit/encounter/case persistidos (body ou resolução).
 */
async function assertComandaPersistedTenantFks(opts) {
    if (!(await (0, hubTenantAsserts_1.assertUnitInClinic)(opts.clinicId, opts.unitId))) {
        return { ok: false, error: 'Unidade inválida' };
    }
    if (!(await (0, hubTenantAsserts_1.assertEncounterInClinic)(opts.clinicId, opts.encounterId))) {
        return { ok: false, error: 'Atendimento inválido' };
    }
    if (!(await (0, hubTenantAsserts_1.assertCaseInClinic)(opts.clinicId, opts.caseId))) {
        return { ok: false, error: 'Caso clínico inválido' };
    }
    const clientSuppliedIds = opts.originType === 'manual' || opts.originType === 'package';
    if (!clientSuppliedIds) {
        return { ok: true };
    }
    if (!(await (0, hubTenantAsserts_1.assertGuardianInClinic)(opts.clinicId, opts.guardianId))) {
        return { ok: false, error: 'Tutor inválido' };
    }
    const uniquePets = [
        ...new Set(opts.petIds.filter((id) => typeof id === 'string' && id.length > 0)),
    ];
    for (const petId of uniquePets) {
        if (!(await (0, hubTenantAsserts_1.assertPetInClinic)(opts.clinicId, petId))) {
            return { ok: false, error: 'Pet inválido' };
        }
    }
    const guardianId = opts.guardianId ?? null;
    if (guardianId) {
        for (const petId of uniquePets) {
            if (!(await (0, hubTenantAsserts_1.assertGuardianLinkedToPet)(petId, guardianId))) {
                return { ok: false, error: 'Tutor inválido' };
            }
        }
    }
    return { ok: true };
}
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
const boardingBilling_1 = require("./boardingBilling");
const boardingOperational_1 = require("./boardingOperational");
const groomingStages_1 = require("./groomingStages");
const hubHospitalizationBilling_1 = require("./hubHospitalizationBilling");
async function loadServiceGroupByIds(serviceTypeIds) {
    const ids = [...new Set(serviceTypeIds.filter(Boolean))];
    const map = new Map();
    if (ids.length === 0)
        return map;
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, service_group')
        .in('id', ids);
    for (const row of data ?? []) {
        map.set(row.id, row.service_group);
    }
    return map;
}
const hubComandaSchemas_1 = require("./hubComandaSchemas");
async function resolveClinicDefaultUnitId(clinicId) {
    const { data: main } = await supabase_1.supabaseAdmin
        .from('units')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('is_main', true)
        .limit(1)
        .maybeSingle();
    if (main?.id)
        return main.id;
    const { data: first } = await supabase_1.supabaseAdmin
        .from('units')
        .select('id')
        .eq('clinic_id', clinicId)
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle();
    return first?.id ?? null;
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
async function fetchOpenComandaOriginKeys(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('origin_type, origin_id')
        .eq('clinic_id', clinicId)
        .eq('status', 'aberta')
        .is('deleted_at', null)
        .not('origin_id', 'is', null);
    if (error)
        throw new Error(error.message);
    const set = new Set();
    for (const row of data ?? []) {
        const oid = row.origin_id;
        if (oid)
            set.add(`${row.origin_type}:${oid}`);
    }
    const { expandBoardingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./boardingOriginKeys')));
    const { expandGroomingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./groomingOriginKeys')));
    const withBoarding = await expandBoardingAppointmentOriginKeys(clinicId, set);
    return expandGroomingAppointmentOriginKeys(clinicId, withBoarding);
}
/** Origens de comandas não canceladas que já têm recebível (source_type do recebível pode ser manual). */
async function fetchBilledComandaOriginKeys(clinicId) {
    const keys = new Set();
    const { data: comandas, error: cErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, origin_type, origin_id, status')
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelada')
        .is('deleted_at', null)
        .not('origin_id', 'is', null);
    if (cErr)
        throw new Error(cErr.message);
    if (!comandas?.length)
        return keys;
    const comandaIds = comandas.map((c) => c.id);
    const { data: receivables, error: rErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('comanda_id')
        .eq('clinic_id', clinicId)
        .in('comanda_id', comandaIds)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (rErr)
        throw new Error(rErr.message);
    const billedComandaIds = new Set((receivables ?? []).map((r) => r.comanda_id).filter(Boolean));
    for (const c of comandas) {
        if (billedComandaIds.has(c.id) || String(c.status) === 'fechada') {
            keys.add(`${c.origin_type}:${c.origin_id}`);
        }
    }
    const { expandBoardingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./boardingOriginKeys')));
    const { expandGroomingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./groomingOriginKeys')));
    const withBoarding = await expandBoardingAppointmentOriginKeys(clinicId, keys);
    return expandGroomingAppointmentOriginKeys(clinicId, withBoarding);
}
/**
 * Origens de itens já faturados em outras comandas (`origin_type:origin_id`).
 * Checkout grava recebível como `source_type=manual`; a fatura real fica na comanda/linha.
 * Usado para não re-lançar `appointment_service` (ex.: consulta paga na agenda) ao montar
 * o snapshot do encounter.
 */
async function fetchInvoicedComandaItemOriginKeys(clinicId) {
    const keys = new Set();
    const addItemOrigins = (rows) => {
        for (const it of rows ?? []) {
            const ot = it.origin_type;
            const oid = it.origin_id;
            if (ot && oid)
                keys.add(`${ot}:${oid}`);
        }
    };
    // Comanda fechada = quitada: todos os itens com origem operacional já foram cobrados.
    const { data: closedComandas, error: closedErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('status', 'fechada')
        .is('deleted_at', null);
    if (closedErr)
        throw new Error(closedErr.message);
    const closedIds = (closedComandas ?? []).map((c) => c.id);
    if (closedIds.length > 0) {
        const { data: closedItems, error: closedItemsErr } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .select('origin_type, origin_id')
            .eq('clinic_id', clinicId)
            .in('comanda_id', closedIds);
        if (closedItemsErr)
            throw new Error(closedItemsErr.message);
        addItemOrigins(closedItems);
    }
    // Comanda ainda aberta com cobrança parcial: só itens ligados a recebível ativo.
    const { data: receivables, error: rErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (rErr)
        throw new Error(rErr.message);
    const recIds = (receivables ?? []).map((r) => r.id);
    if (recIds.length === 0)
        return keys;
    const { data: lines, error: lineErr } = await supabase_1.supabaseAdmin
        .from('hub_receivable_lines')
        .select('comanda_item_id')
        .in('receivable_id', recIds)
        .not('comanda_item_id', 'is', null);
    if (lineErr)
        throw new Error(lineErr.message);
    const itemIds = [
        ...new Set((lines ?? []).map((l) => l.comanda_item_id).filter(Boolean)),
    ];
    if (itemIds.length === 0)
        return keys;
    const { data: invoicedItems, error: itemsErr } = await supabase_1.supabaseAdmin
        .from('hub_comanda_items')
        .select('origin_type, origin_id')
        .eq('clinic_id', clinicId)
        .in('id', itemIds);
    if (itemsErr)
        throw new Error(itemsErr.message);
    addItemOrigins(invoicedItems);
    return keys;
}
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
/** Reutiliza comanda aberta do agendamento ao abrir checkout pela sessão B&T ou pelo encounter. */
async function resolveExistingOpenComandaIdForOpen(clinicId, originType, originId) {
    if (originType === 'grooming_session') {
        const bySess = await findOpenComandaIdByOrigin(clinicId, 'grooming_session', originId);
        if (bySess)
            return bySess;
        const { data: session } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('hub_appointment_id')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        const apptId = session?.hub_appointment_id ?? null;
        if (apptId) {
            const byAppt = await findOpenComandaIdByOrigin(clinicId, 'appointment', apptId);
            if (byAppt)
                return byAppt;
        }
    }
    if (originType === 'encounter') {
        const { data: enc } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('hub_appointment_id')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        const apptId = enc?.hub_appointment_id ?? null;
        if (apptId) {
            const byAppt = await findOpenComandaIdByOrigin(clinicId, 'appointment', apptId);
            if (byAppt)
                return byAppt;
        }
        const byEnc = await findOpenComandaIdByOrigin(clinicId, 'encounter', originId);
        if (byEnc)
            return byEnc;
    }
    if (originType === 'appointment') {
        const byAppt = await findOpenComandaIdByOrigin(clinicId, 'appointment', originId);
        if (byAppt)
            return byAppt;
        const byGroom = await findOpenGroomingComandaIdForAppointment(clinicId, originId);
        if (byGroom)
            return byGroom;
        const boardingId = await findAnyBoardingReservationForAppointment(clinicId, originId);
        if (boardingId) {
            const byBoard = await findOpenComandaIdByOrigin(clinicId, 'boarding_reservation', boardingId);
            if (byBoard)
                return byBoard;
        }
        return findOpenEncounterComandaIdForAppointment(clinicId, originId);
    }
    if (originType === 'boarding_reservation') {
        const byBoard = await findOpenComandaIdByOrigin(clinicId, 'boarding_reservation', originId);
        if (byBoard)
            return byBoard;
        const { data: rsv } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('hub_appointment_id')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        const apptId = rsv?.hub_appointment_id ?? null;
        if (apptId) {
            const byAppt = await findOpenComandaIdByOrigin(clinicId, 'appointment', apptId);
            if (byAppt)
                return byAppt;
        }
        return null;
    }
    return findOpenComandaIdByOrigin(clinicId, originType, originId);
}
async function findLatestClosedGroomingSessionIdForAppointment(clinicId, appointmentId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('hub_appointment_id', appointmentId)
        .eq('grooming_stage', 'closed')
        .is('deleted_at', null)
        .order('closed_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    return data?.id ?? null;
}
async function findLatestCompletedEncounterIdForAppointment(clinicId, appointmentId) {
    return findLatestEncounterIdForAppointment(clinicId, appointmentId, { completedOnly: true });
}
async function findLatestEncounterIdForAppointment(clinicId, appointmentId, opts) {
    let q = supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('id, status, completed_at, created_at')
        .eq('clinic_id', clinicId)
        .eq('hub_appointment_id', appointmentId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (opts?.completedOnly) {
        q = q.eq('status', 'completed').order('completed_at', { ascending: false, nullsFirst: false });
    }
    else if (opts?.anyOpen) {
        q = q.neq('status', 'completed').order('created_at', { ascending: false });
    }
    else {
        q = q.order('created_at', { ascending: false });
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error)
        throw new Error(error.message);
    return data?.id ?? null;
}
/** Reserva de hotel/creche cobrável ligada ao agendamento (ativa ou já com check-out). */
async function findBillableBoardingReservationForAppointment(clinicId, appointmentId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('id, status, checked_out_at, created_at')
        .eq('clinic_id', clinicId)
        .eq('hub_appointment_id', appointmentId)
        .is('deleted_at', null)
        .not('status', 'in', '("cancelled","no_show")')
        .order('checked_out_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!data?.id)
        return null;
    const st = String(data.status ?? '');
    if (!(0, boardingOperational_1.isBoardingStatusReadyForComanda)(st, { allowIncomplete: true }))
        return null;
    return data.id;
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
async function appendGroomingExtrasToAppointmentSnapshot(clinicId, appointmentId, base) {
    const closedSess = await findLatestClosedGroomingSessionIdForAppointment(clinicId, appointmentId);
    if (!closedSess)
        return base;
    const extras = await sumGroomingExtrasForComanda(closedSess, clinicId, base.pet_id);
    return {
        ...base,
        items: [...base.items, ...extras.items],
        subtotal: round2(base.subtotal + extras.subtotal),
    };
}
async function isOperationalCompleteForComanda(comanda) {
    const originType = String(comanda.origin_type ?? '');
    const originId = comanda.origin_id;
    const clinicId = comanda.clinic_id;
    if (!originId)
        return true;
    if (originType === 'quote')
        return true;
    if (originType === 'manual')
        return true;
    if (originType === 'package')
        return true;
    if (originType === 'appointment') {
        // Encounter clínico aberto → serviço em andamento (mesmo se a agenda já estiver "paid" por cobrança antecipada).
        const openEncId = await findLatestEncounterIdForAppointment(clinicId, originId, { anyOpen: true });
        if (openEncId)
            return false;
        const { data: appt } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('status')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        const st = String(appt?.status ?? '');
        return st === 'done' || st === 'paid';
    }
    if (originType === 'grooming_session') {
        const { data: s } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('grooming_stage')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        // Pronto = serviço concluído (custódia/retirada pode continuar em ready).
        return (0, groomingStages_1.isGroomingServiceOperationallyDone)(String(s?.grooming_stage ?? ''));
    }
    if (originType === 'encounter') {
        const { data: e } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('status')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        return String(e?.status ?? '') === 'completed';
    }
    if (originType === 'boarding_reservation') {
        const { data: r } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('status')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        return String(r?.status ?? '') === 'checked_out';
    }
    return true;
}
async function listReceivableIdsForComandaPayments(comandaId, clinicId) {
    const { data: recs, error: rErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelled');
    if (rErr)
        throw new Error(rErr.message);
    return (recs ?? []).map((r) => r.id);
}
async function listPostedPaymentsForComandaReceivables(comandaId, clinicId, selectCols) {
    const ids = await listReceivableIdsForComandaPayments(comandaId, clinicId);
    if (ids.length === 0)
        return [];
    const { data: pays, error: pErr } = await supabase_1.supabaseAdmin
        .from('hub_payments')
        .select(selectCols)
        .in('receivable_id', ids)
        .eq('status', 'posted');
    if (pErr)
        throw new Error(pErr.message);
    return (pays ?? []);
}
/** Pagamentos da timeline da comanda (um evento por lançamento; posted + reversed). */
async function listTimelinePaymentsForComanda(comandaId, clinicId) {
    const ids = await listReceivableIdsForComandaPayments(comandaId, clinicId);
    if (ids.length === 0)
        return [];
    const { data: pays, error: pErr } = await supabase_1.supabaseAdmin
        .from('hub_payments')
        .select('id, amount, payment_method, status, payment_date, effective_payment_date, created_at')
        .in('receivable_id', ids)
        .in('status', ['posted', 'reversed'])
        .order('created_at', { ascending: true });
    if (pErr)
        throw new Error(pErr.message);
    return (pays ?? []).map((row) => {
        const at = String(row.effective_payment_date ?? '') ||
            String(row.payment_date ?? '') ||
            String(row.created_at ?? '');
        return {
            id: String(row.id),
            amount: round2(Number(row.amount ?? 0)),
            payment_method: String(row.payment_method ?? ''),
            status: String(row.status ?? ''),
            payment_date: at,
        };
    });
}
async function sumPaymentsForComandaReceivables(comandaId, clinicId) {
    const pays = await listPostedPaymentsForComandaReceivables(comandaId, clinicId, 'amount');
    return round2(pays.reduce((s, row) => s + Number(row.amount ?? 0), 0));
}
const EMPTY_CARD_FEE_TOTALS = {
    card_gross_total: 0,
    card_fee_total: 0,
    card_net_total: 0,
    card_without_fee_gross_total: 0,
};
/** Totais de taxa da maquininha na comanda (somente pagamentos posted). */
async function computeComandaCardFeeTotals(comandaId, clinicId) {
    const pays = await listPostedPaymentsForComandaReceivables(comandaId, clinicId, 'amount, payment_method, card_fee_amount, net_amount');
    return (0, hubCardMachineFees_1.aggregateCardFeeTotals)(pays.map((row) => ({
        payment_method: String(row.payment_method ?? ''),
        amount: Number(row.amount ?? 0),
        card_fee_amount: row.card_fee_amount == null || !Number.isFinite(Number(row.card_fee_amount))
            ? null
            : Number(row.card_fee_amount),
        net_amount: row.net_amount == null || !Number.isFinite(Number(row.net_amount))
            ? null
            : Number(row.net_amount),
    })));
}
/** Saldo em linhas ainda não faturadas (líquidas do desconto de cabeçalho) + resíduo dos recebíveis. */
async function computeComandaBalancePayload(comandaId, clinicId) {
    const { data: comandaRow, error: cErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('total_amount, discount_amount')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (cErr)
        throw new Error(cErr.message);
    const totalAmount = Number(comandaRow?.total_amount ?? 0);
    const headerDiscount = Number(comandaRow?.discount_amount ?? 0);
    const { data: items, error: iErr } = await supabase_1.supabaseAdmin
        .from('hub_comanda_items')
        .select('id, line_total')
        .eq('comanda_id', comandaId)
        .order('sort_order', { ascending: true });
    if (iErr)
        throw new Error(iErr.message);
    const { data: lineRows } = await supabase_1.supabaseAdmin
        .from('hub_receivable_lines')
        .select('comanda_item_id, receivable_id')
        .eq('comanda_id', comandaId)
        .not('comanda_item_id', 'is', null);
    const recIds = [...new Set((lineRows ?? []).map((r) => r.receivable_id))];
    /** Recebível “conta” para faturamento de itens (não reabre linha na comanda). */
    let billsItemByRecId = new Map();
    /** Recebível listável na ficha financeira (exclui cancelamento puro sem devolução). */
    let listableRecById = new Map();
    if (recIds.length) {
        const { data: recs, error: covErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, status, returned_amount, cancel_rebill')
            .in('id', recIds);
        const coverageRows = covErr && String(covErr.message || '').includes('cancel_rebill')
            ? (await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, status, returned_amount')
                .in('id', recIds)).data
            : recs;
        for (const r of coverageRows ?? []) {
            const id = r.id;
            // reissue (legado/cancel_rebill≠false) reabre itens; void_sale mantém cobertos.
            billsItemByRecId.set(id, (0, hubReceivableCancelCoverage_1.receivableBillsComandaItem)(r));
            listableRecById.set(id, (0, hubReceivableCancelCoverage_1.receivableListableOnComanda)(r));
        }
    }
    const invoicedItemIds = new Set();
    for (const row of lineRows ?? []) {
        const cid = row.comanda_item_id;
        const rid = row.receivable_id;
        if (cid && billsItemByRecId.get(rid))
            invoicedItemIds.add(cid);
    }
    const allItems = items ?? [];
    const openItemIds = allItems.map((it) => it.id).filter((id) => !invoicedItemIds.has(id));
    const openSet = new Set(openItemIds);
    const openLinesTotal = round2(allItems.filter((it) => openSet.has(it.id)).reduce((s, it) => s + Number(it.line_total ?? 0), 0));
    const allLinesTotal = round2(allItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
    const postedGross = await sumPaymentsForComandaReceivables(comandaId, clinicId);
    let recs = null;
    {
        const primary = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, final_amount, status, returned_amount, cancel_rebill')
            .eq('comanda_id', comandaId)
            .eq('clinic_id', clinicId);
        if (primary.error && String(primary.error.message || '').includes('cancel_rebill')) {
            const legacy = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, final_amount, status, returned_amount')
                .eq('comanda_id', comandaId)
                .eq('clinic_id', clinicId);
            if (legacy.error)
                throw new Error(legacy.error.message);
            recs = (legacy.data ?? []);
        }
        else if (primary.error) {
            throw new Error(primary.error.message);
        }
        else {
            recs = (primary.data ?? []);
        }
    }
    let receivableResidual = 0;
    let netTotal = 0;
    let returnedTotal = 0;
    let lineRefundsTotal = 0;
    let paidNetTotal = 0;
    for (const r of recs ?? []) {
        const rid = r.id;
        const returnedAmt = Number(r.returned_amount ?? 0);
        // Cancelamento sem devolução (void ou reissue) não entra no líquido vigente.
        if ((0, hubReceivableCancelCoverage_1.isFinancialCancelWithoutReturn)(r))
            continue;
        const fa = Number(r.final_amount ?? 0);
        netTotal = round2(netTotal + fa);
        returnedTotal = round2(returnedTotal + returnedAmt);
        const [{ data: pays }, { data: refundAdjs }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_payments')
                .select('amount')
                .eq('receivable_id', rid)
                .eq('status', 'posted'),
            supabase_1.supabaseAdmin
                .from('hub_financial_adjustments')
                .select('amount, payment_id')
                .eq('receivable_id', rid)
                .eq('adjustment_type', 'refund'),
        ]);
        const postedRec = round2((pays ?? []).reduce((a, row) => a + Number(row.amount ?? 0), 0));
        const lineRefundsRec = round2((refundAdjs ?? [])
            .filter((row) => row.payment_id == null)
            .reduce((a, row) => a + Number(row.amount ?? 0), 0));
        lineRefundsTotal = round2(lineRefundsTotal + lineRefundsRec);
        const netPaidRec = round2(Math.max(0, postedRec - lineRefundsRec));
        paidNetTotal = round2(paidNetTotal + netPaidRec);
        // refunded: episódio financeiro encerrado — sem residual a cobrar.
        if ((0, hubReceivableCancelCoverage_1.receivableResidualCountsTowardBalance)(r)) {
            receivableResidual += round2(Math.max(0, fa - netPaidRec));
        }
    }
    // Itens ainda não faturados entram no líquido vigente da comanda.
    const openHeaderDisc = (0, comandaFinanceHandoff_1.openLinesHeaderDiscount)({
        openLinesTotal,
        allLinesTotal,
        headerDiscount,
        openItemsCount: openItemIds.length,
        allItemsCount: allItems.length,
    });
    netTotal = round2(netTotal + Math.max(0, openLinesTotal - openHeaderDisc));
    const balance_due = (0, comandaFinanceHandoff_1.computeBalanceDueFromParts)({
        openLinesTotal,
        allLinesTotal,
        headerDiscount,
        openItemsCount: openItemIds.length,
        allItemsCount: allItems.length,
        receivableResidual,
    });
    return {
        /** Pago líquido efetivo (posted − refunds de linha). */
        paid_total: paidNetTotal,
        balance_due,
        /** Bruto original da comanda (linhas históricas preservadas). */
        total_amount: totalAmount,
        net_total: netTotal,
        returned_amount: returnedTotal,
        posted_total: postedGross,
        line_refunds_total: lineRefundsTotal,
    };
}
/** Preenche finance_handoff_at sem criar recebíveis (ex.: saldo restante após pagamento parcial). */
async function applyFinanceHandoffOnly(comandaId, clinicId, detail, dueDate) {
    const comanda = detail.comanda;
    const activeRecIds = detail.active_receivable_ids;
    if (comanda.finance_handoff_at) {
        return activeRecIds;
    }
    if (!(0, comandaFinanceHandoff_1.canHandoffExistingReceivables)(detail)) {
        throw new Error('HANDOFF_NOT_APPLICABLE');
    }
    const { error: updErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .update({ finance_handoff_at: new Date().toISOString() })
        .eq('id', comandaId)
        .eq('clinic_id', clinicId);
    if (updErr)
        throw new Error(updErr.message);
    if (dueDate) {
        await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .update({ due_date: dueDate })
            .in('id', activeRecIds)
            .eq('clinic_id', clinicId)
            .in('status', ['pending', 'partially_paid']);
    }
    return activeRecIds;
}
/** Atualiza financial_status pelo saldo real — inclusive comanda fechada (não reabre). */
async function refreshComandaFinancialStatus(comandaId, clinicId, comandaRow) {
    const total = Number(comandaRow.total_amount ?? 0);
    const { balance_due } = await computeComandaBalancePayload(comandaId, clinicId);
    const opDone = await isOperationalCompleteForComanda(comandaRow);
    let financial = 'open';
    if (balance_due > 0.02)
        financial = 'awaiting_balance';
    else if (balance_due <= 0.02 && total > 0)
        financial = opDone ? 'balanced' : 'awaiting_balance';
    else
        financial = opDone ? 'balanced' : 'open';
    await supabase_1.supabaseAdmin.from('hub_comandas').update({ financial_status: financial }).eq('id', comandaId).eq('clinic_id', clinicId);
}
/**
 * Após reembolso/void total: se não restar recebível cobrável, anula a comanda
 * (evita fantasma em “Pendentes de dias anteriores” no caixa).
 * Não usa `receivableListableOnComanda` — `refunded` é listável na ficha, mas não mantém cobrança.
 */
async function tryVoidComandaAfterSaleFinanciallyEnded(opts) {
    const comandaId = opts.comandaId;
    if (!comandaId)
        return { comanda_status: null };
    const { data: comandaRow } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('*')
        .eq('id', comandaId)
        .eq('clinic_id', opts.clinicId)
        .maybeSingle();
    if (!comandaRow)
        return { comanda_status: null };
    const currentStatus = String(comandaRow.status ?? '');
    if (currentStatus === 'cancelada') {
        await refreshComandaFinancialStatus(comandaId, opts.clinicId, comandaRow);
        return { comanda_status: 'cancelada' };
    }
    let siblings = [];
    {
        const primary = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, status, returned_amount, cancel_rebill')
            .eq('comanda_id', comandaId)
            .eq('clinic_id', opts.clinicId)
            .is('deleted_at', null);
        if (primary.error && String(primary.error.message || '').includes('cancel_rebill')) {
            const legacy = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, status, returned_amount')
                .eq('comanda_id', comandaId)
                .eq('clinic_id', opts.clinicId)
                .is('deleted_at', null);
            siblings = (legacy.data ?? []);
        }
        else {
            siblings = (primary.data ?? []);
        }
    }
    // Sem recebíveis: comanda ainda não faturada (ex. venda rápida aberta) — não anular.
    const stillChargeable = siblings.some((r) => (0, hubReceivableCancelCoverage_1.receivableKeepsComandaChargeable)(r));
    if (siblings.length === 0 || stillChargeable) {
        await refreshComandaFinancialStatus(comandaId, opts.clinicId, comandaRow);
        return { comanda_status: currentStatus || null };
    }
    const now = new Date().toISOString();
    const originType = String(comandaRow.origin_type ?? '');
    const originId = comandaRow.origin_id;
    const waiveReason = `Anulação financeira: ${opts.reason}`.slice(0, 2000);
    if (originId) {
        if (originType === 'grooming_session') {
            await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', opts.clinicId);
        }
        else if (originType === 'encounter') {
            await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', opts.clinicId);
        }
        else if (originType === 'appointment') {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', opts.clinicId);
        }
        else if (originType === 'quote') {
            await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', opts.clinicId);
        }
        else if (originType === 'boarding_reservation') {
            await supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
                .eq('id', originId)
                .eq('clinic_id', opts.clinicId);
        }
    }
    await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .update({ status: 'cancelada', closed_at: now, financial_status: 'balanced' })
        .eq('id', comandaId)
        .eq('clinic_id', opts.clinicId);
    return { comanda_status: 'cancelada' };
}
/**
 * Contagem usada pelo Financeiro / visão geral — alinhada ao caixa (edit_scopes.caixa + saldo).
 * Cura comandas fantasma (aberta sem saldo cobrável) no enriquecimento.
 */
async function countOpenComandasPendingCaixa(clinicId, unitId) {
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, total_amount, status, finance_handoff_at, origin_type, origin_id')
        .eq('clinic_id', clinicId)
        .or(`unit_id.eq.${unitId},unit_id.is.null`)
        .eq('status', 'aberta')
        .is('finance_handoff_at', null)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    let count = 0;
    let total = 0;
    for (const row of rows ?? []) {
        const comandaId = row.id;
        let { balance_due } = await computeComandaBalancePayload(comandaId, clinicId);
        if (balance_due <= 0.02) {
            try {
                const voided = await tryVoidComandaAfterSaleFinanciallyEnded({
                    clinicId,
                    comandaId,
                    reason: 'Cura automática: sem saldo cobrável',
                });
                if (voided.comanda_status === 'cancelada')
                    continue;
                const closed = await tryAutoCloseComanda(comandaId, clinicId);
                if (closed)
                    continue;
                ({ balance_due } = await computeComandaBalancePayload(comandaId, clinicId));
            }
            catch (e) {
                console.warn('[hub_comandas] countOpenComandasPendingCaixa heal', comandaId, e);
            }
        }
        if (balance_due <= 0.02)
            continue;
        const operational_complete = await isOperationalCompleteForComanda(row);
        const scopes = (0, comandaEditScopes_1.computeComandaEditScopes)(row, operational_complete, balance_due);
        if (!scopes.caixa)
            continue;
        count += 1;
        total = round2(total + balance_due);
    }
    return { count, total: round2(total) };
}
/** Fecha comanda aberta quando saldo quitado e sem itens em aberto. */
async function tryAutoCloseComanda(comandaId, clinicId) {
    const { data: comandaRow, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('*')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error || !comandaRow)
        return false;
    if (String(comandaRow.status) !== 'aberta')
        return false;
    // Pagamento antecipado com serviço em andamento: mantém aberta para novos itens (ex. medicação no AT).
    const opDone = await isOperationalCompleteForComanda(comandaRow);
    if (!opDone) {
        await refreshComandaFinancialStatus(comandaId, clinicId, comandaRow);
        return false;
    }
    const detail = await getHubComandaDetailPayload(comandaId, clinicId);
    const stillOpenItems = detail.open_item_ids.length > 0;
    const balAfter = Number(detail.balance_due ?? 0);
    const total = Number(comandaRow.total_amount ?? 0);
    const itemCount = Array.isArray(detail.items) ? detail.items.length : 0;
    const hasPackageCoverage = Array.isArray(detail.items)
        ? detail.items.some((it) => Boolean(it.package_balance_id))
        : false;
    // Não fecha comanda vazia (ex.: manual aberta sem itens ainda).
    // Cobertura total por pacote: itens podem permanecer em open_item_ids (sem recebível).
    // Só fecha após resgate confirmado — aplicar pacote sozinho não encerra.
    if (balAfter > 0.02)
        return false;
    if (itemCount === 0)
        return false;
    if (stillOpenItems) {
        if (!(hasPackageCoverage && total <= 0.02))
            return false;
        const packageItemIds = detail.items
            .filter((it) => Boolean(it.package_balance_id))
            .map((it) => it.id);
        if (!packageItemIds.length)
            return false;
        const { data: redemptions } = await supabase_1.supabaseAdmin
            .from('hub_package_redemptions')
            .select('id')
            .in('comanda_item_id', packageItemIds)
            .is('reversed_at', null)
            .limit(1);
        if (!redemptions?.length)
            return false;
    }
    else if (total <= 0.02 && !hasPackageCoverage) {
        return false;
    }
    const now = new Date().toISOString();
    const { error: closeErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .update({ status: 'fechada', closed_at: now })
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .eq('status', 'aberta');
    if (closeErr)
        throw new Error(closeErr.message);
    const { data: comandaFresh } = await supabase_1.supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();
    if (comandaFresh) {
        await refreshComandaFinancialStatus(comandaId, clinicId, comandaFresh);
    }
    return true;
}
async function syncAndTryAutoCloseComanda(clinicId, comandaId) {
    try {
        await applySyncComandaFromOrigin(clinicId, comandaId);
    }
    catch (e) {
        console.error('syncAndTryAutoCloseComanda sync', comandaId, e);
    }
    try {
        await tryAutoCloseComanda(comandaId, clinicId);
    }
    catch (e) {
        console.error('syncAndTryAutoCloseComanda close', comandaId, e);
    }
}
/** Omite `package_balance_id` quando null — evita erro no PostgREST se a migration 078 ainda não rodou. */
function comandaItemInsertRow(clinicId, comandaId, it) {
    const row = {
        clinic_id: clinicId,
        comanda_id: comandaId,
        pet_id: it.pet_id,
        item_kind: it.item_kind,
        hub_service_type_id: it.hub_service_type_id,
        hub_inventory_item_id: it.hub_inventory_item_id,
        hub_inventory_lot_id: it.hub_inventory_lot_id,
        description: it.description,
        quantity: it.quantity,
        unit_amount: it.unit_amount,
        discount_amount: it.discount_amount,
        line_total: it.line_total,
        service_date: it.service_date,
        origin_type: it.origin_type,
        origin_id: it.origin_id,
        sort_order: it.sort_order,
    };
    if (it.package_balance_id != null)
        row.package_balance_id = it.package_balance_id;
    return row;
}
async function sumAppointmentServicesSaleForComanda(appointmentId, defaultPetId) {
    const { data: svcRows, error } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('id, hub_service_type_id, order_index, sale_amount_applied, hub_service_types(name, sale_amount)')
        .eq('appointment_id', appointmentId)
        .order('order_index', { ascending: true });
    if (error)
        throw new Error(error.message);
    const items = [];
    let subtotal = 0;
    let idx = 0;
    for (const row of svcRows ?? []) {
        const st = row.hub_service_types;
        const stRow = Array.isArray(st) ? st[0] : st;
        const sale = (0, hubPricingResolve_1.resolveAppliedSaleAmount)(row.sale_amount_applied, stRow?.sale_amount);
        const desc = stRow?.name || 'Serviço';
        subtotal += sale;
        items.push({
            pet_id: defaultPetId,
            item_kind: 'service',
            hub_service_type_id: row.hub_service_type_id ?? null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: desc,
            quantity: 1,
            unit_amount: sale,
            discount_amount: 0,
            line_total: sale,
            service_date: null,
            origin_type: 'appointment_service',
            origin_id: row.id,
            sort_order: idx++,
        });
    }
    return { items, subtotal: round2(subtotal) };
}
async function sumGroomingExtrasForComanda(sessionId, clinicId, defaultPetId) {
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_session_extras')
        .select('id, hub_service_type_id, name_snapshot, sale_amount_snapshot')
        .eq('hub_grooming_session_id', sessionId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    const items = [];
    let subtotal = 0;
    let idx = 1000;
    for (const row of rows ?? []) {
        const sale = Number(row.sale_amount_snapshot ?? 0);
        subtotal += sale;
        items.push({
            pet_id: defaultPetId,
            item_kind: 'service',
            hub_service_type_id: row.hub_service_type_id ?? null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: String(row.name_snapshot || 'Adicional'),
            quantity: 1,
            unit_amount: sale,
            discount_amount: 0,
            line_total: sale,
            service_date: null,
            origin_type: 'grooming_extra',
            origin_id: row.id,
            sort_order: idx++,
        });
    }
    return { items, subtotal: round2(subtotal) };
}
const APPOINTMENT_STATUSES_OPEN_FOR_COMANDA = new Set([
    'pending_confirm',
    'confirmed',
    'checked_in',
    'in_progress',
    'done',
    'paid',
]);
/** Agendamentos com comanda ativa (não cancelada) na origem `appointment`. */
async function appointmentIdsWithActiveComanda(clinicId, appointmentIds) {
    const out = new Set();
    if (!appointmentIds.length)
        return out;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('origin_id')
        .eq('clinic_id', clinicId)
        .eq('origin_type', 'appointment')
        .neq('status', 'cancelada')
        .is('deleted_at', null)
        .in('origin_id', appointmentIds);
    if (error)
        throw new Error(error.message);
    for (const row of data ?? []) {
        const oid = row.origin_id;
        if (oid)
            out.add(oid);
    }
    return out;
}
/**
 * Inclui serviços das pernas `pickup_route` filhas na comanda do ancestral (pai ou bloco).
 * Não inclui perna que já tenha comanda própria (anti-duplicata).
 */
async function appendAttachedPickupLegsToComandaSnapshot(clinicId, parentAppointmentId, snapshot) {
    const { data: legs, error } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, status')
        .eq('clinic_id', clinicId)
        .eq('parent_appointment_id', parentAppointmentId)
        .eq('appointment_kind', 'pickup_route')
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    const candidateIds = [];
    for (const leg of legs ?? []) {
        const st = String(leg.status ?? '');
        if (st === 'cancelled' || st === 'no_show')
            continue;
        candidateIds.push(leg.id);
    }
    if (candidateIds.length === 0)
        return snapshot;
    const withOwnComanda = await appointmentIdsWithActiveComanda(clinicId, candidateIds);
    const items = [...snapshot.items];
    let subtotal = snapshot.subtotal;
    let sortBase = items.length;
    for (const legId of candidateIds) {
        if (withOwnComanda.has(legId))
            continue;
        const legBuilt = await sumAppointmentServicesSaleForComanda(legId, snapshot.pet_id);
        for (const it of legBuilt.items) {
            items.push({ ...it, sort_order: sortBase++ });
        }
        subtotal = round2(subtotal + legBuilt.subtotal);
    }
    return { ...snapshot, items, subtotal };
}
async function buildComandaItemsFromAppointment(clinicId, appointmentId, opts) {
    const { data: appt, error } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, clinic_id, unit_id, guardian_id, pet_id, status, title')
        .eq('id', appointmentId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!appt || appt.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    const st = String(appt.status);
    if (st === 'cancelled')
        throw new Error('NOT_READY');
    if (opts?.allowIncompleteStatus) {
        if (!APPOINTMENT_STATUSES_OPEN_FOR_COMANDA.has(st))
            throw new Error('NOT_READY');
    }
    else if (!['done', 'paid'].includes(st)) {
        throw new Error('NOT_READY');
    }
    const guardianId = appt.guardian_id;
    if (!guardianId)
        throw new Error('NO_GUARDIAN');
    const petId = appt.pet_id ?? null;
    const built = await sumAppointmentServicesSaleForComanda(appointmentId, petId);
    let snapshot = {
        items: built.items,
        subtotal: built.subtotal,
        unit_id: appt.unit_id ?? null,
        guardian_id: guardianId,
        pet_id: petId,
    };
    snapshot = await appendAttachedPickupLegsToComandaSnapshot(clinicId, appointmentId, snapshot);
    if (snapshot.items.length === 0) {
        snapshot.items.push({
            pet_id: petId,
            item_kind: 'fee',
            hub_service_type_id: null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: String(appt.title || 'Agendamento'),
            quantity: 1,
            unit_amount: 0,
            discount_amount: 0,
            line_total: 0,
            service_date: null,
            origin_type: 'appointment_service',
            origin_id: null,
            sort_order: 0,
        });
    }
    const applied = await (0, hubPackagesService_1.autoApplyEligiblePackagesToItems)({
        clinicId,
        guardianId,
        items: snapshot.items,
        resolvePricingVariant: async (item) => {
            if (item.origin_type === 'appointment_service' && item.origin_id) {
                const { data: svc } = await supabase_1.supabaseAdmin
                    .from('hub_appointment_services')
                    .select('pricing_variant')
                    .eq('id', item.origin_id)
                    .maybeSingle();
                const raw = svc?.pricing_variant;
                if (raw && typeof raw === 'object')
                    return raw;
            }
            return null;
        },
        skipIfAlreadyCovered: async (item) => {
            // Fatura de série (fase 2): se a migration existir e o appointment_service estiver coberto.
            if (item.origin_type !== 'appointment_service' || !item.origin_id)
                return false;
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_series_invoice_items')
                .select('id, invoice:hub_series_invoices(status)')
                .eq('appointment_service_id', item.origin_id)
                .limit(5);
            if (error)
                return false;
            for (const row of data ?? []) {
                const inv = row.invoice;
                const status = Array.isArray(inv) ? inv[0]?.status : inv?.status;
                if (status && status !== 'cancelled')
                    return true;
            }
            return false;
        },
    });
    return {
        items: snapshot.items,
        subtotal: applied.appliedCount > 0 ? applied.subtotal : snapshot.subtotal,
        unit_id: snapshot.unit_id,
        guardian_id: snapshot.guardian_id,
        pet_id: snapshot.pet_id,
    };
}
async function buildComandaItemsFromGroomingSession(clinicId, sessionId) {
    const { data: session, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select(`
      id, clinic_id, unit_id, guardian_id, hub_appointment_id, grooming_stage, billing_waived_at
    `)
        .eq('id', sessionId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!session || session.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    if (session.grooming_stage !== 'closed')
        throw new Error('NOT_READY');
    if (session.billing_waived_at)
        throw new Error('WAIVED');
    const guardianId = session.guardian_id;
    if (!guardianId)
        throw new Error('NO_GUARDIAN');
    let petId = null;
    const apptId = session.hub_appointment_id;
    if (apptId) {
        const { data: appt } = await supabase_1.supabaseAdmin.from('hub_appointments').select('pet_id').eq('id', apptId).maybeSingle();
        petId = appt?.pet_id ?? null;
    }
    const svc = apptId
        ? await sumAppointmentServicesSaleForComanda(apptId, petId)
        : { items: [], subtotal: 0 };
    const extras = await sumGroomingExtrasForComanda(sessionId, clinicId, petId);
    const allItems = [...svc.items, ...extras.items];
    if (allItems.length === 0) {
        allItems.push({
            pet_id: petId,
            item_kind: 'fee',
            hub_service_type_id: null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: 'Banho e Tosa',
            quantity: 1,
            unit_amount: 0,
            discount_amount: 0,
            line_total: 0,
            service_date: null,
            origin_type: null,
            origin_id: null,
            sort_order: 0,
        });
    }
    const applied = await (0, hubPackagesService_1.autoApplyEligiblePackagesToItems)({
        clinicId,
        guardianId,
        items: allItems,
        resolvePricingVariant: async (item) => {
            if (item.origin_type === 'appointment_service' && item.origin_id) {
                const { data: svcRow } = await supabase_1.supabaseAdmin
                    .from('hub_appointment_services')
                    .select('pricing_variant')
                    .eq('id', item.origin_id)
                    .maybeSingle();
                const raw = svcRow?.pricing_variant;
                if (raw && typeof raw === 'object')
                    return raw;
            }
            return null;
        },
    });
    return {
        items: allItems,
        subtotal: applied.appliedCount > 0 ? applied.subtotal : round2(svc.subtotal + extras.subtotal),
        unit_id: session.unit_id ?? null,
        guardian_id: guardianId,
        pet_id: petId,
    };
}
async function buildComandaItemsFromQuote(clinicId, quoteId) {
    const { data: quote, error: qErr } = await supabase_1.supabaseAdmin
        .from('hub_quotes')
        .select('id, clinic_id, unit_id, guardian_id, status, billing_state, billing_waived_at, client_notes, discount_kind, discount_value')
        .eq('id', quoteId)
        .maybeSingle();
    if (qErr)
        throw new Error(qErr.message);
    if (!quote || quote.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    if (quote.status !== 'accepted')
        throw new Error('NOT_READY');
    if (quote.billing_state === 'receivable_created')
        throw new Error('ALREADY_BILLED');
    if (quote.billing_waived_at)
        throw new Error('WAIVED');
    const guardianId = quote.guardian_id;
    if (!guardianId)
        throw new Error('NO_GUARDIAN');
    const { data: qLines, error: lErr } = await supabase_1.supabaseAdmin
        .from('hub_quote_lines')
        .select(`
      id, hub_service_type_id, description, quantity, unit_price, discount_amount, line_total, sort_order,
      line_pets:hub_quote_line_pets(id, quote_pet_id, unit_price, sort_order, quote_pet:hub_quote_pets(id, hub_pet_id))
    `)
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true });
    if (lErr)
        throw new Error(lErr.message);
    const items = [];
    let subtotal = 0;
    let sort = 0;
    for (const row of qLines ?? []) {
        const linePets = row.line_pets ?? [];
        const lineTotal = Number(row.line_total ?? 0);
        const qty = Number(row.quantity ?? 1);
        const serviceTypeId = row.hub_service_type_id ?? null;
        const baseDesc = String(row.description || '').trim() || 'Serviço';
        if (Array.isArray(linePets) && linePets.length > 0) {
            for (const lp of linePets) {
                const lpRow = lp;
                const qp = lpRow.quote_pet;
                const hubPetId = Array.isArray(qp) ? qp[0]?.hub_pet_id : qp?.hub_pet_id;
                const up = Number(lpRow.unit_price ?? 0);
                subtotal += up;
                items.push({
                    pet_id: hubPetId ?? null,
                    item_kind: 'service',
                    hub_service_type_id: serviceTypeId,
                    hub_inventory_item_id: null,
                    hub_inventory_lot_id: null,
                    description: baseDesc,
                    quantity: 1,
                    unit_amount: up,
                    discount_amount: 0,
                    line_total: up,
                    service_date: null,
                    origin_type: 'quote_line',
                    origin_id: row.id,
                    sort_order: sort++,
                });
            }
        }
        else {
            subtotal += lineTotal;
            const unit = qty > 0 ? round2(lineTotal / qty) : lineTotal;
            const { data: firstPet } = await supabase_1.supabaseAdmin
                .from('hub_quote_pets')
                .select('hub_pet_id')
                .eq('quote_id', quoteId)
                .order('sort_order', { ascending: true })
                .limit(1)
                .maybeSingle();
            items.push({
                pet_id: firstPet?.hub_pet_id ?? null,
                item_kind: 'service',
                hub_service_type_id: serviceTypeId,
                hub_inventory_item_id: null,
                hub_inventory_lot_id: null,
                description: baseDesc,
                quantity: qty,
                unit_amount: unit,
                discount_amount: Number(row.discount_amount ?? 0),
                line_total: lineTotal,
                service_date: null,
                origin_type: 'quote_line',
                origin_id: row.id,
                sort_order: sort++,
            });
        }
    }
    if (items.length === 0) {
        const { data: qFull } = await supabase_1.supabaseAdmin.from('hub_quotes').select('total_amount').eq('id', quoteId).single();
        const total = Number(qFull?.total_amount ?? 0);
        const { data: firstPet } = await supabase_1.supabaseAdmin
            .from('hub_quote_pets')
            .select('hub_pet_id')
            .eq('quote_id', quoteId)
            .order('sort_order', { ascending: true })
            .limit(1)
            .maybeSingle();
        items.push({
            pet_id: firstPet?.hub_pet_id ?? null,
            item_kind: 'fee',
            hub_service_type_id: null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: 'Orçamento',
            quantity: 1,
            unit_amount: total,
            discount_amount: 0,
            line_total: total,
            service_date: null,
            origin_type: 'quote_line',
            origin_id: null,
            sort_order: 0,
        });
        subtotal = total;
    }
    let unitId = quote.unit_id ?? null;
    if (!unitId)
        unitId = await resolveClinicDefaultUnitId(clinicId);
    const subtotalRounded = round2(subtotal);
    const headerDiscount = items.length === 0
        ? 0
        : (0, hubQuoteDiscount_1.quoteDiscountAmount)(subtotalRounded, quote.discount_kind ?? null, quote.discount_value);
    return {
        items,
        subtotal: subtotalRounded,
        unit_id: unitId,
        guardian_id: guardianId,
        client_notes: quote.client_notes?.trim() || null,
        discount_amount: headerDiscount,
    };
}
async function fetchPrimaryGuardianForPet(petId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('guardian_id')
        .eq('pet_id', petId)
        .eq('role', 'primary')
        .limit(1)
        .maybeSingle();
    return data?.guardian_id ?? null;
}
/**
 * Carrega serviços cirúrgicos confirmados e os mescla na comanda:
 * - substitui o espelho `appointment_service` quando há vínculo (mesma cobrança);
 * - não duplica por `hub_service_type_id` já coberto por outra linha cirúrgica;
 * - preços pendentes ficam de fora (só `confirmed` + `charge`).
 */
async function loadConfirmedSurgeryServiceRows(opts) {
    const surgeryIds = new Set();
    if (opts.encounterId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_surgeries')
            .select('id')
            .eq('hub_encounter_id', opts.encounterId)
            .eq('clinic_id', opts.clinicId)
            .is('deleted_at', null);
        if (!error || !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
            for (const row of data ?? [])
                surgeryIds.add(row.id);
        }
    }
    if (opts.appointmentId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_surgeries')
            .select('id')
            .eq('hub_appointment_id', opts.appointmentId)
            .eq('clinic_id', opts.clinicId)
            .is('deleted_at', null);
        if (!error || !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
            for (const row of data ?? [])
                surgeryIds.add(row.id);
        }
    }
    if (surgeryIds.size === 0)
        return [];
    const { data: surgSvcRows, error: surgSvcErr } = await supabase_1.supabaseAdmin
        .from('hub_surgery_services')
        .select('id, surgery_id, hub_service_type_id, hub_appointment_service_id, service_name, quantity, unit_amount, billing_mode, price_status')
        .in('surgery_id', [...surgeryIds])
        .eq('billing_mode', 'charge')
        .eq('price_status', 'confirmed')
        .is('deleted_at', null);
    if (surgSvcErr && (0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(surgSvcErr))
        return [];
    if (surgSvcErr)
        throw new Error(surgSvcErr.message);
    return (surgSvcRows ?? []);
}
/** @internal exportado para testes de regressão da comanda cirúrgica */
/**
 * Mescla linhas cirúrgicas confirmadas no snapshot da comanda.
 * Sem cirurgia, devolve **cópia** dos itens — o builder faz `allItems.length = 0; push(...merged)`,
 * e devolver a mesma referência apagaria consulta/vacina (mesmo padrão de
 * `dropAppointmentLinesReplacedByHospitalization`).
 */
function resolveSurgeryMergeIntoComandaItems(opts) {
    if (opts.surgSvcList.length === 0) {
        return {
            items: opts.items.map((it, i) => ({ ...it, sort_order: i })),
            subtotal: round2(opts.subtotal),
        };
    }
    return applySurgeryServiceLinesToComandaItems({
        items: opts.items,
        surgSvcList: opts.surgSvcList,
        petId: opts.petId,
    });
}
function applySurgeryServiceLinesToComandaItems(opts) {
    const { items, surgSvcList, petId } = opts;
    if (surgSvcList.length === 0) {
        return resolveSurgeryMergeIntoComandaItems({
            items,
            subtotal: items.reduce((s, it) => s + Number(it.line_total ?? 0), 0),
            petId,
            surgSvcList: [],
        });
    }
    const replaceApptIds = new Set(surgSvcList
        .map((row) => row.hub_appointment_service_id)
        .filter((id) => Boolean(id)));
    const replaceTypeIds = new Set(surgSvcList
        .map((row) => row.hub_service_type_id)
        .filter((id) => Boolean(id)));
    let subtotal = 0;
    const kept = [];
    for (const it of items) {
        if (it.origin_type === 'appointment_service') {
            const oid = it.origin_id;
            const typeId = it.hub_service_type_id;
            if ((oid && replaceApptIds.has(oid)) || (typeId && replaceTypeIds.has(typeId))) {
                continue;
            }
        }
        if (it.origin_type === 'surgery_service') {
            // Será reinserido abaixo a partir da fonte canônica.
            continue;
        }
        kept.push({ ...it, sort_order: kept.length });
        subtotal = round2(subtotal + Number(it.line_total ?? 0));
    }
    const seenSurgerySvc = new Set();
    const seenTypeIds = new Set(kept
        .map((it) => it.hub_service_type_id)
        .filter((id) => Boolean(id)));
    for (const row of surgSvcList) {
        if (seenSurgerySvc.has(row.id))
            continue;
        seenSurgerySvc.add(row.id);
        const typeId = row.hub_service_type_id;
        if (typeId && seenTypeIds.has(typeId))
            continue;
        if (typeId)
            seenTypeIds.add(typeId);
        const qty = Number(row.quantity ?? 1) || 1;
        const unit = Number(row.unit_amount ?? 0);
        const lineTotal = round2(qty * unit);
        kept.push({
            pet_id: petId,
            item_kind: 'service',
            hub_service_type_id: typeId,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: `Cirurgia: ${String(row.service_name || 'Procedimento')}`,
            quantity: qty,
            unit_amount: unit,
            discount_amount: 0,
            line_total: lineTotal,
            service_date: null,
            origin_type: 'surgery_service',
            origin_id: row.id,
            sort_order: kept.length,
        });
        subtotal = round2(subtotal + lineTotal);
    }
    return { items: kept, subtotal };
}
async function mergeSurgeryServicesIntoComandaItems(opts) {
    const surgSvcList = await loadConfirmedSurgeryServiceRows({
        clinicId: opts.clinicId,
        encounterId: opts.encounterId,
        appointmentId: opts.appointmentId,
    });
    return resolveSurgeryMergeIntoComandaItems({
        items: opts.items,
        subtotal: opts.subtotal,
        petId: opts.petId,
        surgSvcList,
    });
}
async function loadConfirmedEncounterServiceRows(clinicId, encounterId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_encounter_services')
        .select('id, hub_service_type_id, hub_appointment_service_id, service_name, quantity, unit_amount, billing_mode, price_status')
        .eq('hub_encounter_id', encounterId)
        .eq('clinic_id', clinicId)
        .eq('billing_mode', 'charge')
        .eq('price_status', 'confirmed')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
    if (error && (0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error))
        return [];
    if (error)
        throw new Error(error.message);
    return (data ?? []);
}
/** @internal exportado para testes — merge de serviços da consulta na comanda. */
function applyEncounterServiceLinesToComandaItems(opts) {
    const { items, encSvcList, petId } = opts;
    if (encSvcList.length === 0) {
        return {
            items: items.map((it, i) => ({ ...it, sort_order: i })),
            subtotal: round2(items.reduce((s, it) => s + Number(it.line_total ?? 0), 0)),
        };
    }
    const replaceApptIds = new Set(encSvcList
        .map((row) => row.hub_appointment_service_id)
        .filter((id) => Boolean(id)));
    const replaceTypeIds = new Set(encSvcList
        .map((row) => row.hub_service_type_id)
        .filter((id) => Boolean(id)));
    let subtotal = 0;
    const kept = [];
    for (const it of items) {
        if (it.origin_type === 'appointment_service') {
            const oid = it.origin_id;
            const typeId = it.hub_service_type_id;
            if ((oid && replaceApptIds.has(oid)) || (typeId && replaceTypeIds.has(typeId))) {
                continue;
            }
        }
        if (it.origin_type === 'encounter_service')
            continue;
        kept.push({ ...it, sort_order: kept.length });
        subtotal = round2(subtotal + Number(it.line_total ?? 0));
    }
    const seenEncSvc = new Set();
    const seenTypeIds = new Set(kept
        .map((it) => it.hub_service_type_id)
        .filter((id) => Boolean(id)));
    for (const row of encSvcList) {
        if (seenEncSvc.has(row.id))
            continue;
        seenEncSvc.add(row.id);
        const typeId = row.hub_service_type_id;
        if (typeId && seenTypeIds.has(typeId))
            continue;
        if (typeId)
            seenTypeIds.add(typeId);
        const qty = Number(row.quantity ?? 1) || 1;
        const unit = Number(row.unit_amount ?? 0);
        const lineTotal = round2(qty * unit);
        kept.push({
            pet_id: petId,
            item_kind: 'service',
            hub_service_type_id: typeId,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: String(row.service_name || 'Serviço clínico'),
            quantity: qty,
            unit_amount: unit,
            discount_amount: 0,
            line_total: lineTotal,
            service_date: null,
            origin_type: 'encounter_service',
            origin_id: row.id,
            sort_order: kept.length,
        });
        subtotal = round2(subtotal + lineTotal);
    }
    return { items: kept, subtotal };
}
async function mergeEncounterServicesIntoComandaItems(opts) {
    const encSvcList = await loadConfirmedEncounterServiceRows(opts.clinicId, opts.encounterId);
    if (encSvcList.length === 0) {
        return {
            items: opts.items.map((it, i) => ({ ...it, sort_order: i })),
            subtotal: round2(opts.subtotal),
        };
    }
    return applyEncounterServiceLinesToComandaItems({
        items: opts.items,
        encSvcList,
        petId: opts.petId,
    });
}
async function buildComandaItemsFromEncounter(clinicId, encounterId, opts) {
    const { data: enc, error } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('id, clinic_id, unit_id, guardian_id, pet_id, status, billing_waived_at, hub_appointment_id, hub_case_id')
        .eq('id', encounterId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!enc || enc.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    if (enc.billing_waived_at)
        throw new Error('WAIVED');
    const encStatus = String(enc.status ?? '');
    const isCompleted = encStatus === 'completed';
    if (!isCompleted && !opts?.allowIncomplete)
        throw new Error('NOT_READY');
    let guardianId = enc.guardian_id;
    let petId = enc.pet_id ?? null;
    // Tenta resolver identidade via caso clínico quando encounter não tem tutor/pet.
    if (!guardianId || !petId) {
        const caseId = enc.hub_case_id;
        if (caseId) {
            const { data: caseRow } = await supabase_1.supabaseAdmin
                .from('hub_clinical_cases')
                .select('pet_id, guardian_id_snapshot')
                .eq('id', caseId)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null)
                .maybeSingle();
            if (caseRow) {
                const cr = caseRow;
                if (!petId && cr.pet_id)
                    petId = cr.pet_id;
                if (!guardianId && cr.guardian_id_snapshot)
                    guardianId = cr.guardian_id_snapshot;
                if (!guardianId && petId)
                    guardianId = await fetchPrimaryGuardianForPet(petId);
            }
        }
    }
    if (!guardianId)
        throw new Error('NO_GUARDIAN');
    if (!petId && isCompleted)
        throw new Error('NO_PET');
    const apptId = enc.hub_appointment_id;
    const allItems = [];
    let subtotal = 0;
    // 1. Appointment service items (existing behaviour)
    if (apptId && petId) {
        const ap = await sumAppointmentServicesSaleForComanda(apptId, petId);
        allItems.push(...ap.items);
        subtotal += ap.subtotal;
    }
    // 2. Vaccinations applied in-clinic during this encounter
    const { data: vaxRows } = await supabase_1.supabaseAdmin
        .from('hub_vaccination_records')
        .select('id, vaccine_name, hub_inventory_item_id, hub_inventory_lot_id, price')
        .eq('hub_encounter_id', encounterId)
        .eq('source', 'in_clinic')
        .is('deleted_at', null);
    const vaxItemIds = [
        ...new Set((vaxRows ?? [])
            .map((v) => v.hub_inventory_item_id)
            .filter(Boolean)),
    ];
    const vaxPriceByItemId = new Map();
    if (vaxItemIds.length > 0) {
        const { data: invItems } = await supabase_1.supabaseAdmin
            .from('hub_inventory_items')
            .select('id, sale_amount')
            .in('id', vaxItemIds);
        for (const row of invItems ?? []) {
            const r = row;
            vaxPriceByItemId.set(r.id, Number(r.sale_amount));
        }
    }
    for (const vax of vaxRows ?? []) {
        const vaxRow = vax;
        const itemId = vaxRow.hub_inventory_item_id;
        let amount = typeof vaxRow.price === 'number' ? vaxRow.price : 0;
        if ((!amount || amount <= 0) && itemId) {
            amount = vaxPriceByItemId.get(itemId) ?? 0;
        }
        allItems.push({
            pet_id: petId,
            item_kind: 'product',
            hub_service_type_id: null,
            hub_inventory_item_id: itemId,
            hub_inventory_lot_id: vaxRow.hub_inventory_lot_id ?? null,
            description: `Vacina: ${String(vaxRow.vaccine_name || 'Vacina')}`,
            quantity: 1,
            unit_amount: amount,
            discount_amount: 0,
            line_total: amount,
            service_date: null,
            origin_type: 'vaccination',
            origin_id: vaxRow.id,
            sort_order: allItems.length,
        });
        subtotal += amount;
    }
    // 3. Prescription items administered in clinic (NOT home_use)
    // These are items where the patient received medication at the clinic.
    const { data: rxRows } = await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .select('id, hub_prescription_items(id, product_name, quantity, unit, hub_inventory_item_id, administration, price)')
        .eq('hub_encounter_id', encounterId)
        .is('deleted_at', null);
    for (const rx of rxRows ?? []) {
        const rxRow = rx;
        const rxItems = rxRow.hub_prescription_items ?? [];
        for (const item of rxItems) {
            // Only include items that are NOT for home use (clinic_administration or undefined administration)
            const administration = item.administration;
            if (administration === 'home_use')
                continue;
            const amount = typeof item.price === 'number' ? item.price : 0;
            const qty = typeof item.quantity === 'number' ? item.quantity : 1;
            allItems.push({
                pet_id: petId,
                item_kind: 'product',
                hub_service_type_id: null,
                hub_inventory_item_id: item.hub_inventory_item_id,
                hub_inventory_lot_id: null,
                description: `Medicamento (clinic): ${String(item.product_name || 'Medicamento')} ${qty} ${String(item.unit || 'un')}`,
                quantity: qty,
                unit_amount: amount,
                discount_amount: 0,
                line_total: round2(amount * qty),
                service_date: null,
                origin_type: 'prescription_item',
                origin_id: item.id,
                sort_order: allItems.length,
            });
            subtotal += round2(amount * qty);
        }
    }
    // 3b. Medicação aplicada na consulta — só o serviço cobrável (estoque é custo da clínica)
    const { data: medAdminRows, error: medAdminErr } = await supabase_1.supabaseAdmin
        .from('hub_encounter_medication_administrations')
        .select('id, service_name, service_price, hub_service_type_id')
        .eq('hub_encounter_id', encounterId)
        .is('deleted_at', null);
    const medAdminList = medAdminErr && (0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(medAdminErr) ? [] : medAdminRows ?? [];
    for (const raw of medAdminList) {
        const row = raw;
        const serviceAmount = Number(row.service_price ?? 0);
        allItems.push({
            pet_id: petId,
            item_kind: 'service',
            hub_service_type_id: row.hub_service_type_id ?? null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: `Aplicação: ${String(row.service_name || 'Medicação na consulta')}`,
            quantity: 1,
            unit_amount: serviceAmount,
            discount_amount: 0,
            line_total: serviceAmount,
            service_date: null,
            origin_type: 'medication_service',
            origin_id: row.id,
            sort_order: allItems.length,
        });
        subtotal += serviceAmount;
    }
    // 4. Serviços do grupo clinica lançados no atendimento (pedido de exame PDF não cobra).
    {
        const encSvcMerged = await mergeEncounterServicesIntoComandaItems({
            clinicId,
            items: allItems,
            subtotal,
            petId,
            encounterId,
        });
        allItems.length = 0;
        allItems.push(...encSvcMerged.items);
        subtotal = encSvcMerged.subtotal;
    }
    // 5. Serviços de cirurgia vinculados a este atendimento
    // Preferir a linha cirúrgica confirmada sobre o espelho da agenda (evita "Consulta R$0" + total errado).
    {
        const surgMerged = await mergeSurgeryServicesIntoComandaItems({
            clinicId,
            items: allItems,
            subtotal,
            petId,
            encounterId,
            appointmentId: apptId,
        });
        allItems.length = 0;
        allItems.push(...surgMerged.items);
        subtotal = surgMerged.subtotal;
    }
    // 6. Diárias e lançamentos de internação (encounter e/ou appointment espelhado)
    const hospBuilt = await (0, hubHospitalizationBilling_1.loadHospitalizationComandaItems)({
        clinicId,
        encounterId,
        appointmentId: apptId,
        defaultPetId: petId,
    });
    // Remove espelho de agenda (appointment_service de internação) quando há diária.
    const apptSvcIds = allItems
        .filter((it) => it.origin_type === 'appointment_service' && it.hub_service_type_id)
        .map((it) => it.hub_service_type_id);
    const groupById = await loadServiceGroupByIds(apptSvcIds);
    const dropped = (0, hubHospitalizationBilling_1.dropAppointmentLinesReplacedByHospitalization)(allItems, groupById, hospBuilt.items);
    allItems.length = 0;
    allItems.push(...dropped.items);
    subtotal = round2(subtotal - dropped.removedTotal);
    for (const line of hospBuilt.items) {
        allItems.push({ ...line, sort_order: allItems.length });
    }
    subtotal = round2(subtotal + hospBuilt.subtotal);
    // Não re-lançar origens já faturadas noutra comanda (ex.: consulta paga na agenda).
    const hadItemsBeforeInvoicedDedupe = allItems.length > 0;
    const invoicedOrigins = await fetchInvoicedComandaItemOriginKeys(clinicId);
    if (invoicedOrigins.size > 0) {
        const kept = [];
        let keptSubtotal = 0;
        for (const it of allItems) {
            const ot = it.origin_type;
            const oid = it.origin_id;
            if (ot && oid && invoicedOrigins.has(`${ot}:${oid}`))
                continue;
            kept.push({ ...it, sort_order: kept.length });
            keptSubtotal = round2(keptSubtotal + Number(it.line_total ?? 0));
        }
        allItems.length = 0;
        allItems.push(...kept);
        subtotal = keptSubtotal;
    }
    // Fallback genérico só se o encounter nunca teve item cobrável.
    // Se os itens existiam e já foram faturados noutra comanda, devolve vazio (sem reabrir cobrança).
    if (allItems.length === 0 && !hadItemsBeforeInvoicedDedupe) {
        allItems.push({
            pet_id: petId,
            item_kind: 'fee',
            hub_service_type_id: null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: isCompleted
                ? 'Consulta / atendimento clínico'
                : 'Consulta / atendimento clínico (parcial)',
            quantity: 1,
            unit_amount: 0,
            discount_amount: 0,
            line_total: 0,
            service_date: null,
            origin_type: null,
            origin_id: null,
            sort_order: 0,
        });
        subtotal = 0;
    }
    return {
        items: allItems,
        subtotal: round2(subtotal),
        unit_id: enc.unit_id ?? null,
        guardian_id: guardianId,
        pet_id: petId,
    };
}
async function buildComandaItemsFromBoardingReservation(clinicId, reservationId, opts) {
    const { data: res, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('*')
        .eq('id', reservationId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!res)
        throw new Error('NOT_FOUND');
    const guardianId = res.guardian_id;
    if (!guardianId)
        throw new Error('NO_GUARDIAN');
    if (res.billing_waived_at)
        throw new Error('WAIVED');
    if (!(0, boardingOperational_1.isBoardingStatusReadyForComanda)(String(res.status ?? ''), opts)) {
        throw new Error('NOT_READY');
    }
    const unitId = res.unit_id ?? null;
    let cutoffTime = null;
    if (unitId) {
        const { data: settings } = await supabase_1.supabaseAdmin
            .from('hub_unit_boarding_settings')
            .select('checkout_cutoff_time')
            .eq('unit_id', unitId)
            .maybeSingle();
        cutoffTime = settings?.checkout_cutoff_time ?? null;
    }
    const { line, subtotal } = (0, boardingBilling_1.buildBoardingComandaLine)({
        id: reservationId,
        mode: res.mode,
        pet_id: res.pet_id,
        hub_service_type_id: res.hub_service_type_id ?? null,
        daycare_period: res.daycare_period ?? null,
        expected_check_in: res.expected_check_in,
        expected_check_out: res.expected_check_out,
        checked_in_at: res.checked_in_at,
        checked_out_at: res.checked_out_at,
        daily_rate_cents: res.daily_rate_cents,
    }, { cutoffTime });
    const { data: extraRows, error: extraErr } = await supabase_1.supabaseAdmin
        .from('hub_boarding_extras')
        .select('id, hub_service_type_id, description, quantity, unit_amount_cents, service_date, deleted_at')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', reservationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
    if (extraErr && !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(extraErr))
        throw new Error(extraErr.message);
    const extras = (0, boardingBilling_1.buildBoardingExtraLines)((extraErr ? [] : extraRows ?? []), res.pet_id ?? null);
    return {
        items: [line, ...extras.lines],
        subtotal: round2(subtotal + extras.subtotal),
        unit_id: unitId,
        guardian_id: guardianId,
        pet_id: res.pet_id,
    };
}
/** Remove do snapshot do agendamento as linhas de hospedagem substituídas pelas diárias. */
async function dropAppointmentLinesReplacedByBoarding(clinicId, reservationId, items) {
    const serviceIds = [
        ...new Set(items
            .filter((it) => it.origin_type === 'appointment_service' && it.hub_service_type_id)
            .map((it) => it.hub_service_type_id)),
    ];
    if (serviceIds.length === 0)
        return { items, removedTotal: 0 };
    const [{ data: types }, { data: res }] = await Promise.all([
        supabase_1.supabaseAdmin.from('hub_service_types').select('id, service_group').in('id', serviceIds),
        supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('*')
            .eq('id', reservationId)
            .eq('clinic_id', clinicId)
            .maybeSingle(),
    ]);
    const groupById = new Map((types ?? []).map((t) => [t.id, t.service_group]));
    const reservationServiceId = res?.hub_service_type_id ?? null;
    let removedTotal = 0;
    const kept = items.filter((it) => {
        if (it.origin_type !== 'appointment_service')
            return true;
        const sid = it.hub_service_type_id ?? null;
        const replaced = (0, boardingBilling_1.isAppointmentLineReplacedByBoarding)(sid, sid ? groupById.get(sid) : null, reservationServiceId);
        if (replaced)
            removedTotal = round2(removedTotal + Number(it.line_total ?? 0));
        return !replaced;
    });
    return { items: kept.map((it, i) => ({ ...it, sort_order: i })), removedTotal };
}
function mapItemToReceivableLineKind(originType) {
    if (originType === 'appointment_service')
        return 'appointment_service';
    if (originType === 'grooming_extra')
        return 'grooming_extra';
    if (originType === 'quote_line')
        return 'quote_line';
    return 'manual';
}
/** Itens desejados na comanda conforme origem atual (para sync / antecipado). */
async function buildDesiredComandaSnapshot(clinicId, comanda) {
    const ot = String(comanda.origin_type ?? '');
    const oid = comanda.origin_id;
    if (ot === 'appointment') {
        // Preferir encounter (concluído ou em andamento) para sync ao vivo de medicação/vacina/etc.
        const completedEncId = await findLatestCompletedEncounterIdForAppointment(clinicId, oid);
        const openEncId = completedEncId
            ? null
            : await findLatestEncounterIdForAppointment(clinicId, oid, { anyOpen: true });
        const encId = completedEncId ?? openEncId;
        if (encId) {
            let encBuilt = await buildComandaItemsFromEncounter(clinicId, encId, {
                allowIncomplete: !completedEncId,
            });
            encBuilt = await appendGroomingExtrasToAppointmentSnapshot(clinicId, oid, encBuilt);
            // Encounter não carrega L&T; pernas anexadas entram na comanda do appointment pai/bloco.
            return appendAttachedPickupLegsToComandaSnapshot(clinicId, oid, encBuilt);
        }
        let snapshot = await buildComandaItemsFromAppointment(clinicId, oid, { allowIncompleteStatus: true });
        snapshot = await appendGroomingExtrasToAppointmentSnapshot(clinicId, oid, snapshot);
        // Cirurgia ligada ao appointment: preferir hub_surgery_services confirmados.
        {
            const openEncForSurg = await findLatestEncounterIdForAppointment(clinicId, oid, { anyOpen: true });
            const surgMerged = await mergeSurgeryServicesIntoComandaItems({
                clinicId,
                items: snapshot.items,
                subtotal: snapshot.subtotal,
                petId: snapshot.pet_id,
                encounterId: openEncForSurg,
                appointmentId: oid,
            });
            snapshot = { ...snapshot, items: surgMerged.items, subtotal: surgMerged.subtotal };
        }
        // Internação ligada ao appointment (sem encounter): anexa diárias/charges.
        // Com encounter aberto/concluído o snapshot já veio de buildComandaItemsFromEncounter acima.
        const hospForAppt = await (0, hubHospitalizationBilling_1.loadHospitalizationComandaItems)({
            clinicId,
            appointmentId: oid,
            defaultPetId: snapshot.pet_id,
        });
        {
            const svcIds = snapshot.items
                .filter((it) => it.origin_type === 'appointment_service' && it.hub_service_type_id)
                .map((it) => it.hub_service_type_id);
            const groupById = await loadServiceGroupByIds(svcIds);
            snapshot = (0, hubHospitalizationBilling_1.mergeHospitalizationItemsIntoSnapshot)(snapshot, hospForAppt.items, groupById);
        }
        const boardingId = await findBillableBoardingReservationForAppointment(clinicId, oid);
        if (boardingId) {
            const boardingBuilt = await buildComandaItemsFromBoardingReservation(clinicId, boardingId, {
                allowIncomplete: true,
            });
            const { items: apptItems, removedTotal } = await dropAppointmentLinesReplacedByBoarding(clinicId, boardingId, snapshot.items);
            const base = apptItems.length;
            return {
                ...snapshot,
                items: [...apptItems, ...boardingBuilt.items.map((it, i) => ({ ...it, sort_order: base + i }))],
                subtotal: round2(snapshot.subtotal - removedTotal + boardingBuilt.subtotal),
            };
        }
        return snapshot;
    }
    if (ot === 'grooming_session') {
        const { data: session, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('grooming_stage, hub_appointment_id')
            .eq('id', oid)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        if (!session)
            throw new Error('NOT_FOUND');
        if (String(session.grooming_stage) === 'closed') {
            return await buildComandaItemsFromGroomingSession(clinicId, oid);
        }
        const apptId = session.hub_appointment_id ?? null;
        if (apptId) {
            return await buildComandaItemsFromAppointment(clinicId, apptId, { allowIncompleteStatus: true });
        }
        throw new Error('NOT_READY');
    }
    if (ot === 'encounter') {
        const { data: enc } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('status')
            .eq('id', oid)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        if (!enc)
            throw new Error('NOT_FOUND');
        if (String(enc.status) === 'completed') {
            return await buildComandaItemsFromEncounter(clinicId, oid);
        }
        return await buildComandaItemsFromEncounter(clinicId, oid, { allowIncomplete: true });
    }
    if (ot === 'quote') {
        const q = await buildComandaItemsFromQuote(clinicId, oid);
        return { ...q, pet_id: null };
    }
    if (ot === 'boarding_reservation') {
        return await buildComandaItemsFromBoardingReservation(clinicId, oid, { allowIncomplete: true });
    }
    throw new Error('NOT_FOUND');
}
const openComandaBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    origin_type: zod_1.z.enum([
        'appointment',
        'grooming_session',
        'quote',
        'encounter',
        'manual',
        'boarding_reservation',
        'package',
    ]),
    origin_id: uuidStr.optional(),
    package_id: uuidStr.optional(),
    pet_id: uuidStr.optional().nullable(),
    pet_ids: zod_1.z.array(uuidStr).min(1).max(20).optional(),
    package_lines: zod_1.z
        .array(zod_1.z
        .object({
        package_id: uuidStr,
        pet_id: uuidStr,
    })
        .strict())
        .min(1)
        .max(20)
        .optional(),
    guardian_id: uuidStr.optional().nullable(),
    unit_id: uuidStr.optional().nullable(),
    manual_lines: zod_1.z
        .array(zod_1.z
        .object({
        description: zod_1.z.string().trim().min(1).max(300),
        quantity: zod_1.z.number().positive().optional(),
        unit_amount: zod_1.z.number().min(0),
        pet_id: uuidStr.optional().nullable(),
    })
        .strict())
        .optional(),
    hub_case_id: uuidStr.optional().nullable(),
    hub_encounter_id: uuidStr.optional().nullable(),
})
    .strict()
    .superRefine((data, ctx) => {
    // origin_type manual: guardian_id e origin_id opcionais (venda avulsa de balcão)
    if (data.origin_type === 'manual') {
        return;
    }
    if (data.origin_type === 'package') {
        if (!data.guardian_id) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'guardian_id obrigatório para venda de pacote' });
        }
        const hasPackageLines = Boolean(data.package_lines?.length);
        const hasLegacyPackage = Boolean(data.package_id);
        if (!hasPackageLines && !hasLegacyPackage) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'package_lines ou package_id obrigatório para venda de pacote',
            });
        }
        if (hasPackageLines && hasLegacyPackage) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Use package_lines ou package_id + pet_ids, não ambos',
            });
        }
        if (hasPackageLines) {
            const seen = new Set();
            for (const ln of data.package_lines ?? []) {
                const key = `${ln.package_id}:${ln.pet_id}`;
                if (seen.has(key)) {
                    ctx.addIssue({
                        code: zod_1.z.ZodIssueCode.custom,
                        message: 'Não é possível repetir o mesmo pacote para o mesmo pet na venda',
                    });
                    break;
                }
                seen.add(key);
            }
        }
    }
    else if (!data.origin_id) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'origin_id obrigatório para esta origem' });
    }
});
const postHubComandaOpen = async (req, res) => {
    try {
        const parsed = openComandaBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const b = parsed.data;
        const { clinic_id, hub_case_id, hub_encounter_id } = b;
        let origin_type = b.origin_type;
        let effectiveOriginId = origin_type === 'manual'
            ? (b.origin_id ?? (0, node_crypto_1.randomUUID)())
            : origin_type === 'package'
                ? (b.origin_id ?? (0, hubPackagesService_1.newPurchaseGroupId)())
                : b.origin_id;
        // Hotel/Creche: com reserva cobrável (ativa ou checked_out), preferir boarding_reservation
        // e reutilizar comanda appointment já aberta quando existir.
        // Banho: com sessão ligada, preferir grooming_session (origem canônica) para colidir no unique index.
        /** Agendamento original para trava de fatura em série (antes de remap boarding/grooming). */
        let seriesGuardAppointmentId = origin_type === 'appointment' ? effectiveOriginId : null;
        if (origin_type === 'appointment') {
            const existingApptOrLinked = await resolveExistingOpenComandaIdForOpen(clinic_id, 'appointment', effectiveOriginId);
            if (existingApptOrLinked) {
                const detail = await getHubComandaDetailPayload(existingApptOrLinked, clinic_id);
                return res.status(200).json(detail);
            }
            const billableBoarding = await findBillableBoardingReservationForAppointment(clinic_id, effectiveOriginId);
            if (billableBoarding) {
                origin_type = 'boarding_reservation';
                effectiveOriginId = billableBoarding;
            }
            else {
                const { findLinkedGroomingSessionIdForAppointment } = await Promise.resolve().then(() => __importStar(require('./groomingOriginKeys')));
                const linkedSession = await findLinkedGroomingSessionIdForAppointment(clinic_id, effectiveOriginId);
                if (linkedSession) {
                    origin_type = 'grooming_session';
                    effectiveOriginId = linkedSession;
                }
            }
        }
        else if (origin_type === 'grooming_session') {
            const { data: sess } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('hub_appointment_id')
                .eq('id', effectiveOriginId)
                .eq('clinic_id', clinic_id)
                .maybeSingle();
            seriesGuardAppointmentId =
                sess?.hub_appointment_id ??
                    null;
        }
        if (seriesGuardAppointmentId) {
            const seriesGuard = await (0, hubSeriesBillingService_1.isAppointmentPendingPeriodicSeriesInvoice)(seriesGuardAppointmentId);
            if (seriesGuard.seriesInvoiceComandaId) {
                const detail = await getHubComandaDetailPayload(seriesGuard.seriesInvoiceComandaId, clinic_id);
                return res.status(200).json(detail);
            }
            if (seriesGuard.pending) {
                return res.status(409).json({
                    code: 'SERIES_PERIODIC_PENDING',
                    error: 'Esta ocorrência faz parte de uma série com fatura mensal. A cobrança será lançada na fatura da série, não no caixa do dia.',
                });
            }
        }
        if (origin_type !== 'manual') {
            const keys = await fetchActiveReceivableKeys(clinic_id);
            const { expandBoardingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./boardingOriginKeys')));
            const { expandGroomingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./groomingOriginKeys')));
            const withBoarding = await expandBoardingAppointmentOriginKeys(clinic_id, new Set(keys));
            const expanded = await expandGroomingAppointmentOriginKeys(clinic_id, withBoarding);
            // Recebível pode nascer como source_type=manual; a origem efetiva está na comanda.
            const billedViaComanda = await fetchBilledComandaOriginKeys(clinic_id);
            if (expanded.has(`${origin_type}:${effectiveOriginId}`) ||
                billedViaComanda.has(`${origin_type}:${effectiveOriginId}`)) {
                return res.status(409).json({ error: 'Já existe cobrança para esta origem' });
            }
        }
        if (origin_type === 'appointment' ||
            origin_type === 'grooming_session' ||
            origin_type === 'encounter' ||
            origin_type === 'boarding_reservation' ||
            origin_type === 'quote') {
            const existingId = await resolveExistingOpenComandaIdForOpen(clinic_id, origin_type, effectiveOriginId);
            if (existingId) {
                const detail = await getHubComandaDetailPayload(existingId, clinic_id);
                return res.status(200).json(detail);
            }
        }
        const comandaKeys = await fetchOpenComandaOriginKeys(clinic_id);
        if (comandaKeys.has(`${origin_type}:${effectiveOriginId}`)) {
            const { data: existing } = await supabase_1.supabaseAdmin
                .from('hub_comandas')
                .select('id')
                .eq('clinic_id', clinic_id)
                .eq('origin_type', origin_type)
                .eq('origin_id', effectiveOriginId)
                .eq('status', 'aberta')
                .is('deleted_at', null)
                .maybeSingle();
            if (existing?.id) {
                // Idempotente: reabrir a mesma comanda ativa (evita 409/500 no 2º «Gerar venda»).
                const detail = await getHubComandaDetailPayload(existing.id, clinic_id);
                return res.status(200).json(detail);
            }
            return res.status(409).json({
                error: 'Já existe comanda aberta para esta origem',
                comanda_id: null,
            });
        }
        let built;
        if (origin_type === 'manual') {
            const lines = b.manual_lines ?? [];
            const contextPetId = b.pet_id ?? null;
            const items = [];
            let subtotal = 0;
            let sort = 0;
            for (const ln of lines) {
                const qty = Number(ln.quantity ?? 1);
                const unit = round2(ln.unit_amount);
                const lineTotal = round2(qty * unit);
                subtotal += lineTotal;
                items.push({
                    pet_id: ln.pet_id ?? contextPetId,
                    item_kind: 'service',
                    hub_service_type_id: null,
                    hub_inventory_item_id: null,
                    hub_inventory_lot_id: null,
                    description: ln.description,
                    quantity: qty,
                    unit_amount: unit,
                    discount_amount: 0,
                    line_total: lineTotal,
                    service_date: null,
                    origin_type: 'manual_line',
                    origin_id: null,
                    sort_order: sort++,
                });
            }
            let unitId = b.unit_id ?? null;
            if (!unitId)
                unitId = await resolveClinicDefaultUnitId(clinic_id);
            built = {
                items,
                subtotal: round2(subtotal),
                unit_id: unitId,
                guardian_id: b.guardian_id ?? null,
                pet_id: contextPetId,
            };
        }
        else if (origin_type === 'appointment') {
            built = await buildDesiredComandaSnapshot(clinic_id, {
                origin_type: 'appointment',
                origin_id: effectiveOriginId,
            });
        }
        else if (origin_type === 'grooming_session') {
            const { data: sess, error: sessErr } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('grooming_stage, hub_appointment_id, unit_id, guardian_id')
                .eq('id', effectiveOriginId)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (sessErr)
                throw new Error(sessErr.message);
            if (!sess)
                throw new Error('NOT_FOUND');
            if (String(sess.grooming_stage) === 'closed') {
                built = await buildComandaItemsFromGroomingSession(clinic_id, effectiveOriginId);
            }
            else {
                const apptId = sess.hub_appointment_id;
                if (apptId) {
                    // Pagamento antecipado com agendamento — usar itens do agendamento como rascunho
                    const apptBuilt = await buildComandaItemsFromAppointment(clinic_id, apptId, { allowIncompleteStatus: true });
                    built = {
                        ...apptBuilt,
                        unit_id: sess.unit_id ?? apptBuilt.unit_id,
                    };
                }
                else {
                    // Walk-in antecipado — sem agendamento, criar item de placeholder com o tutor da sessão
                    const guardianId = sess.guardian_id;
                    if (!guardianId)
                        throw new Error('NO_GUARDIAN');
                    built = {
                        items: [
                            {
                                pet_id: null,
                                item_kind: 'fee',
                                hub_service_type_id: null,
                                hub_inventory_item_id: null,
                                hub_inventory_lot_id: null,
                                description: 'Banho e Tosa (avulso — antecipado)',
                                quantity: 1,
                                unit_amount: 0,
                                discount_amount: 0,
                                line_total: 0,
                                service_date: null,
                                origin_type: null,
                                origin_id: null,
                                sort_order: 0,
                            },
                        ],
                        subtotal: 0,
                        unit_id: sess.unit_id ?? null,
                        guardian_id: guardianId,
                        pet_id: null,
                    };
                }
            }
        }
        else if (origin_type === 'quote') {
            built = await buildComandaItemsFromQuote(clinic_id, effectiveOriginId);
        }
        else if (origin_type === 'boarding_reservation') {
            // Hotel/Creche: permite comanda antecipada (antes do check-out operacional)
            built = await buildComandaItemsFromBoardingReservation(clinic_id, effectiveOriginId, {
                allowIncomplete: true,
            });
        }
        else if (origin_type === 'package') {
            const pkgBuilt = await (0, hubPackagesService_1.buildComandaItemsFromPackagePurchase)({
                clinicId: clinic_id,
                packageId: b.package_id,
                purchaseGroupId: effectiveOriginId,
                petId: b.pet_id ?? null,
                petIds: b.pet_ids,
                packageLines: b.package_lines?.map((ln) => ({ packageId: ln.package_id, petId: ln.pet_id })),
                guardianId: b.guardian_id,
                unitId: b.unit_id ?? null,
            });
            built = {
                items: pkgBuilt.items,
                subtotal: pkgBuilt.subtotal,
                unit_id: pkgBuilt.unit_id,
                guardian_id: pkgBuilt.guardian_id,
                pet_id: pkgBuilt.pet_id,
            };
        }
        else {
            // Encounter: permite comanda antecipada (allowIncomplete) para recebimento antes de concluir
            built = await buildComandaItemsFromEncounter(clinic_id, effectiveOriginId, { allowIncomplete: true });
        }
        const discount = origin_type === 'quote' && 'discount_amount' in built
            ? round2(Number(built.discount_amount ?? 0))
            : 0;
        const total = round2(Math.max(0, built.subtotal - discount));
        let resolvedEncounterId = hub_encounter_id ?? (origin_type === 'encounter' ? effectiveOriginId : null);
        if (!resolvedEncounterId && origin_type === 'appointment') {
            resolvedEncounterId = await findLatestCompletedEncounterIdForAppointment(clinic_id, effectiveOriginId);
        }
        let resolvedCaseId = hub_case_id ?? null;
        if (!resolvedCaseId && resolvedEncounterId) {
            const { data: encCase } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('hub_case_id')
                .eq('id', resolvedEncounterId)
                .maybeSingle();
            resolvedCaseId = encCase?.hub_case_id ?? null;
        }
        const resolvedPetId = built.pet_id ??
            (built.items.map((it) => it.pet_id).find((pid) => Boolean(pid)) ?? null);
        // Isolamento multi-tenant: valida FKs efetivas (o que será persistido) antes de qualquer escrita.
        const tenantCheck = await assertComandaPersistedTenantFks({
            clinicId: clinic_id,
            originType: origin_type,
            unitId: built.unit_id,
            guardianId: built.guardian_id,
            petIds: [resolvedPetId, ...built.items.map((it) => it.pet_id)],
            encounterId: resolvedEncounterId,
            caseId: resolvedCaseId,
        });
        if (!tenantCheck.ok) {
            return res.status(400).json({ error: tenantCheck.error });
        }
        const { data: comanda, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .insert({
            clinic_id,
            unit_id: built.unit_id,
            guardian_id: built.guardian_id,
            pet_id: resolvedPetId,
            origin_type,
            origin_id: effectiveOriginId,
            hub_case_id: resolvedCaseId,
            hub_encounter_id: resolvedEncounterId,
            status: 'aberta',
            financial_status: 'open',
            subtotal_amount: built.subtotal,
            discount_amount: discount,
            total_amount: total,
            notes: null,
            client_notes: origin_type === 'quote' && 'client_notes' in built ? built.client_notes : null,
        })
            .select('id')
            .single();
        if (cErr || !comanda) {
            const errMsg = String(cErr?.message ?? '');
            const isActiveOriginRace = /uniq_hub_comandas_active_origin/i.test(errMsg) ||
                (/duplicate key/i.test(errMsg) && /active_origin|origin/i.test(errMsg));
            if (isActiveOriginRace && origin_type !== 'manual') {
                const racedId = await resolveExistingOpenComandaIdForOpen(clinic_id, origin_type, effectiveOriginId);
                if (racedId) {
                    const detail = await getHubComandaDetailPayload(racedId, clinic_id);
                    return res.status(200).json(detail);
                }
            }
            console.error('postHubComandaOpen', cErr);
            return res.status(500).json({ error: cErr?.message || 'Erro ao criar comanda' });
        }
        const comandaId = comanda.id;
        const rows = built.items.map((it) => comandaItemInsertRow(clinic_id, comandaId, it));
        if (rows.length > 0) {
            const { error: iErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').insert(rows);
            if (iErr) {
                await supabase_1.supabaseAdmin.from('hub_comandas').delete().eq('id', comandaId);
                return res.status(500).json({ error: iErr.message });
            }
        }
        const userId = req.user?.id ?? null;
        for (const row of rows) {
            void (0, comandaEvents_1.recordComandaItemAddedEvent)({
                clinic_id,
                comanda_id: comandaId,
                item: {
                    description: String(row.description),
                    item_kind: String(row.item_kind),
                    quantity: Number(row.quantity),
                    unit_amount: Number(row.unit_amount),
                    line_total: Number(row.line_total),
                },
                actor_user_id: userId,
                source: origin_type === 'manual' ? 'manual_open' : 'origin_open',
            });
        }
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        return res.status(201).json(detail);
    }
    catch (e) {
        const msg = e?.message;
        if (msg === 'NOT_FOUND')
            return res.status(404).json({ error: 'Origem não encontrada' });
        if (msg === 'NOT_READY')
            return res.status(409).json({ error: 'Origem não está pronta para comanda' });
        if (msg === 'WAIVED')
            return res.status(409).json({ error: 'Marcado sem cobrança' });
        if (msg === 'NO_GUARDIAN') {
            return res.status(409).json({
                error: 'Não é possível abrir a comanda sem tutor responsável. Associe tutor e pet ao atendimento ou vincule um caso clínico com pet/tutor cadastrado.',
            });
        }
        if (msg === 'NO_PET') {
            return res.status(409).json({
                error: 'Não é possível abrir a comanda sem pet identificado. Vincule um pet ao atendimento ou ao caso clínico antes de abrir a comanda.',
            });
        }
        if (msg === 'ALREADY_BILLED')
            return res.status(409).json({ error: 'Orçamento já faturado' });
        if (msg === 'PACKAGE_INACTIVE')
            return res.status(409).json({ error: 'Pacote inativo' });
        if (msg === 'PET_NOT_FOUND')
            return res.status(404).json({ error: 'Pet não encontrado' });
        if (msg === 'DUPLICATE_PACKAGE_PET_LINE') {
            return res.status(400).json({ error: 'Não é possível repetir o mesmo pacote para o mesmo pet na venda' });
        }
        if (msg === 'PACKAGE_LINES_REQUIRED') {
            return res.status(400).json({ error: 'Informe ao menos uma linha de pacote' });
        }
        console.error('postHubComandaOpen', e);
        return res.status(500).json({ error: msg || 'Erro interno' });
    }
};
exports.postHubComandaOpen = postHubComandaOpen;
async function listAllowedGuardiansForPetIds(petIds) {
    if (!petIds.length)
        return [];
    const { data: links, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('guardian_id, role, hub_guardians(id, full_name, phone, email, deleted_at)')
        .in('pet_id', petIds);
    if (error)
        throw new Error(error.message);
    const byId = new Map();
    for (const row of links ?? []) {
        const gRaw = row.hub_guardians;
        const g = (Array.isArray(gRaw) ? gRaw[0] : gRaw);
        if (!g || g.deleted_at)
            continue;
        const gid = g.id;
        const role = String(row.role ?? '');
        const existing = byId.get(gid);
        if (existing) {
            if (role === 'primary' && existing.role !== 'primary')
                existing.role = 'primary';
            continue;
        }
        byId.set(gid, {
            id: gid,
            full_name: String(g.full_name ?? ''),
            phone: g.phone ?? null,
            email: g.email ?? null,
            role,
        });
    }
    return [...byId.values()].sort((a, b) => {
        if (a.role === 'primary' && b.role !== 'primary')
            return -1;
        if (b.role === 'primary' && a.role !== 'primary')
            return 1;
        return a.full_name.localeCompare(b.full_name, 'pt-BR');
    });
}
async function getHubComandaDetailPayload(comandaId, clinicId) {
    const { data: comanda, error: cErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('*')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (cErr || !comanda)
        throw new Error('NOT_FOUND');
    const { data: items, error: iErr } = await supabase_1.supabaseAdmin
        .from('hub_comanda_items')
        .select('*')
        .eq('comanda_id', comandaId)
        .order('sort_order', { ascending: true });
    if (iErr)
        throw new Error(iErr.message);
    const { data: lineRows } = await supabase_1.supabaseAdmin
        .from('hub_receivable_lines')
        .select('comanda_item_id, receivable_id')
        .eq('comanda_id', comandaId)
        .not('comanda_item_id', 'is', null);
    const recIds = [...new Set((lineRows ?? []).map((r) => r.receivable_id))];
    /** Itens permanecem faturados salvo reissue (cancelamento puro que reabre cobrança). */
    let billsItemByRecId = new Map();
    /** Listáveis na ficha: paid/pending/refunded + cancelled-com-devolução. */
    let listableRecById = new Map();
    if (recIds.length) {
        const { data: recs, error: covErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, status, returned_amount, cancel_rebill')
            .in('id', recIds);
        const coverageRows = covErr && String(covErr.message || '').includes('cancel_rebill')
            ? (await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, status, returned_amount')
                .in('id', recIds)).data
            : recs;
        for (const r of coverageRows ?? []) {
            const id = r.id;
            billsItemByRecId.set(id, (0, hubReceivableCancelCoverage_1.receivableBillsComandaItem)(r));
            listableRecById.set(id, (0, hubReceivableCancelCoverage_1.receivableListableOnComanda)(r));
        }
    }
    const invoicedItemIds = new Set();
    for (const row of lineRows ?? []) {
        const cid = row.comanda_item_id;
        const rid = row.receivable_id;
        if (cid && billsItemByRecId.get(rid))
            invoicedItemIds.add(cid);
    }
    const openItemIds = (items ?? []).map((it) => it.id).filter((id) => !invoicedItemIds.has(id));
    const activeReceivableIds = recIds.filter((id) => listableRecById.get(id));
    const comandaRow = comanda;
    const [balancePayload, cardFeeTotals] = await Promise.all([
        computeComandaBalancePayload(comandaId, clinicId),
        computeComandaCardFeeTotals(comandaId, clinicId).catch((e) => {
            // Colunas de taxa ausentes (migration 154) → zera sem quebrar o detail.
            console.warn('[hub_comandas] card fee totals skipped', e);
            return EMPTY_CARD_FEE_TOTALS;
        }),
    ]);
    const { paid_total, balance_due, net_total, returned_amount, posted_total, line_refunds_total, } = balancePayload;
    const operational_complete = await isOperationalCompleteForComanda(comandaRow);
    const edit_scopes = (0, comandaEditScopes_1.computeComandaEditScopes)(comandaRow, operational_complete, balance_due);
    // Enriquecer com nomes de tutor/pet
    const guardianId = comandaRow.guardian_id;
    const petId = comandaRow.pet_id;
    const petIds = [
        ...new Set([
            ...(items ?? []).map((it) => it.pet_id),
            petId,
        ].filter((id) => Boolean(id))),
    ];
    const allowedGuardians = await listAllowedGuardiansForPetIds(petIds);
    const [guRes, petRes, itemPetsRes] = await Promise.all([
        guardianId
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name, phone, email, tax_id').eq('id', guardianId).maybeSingle()
            : Promise.resolve({ data: null }),
        petId
            ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name, species, breed, size_tier, sex').eq('id', petId).maybeSingle()
            : Promise.resolve({ data: null }),
        petIds.length
            ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name, species, breed, size_tier, sex').in('id', petIds)
            : Promise.resolve({ data: [] }),
    ]);
    const guardian = guRes.data
        ? {
            id: guRes.data.id,
            full_name: guRes.data.full_name,
            phone: guRes.data.phone ?? null,
            email: guRes.data.email ?? null,
            tax_id: guRes.data.tax_id ?? null,
        }
        : null;
    const pet = petRes.data
        ? {
            id: petRes.data.id,
            name: petRes.data.name,
            species: petRes.data.species,
            breed: petRes.data.breed ?? null,
            size_tier: petRes.data.size_tier,
            sex: petRes.data.sex ?? null,
        }
        : null;
    const petNameMap = new Map((itemPetsRes.data ?? []).map((p) => [p.id, p.name]));
    const petsById = new Map();
    for (const p of itemPetsRes.data ?? []) {
        petsById.set(p.id, p);
    }
    if (petRes.data) {
        petsById.set(petRes.data.id, petRes.data);
    }
    const pets = [...petsById.values()]
        .map((p) => ({
        id: p.id,
        name: String(p.name ?? ''),
        species: String(p.species ?? ''),
        breed: p.breed ?? null,
        size_tier: String(p.size_tier ?? ''),
        sex: p.sex ?? null,
    }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const enrichedItems = (items ?? []).map((it) => ({
        ...it,
        pet_name: it.pet_id ? (petNameMap.get(it.pet_id) ?? null) : null,
    }));
    const packageBalancesByItemId = {};
    if (guardianId &&
        String(comandaRow.origin_type) !== 'package' &&
        String(comandaRow.origin_type) !== 'series_invoice') {
        for (const it of enrichedItems) {
            if (!openItemIds.includes(it.id))
                continue;
            if (String(it.item_kind) !== 'service' || !it.hub_service_type_id)
                continue;
            if (String(it.origin_type) === 'appointment_service' && it.origin_id) {
                const { data: covered } = await supabase_1.supabaseAdmin
                    .from('hub_series_invoice_items')
                    .select('id, invoice:hub_series_invoices(status)')
                    .eq('appointment_service_id', it.origin_id)
                    .limit(5);
                const active = (covered ?? []).some((row) => {
                    const inv = row.invoice;
                    const status = Array.isArray(inv) ? inv[0]?.status : inv?.status;
                    return Boolean(status && status !== 'cancelled');
                });
                if (active)
                    continue;
            }
            const lineVariant = await resolveComandaItemPricingVariant(it);
            const eligible = await (0, hubPackagesService_1.eligibleBalancesForComandaItem)({
                clinicId,
                guardianId,
                petId: it.pet_id ?? null,
                hubServiceTypeId: it.hub_service_type_id,
                pricingVariant: lineVariant,
            });
            if (eligible.length)
                packageBalancesByItemId[it.id] = eligible;
        }
    }
    const [events, timelinePayments] = await Promise.all([
        (0, comandaEvents_1.listComandaEvents)(comandaId, clinicId),
        listTimelinePaymentsForComanda(comandaId, clinicId).catch((e) => {
            console.warn('[hub_comandas] timeline payments skipped', e);
            return [];
        }),
    ]);
    // Itens da comanda já devolvidos fisicamente (preserva histórico; só marca UI).
    const returnedComandaItemIds = new Set();
    if (recIds.length) {
        const { data: returnEvents, error: retErr } = await supabase_1.supabaseAdmin
            .from('hub_product_return_events')
            .select('receivable_line_id')
            .eq('clinic_id', clinicId)
            .in('receivable_id', recIds);
        if (retErr && !/does not exist|schema cache|42P01/i.test(String(retErr.message))) {
            throw new Error(retErr.message);
        }
        const returnedLineIds = [
            ...new Set((returnEvents ?? []).map((r) => String(r.receivable_line_id ?? '')).filter(Boolean)),
        ];
        if (returnedLineIds.length) {
            const { data: returnedLines } = await supabase_1.supabaseAdmin
                .from('hub_receivable_lines')
                .select('id, comanda_item_id')
                .eq('comanda_id', comandaId)
                .in('id', returnedLineIds);
            for (const row of returnedLines ?? []) {
                const cid = row.comanda_item_id == null ? null : String(row.comanda_item_id);
                if (cid)
                    returnedComandaItemIds.add(cid);
            }
        }
    }
    const encounterIdForPending = comandaRow.hub_encounter_id ||
        (String(comandaRow.origin_type) === 'encounter' ? comandaRow.origin_id : null);
    const pending_price_approvals = await listPendingClinicalPriceApprovals(clinicId, encounterIdForPending);
    return {
        comanda: { ...comanda, guardian, pet },
        items: enrichedItems,
        pets,
        open_item_ids: openItemIds,
        invoiced_item_ids: [...invoicedItemIds],
        returned_item_ids: [...returnedComandaItemIds],
        active_receivable_ids: activeReceivableIds,
        paid_total,
        balance_due,
        /** Líquido vigente (recebíveis após devoluções + itens abertos). */
        net_total,
        returned_amount,
        posted_total,
        line_refunds_total,
        card_gross_total: cardFeeTotals.card_gross_total,
        card_fee_total: cardFeeTotals.card_fee_total,
        card_net_total: cardFeeTotals.card_net_total,
        card_without_fee_gross_total: cardFeeTotals.card_without_fee_gross_total,
        operational_complete,
        edit_scopes,
        allowed_guardians: allowedGuardians,
        package_balances_by_item_id: packageBalancesByItemId,
        events,
        /** Um lançamento por pagamento (não agregar métodos na timeline). */
        payments: timelinePayments,
        pending_price_approvals,
    };
}
/** Preços clínicos ainda pendentes de aprovação financeira (não entram na comanda até confirmar). */
async function listPendingClinicalPriceApprovals(clinicId, encounterId) {
    if (!encounterId)
        return [];
    const out = [];
    const { data: encSvcRows, error: encSvcErr } = await supabase_1.supabaseAdmin
        .from('hub_encounter_services')
        .select('id, hub_encounter_id, service_name, unit_amount, quantity')
        .eq('hub_encounter_id', encounterId)
        .eq('clinic_id', clinicId)
        .eq('billing_mode', 'charge')
        .eq('price_status', 'pending_approval')
        .is('deleted_at', null);
    if (!encSvcErr || !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(encSvcErr)) {
        for (const raw of encSvcRows ?? []) {
            const row = raw;
            out.push({
                kind: 'encounter_service',
                id: row.id,
                parent_id: row.hub_encounter_id,
                service_name: String(row.service_name || 'Serviço clínico'),
                unit_amount: Number(row.unit_amount ?? 0),
                quantity: Number(row.quantity ?? 1) || 1,
            });
        }
    }
    const { data: surgeries, error: surgErr } = await supabase_1.supabaseAdmin
        .from('hub_surgeries')
        .select('id')
        .eq('hub_encounter_id', encounterId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
    if (!surgErr || !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(surgErr)) {
        const surgeryIds = (surgeries ?? []).map((s) => s.id);
        if (surgeryIds.length > 0) {
            const { data: rows, error } = await supabase_1.supabaseAdmin
                .from('hub_surgery_services')
                .select('id, surgery_id, service_name, unit_amount, quantity')
                .in('surgery_id', surgeryIds)
                .eq('clinic_id', clinicId)
                .eq('billing_mode', 'charge')
                .eq('price_status', 'pending_approval')
                .is('deleted_at', null);
            if (!error || !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
                for (const raw of rows ?? []) {
                    const row = raw;
                    out.push({
                        kind: 'surgery_service',
                        id: row.id,
                        parent_id: row.surgery_id,
                        service_name: String(row.service_name || 'Serviço de cirurgia'),
                        unit_amount: Number(row.unit_amount ?? 0),
                        quantity: Number(row.quantity ?? 1) || 1,
                    });
                }
            }
        }
    }
    const { data: hosps, error: hospErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('id')
        .eq('hub_encounter_id', encounterId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
    if (!hospErr || !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(hospErr)) {
        const hospIds = (hosps ?? []).map((h) => h.id);
        if (hospIds.length > 0) {
            const { data: rows, error } = await supabase_1.supabaseAdmin
                .from('hub_hospitalization_charges')
                .select('id, hospitalization_id, service_name, unit_amount, quantity')
                .in('hospitalization_id', hospIds)
                .eq('clinic_id', clinicId)
                .eq('billing_mode', 'charge')
                .eq('price_status', 'pending_approval')
                .is('deleted_at', null);
            if (!error || !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
                for (const raw of rows ?? []) {
                    const row = raw;
                    out.push({
                        kind: 'hospitalization_charge',
                        id: row.id,
                        parent_id: row.hospitalization_id,
                        service_name: String(row.service_name || 'Lançamento de internação'),
                        unit_amount: Number(row.unit_amount ?? 0),
                        quantity: Number(row.quantity ?? 1) || 1,
                    });
                }
            }
        }
    }
    return out;
}
async function loadComandaPdfPayload(comandaId, clinicId) {
    const detail = await getHubComandaDetailPayload(comandaId, clinicId);
    const comanda = detail.comanda;
    const { data: clinicRow } = await supabase_1.supabaseAdmin
        .from('clinics')
        .select('name, photo_url')
        .eq('id', clinicId)
        .maybeSingle();
    const guardianRaw = comanda.guardian;
    const pets = (detail.pets ?? []);
    return {
        id: comanda.id,
        status: String(comanda.status ?? ''),
        subtotal_amount: Number(comanda.subtotal_amount ?? 0),
        discount_amount: Number(comanda.discount_amount ?? 0),
        total_amount: Number(comanda.total_amount ?? 0),
        opened_at: String(comanda.opened_at ?? comanda.created_at ?? new Date().toISOString()),
        closed_at: comanda.closed_at ?? null,
        guardian: guardianRaw
            ? {
                full_name: String(guardianRaw.full_name ?? ''),
                phone: guardianRaw.phone ?? null,
                email: guardianRaw.email ?? null,
                tax_id: guardianRaw.tax_id ?? null,
            }
            : null,
        clinic: clinicRow
            ? {
                name: clinicRow.name,
                photo_url: clinicRow.photo_url ?? null,
            }
            : null,
        pets: pets.map((p) => ({
            id: String(p.id ?? ''),
            name: String(p.name ?? ''),
            species: String(p.species ?? '—'),
            breed: p.breed ?? null,
            size_tier: String(p.size_tier ?? ''),
        })),
        items: detail.items.map((it) => ({
            id: it.id,
            description: String(it.description ?? ''),
            quantity: Number(it.quantity ?? 1),
            unit_amount: Number(it.unit_amount ?? 0),
            discount_amount: Number(it.discount_amount ?? 0),
            line_total: Number(it.line_total ?? 0),
            sort_order: Number(it.sort_order ?? 0),
            pet_name: it.pet_name,
        })),
        paid_total: detail.paid_total,
        balance_due: detail.balance_due,
        client_notes: comanda.client_notes?.trim() || null,
    };
}
const ensureComandaPublicToken = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!idParsed.success || !clinicParsed.success) {
            return res.status(400).json({ error: 'id e clinic_id (UUID) obrigatórios' });
        }
        const { data: existing, error: fetchErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id, clinic_id, public_token, deleted_at')
            .eq('id', idParsed.data)
            .eq('clinic_id', clinicParsed.data)
            .maybeSingle();
        if (fetchErr)
            return res.status(500).json({ error: fetchErr.message });
        if (!existing || existing.deleted_at)
            return res.status(404).json({ error: 'Comanda não encontrada' });
        let token = existing.public_token;
        if (!token) {
            token = (0, node_crypto_1.randomBytes)(24).toString('base64url');
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_comandas')
                .update({ public_token: token })
                .eq('id', idParsed.data);
            if (error) {
                console.error('ensureComandaPublicToken', error);
                return res.status(500).json({ error: 'Erro ao gerar token público' });
            }
        }
        return res.json({ public_token: token });
    }
    catch (e) {
        console.error('ensureComandaPublicToken', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.ensureComandaPublicToken = ensureComandaPublicToken;
const getPublicComanda = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!token)
            return res.status(400).json({ error: 'Token inválido' });
        const { data: comanda, error } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id, clinic_id, status, subtotal_amount, discount_amount, total_amount, opened_at, closed_at, guardian_id, public_token, deleted_at')
            .eq('public_token', token)
            .maybeSingle();
        if (error) {
            console.error('getPublicComanda', error);
            return res.status(500).json({ error: 'Erro ao carregar comanda' });
        }
        if (!comanda || comanda.deleted_at)
            return res.status(404).json({ error: 'Comanda não encontrada' });
        const clinicId = comanda.clinic_id;
        const detail = await getHubComandaDetailPayload(comanda.id, clinicId);
        const comandaRow = detail.comanda;
        const { notes: _notes, finance_notes: _financeNotes, ...comandaPublic } = comandaRow;
        const { data: clinicRow } = await supabase_1.supabaseAdmin
            .from('clinics')
            .select('name, photo_url')
            .eq('id', clinicId)
            .maybeSingle();
        return res.json({
            comanda: {
                ...comandaPublic,
                clinic: clinicRow
                    ? {
                        name: clinicRow.name,
                        photo_url: clinicRow.photo_url ?? null,
                    }
                    : null,
            },
            items: detail.items,
            pets: detail.pets,
            paid_total: detail.paid_total,
            balance_due: detail.balance_due,
        });
    }
    catch (e) {
        console.error('getPublicComanda', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getPublicComanda = getPublicComanda;
const getHubComandaPdf = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!idParsed.success || !clinicParsed.success) {
            return res.status(400).json({ error: 'id e clinic_id (UUID) obrigatórios' });
        }
        const payload = await loadComandaPdfPayload(idParsed.data, clinicParsed.data);
        await (0, hubComandaPdf_1.streamComandaPdf)(res, payload);
        return;
    }
    catch (e) {
        if (e?.message === 'NOT_FOUND')
            return res.status(404).json({ error: 'Comanda não encontrada' });
        console.error('getHubComandaPdf', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubComandaPdf = getHubComandaPdf;
/** Cupom térmico (58/80mm) — largura vem de hub_clinic_settings.cupom_width_mm. */
const getHubComandaCupomPdf = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!idParsed.success || !clinicParsed.success) {
            return res.status(400).json({ error: 'id e clinic_id (UUID) obrigatórios' });
        }
        const clinicId = clinicParsed.data;
        const [payload, settings] = await Promise.all([
            loadComandaPdfPayload(idParsed.data, clinicId),
            (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinicId),
        ]);
        (0, hubComandaCupomPdf_1.streamComandaCupomPdf)(res, payload, settings.cupom_width_mm);
        return;
    }
    catch (e) {
        if (e?.message === 'NOT_FOUND')
            return res.status(404).json({ error: 'Comanda não encontrada' });
        console.error('getHubComandaCupomPdf', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubComandaCupomPdf = getHubComandaCupomPdf;
const getHubComandaDetail = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!idParsed.success || !clinicParsed.success) {
            return res.status(400).json({ error: 'id e clinic_id (UUID) obrigatórios' });
        }
        const detail = await getHubComandaDetailPayload(idParsed.data, clinicParsed.data);
        return res.json(detail);
    }
    catch (e) {
        if (e?.message === 'NOT_FOUND')
            return res.status(404).json({ error: 'Comanda não encontrada' });
        console.error('getHubComandaDetail', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubComandaDetail = getHubComandaDetail;
const applyPackageBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    item_id: uuidStr,
    package_balance_id: uuidStr.nullable(),
    edit_context: comandaEditContextSchema,
})
    .strict();
const postHubComandaApplyPackage = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = applyPackageBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const comandaId = idParsed.data;
        const { clinic_id, item_id, package_balance_id, edit_context } = parsed.data;
        await assertComandaEditAllowed(comandaId, clinic_id, edit_context);
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        const item = detail.items.find((it) => it.id === item_id);
        if (!item)
            return res.status(404).json({ error: 'Item não encontrado' });
        if (detail.invoiced_item_ids.includes(item_id)) {
            return res.status(409).json({ error: 'Item já faturado' });
        }
        const comanda = detail.comanda;
        const guardianId = comanda.guardian_id;
        const petId = item.pet_id ?? null;
        const serviceTypeId = item.hub_service_type_id;
        let unitAmount = Number(item.unit_amount ?? 0);
        let lineTotal = Number(item.line_total ?? 0);
        let description = String(item.description ?? '');
        let balanceId = null;
        if (package_balance_id) {
            if (!serviceTypeId)
                return res.status(400).json({ error: 'Somente linhas de serviço podem usar pacote' });
            if (String(item.origin_type) === 'appointment_service' && item.origin_id) {
                const { data: covered } = await supabase_1.supabaseAdmin
                    .from('hub_series_invoice_items')
                    .select('id, invoice:hub_series_invoices(status)')
                    .eq('appointment_service_id', item.origin_id)
                    .limit(5);
                const active = (covered ?? []).some((row) => {
                    const inv = row.invoice;
                    const status = Array.isArray(inv) ? inv[0]?.status : inv?.status;
                    return Boolean(status && status !== 'cancelled');
                });
                if (active) {
                    return res.status(409).json({
                        error: 'Este serviço já está coberto por fatura em série e não pode usar pacote',
                    });
                }
            }
            const lineVariant = await resolveComandaItemPricingVariant(item);
            const balance = await (0, hubPackagesService_1.findEligiblePackageBalance)({
                clinicId: clinic_id,
                guardianId,
                petId,
                hubServiceTypeId: serviceTypeId,
                pricingVariant: lineVariant,
            });
            if (!balance || balance.id !== package_balance_id) {
                return res.status(409).json({ error: 'Saldo de pacote indisponível para este serviço' });
            }
            const balVariant = balance.pricing_variant ?? null;
            if (balVariant && !(0, hubPackagesService_1.pricingVariantsEqual)(balVariant, lineVariant)) {
                return res.status(409).json({ error: 'A opção de preço desta linha não corresponde ao pacote' });
            }
            const pkgEmbed = balance.hub_packages;
            const pkgName = Array.isArray(pkgEmbed) ? pkgEmbed[0]?.name : pkgEmbed?.name;
            const remaining = Number(balance.sessions_remaining ?? 0);
            const baseDesc = description.split(' — Pacote')[0].trim();
            description = `${baseDesc} — Pacote ${pkgName ?? ''} (${remaining} restantes)`.trim();
            unitAmount = 0;
            lineTotal = 0;
            balanceId = package_balance_id;
        }
        else if (String(item.origin_type) === 'appointment_service' && item.origin_id) {
            const { data: svc } = await supabase_1.supabaseAdmin
                .from('hub_appointment_services')
                .select('sale_amount_applied, hub_service_types(name, sale_amount)')
                .eq('id', item.origin_id)
                .maybeSingle();
            if (svc) {
                const st = svc.hub_service_types;
                const stRow = Array.isArray(st) ? st[0] : st;
                unitAmount = (0, hubPricingResolve_1.resolveAppliedSaleAmount)(svc.sale_amount_applied, stRow?.sale_amount);
                lineTotal = unitAmount;
                description = stRow?.name || description.split(' — Pacote')[0].trim();
            }
        }
        else if (String(item.origin_type) === 'grooming_extra' && item.origin_id) {
            const { data: extra } = await supabase_1.supabaseAdmin
                .from('hub_grooming_session_extras')
                .select('sale_amount_snapshot, name_snapshot')
                .eq('id', item.origin_id)
                .maybeSingle();
            if (extra) {
                unitAmount = round2(Number(extra.sale_amount_snapshot ?? 0));
                lineTotal = unitAmount;
                description = String(extra.name_snapshot ?? description.split(' — Pacote')[0].trim());
            }
        }
        const { error: uErr } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .update({
            unit_amount: unitAmount,
            line_total: lineTotal,
            description,
            package_balance_id: balanceId,
        })
            .eq('id', item_id)
            .eq('comanda_id', comandaId);
        if (uErr)
            return res.status(500).json({ error: uErr.message });
        const openItems = detail.items
            .filter((it) => !detail.invoiced_item_ids.includes(it.id))
            .map((it) => (it.id === item_id ? { ...it, line_total: lineTotal } : it));
        const subtotal = round2(openItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
        const discount = Number(comanda.discount_amount ?? 0);
        const total = round2(Math.max(0, subtotal - discount));
        await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .update({ subtotal_amount: subtotal, total_amount: total })
            .eq('id', comandaId)
            .eq('clinic_id', clinic_id);
        return res.json({ detail: await getHubComandaDetailPayload(comandaId, clinic_id) });
    }
    catch (e) {
        const msg = e?.message;
        if (msg === 'NOT_FOUND')
            return res.status(404).json({ error: 'Comanda não encontrada' });
        console.error('postHubComandaApplyPackage', e);
        return res.status(500).json({ error: msg || 'Erro interno' });
    }
};
exports.postHubComandaApplyPackage = postHubComandaApplyPackage;
const checkoutBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    grouping: zod_1.z.enum(['all', 'by_pet', 'manual']),
    manual_groups: zod_1.z.array(zod_1.z.object({ item_ids: zod_1.z.array(uuidStr) })).optional(),
    /** Índice do grupo (0-based) que recebe itens sem pet em modo by_pet */
    tutor_items_group_index: zod_1.z.number().int().min(0).optional().nullable(),
    action: zod_1.z.enum(['receive_now', 'leave_pending', 'cancel']),
    due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    /** advance: antecipado (comanda pode permanecer aberta até a operação concluir). */
    payment_timing: zod_1.z.enum(['on_checkout', 'advance']).optional().default('on_checkout'),
    payments: zod_1.z
        .array(zod_1.z
        .object({
        group_index: zod_1.z.number().int().min(0),
        amount: zod_1.z.number().positive(),
        payment_method: hubPaymentMethods_1.hubPaymentMethodSchema,
        cash_session_id: uuidStr.optional().nullable(),
        installments: zod_1.z.number().int().min(1).max(99).optional(),
        /** UUID por intenção de pagamento — retry/duplo clique não duplica hub_payments. */
        idempotency_key: uuidStr.optional().nullable(),
        /** Valor entregue em dinheiro (UI); não grava coluna — só validação/notes. */
        tendered_amount: zod_1.z.number().positive().optional().nullable(),
    })
        .strict())
        .optional(),
    waive_reason: zod_1.z.string().trim().min(3).max(2000).optional(),
})
    .strict();
const postHubComandaCheckout = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = checkoutBodySchema.safeParse(req.body);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido', details: idParsed.error.flatten() });
        }
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const comandaId = idParsed.data;
        const { clinic_id, grouping, manual_groups, tutor_items_group_index, action, due_date, payments, waive_reason, payment_timing, } = parsed.data;
        let detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        let comanda = detail.comanda;
        if (String(comanda.status) !== 'aberta') {
            return res.status(409).json({ error: 'Comanda não está aberta' });
        }
        if (action === 'leave_pending') {
            detail = await maybeSyncEmptyComandaForHandoff(comandaId, clinic_id, detail, req.user?.id ?? null);
            comanda = detail.comanda;
        }
        const items = detail.items.filter((it) => detail.open_item_ids.includes(it.id));
        if (items.length === 0 && action !== 'cancel') {
            const bal = Number(detail.balance_due ?? 0);
            const op = Boolean(detail.operational_complete);
            if (action === 'receive_now' && bal <= 0.02 && op) {
                await tryAutoCloseComanda(comandaId, clinic_id);
                const { data: comandaFinal } = await supabase_1.supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();
                return res.status(201).json({
                    comanda: comandaFinal,
                    receivable_ids: [],
                    detail: await getHubComandaDetailPayload(comandaId, clinic_id),
                });
            }
            if (action === 'receive_now' && bal <= 0.02 && !op) {
                return res.status(409).json({
                    error: 'Sem itens em aberto. Aguarde a conclusão do serviço para encerrar a comanda ou sincronize os itens.',
                });
            }
            if (action === 'leave_pending') {
                if (!due_date) {
                    return res.status(400).json({ error: 'due_date obrigatório para deixar pendente' });
                }
                if ((0, comandaFinanceHandoff_1.canHandoffExistingReceivables)(detail)) {
                    try {
                        const receivableIds = await applyFinanceHandoffOnly(comandaId, clinic_id, detail, due_date);
                        const { data: comandaFinal } = await supabase_1.supabaseAdmin
                            .from('hub_comandas')
                            .select('*')
                            .eq('id', comandaId)
                            .single();
                        return res.status(201).json({
                            comanda: comandaFinal,
                            receivable_ids: receivableIds,
                            detail: await getHubComandaDetailPayload(comandaId, clinic_id),
                        });
                    }
                    catch (e) {
                        if (e.message === 'HANDOFF_NOT_APPLICABLE') {
                            return res.status(409).json({ error: 'Não há itens em aberto para faturar' });
                        }
                        throw e;
                    }
                }
            }
            return res.status(409).json({ error: 'Não há itens em aberto para faturar' });
        }
        const userId = req.user?.id ?? null;
        if (action === 'cancel') {
            if (!waive_reason) {
                return res.status(400).json({ error: 'Informe waive_reason (motivo) para cancelar' });
            }
            const originType = String(comanda.origin_type);
            const originId = comanda.origin_id ?? null;
            if (originType !== 'manual' && originId) {
                const keys = await fetchActiveReceivableKeys(clinic_id);
                if (keys.has(`${originType}:${originId}`)) {
                    return res.status(409).json({ error: 'Já existe cobrança; não é possível cancelar comanda desta forma' });
                }
            }
            const { waiveOriginAndCancelOpenComanda } = await Promise.resolve().then(() => __importStar(require('./hubComandaOperationalCancel.js')));
            await waiveOriginAndCancelOpenComanda({
                clinicId: clinic_id,
                comandaId,
                originType,
                originId,
                waiveReason: waive_reason,
            });
            return res.json({ ok: true, comanda: { ...comanda, status: 'cancelada' } });
        }
        if (action === 'leave_pending' && !due_date) {
            return res.status(400).json({ error: 'due_date obrigatório para deixar pendente' });
        }
        const executorCheck = await (0, hubCommissionAccrual_1.assertServiceLinesHaveExecutor)(clinic_id, items);
        if (!executorCheck.ok) {
            return res.status(409).json({
                error: executorCheck.message,
                code: 'COMMISSION_EXECUTOR_REQUIRED',
                missing: executorCheck.missing,
            });
        }
        const itemById = new Map(items.map((it) => [it.id, it]));
        let groups = [];
        if (grouping === 'all') {
            groups = [items.map((it) => it.id)];
        }
        else if (grouping === 'by_pet') {
            const byPet = new Map();
            for (const it of items) {
                const pid = it.pet_id ?? null;
                if (!byPet.has(pid))
                    byPet.set(pid, []);
                byPet.get(pid).push(it.id);
            }
            const nullItems = byPet.get(null) ?? [];
            byPet.delete(null);
            for (const [, ids] of byPet) {
                groups.push(ids);
            }
            if (nullItems.length > 0) {
                const ti = tutor_items_group_index ?? 0;
                if (groups.length === 0)
                    groups.push([]);
                while (groups.length <= ti)
                    groups.push([]);
                groups[ti] = [...(groups[ti] ?? []), ...nullItems];
            }
        }
        else {
            if (!manual_groups?.length) {
                return res.status(400).json({ error: 'manual_groups obrigatório para agrupamento manual' });
            }
            groups = manual_groups.map((g) => g.item_ids);
        }
        const allGrouped = new Set();
        for (const g of groups) {
            for (const id of g) {
                if (allGrouped.has(id))
                    return res.status(400).json({ error: 'Item repetido entre grupos' });
                allGrouped.add(id);
                if (!itemById.has(id))
                    return res.status(400).json({ error: `Item inválido: ${id}` });
            }
        }
        for (const it of items) {
            if (!allGrouped.has(it.id)) {
                return res.status(400).json({ error: 'Todos os itens em aberto devem estar em algum grupo' });
            }
        }
        const receivableIds = [];
        const nonEmptyGroupIndices = [];
        const stockMovementIds = [];
        const creditConsumptions = [];
        let unitId = comanda.unit_id ?? null;
        if (!unitId)
            unitId = await resolveClinicDefaultUnitId(clinic_id);
        const guardianId = comanda.guardian_id ?? null;
        const allComandaItems = detail.items;
        const openLinesGross = round2(items.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
        const allLinesGross = round2(allComandaItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
        const headerDiscount = Number(comanda.discount_amount ?? 0);
        const checkoutDiscountPool = (0, comandaFinanceHandoff_1.openLinesHeaderDiscount)({
            openLinesTotal: openLinesGross,
            allLinesTotal: allLinesGross,
            headerDiscount,
            openItemsCount: items.length,
            allItemsCount: allComandaItems.length,
        });
        let discountRemaining = checkoutDiscountPool;
        const rollbackReceivables = async () => {
            for (const mid of stockMovementIds) {
                await supabase_1.supabaseAdmin.from('hub_stock_movements').delete().eq('id', mid);
            }
            stockMovementIds.length = 0;
            for (const credit of creditConsumptions.splice(0)) {
                try {
                    await (0, hubCustomerCredit_1.restoreHubCustomerCredit)({
                        clinicId: clinic_id,
                        guardianId: credit.guardianId,
                        amount: credit.amount,
                        reason: 'Rollback de checkout — crédito devolvido',
                        comandaId,
                        receivableId: credit.receivableId,
                        createdByUserId: userId,
                    });
                }
                catch (restoreErr) {
                    console.error('rollbackReceivables restore credit', restoreErr);
                }
            }
            for (const rid of receivableIds) {
                await supabase_1.supabaseAdmin.from('hub_payments').delete().eq('receivable_id', rid);
                await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', rid);
                await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', rid);
            }
            if (String(comanda.origin_type) === 'quote' && comanda.origin_id) {
                await supabase_1.supabaseAdmin.from('hub_quotes').update({ billing_state: 'awaiting_billing' }).eq('id', comanda.origin_id);
            }
        };
        const billableGroupSubtotals = groups.map((gids) => round2(gids.map((id) => itemById.get(id)).reduce((s, it) => s + Number(it.line_total ?? 0), 0)));
        const billableGross = round2(billableGroupSubtotals.reduce((s, v) => s + Math.max(0, v), 0));
        for (let gi = 0; gi < groups.length; gi++) {
            const gids = groups[gi];
            const groupItems = gids.map((id) => itemById.get(id));
            const subtotal = billableGroupSubtotals[gi] ?? 0;
            if (subtotal <= 0.009)
                continue;
            let groupDiscount = 0;
            if (discountRemaining > 0 && billableGross > 0) {
                const isLastBillable = groups.slice(gi + 1).every((ids, idx) => (billableGroupSubtotals[gi + 1 + idx] ?? 0) <= 0.009);
                groupDiscount = isLastBillable
                    ? discountRemaining
                    : round2(Math.min(discountRemaining, (checkoutDiscountPool * subtotal) / billableGross));
                discountRemaining = round2(Math.max(0, discountRemaining - groupDiscount));
            }
            const finalAmount = round2(Math.max(0, subtotal - groupDiscount));
            const manualSourceId = (0, node_crypto_1.randomUUID)();
            const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .insert({
                clinic_id,
                unit_id: unitId,
                guardian_id: guardianId,
                source_type: 'manual',
                source_id: manualSourceId,
                comanda_id: comandaId,
                original_amount: subtotal,
                final_amount: finalAmount,
                net_amount_at_sale: finalAmount,
                returned_amount: 0,
                status: 'pending',
                due_date: action === 'leave_pending' ? due_date : null,
                notes: null,
            })
                .select('id')
                .single();
            if (rErr || !rec) {
                console.error('checkout receivable', rErr);
                await rollbackReceivables();
                return res.status(500).json({ error: rErr?.message || 'Erro ao criar recebível' });
            }
            const receivableId = rec.id;
            receivableIds.push(receivableId);
            nonEmptyGroupIndices.push(gi);
            const costByItem = await loadInventoryCostByItemId(clinic_id, groupItems);
            const commissionByItem = await (0, hubCommissionAccrual_1.buildCommissionInsertFieldsForItems)({
                clinicId: clinic_id,
                items: groupItems,
                originalAmount: subtotal,
                netAmountAtSale: finalAmount,
                actingUserId: userId,
                // Checkout: só usa sold_by já gravado; não promove o caixa a vendedor.
                allowActingUserAsSaleAuthor: false,
            });
            let sort = 0;
            for (const it of groupItems) {
                const lineKind = String(it.item_kind ?? '') === 'product'
                    ? 'product'
                    : mapItemToReceivableLineKind(it.origin_type ?? null);
                const snap = commissionByItem.get(String(it.id));
                const { error: lnErr } = await supabase_1.supabaseAdmin.from('hub_receivable_lines').insert({
                    clinic_id,
                    receivable_id: receivableId,
                    comanda_id: comandaId,
                    comanda_item_id: it.id,
                    pet_id: it.pet_id ?? null,
                    line_kind: lineKind,
                    source_line_id: it.origin_id ?? null,
                    hub_service_type_id: it.hub_service_type_id ?? null,
                    hub_inventory_item_id: it.hub_inventory_item_id ?? null,
                    hub_inventory_lot_id: it.hub_inventory_lot_id ?? null,
                    description: String(it.description),
                    quantity: Number(it.quantity ?? 1),
                    unit_sale_amount: Number(it.unit_amount ?? 0),
                    unit_cost_amount: productUnitCostSnapshot(costByItem, it),
                    line_total: Number(it.line_total ?? 0),
                    sort_order: sort++,
                    ...(0, hubCommissionAccrual_1.snapshotToInsertFields)(snap),
                });
                if (lnErr) {
                    await rollbackReceivables();
                    return res.status(500).json({ error: lnErr.message });
                }
            }
        }
        const checkoutCostByItem = await loadInventoryCostByItemId(clinic_id, items);
        for (const it of items) {
            if (String(it.item_kind ?? '') !== 'product')
                continue;
            // Já baixados no atendimento (encounter_out) — não repetir sale_out no checkout
            if ((0, comandaStockOut_1.comandaProductOriginAlreadyStockedOut)(it.origin_type ?? null))
                continue;
            const invItemId = it.hub_inventory_item_id ?? null;
            const invLotId = it.hub_inventory_lot_id ?? null;
            if (!invItemId || !invLotId)
                continue;
            const qty = Number(it.quantity ?? 1);
            if (!(qty > 0))
                continue;
            const stockResult = await (0, hubInventoryStockUtils_1.createSaleStockOut)({
                clinicId: clinic_id,
                itemId: invItemId,
                lotId: invLotId,
                qty,
                unitCost: checkoutCostByItem.get(invItemId) ?? null,
                notes: `Venda na comanda ${comandaId}: ${String(it.description ?? 'Produto')}`,
                referenceType: 'hub_comanda_item',
                referenceId: it.id,
                createdBy: userId,
            });
            if ('error' in stockResult) {
                await rollbackReceivables();
                return res.status(400).json({ error: stockResult.error });
            }
            if (!stockResult.skipped) {
                stockMovementIds.push(stockResult.id);
            }
        }
        if (receivableIds.length === 0) {
            const hasPackageCoverage = items.some((it) => it.package_balance_id);
            if (hasPackageCoverage && (action === 'receive_now' || action === 'leave_pending')) {
                await (0, hubPackagesService_1.redeemPackageBalancesOnCheckout)({
                    clinicId: clinic_id,
                    comandaId,
                    staffUserId: userId,
                });
                if (action === 'leave_pending') {
                    await supabase_1.supabaseAdmin
                        .from('hub_comandas')
                        .update({ finance_handoff_at: new Date().toISOString() })
                        .eq('id', comandaId)
                        .eq('clinic_id', clinic_id);
                }
                await tryAutoCloseComanda(comandaId, clinic_id);
                const { data: comandaFinal } = await supabase_1.supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();
                return res.status(201).json({
                    comanda: comandaFinal,
                    receivable_ids: [],
                    detail: await getHubComandaDetailPayload(comandaId, clinic_id),
                });
            }
            return res.status(400).json({ error: 'Nenhum recebível gerado (valores zerados)' });
        }
        if (action === 'leave_pending') {
            await supabase_1.supabaseAdmin
                .from('hub_comandas')
                .update({ finance_handoff_at: new Date().toISOString() })
                .eq('id', comandaId)
                .eq('clinic_id', clinic_id);
        }
        const receivableIdForGroupIndex = (groupIndex) => {
            const pos = nonEmptyGroupIndices.indexOf(groupIndex);
            return pos >= 0 ? receivableIds[pos] : undefined;
        };
        if (String(comanda.origin_type) === 'quote' && comanda.origin_id) {
            await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_state: 'receivable_created' })
                .eq('id', comanda.origin_id)
                .eq('clinic_id', clinic_id);
        }
        if (String(comanda.origin_type) === 'package' && comanda.origin_id) {
            if (!guardianId) {
                await rollbackReceivables();
                return res.status(409).json({ error: 'Venda de pacote exige tutor na comanda.' });
            }
            const packagePurchaseLines = items
                .filter((it) => String(it.origin_type) === 'package_purchase' && it.origin_id)
                .map((it) => ({
                packageId: String(it.origin_id),
                petId: it.pet_id ?? null,
            }));
            if (packagePurchaseLines.length) {
                await (0, hubPackagesService_1.fulfillPackagePurchasesOnComandaCheckout)({
                    clinicId: clinic_id,
                    comandaId,
                    purchaseGroupId: comanda.origin_id,
                    guardianId,
                    packagePurchaseLines,
                    purchasedReceivableId: receivableIds[0] ?? null,
                });
            }
        }
        const hasServicePackageCoverage = items.some((it) => it.package_balance_id);
        if (hasServicePackageCoverage && String(comanda.origin_type) !== 'package') {
            await (0, hubPackagesService_1.redeemPackageBalancesOnCheckout)({
                clinicId: clinic_id,
                comandaId,
                staffUserId: userId,
            });
        }
        if (action === 'receive_now') {
            if (!payments?.length) {
                await rollbackReceivables();
                return res.status(400).json({ error: 'payments obrigatório para receber agora' });
            }
            if (payments.some((p) => p.payment_method === 'customer_credit') && !guardianId) {
                await rollbackReceivables();
                return res.status(409).json({ error: 'Comanda sem tutor — não é possível pagar com crédito.' });
            }
            const clinicSettings = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinic_id);
            for (const pay of payments) {
                try {
                    (0, hubPaymentMethods_1.assertPaymentMethodInList)(pay.payment_method, clinicSettings.accepted_payment_methods);
                }
                catch (e) {
                    await rollbackReceivables();
                    if (e instanceof hubPaymentMethods_1.PaymentMethodNotAcceptedError) {
                        return res.status(400).json({ error: e.message });
                    }
                    throw e;
                }
            }
            const expectedByGroup = new Map();
            {
                let payDiscountRemaining = checkoutDiscountPool;
                for (let gi = 0; gi < groups.length; gi++) {
                    const sub = billableGroupSubtotals[gi] ?? 0;
                    if (sub <= 0.009)
                        continue;
                    let groupDiscount = 0;
                    if (payDiscountRemaining > 0 && billableGross > 0) {
                        const isLastBillable = groups
                            .slice(gi + 1)
                            .every((_ids, idx) => (billableGroupSubtotals[gi + 1 + idx] ?? 0) <= 0.009);
                        groupDiscount = isLastBillable
                            ? payDiscountRemaining
                            : round2(Math.min(payDiscountRemaining, (checkoutDiscountPool * sub) / billableGross));
                        payDiscountRemaining = round2(Math.max(0, payDiscountRemaining - groupDiscount));
                    }
                    expectedByGroup.set(gi, round2(Math.max(0, sub - groupDiscount)));
                }
            }
            const paidByGroup = new Map();
            for (const pay of payments) {
                if (!receivableIdForGroupIndex(pay.group_index)) {
                    await rollbackReceivables();
                    return res.status(400).json({ error: `group_index inválido: ${pay.group_index}` });
                }
                paidByGroup.set(pay.group_index, round2((paidByGroup.get(pay.group_index) ?? 0) + pay.amount));
            }
            for (const [gi, expected] of expectedByGroup) {
                const got = paidByGroup.get(gi) ?? 0;
                if (got <= 0.009 || got > expected + 0.02) {
                    await rollbackReceivables();
                    return res.status(400).json({
                        error: `Valor pago do grupo ${gi} deve ser entre 0,01 e ${expected.toFixed(2)} (recebido ${got.toFixed(2)})`,
                    });
                }
            }
            for (const pay of payments) {
                const rid = receivableIdForGroupIndex(pay.group_index);
                const { data: recRow } = await supabase_1.supabaseAdmin.from('hub_receivables').select('final_amount, unit_id').eq('id', rid).single();
                const recUnit = recRow?.unit_id;
                const { insertPostedPaymentWithIdempotency, validatePaymentCashSession } = await Promise.resolve().then(() => __importStar(require('./hubFinanceLedger.js')));
                const cashCheck = await validatePaymentCashSession({
                    clinicId: clinic_id,
                    paymentMethod: pay.payment_method,
                    cashSessionId: pay.cash_session_id ?? null,
                    receivableUnitId: recUnit,
                });
                if (!cashCheck.ok) {
                    await rollbackReceivables();
                    return res.status(cashCheck.status).json({ error: cashCheck.error });
                }
                const validatedCashSessionId = cashCheck.cash_session_id;
                if (pay.payment_method === 'cash' && pay.tendered_amount != null) {
                    const tendered = round2(Number(pay.tendered_amount));
                    const recorded = round2(pay.amount);
                    if (recorded > tendered + 0.009) {
                        await rollbackReceivables();
                        return res.status(400).json({
                            error: 'Valor do pagamento em dinheiro não pode exceder o valor recebido (tendered).',
                        });
                    }
                }
                const idempotencyKey = pay.idempotency_key ?? null;
                if (pay.payment_method === 'customer_credit') {
                    if (!guardianId) {
                        await rollbackReceivables();
                        return res.status(409).json({ error: 'Comanda sem tutor — não é possível pagar com crédito.' });
                    }
                    try {
                        await (0, hubCustomerCredit_1.consumeHubCustomerCredit)({
                            clinicId: clinic_id,
                            guardianId,
                            amount: round2(pay.amount),
                            reason: 'Pagamento com crédito do tutor (checkout)',
                            comandaId,
                            receivableId: rid,
                            createdByUserId: userId,
                        });
                        creditConsumptions.push({
                            guardianId,
                            amount: round2(pay.amount),
                            receivableId: rid,
                        });
                    }
                    catch (e) {
                        await rollbackReceivables();
                        if (e instanceof hubCustomerCredit_1.CustomerCreditError) {
                            return res.status(e.status).json({ error: e.message });
                        }
                        throw e;
                    }
                }
                let tenderedAmount = null;
                let changeAmount = null;
                let paymentNotes = null;
                if (pay.payment_method === 'cash' && pay.tendered_amount != null) {
                    tenderedAmount = round2(Number(pay.tendered_amount));
                    const recorded = round2(pay.amount);
                    changeAmount = round2(Math.max(0, tenderedAmount - recorded));
                    if (changeAmount > 0.009) {
                        paymentNotes = `Troco R$ ${changeAmount.toFixed(2)} (recebido R$ ${tenderedAmount.toFixed(2)})`;
                    }
                }
                const inserted = await insertPostedPaymentWithIdempotency({
                    clinicId: clinic_id,
                    receivableId: rid,
                    cashSessionId: validatedCashSessionId,
                    amount: round2(pay.amount),
                    paymentMethod: pay.payment_method,
                    installments: pay.installments ?? 1,
                    paymentDate: new Date().toISOString(),
                    notes: paymentNotes,
                    createdByUserId: userId,
                    paymentTiming: payment_timing,
                    idempotencyKey,
                    tenderedAmount,
                    changeAmount,
                });
                if (!inserted.ok) {
                    await rollbackReceivables();
                    return res.status(inserted.status ?? 500).json({
                        error: inserted.error,
                        ...(inserted.existing ? { existing_payment: inserted.existing } : {}),
                    });
                }
                const { recalculateReceivableFromPosted } = await Promise.resolve().then(() => __importStar(require('./hubFinanceLedger.js')));
                const nextStatus = await recalculateReceivableFromPosted(rid);
                if (nextStatus === 'paid') {
                    void (0, appointmentPaidFromBilling_1.markHubAppointmentPaidFromReceivable)({ clinicId: clinic_id, receivableId: rid });
                }
            }
        }
        await tryAutoCloseComanda(comandaId, clinic_id);
        const { data: comandaFresh } = await supabase_1.supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();
        if (comandaFresh && String(comandaFresh.status) === 'aberta') {
            await refreshComandaFinancialStatus(comandaId, clinic_id, comandaFresh);
        }
        const { data: comandaFinal } = await supabase_1.supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();
        return res.status(201).json({
            comanda: comandaFinal,
            receivable_ids: receivableIds,
            detail: await getHubComandaDetailPayload(comandaId, clinic_id),
        });
    }
    catch (e) {
        console.error('postHubComandaCheckout', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubComandaCheckout = postHubComandaCheckout;
/** Sincroniza a origem quando o handoff não encontra itens em aberto (comanda aberta cedo). */
async function maybeSyncEmptyComandaForHandoff(comandaId, clinicId, detail, actorUserId) {
    const originType = String(detail.comanda.origin_type ?? '');
    if (!originType || originType === 'manual')
        return detail;
    if (detail.open_item_ids.length > 0)
        return detail;
    if ((0, comandaFinanceHandoff_1.canHandoffExistingReceivables)(detail))
        return detail;
    try {
        return await applySyncComandaFromOrigin(clinicId, comandaId, {
            actor_user_id: actorUserId,
            edit_context: 'caixa',
        });
    }
    catch {
        return detail;
    }
}
/**
 * Handoff leave_pending de uma comanda: recebível + linhas + finance_handoff_at.
 * Nunca cria recebível sem linhas (exceto handoff só de saldo já faturado).
 */
async function leavePendingHandoffComanda(comandaId, clinicId, opts) {
    const userId = opts.userId ?? null;
    const dueDate = opts.dueDate;
    const receivableIds = [];
    const stockMovementIds = [];
    const rollback = async () => {
        for (const mid of stockMovementIds) {
            await supabase_1.supabaseAdmin.from('hub_stock_movements').delete().eq('id', mid);
        }
        stockMovementIds.length = 0;
        for (const rid of receivableIds.splice(0)) {
            await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', rid);
            await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', rid);
        }
    };
    try {
        let detail = await getHubComandaDetailPayload(comandaId, clinicId);
        let comanda = detail.comanda;
        if (String(comanda.status) !== 'aberta') {
            return { comanda_id: comandaId, receivable_ids: [], error: 'Comanda não está aberta' };
        }
        if (comanda.finance_handoff_at) {
            return {
                comanda_id: comandaId,
                receivable_ids: detail.active_receivable_ids ?? [],
                skipped: true,
            };
        }
        detail = await maybeSyncEmptyComandaForHandoff(comandaId, clinicId, detail, userId);
        comanda = detail.comanda;
        const items = detail.items.filter((it) => detail.open_item_ids.includes(it.id));
        if (items.length === 0) {
            if ((0, comandaFinanceHandoff_1.canHandoffExistingReceivables)(detail)) {
                const ids = await applyFinanceHandoffOnly(comandaId, clinicId, detail, dueDate);
                return { comanda_id: comandaId, receivable_ids: ids };
            }
            return {
                comanda_id: comandaId,
                receivable_ids: [],
                skipped: true,
                error: 'Não há itens em aberto para enviar ao financeiro',
            };
        }
        const executorCheck = await (0, hubCommissionAccrual_1.assertServiceLinesHaveExecutor)(clinicId, items);
        if (!executorCheck.ok) {
            return {
                comanda_id: comandaId,
                receivable_ids: [],
                error: executorCheck.message,
                code: 'COMMISSION_EXECUTOR_REQUIRED',
            };
        }
        let unitId = comanda.unit_id ?? null;
        if (!unitId)
            unitId = await resolveClinicDefaultUnitId(clinicId);
        const guardianId = comanda.guardian_id ?? null;
        const subtotal = round2(items.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
        const allComandaItems = detail.items;
        const allLinesGross = round2(allComandaItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
        const headerDiscount = Number(comanda.discount_amount ?? 0);
        const handoffDiscount = (0, comandaFinanceHandoff_1.openLinesHeaderDiscount)({
            openLinesTotal: subtotal,
            allLinesTotal: allLinesGross,
            headerDiscount,
            openItemsCount: items.length,
            allItemsCount: allComandaItems.length,
        });
        const finalAmount = round2(Math.max(0, subtotal - handoffDiscount));
        if (subtotal <= 0.009) {
            const hasPackageCoverage = items.some((it) => it.package_balance_id);
            if (hasPackageCoverage) {
                await (0, hubPackagesService_1.redeemPackageBalancesOnCheckout)({
                    clinicId,
                    comandaId,
                    staffUserId: userId,
                });
                await supabase_1.supabaseAdmin
                    .from('hub_comandas')
                    .update({ finance_handoff_at: new Date().toISOString() })
                    .eq('id', comandaId)
                    .eq('clinic_id', clinicId);
                await tryAutoCloseComanda(comandaId, clinicId);
                return { comanda_id: comandaId, receivable_ids: [] };
            }
            return {
                comanda_id: comandaId,
                receivable_ids: [],
                skipped: true,
                error: 'Nenhum recebível gerado (valores zerados)',
            };
        }
        const manualSourceId = (0, node_crypto_1.randomUUID)();
        const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .insert({
            clinic_id: clinicId,
            unit_id: unitId,
            guardian_id: guardianId,
            source_type: 'manual',
            source_id: manualSourceId,
            comanda_id: comandaId,
            original_amount: subtotal,
            final_amount: finalAmount,
            net_amount_at_sale: finalAmount,
            returned_amount: 0,
            status: 'pending',
            due_date: dueDate,
            notes: null,
        })
            .select('id')
            .single();
        if (rErr || !rec) {
            return {
                comanda_id: comandaId,
                receivable_ids: [],
                error: rErr?.message ?? 'Erro ao criar recebível',
            };
        }
        const receivableId = rec.id;
        receivableIds.push(receivableId);
        const handoffCostByItem = await loadInventoryCostByItemId(clinicId, items);
        const commissionByItem = await (0, hubCommissionAccrual_1.buildCommissionInsertFieldsForItems)({
            clinicId,
            items: items,
            originalAmount: subtotal,
            netAmountAtSale: finalAmount,
            actingUserId: userId,
            // leave_pending / auto-close: nunca inventar vendedor pelo ator do handoff.
            allowActingUserAsSaleAuthor: false,
        });
        let sort = 0;
        for (const it of items) {
            const lineKind = String(it.item_kind ?? '') === 'product'
                ? 'product'
                : mapItemToReceivableLineKind(it.origin_type ?? null);
            const snap = commissionByItem.get(String(it.id));
            const { error: lnErr } = await supabase_1.supabaseAdmin.from('hub_receivable_lines').insert({
                clinic_id: clinicId,
                receivable_id: receivableId,
                comanda_id: comandaId,
                comanda_item_id: it.id,
                pet_id: it.pet_id ?? null,
                line_kind: lineKind,
                source_line_id: it.origin_id ?? null,
                hub_service_type_id: it.hub_service_type_id ?? null,
                hub_inventory_item_id: it.hub_inventory_item_id ?? null,
                hub_inventory_lot_id: it.hub_inventory_lot_id ?? null,
                description: String(it.description),
                quantity: Number(it.quantity ?? 1),
                unit_sale_amount: Number(it.unit_amount ?? 0),
                unit_cost_amount: productUnitCostSnapshot(handoffCostByItem, it),
                line_total: Number(it.line_total ?? 0),
                sort_order: sort++,
                ...(0, hubCommissionAccrual_1.snapshotToInsertFields)(snap),
            });
            if (lnErr) {
                await rollback();
                return { comanda_id: comandaId, receivable_ids: [], error: lnErr.message };
            }
        }
        for (const it of items) {
            if (String(it.item_kind ?? '') !== 'product')
                continue;
            if ((0, comandaStockOut_1.comandaProductOriginAlreadyStockedOut)(it.origin_type ?? null))
                continue;
            const invItemId = it.hub_inventory_item_id ?? null;
            const invLotId = it.hub_inventory_lot_id ?? null;
            if (!invItemId || !invLotId)
                continue;
            const qty = Number(it.quantity ?? 1);
            if (!(qty > 0))
                continue;
            const stockResult = await (0, hubInventoryStockUtils_1.createSaleStockOut)({
                clinicId,
                itemId: invItemId,
                lotId: invLotId,
                qty,
                unitCost: handoffCostByItem.get(invItemId) ?? null,
                notes: `Venda na comanda ${comandaId}: ${String(it.description ?? 'Produto')}`,
                referenceType: 'hub_comanda_item',
                referenceId: it.id,
                createdBy: userId,
            });
            if ('error' in stockResult) {
                await rollback();
                return { comanda_id: comandaId, receivable_ids: [], error: stockResult.error };
            }
            if (!stockResult.skipped) {
                stockMovementIds.push(stockResult.id);
            }
        }
        await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .update({ finance_handoff_at: new Date().toISOString() })
            .eq('id', comandaId)
            .eq('clinic_id', clinicId);
        if (String(comanda.origin_type) === 'quote' && comanda.origin_id) {
            await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_state: 'receivable_created' })
                .eq('id', comanda.origin_id)
                .eq('clinic_id', clinicId);
        }
        if (String(comanda.origin_type) === 'package' && comanda.origin_id) {
            if (!guardianId) {
                return {
                    comanda_id: comandaId,
                    receivable_ids: receivableIds,
                    error: 'Venda de pacote exige tutor na comanda.',
                };
            }
            const packagePurchaseLines = items
                .filter((it) => String(it.origin_type) === 'package_purchase' && it.origin_id)
                .map((it) => ({
                packageId: String(it.origin_id),
                petId: it.pet_id ?? null,
            }));
            if (packagePurchaseLines.length) {
                await (0, hubPackagesService_1.fulfillPackagePurchasesOnComandaCheckout)({
                    clinicId,
                    comandaId,
                    purchaseGroupId: comanda.origin_id,
                    guardianId,
                    packagePurchaseLines,
                    purchasedReceivableId: receivableId,
                });
            }
        }
        const hasServicePackageCoverage = items.some((it) => it.package_balance_id);
        if (hasServicePackageCoverage && String(comanda.origin_type) !== 'package') {
            await (0, hubPackagesService_1.redeemPackageBalancesOnCheckout)({
                clinicId,
                comandaId,
                staffUserId: userId,
            });
        }
        return { comanda_id: comandaId, receivable_ids: [receivableId] };
    }
    catch (e) {
        await rollback().catch(() => undefined);
        return {
            comanda_id: comandaId,
            receivable_ids: [],
            error: e?.message ?? 'Erro ao processar comanda',
        };
    }
}
/** Handoff leave_pending de todas as comandas abertas da unidade (sem finance_handoff_at). */
async function leavePendingHandoffOpenComandasForUnit(clinicId, unitId, opts) {
    const { data: openComandas, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('unit_id', unitId)
        .eq('status', 'aberta')
        .is('finance_handoff_at', null)
        .is('deleted_at', null);
    if (error) {
        throw new Error(error.message);
    }
    const results = [];
    const errors = [];
    let handoffCount = 0;
    let skippedCount = 0;
    for (const row of openComandas ?? []) {
        const comandaId = row.id;
        const result = await leavePendingHandoffComanda(comandaId, clinicId, opts);
        results.push(result);
        if (result.skipped) {
            skippedCount++;
            continue;
        }
        if (result.error) {
            if ((0, comandaFinanceHandoff_1.isSkippableLeavePendingHandoffError)(result.error)) {
                skippedCount++;
                continue;
            }
            errors.push(`${comandaId.slice(0, 8)}: ${result.error}`);
            continue;
        }
        handoffCount++;
    }
    return { handoff_count: handoffCount, skipped_count: skippedCount, results, errors };
}
async function applySyncComandaFromOrigin(clinicId, comandaId, opts) {
    const detail = await getHubComandaDetailPayload(comandaId, clinicId);
    const comanda = detail.comanda;
    if (String(comanda.status) !== 'aberta') {
        throw new Error('COMANDA_NOT_OPEN');
    }
    if (String(comanda.origin_type) === 'manual') {
        throw new Error('SYNC_NOT_APPLICABLE');
    }
    let built;
    try {
        built = await buildDesiredComandaSnapshot(clinicId, comanda);
    }
    catch (e) {
        throw e;
    }
    const invoiced = new Set(detail.invoiced_item_ids);
    const invoicedOriginKeys = new Set();
    for (const it of detail.items) {
        if (!invoiced.has(it.id))
            continue;
        const ot = it.origin_type;
        const oid = it.origin_id;
        if (ot && oid)
            invoicedOriginKeys.add(`${ot}:${oid}`);
    }
    const desiredFiltered = built.items.filter((row) => {
        const ot = row.origin_type;
        const oid = row.origin_id;
        if (!ot || !oid)
            return true;
        return !invoicedOriginKeys.has(`${ot}:${oid}`);
    });
    // Diárias já faturadas + quantity maior (late checkout etc.): linha aberta de ajuste (não estorna se cair).
    const allItems = detail.items;
    const boardingDesiredById = new Map();
    for (const row of built.items) {
        if (row.origin_type === 'boarding_reservation' && row.origin_id) {
            boardingDesiredById.set(String(row.origin_id), row);
        }
    }
    for (const [reservationId, desiredLine] of boardingDesiredById) {
        const mainKey = `boarding_reservation:${reservationId}`;
        if (!invoicedOriginKeys.has(mainKey))
            continue;
        let invoicedQty = 0;
        let invoicedUnit = Number(desiredLine.unit_amount);
        for (const it of allItems) {
            if (!invoiced.has(it.id))
                continue;
            const ot = String(it.origin_type ?? '');
            const oid = String(it.origin_id ?? '');
            if (oid !== reservationId)
                continue;
            if (ot !== 'boarding_reservation' && ot !== 'boarding_reservation_adjustment')
                continue;
            invoicedQty = round2(invoicedQty + Number(it.quantity ?? 0));
            if (ot === 'boarding_reservation')
                invoicedUnit = Number(it.unit_amount ?? invoicedUnit);
        }
        const delta = round2(Number(desiredLine.quantity) - invoicedQty);
        if (delta <= 0)
            continue;
        const desc = String(desiredLine.description ?? '');
        const mode = desc.startsWith('Creche') ? 'daycare' : 'hotel';
        const adj = (0, boardingBilling_1.buildBoardingQuantityAdjustmentLine)({
            reservationId,
            mode,
            petId: desiredLine.pet_id ?? null,
            hubServiceTypeId: desiredLine.hub_service_type_id ?? null,
            deltaQuantity: delta,
            unitAmount: invoicedUnit,
            serviceDate: desiredLine.service_date ?? null,
            sortOrder: desiredFiltered.length,
        });
        if (adj)
            desiredFiltered.push(adj);
    }
    // Preserva itens adicionados manualmente pelo Caixa — só deleta os que vieram da origem operacional
    const openIdsSet = new Set(detail.open_item_ids);
    const manualOpenIds = new Set(allItems
        .filter((it) => openIdsSet.has(it.id) && it.origin_type === 'manual')
        .map((it) => it.id));
    const openIds = [...openIdsSet].filter((id) => !manualOpenIds.has(id));
    const removedItems = allItems.filter((it) => openIds.includes(it.id));
    const originLineFingerprint = (row) => [
        String(row.origin_type ?? ''),
        String(row.origin_id ?? ''),
        String(row.hub_service_type_id ?? ''),
        String(row.description ?? ''),
        round2(Number(row.quantity ?? 0)),
        round2(Number(row.unit_amount ?? 0)),
        round2(Number(row.line_total ?? 0)),
    ].join('|');
    const currentFp = removedItems
        .map((it) => originLineFingerprint({
        origin_type: it.origin_type ?? null,
        origin_id: it.origin_id ?? null,
        description: it.description ?? null,
        hub_service_type_id: it.hub_service_type_id ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_amount: Number(it.unit_amount ?? 0),
        line_total: Number(it.line_total ?? 0),
    }))
        .sort()
        .join('\n');
    const desiredFp = desiredFiltered
        .map((it) => originLineFingerprint({
        origin_type: it.origin_type,
        origin_id: it.origin_id,
        description: it.description,
        hub_service_type_id: it.hub_service_type_id,
        quantity: it.quantity,
        unit_amount: it.unit_amount,
        line_total: it.line_total,
    }))
        .sort()
        .join('\n');
    // Mid-AT / complete podem sync várias vezes com o mesmo snapshot — evita churn no DB e no histórico.
    if (currentFp === desiredFp) {
        return detail;
    }
    if (openIds.length) {
        const { error: delErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').delete().in('id', openIds);
        if (delErr)
            throw new Error(delErr.message);
    }
    const { data: maxSortRow } = await supabase_1.supabaseAdmin
        .from('hub_comanda_items')
        .select('sort_order')
        .eq('comanda_id', comandaId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
    let sortBase = Number(maxSortRow?.sort_order ?? -1) + 1;
    const discount = 'discount_amount' in built
        ? round2(Number(built.discount_amount ?? 0))
        : Number(comanda.discount_amount ?? 0);
    const insertRows = desiredFiltered.map((it) => comandaItemInsertRow(clinicId, comandaId, {
        ...it,
        sort_order: sortBase++,
    }));
    if (insertRows.length) {
        const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').insert(insertRows);
        if (insErr)
            throw new Error(insErr.message);
    }
    // Sync rebuilda linhas de origem: um único evento de resumo (sem N× removido/adicionado).
    if (removedItems.length > 0 || insertRows.length > 0) {
        void (0, comandaEvents_1.recordComandaEvent)({
            clinic_id: clinicId,
            comanda_id: comandaId,
            event_type: 'items_synced',
            title: 'Comanda atualizada a partir do atendimento',
            body: `${insertRows.length} item(ns) na comanda aberta`,
            actor_user_id: opts?.actor_user_id ?? null,
            edit_context: opts?.edit_context ?? null,
            metadata: {
                removed_count: removedItems.length,
                added_count: insertRows.length,
                source: 'sync_origin',
            },
        });
    }
    const { data: remaining } = await supabase_1.supabaseAdmin.from('hub_comanda_items').select('line_total').eq('comanda_id', comandaId);
    const sumAll = round2((remaining ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0));
    const total = round2(Math.max(0, sumAll - discount));
    await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .update({
        subtotal_amount: sumAll,
        discount_amount: discount,
        total_amount: total,
        unit_id: built.unit_id ?? comanda.unit_id,
    })
        .eq('id', comandaId)
        .eq('clinic_id', clinicId);
    const { data: updatedComanda } = await supabase_1.supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();
    if (updatedComanda) {
        await refreshComandaFinancialStatus(comandaId, clinicId, updatedComanda);
    }
    return getHubComandaDetailPayload(comandaId, clinicId);
}
const postHubComandaSyncFromOrigin = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const bodyParsed = zod_1.z
            .object({ clinic_id: uuidStr, edit_context: comandaEditContextSchema })
            .strict()
            .safeParse(req.body);
        const clinicFromQuery = uuidStr.safeParse(req.query.clinic_id);
        const clinicId = bodyParsed.success ? bodyParsed.data.clinic_id : clinicFromQuery.success ? clinicFromQuery.data : null;
        const editContext = bodyParsed.success ? bodyParsed.data.edit_context : 'caixa';
        if (!idParsed.success || !clinicId) {
            return res.status(400).json({ error: 'id e clinic_id (UUID) obrigatórios' });
        }
        try {
            await assertComandaEditAllowed(idParsed.data, clinicId, editContext);
        }
        catch (e) {
            const msg = e.message;
            if (msg === 'NOT_FOUND')
                return res.status(404).json({ error: 'Comanda não encontrada' });
            return res.status(409).json({ error: msg });
        }
        try {
            const detail = await applySyncComandaFromOrigin(clinicId, idParsed.data, {
                actor_user_id: req.user?.id ?? null,
                edit_context: editContext,
            });
            return res.json(detail);
        }
        catch (e) {
            const msg = e.message;
            if (msg === 'NOT_READY')
                return res.status(409).json({ error: 'Origem ainda não está pronta para sincronizar itens' });
            if (msg === 'NOT_FOUND')
                return res.status(404).json({ error: 'Origem não encontrada' });
            if (msg === 'COMANDA_NOT_OPEN')
                return res.status(409).json({ error: 'Comanda não está aberta' });
            if (msg === 'SYNC_NOT_APPLICABLE')
                return res.status(400).json({ error: 'Sincronização não aplicável a comanda manual' });
            if (msg === 'NO_GUARDIAN' || msg === 'NO_PET')
                return res.status(409).json({ error: 'Identificação incompleta para sincronizar' });
            if (msg === 'WAIVED')
                return res.status(409).json({ error: 'Marcado sem cobrança' });
            if (msg === 'ALREADY_BILLED')
                return res.status(409).json({ error: 'Orçamento já faturado' });
            throw e;
        }
    }
    catch (e) {
        console.error('postHubComandaSyncFromOrigin', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubComandaSyncFromOrigin = postHubComandaSyncFromOrigin;
async function syncOpenComandasAfterGroomingClosed(clinicId, sessionId) {
    const { data: sess } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('hub_appointment_id')
        .eq('id', sessionId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    const apptId = sess?.hub_appointment_id ?? null;
    const ids = new Set();
    const idG = await findOpenComandaIdByOrigin(clinicId, 'grooming_session', sessionId);
    if (idG)
        ids.add(idG);
    if (apptId) {
        const idA = await findOpenComandaIdByOrigin(clinicId, 'appointment', apptId);
        if (idA)
            ids.add(idA);
    }
    for (const id of ids) {
        await syncAndTryAutoCloseComanda(clinicId, id);
    }
}
async function listOpenComandaIdsForEncounter(clinicId, encounterId) {
    const { data: enc } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('hub_appointment_id, hub_case_id')
        .eq('id', encounterId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    const appointmentId = enc?.hub_appointment_id ?? null;
    const caseId = enc?.hub_case_id ?? null;
    const ids = new Set();
    const idE = await findOpenComandaIdByOrigin(clinicId, 'encounter', encounterId);
    if (idE)
        ids.add(idE);
    if (appointmentId) {
        const idA = await findOpenComandaIdByOrigin(clinicId, 'appointment', appointmentId);
        if (idA)
            ids.add(idA);
    }
    return { ids: [...ids], appointmentId, caseId };
}
/** Sincroniza comanda já aberta quando o vet registra item cobrável (medicação, vacina, exame). */
async function syncOpenComandasAfterEncounterChargeableChange(clinicId, encounterId) {
    try {
        const { ids } = await listOpenComandaIdsForEncounter(clinicId, encounterId);
        for (const id of ids) {
            await syncAndTryAutoCloseComanda(clinicId, id);
        }
    }
    catch (e) {
        console.error('syncOpenComandasAfterEncounterChargeableChange', e);
    }
}
/** Agenda cancelled/no_show — não completar encounter nem abrir comanda. */
async function isAppointmentTerminalCancelled(clinicId, appointmentId) {
    if (!appointmentId)
        return false;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('status')
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error) {
        console.error('isAppointmentTerminalCancelled', error.message);
        return false;
    }
    const st = String(data?.status ?? '');
    return st === 'cancelled' || st === 'no_show';
}
async function ensureOpenComandaForCompletedEncounter(clinicId, encounterId, appointmentId, caseId) {
    try {
        if (await isAppointmentTerminalCancelled(clinicId, appointmentId))
            return;
        const keys = await fetchActiveReceivableKeys(clinicId);
        if (keys.has(`encounter:${encounterId}`))
            return;
        if (appointmentId && keys.has(`appointment:${appointmentId}`))
            return;
        // Mesmo critério de postHubComandaOpen: recebível pode nascer como manual.
        const billedViaComanda = await fetchBilledComandaOriginKeys(clinicId);
        if (billedViaComanda.has(`encounter:${encounterId}`))
            return;
        const built = await buildComandaItemsFromEncounter(clinicId, encounterId);
        // Snapshot já omite appointment_service (e demais origens) faturados na agenda.
        // Sem saldo clínico novo → não abrir segunda comanda vazia/duplicada.
        const billableItems = built.items.filter((it) => Number(it.line_total ?? 0) > 0);
        if (billableItems.length === 0)
            return;
        const discount = 0;
        const subtotal = round2(billableItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
        const total = round2(Math.max(0, subtotal - discount));
        const resolvedPetId = built.pet_id ??
            (billableItems.map((it) => it.pet_id).find((pid) => Boolean(pid)) ?? null);
        const { data: comanda, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .insert({
            clinic_id: clinicId,
            unit_id: built.unit_id,
            guardian_id: built.guardian_id,
            pet_id: resolvedPetId,
            origin_type: 'encounter',
            origin_id: encounterId,
            hub_case_id: caseId,
            hub_encounter_id: encounterId,
            status: 'aberta',
            financial_status: 'open',
            subtotal_amount: subtotal,
            discount_amount: discount,
            total_amount: total,
            notes: null,
        })
            .select('id')
            .single();
        if (cErr || !comanda) {
            console.error('ensureOpenComandaForCompletedEncounter', cErr);
            return;
        }
        const comandaId = comanda.id;
        const rows = billableItems.map((it, idx) => comandaItemInsertRow(clinicId, comandaId, { ...it, sort_order: idx }));
        if (rows.length > 0) {
            const { error: iErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').insert(rows);
            if (iErr) {
                await supabase_1.supabaseAdmin.from('hub_comandas').delete().eq('id', comandaId);
                console.error('ensureOpenComandaForCompletedEncounter items', iErr);
                return;
            }
        }
        for (const row of rows) {
            void (0, comandaEvents_1.recordComandaItemAddedEvent)({
                clinic_id: clinicId,
                comanda_id: comandaId,
                item: {
                    description: String(row.description),
                    item_kind: String(row.item_kind),
                    quantity: Number(row.quantity),
                    unit_amount: Number(row.unit_amount),
                    line_total: Number(row.line_total),
                },
                actor_user_id: null,
                source: 'origin_open',
            });
        }
    }
    catch (e) {
        const msg = e?.message;
        if (msg === 'WAIVED' || msg === 'NO_GUARDIAN' || msg === 'NO_PET' || msg === 'NOT_FOUND' || msg === 'NOT_READY') {
            return;
        }
        console.error('ensureOpenComandaForCompletedEncounter', e);
    }
}
async function syncOpenComandasAfterEncounterCompleted(clinicId, encounterId) {
    const { ids, appointmentId, caseId } = await listOpenComandaIdsForEncounter(clinicId, encounterId);
    // Agenda cancelada/falta: não sincronizar nem abrir comanda (visita operacionalmente encerrada).
    if (await isAppointmentTerminalCancelled(clinicId, appointmentId))
        return;
    if (ids.length > 0) {
        for (const id of ids) {
            await syncAndTryAutoCloseComanda(clinicId, id);
        }
        return;
    }
    await ensureOpenComandaForCompletedEncounter(clinicId, encounterId, appointmentId, caseId);
}
async function syncOpenComandasAfterBoardingCheckedOut(clinicId, reservationId) {
    const { data: res } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('hub_appointment_id')
        .eq('id', reservationId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    const apptId = res?.hub_appointment_id ?? null;
    const ids = new Set();
    const idB = await findOpenComandaIdByOrigin(clinicId, 'boarding_reservation', reservationId);
    if (idB)
        ids.add(idB);
    if (apptId) {
        const idA = await findOpenComandaIdByOrigin(clinicId, 'appointment', apptId);
        if (idA)
            ids.add(idA);
    }
    for (const id of ids) {
        await syncAndTryAutoCloseComanda(clinicId, id);
    }
}
/** Sincroniza e tenta fechar comanda aberta vinculada ao agendamento quando o serviço conclui. */
async function syncOpenComandasAfterAppointmentOperationalComplete(clinicId, appointmentId) {
    const seriesGuard = await (0, hubSeriesBillingService_1.isAppointmentPendingPeriodicSeriesInvoice)(appointmentId);
    // Série com fatura mensal pendente: não criar/sincronizar cobrança da ocorrência no dia.
    if (seriesGuard.pending)
        return;
    const id = await findOpenComandaIdByOrigin(clinicId, 'appointment', appointmentId);
    if (!id)
        return;
    await syncAndTryAutoCloseComanda(clinicId, id);
}
const listComandasQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    status: zod_1.z.enum(['aberta', 'fechada', 'cancelada']).optional(),
    hub_case_id: uuidStr.optional(),
    cancellation_pending: zod_1.z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
    enrich: zod_1.z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
})
    .strict();
const resolveCancellationBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    resolution: zod_1.z.enum(['refund', 'customer_credit', 'keep_billing']),
    reason: zod_1.z.string().trim().min(3).max(2000),
    cash_session_id: uuidStr.optional().nullable(),
})
    .strict();
async function recalculateReceivableStatusLocal(receivableId) {
    const { recalculateReceivableFromPosted } = await Promise.resolve().then(() => __importStar(require('./hubFinanceLedger.js')));
    return recalculateReceivableFromPosted(receivableId);
}
async function resolveOpenComandaIdForCancellation(clinicId, operationalType, operationalId) {
    if (operationalType === 'appointment') {
        return findOpenComandaIdByOrigin(clinicId, 'appointment', operationalId);
    }
    if (operationalType === 'grooming_session') {
        return resolveExistingOpenComandaIdForOpen(clinicId, 'grooming_session', operationalId);
    }
    if (operationalType === 'encounter') {
        return resolveExistingOpenComandaIdForOpen(clinicId, 'encounter', operationalId);
    }
    if (operationalType === 'quote') {
        return findOpenComandaIdByOrigin(clinicId, 'quote', operationalId);
    }
    return null;
}
/** Marca pendência financeira na comanda após cancelamento operacional (não bloqueia o caller). */
async function maybeFlagComandaCancellationPending(clinicId, operationalType, operationalId) {
    try {
        const comandaId = await resolveOpenComandaIdForCancellation(clinicId, operationalType, operationalId);
        if (!comandaId)
            return;
        const { paid_total } = await computeComandaBalancePayload(comandaId, clinicId);
        if (paid_total <= 0.009)
            return;
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
        // Só avisa quando a pendência nasce, para não repetir o aviso a cada sincronização.
        if (isNewPending) {
            void (0, hubNotifyEvents_1.notifyHubCancellationPending)({
                clinicId,
                unitId: existing.unit_id ?? null,
                comandaId,
                guardianId: existing.guardian_id ?? null,
                paidAmount: paid_total,
            });
        }
    }
    catch (e) {
        console.error('maybeFlagComandaCancellationPending', e);
    }
}
async function loadPendingCancellationComandas(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, origin_type, origin_id')
        .eq('clinic_id', clinicId)
        .not('cancellation_pending_at', 'is', null)
        .is('cancellation_resolved_at', null)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    return (data ?? []);
}
/** Comandas abertas ligadas diretamente a agendamentos (origin_type = appointment). */
async function openComandaIdsForAppointments(clinicId, appointmentIds) {
    const out = new Map();
    if (!appointmentIds.length)
        return out;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, origin_id')
        .eq('clinic_id', clinicId)
        .eq('origin_type', 'appointment')
        .eq('status', 'aberta')
        .is('deleted_at', null)
        .in('origin_id', appointmentIds);
    if (error)
        throw new Error(error.message);
    for (const row of data ?? []) {
        const oid = row.origin_id;
        if (oid)
            out.set(oid, row.id);
    }
    return out;
}
/** Badge operacional: pendência de ajuste financeiro por agendamento. */
async function financialAdjustmentFlagsForAppointments(clinicId, appointmentIds) {
    const out = new Map();
    for (const id of appointmentIds) {
        out.set(id, { financial_adjustment_pending: false, comanda_id: null });
    }
    if (!appointmentIds.length)
        return out;
    const pending = await loadPendingCancellationComandas(clinicId);
    if (!pending.length)
        return out;
    const apptSet = new Set(appointmentIds);
    const encounterOriginIds = [];
    const groomingOriginIds = [];
    for (const c of pending) {
        const ot = c.origin_type;
        const oid = c.origin_id;
        if (!ot || !oid)
            continue;
        if (ot === 'appointment' && apptSet.has(oid)) {
            out.set(oid, { financial_adjustment_pending: true, comanda_id: c.id });
        }
        else if (ot === 'encounter') {
            encounterOriginIds.push(oid);
        }
        else if (ot === 'grooming_session') {
            groomingOriginIds.push(oid);
        }
    }
    if (encounterOriginIds.length) {
        const { data: encs } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('id, hub_appointment_id')
            .in('id', encounterOriginIds)
            .eq('clinic_id', clinicId);
        for (const enc of encs ?? []) {
            const apptId = enc.hub_appointment_id;
            if (!apptId || !apptSet.has(apptId))
                continue;
            const comanda = pending.find((c) => c.origin_type === 'encounter' && c.origin_id === enc.id);
            if (comanda)
                out.set(apptId, { financial_adjustment_pending: true, comanda_id: comanda.id });
        }
    }
    if (groomingOriginIds.length) {
        const { data: sessions } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('id, hub_appointment_id')
            .in('id', groomingOriginIds)
            .eq('clinic_id', clinicId);
        for (const sess of sessions ?? []) {
            const apptId = sess.hub_appointment_id;
            if (!apptId || !apptSet.has(apptId))
                continue;
            const comanda = pending.find((c) => c.origin_type === 'grooming_session' && c.origin_id === sess.id);
            if (comanda)
                out.set(apptId, { financial_adjustment_pending: true, comanda_id: comanda.id });
        }
    }
    return out;
}
/** Badge operacional: pendência de ajuste financeiro por atendimento (encounter). */
async function financialAdjustmentFlagsForEncounters(clinicId, encounterIds) {
    const out = new Map();
    for (const id of encounterIds) {
        out.set(id, { financial_adjustment_pending: false, comanda_id: null });
    }
    if (!encounterIds.length)
        return out;
    const pending = await loadPendingCancellationComandas(clinicId);
    const encSet = new Set(encounterIds);
    for (const c of pending) {
        if (c.origin_type === 'encounter' && c.origin_id && encSet.has(c.origin_id)) {
            out.set(c.origin_id, { financial_adjustment_pending: true, comanda_id: c.id });
        }
    }
    return out;
}
async function reverseAllComandaPayments(clinicId, comandaId, reason, userId) {
    const { reversePaymentSoft, FinanceLedgerError } = await Promise.resolve().then(() => __importStar(require('./hubFinanceLedger.js')));
    const { data: recs, error: rErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, final_amount, status')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelled');
    if (rErr)
        throw new Error(rErr.message);
    const recRows = recs ?? [];
    if (!recRows.length)
        return { totalReversed: 0, restoredCustomerCredit: 0 };
    const recIds = recRows.map((r) => r.id);
    const { data: payments, error: pErr } = await supabase_1.supabaseAdmin
        .from('hub_payments')
        .select('id, clinic_id, receivable_id, amount, payment_method, cash_session_id, status')
        .in('receivable_id', recIds)
        .eq('status', 'posted');
    if (pErr)
        throw new Error(pErr.message);
    let totalReversed = 0;
    let restoredCustomerCredit = 0;
    for (const payment of payments ?? []) {
        if (payment.clinic_id !== clinicId)
            continue;
        try {
            await reversePaymentSoft({
                paymentId: payment.id,
                clinicId,
                userId,
                reason,
                mode: 'payment_reversal',
            });
        }
        catch (e) {
            if (e instanceof FinanceLedgerError && e.status === 409)
                continue;
            throw e;
        }
        if (payment.payment_method === 'customer_credit') {
            restoredCustomerCredit = round2(restoredCustomerCredit + Number(payment.amount ?? 0));
        }
        totalReversed = round2(totalReversed + Number(payment.amount ?? 0));
    }
    for (const rec of recRows) {
        const rid = rec.id;
        const { data: paysLeft } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('id')
            .eq('receivable_id', rid)
            .eq('status', 'posted')
            .limit(1);
        if ((paysLeft ?? []).length > 0)
            continue;
        if (String(rec.status) === 'cancelled')
            continue;
        const finalAmt = Number(rec.final_amount ?? 0);
        if (finalAmt > 0.009) {
            await supabase_1.supabaseAdmin.from('hub_financial_adjustments').insert({
                clinic_id: clinicId,
                receivable_id: rid,
                adjustment_type: 'write_off',
                amount: finalAmt,
                reason: `Cancelamento operacional — comanda ${comandaId}: ${reason}`,
                created_by_user_id: userId,
            });
        }
        {
            const upd = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .update({ status: 'cancelled', cancel_rebill: false })
                .eq('id', rid);
            if (upd.error && String(upd.error.message || '').includes('cancel_rebill')) {
                await supabase_1.supabaseAdmin.from('hub_receivables').update({ status: 'cancelled' }).eq('id', rid);
            }
        }
        await (0, appointmentPaidFromBilling_1.syncHubAppointmentPaidFromReceivable)({ clinicId, receivableId: rid });
    }
    const { data: comandaRow } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('*')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (comandaRow) {
        await refreshComandaFinancialStatus(comandaId, clinicId, comandaRow);
    }
    return { totalReversed, restoredCustomerCredit };
}
async function enrichCancellationQueueRows(clinicId, rows) {
    if (!rows.length)
        return rows;
    const guIds = [...new Set(rows.map((r) => r.guardian_id).filter(Boolean))];
    const headerPetIds = [...new Set(rows.map((r) => r.pet_id).filter(Boolean))];
    const comandaIds = rows.map((r) => r.id);
    const [guRes, itemsRes, enrichedByComanda] = await Promise.all([
        guIds.length
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', guIds)
            : Promise.resolve({ data: [] }),
        comandaIds.length
            ? supabase_1.supabaseAdmin
                .from('hub_comanda_items')
                .select('comanda_id, pet_id, description, sort_order')
                .in('comanda_id', comandaIds)
                .order('sort_order', { ascending: true })
            : Promise.resolve({ data: [] }),
        Promise.all(comandaIds.map(async (cid) => {
            const row = rows.find((r) => r.id === cid);
            if (!row) {
                const { paid_total, balance_due } = await computeComandaBalancePayload(cid, clinicId);
                return [cid, { paid_total, balance_due, operational_complete: true, edit_scopes: null }];
            }
            let { paid_total, balance_due } = await computeComandaBalancePayload(cid, clinicId);
            // Cura: quitada sem auto-close, ou reembolsada/estornada sem anular a comanda —
            // evitava fantasma em “Pendentes de dias anteriores” no caixa.
            if (String(row.status) === 'aberta' && balance_due <= 0.02) {
                try {
                    const voided = await tryVoidComandaAfterSaleFinanciallyEnded({
                        clinicId,
                        comandaId: cid,
                        reason: 'Cura automática: sem saldo cobrável na comanda',
                    });
                    if (voided.comanda_status === 'cancelada') {
                        row.status = 'cancelada';
                        ({ paid_total, balance_due } = await computeComandaBalancePayload(cid, clinicId));
                    }
                    else {
                        const closed = await tryAutoCloseComanda(cid, clinicId);
                        if (closed) {
                            row.status = 'fechada';
                            ({ paid_total, balance_due } = await computeComandaBalancePayload(cid, clinicId));
                        }
                    }
                }
                catch (e) {
                    console.error('enrichComandaRows tryVoid/tryAutoCloseComanda', cid, e);
                }
            }
            const operational_complete = await isOperationalCompleteForComanda(row);
            const edit_scopes = (0, comandaEditScopes_1.computeComandaEditScopes)(row, operational_complete, balance_due);
            return [cid, { paid_total, balance_due, operational_complete, edit_scopes }];
        })),
    ]);
    const itemsByComanda = new Map();
    const itemPetIds = new Set();
    for (const it of itemsRes.data ?? []) {
        const cid = it.comanda_id;
        const petId = it.pet_id ?? null;
        if (petId)
            itemPetIds.add(petId);
        const list = itemsByComanda.get(cid) ?? [];
        list.push({
            pet_id: petId,
            description: String(it.description ?? '').trim(),
        });
        itemsByComanda.set(cid, list);
    }
    const allPetIds = [...new Set([...headerPetIds, ...itemPetIds])];
    const petRes = allPetIds.length
        ? await supabase_1.supabaseAdmin.from('hub_pets').select('id, name').in('id', allPetIds)
        : { data: [] };
    const guMap = new Map((guRes.data ?? []).map((g) => [g.id, g]));
    const petMap = new Map((petRes.data ?? []).map((p) => [p.id, p]));
    const enrichedMap = new Map(enrichedByComanda);
    return rows.map((r) => {
        const cid = r.id;
        const gu = r.guardian_id ? guMap.get(r.guardian_id) : null;
        const headerPetId = r.pet_id;
        const headerPet = headerPetId ? petMap.get(headerPetId) : null;
        const items = itemsByComanda.get(cid) ?? [];
        const itemLabels = [];
        const seenLabel = new Set();
        for (const it of items) {
            const desc = it.description;
            if (!desc || seenLabel.has(desc))
                continue;
            seenLabel.add(desc);
            itemLabels.push(desc);
        }
        const petsById = new Map();
        if (headerPet) {
            petsById.set(headerPet.id, { id: headerPet.id, name: String(headerPet.name ?? '') });
        }
        for (const it of items) {
            if (!it.pet_id)
                continue;
            const p = petMap.get(it.pet_id);
            if (!p || petsById.has(it.pet_id))
                continue;
            petsById.set(it.pet_id, { id: it.pet_id, name: String(p.name ?? '') });
        }
        const pets = [...petsById.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const extra = enrichedMap.get(cid);
        return {
            ...r,
            guardian: gu ? { id: gu.id, full_name: gu.full_name } : null,
            pet: headerPet ? { id: headerPet.id, name: headerPet.name } : pets[0] ?? null,
            pets,
            item_labels: itemLabels,
            items_count: items.length,
            paid_total: extra?.paid_total ?? 0,
            balance_due: extra?.balance_due ?? 0,
            operational_complete: extra?.operational_complete ?? true,
            edit_scopes: extra?.edit_scopes ?? null,
        };
    });
}
const getHubComandaByOrigin = async (req, res) => {
    try {
        const q = zod_1.z
            .object({
            clinic_id: uuidStr,
            origin_type: hubComandaSchemas_1.comandaOriginSchema,
            origin_id: uuidStr,
        })
            .strict()
            .safeParse(req.query);
        if (!q.success) {
            return res.status(400).json({ error: 'clinic_id, origin_type e origin_id obrigatórios' });
        }
        const { clinic_id, origin_type, origin_id } = q.data;
        let rowId = null;
        const { data: row, error } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id')
            .eq('clinic_id', clinic_id)
            .eq('origin_type', origin_type)
            .eq('origin_id', origin_id)
            .eq('status', 'aberta')
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        rowId = row?.id ?? null;
        if (!rowId && origin_type === 'grooming_session') {
            const { data: sess } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('hub_appointment_id')
                .eq('id', origin_id)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            const apptId = sess?.hub_appointment_id ?? null;
            if (apptId) {
                const { data: rowAppt } = await supabase_1.supabaseAdmin
                    .from('hub_comandas')
                    .select('id')
                    .eq('clinic_id', clinic_id)
                    .eq('origin_type', 'appointment')
                    .eq('origin_id', apptId)
                    .eq('status', 'aberta')
                    .is('deleted_at', null)
                    .maybeSingle();
                rowId = rowAppt?.id ?? null;
            }
        }
        if (!rowId && origin_type === 'encounter') {
            const { data: enc } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('hub_appointment_id')
                .eq('id', origin_id)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            const apptId = enc?.hub_appointment_id ?? null;
            if (apptId) {
                const { data: rowAppt } = await supabase_1.supabaseAdmin
                    .from('hub_comandas')
                    .select('id')
                    .eq('clinic_id', clinic_id)
                    .eq('origin_type', 'appointment')
                    .eq('origin_id', apptId)
                    .eq('status', 'aberta')
                    .is('deleted_at', null)
                    .maybeSingle();
                rowId = rowAppt?.id ?? null;
            }
        }
        if (!rowId && origin_type === 'appointment') {
            rowId = await findOpenGroomingComandaIdForAppointment(clinic_id, origin_id);
            if (!rowId) {
                rowId = await findOpenEncounterComandaIdForAppointment(clinic_id, origin_id);
            }
        }
        if (!rowId)
            return res.status(404).json({ error: 'Comanda aberta não encontrada' });
        const detail = await getHubComandaDetailPayload(rowId, clinic_id);
        return res.json(detail);
    }
    catch (e) {
        console.error('getHubComandaByOrigin', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubComandaByOrigin = getHubComandaByOrigin;
const listHubComandas = async (req, res) => {
    try {
        const parsed = listComandasQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório', details: parsed.error.flatten() });
        }
        const { clinic_id, unit_id, status, hub_case_id, cancellation_pending, enrich } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('*')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('opened_at', { ascending: false })
            .limit(100);
        if (unit_id)
            q = q.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        if (status)
            q = q.eq('status', status);
        if (hub_case_id)
            q = q.eq('hub_case_id', hub_case_id);
        if (cancellation_pending) {
            q = q.not('cancellation_pending_at', 'is', null).is('cancellation_resolved_at', null);
        }
        const { data, error } = await q;
        if (error) {
            if (String(error.message || '').includes('cancellation_pending')) {
                return res.status(503).json({
                    error: 'Colunas de cancelamento na comanda não encontradas. Execute 050_alter_hub_comandas_cancellation_resolution.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        const rows = (data ?? []);
        const shouldEnrich = cancellation_pending || enrich;
        const comandas = shouldEnrich ? await enrichCancellationQueueRows(clinic_id, rows) : rows;
        return res.json({ comandas });
    }
    catch (e) {
        console.error('listHubComandas', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubComandas = listHubComandas;
/** Exportado para uso em hubFinancialController (fila sem cobrança). */
async function fetchOpenComandaOriginKeysExported(clinicId) {
    return fetchOpenComandaOriginKeys(clinicId);
}
const getHubComandaCancellationPendingCount = async (req, res) => {
    try {
        const parsed = zod_1.z
            .object({ clinic_id: uuidStr, unit_id: uuidStr.optional() })
            .strict()
            .safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        const { clinic_id, unit_id } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', clinic_id)
            .not('cancellation_pending_at', 'is', null)
            .is('cancellation_resolved_at', null)
            .is('deleted_at', null);
        if (unit_id)
            q = q.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { count, error } = await q;
        if (error) {
            if (String(error.message || '').includes('cancellation_pending')) {
                return res.json({ count: 0 });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ count: count ?? 0 });
    }
    catch (e) {
        console.error('getHubComandaCancellationPendingCount', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubComandaCancellationPendingCount = getHubComandaCancellationPendingCount;
const postHubComandaResolveCancellation = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = resolveCancellationBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const comandaId = idParsed.data;
        const { clinic_id, resolution, reason, cash_session_id } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data: comanda, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('*')
            .eq('id', comandaId)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (cErr)
            return res.status(500).json({ error: cErr.message });
        if (!comanda)
            return res.status(404).json({ error: 'Comanda não encontrada' });
        const row = comanda;
        if (!row.cancellation_pending_at || row.cancellation_resolved_at) {
            return res.status(409).json({ error: 'Esta comanda não possui pendência de cancelamento para resolver.' });
        }
        const guardianId = row.guardian_id;
        const { paid_total, total_amount } = await computeComandaBalancePayload(comandaId, clinic_id);
        if (resolution === 'refund') {
            if (paid_total <= 0.009) {
                return res.status(409).json({ error: 'Não há pagamentos na comanda para reembolsar.' });
            }
            await reverseAllComandaPayments(clinic_id, comandaId, reason, userId);
        }
        else if (resolution === 'customer_credit') {
            if (!guardianId) {
                return res.status(409).json({ error: 'Comanda sem tutor — não é possível creditar saldo.' });
            }
            if (paid_total <= 0.009) {
                return res.status(409).json({ error: 'Não há pagamentos na comanda para converter em crédito.' });
            }
            const { totalReversed, restoredCustomerCredit } = await reverseAllComandaPayments(clinic_id, comandaId, reason, userId);
            // Pagamentos já feitos com crédito voltam no reverse; aqui só credita o restante (pix/dinheiro/etc.).
            const creditToGrant = round2(totalReversed - restoredCustomerCredit);
            if (creditToGrant > 0.009) {
                if (cash_session_id) {
                    const { data: sess } = await supabase_1.supabaseAdmin
                        .from('hub_cash_sessions')
                        .select('id, clinic_id, status')
                        .eq('id', cash_session_id)
                        .maybeSingle();
                    if (!sess || sess.clinic_id !== clinic_id || sess.status !== 'open') {
                        return res.status(409).json({ error: 'Sessão de caixa inválida' });
                    }
                }
                const { error: crErr } = await supabase_1.supabaseAdmin.from('hub_customer_credit_movements').insert({
                    clinic_id,
                    guardian_id: guardianId,
                    direction: 'in',
                    amount: creditToGrant,
                    reason,
                    comanda_id: comandaId,
                    receivable_id: null,
                    payment_method: null,
                    cash_session_id: cash_session_id ?? null,
                    notes: 'Crédito por cancelamento operacional (comanda)',
                    created_by_user_id: userId,
                });
                if (crErr) {
                    if (String(crErr.message || '').includes('hub_customer_credit')) {
                        return res.status(503).json({ error: 'Tabela de crédito do tutor não encontrada.' });
                    }
                    return res.status(500).json({ error: crErr.message });
                }
            }
        }
        else {
            // keep_billing — mantém pagamentos; apenas encerra pendência
            if (paid_total + 0.02 < total_amount && total_amount > 0.009) {
                return res.status(409).json({
                    error: 'Pagamento antecipado não cobre o total da comanda. Use reembolso ou crédito, ou ajuste a comanda antes de manter cobrança.',
                });
            }
        }
        const now = new Date().toISOString();
        let financialStatus = 'balanced';
        if (resolution === 'keep_billing') {
            const { balance_due } = await computeComandaBalancePayload(comandaId, clinic_id);
            financialStatus = balance_due <= 0.02 ? 'balanced' : 'awaiting_balance';
        }
        const { error: updErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .update({
            cancellation_resolution: resolution,
            cancellation_resolution_reason: reason,
            cancellation_resolved_at: now,
            cancellation_resolved_by_user_id: userId,
            cancellation_pending_at: null,
            status: 'fechada',
            closed_at: now,
            financial_status: financialStatus,
        })
            .eq('id', comandaId)
            .eq('clinic_id', clinic_id);
        if (updErr)
            return res.status(500).json({ error: updErr.message });
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        return res.json({ comanda: detail.comanda, detail });
    }
    catch (e) {
        console.error('postHubComandaResolveCancellation', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubComandaResolveCancellation = postHubComandaResolveCancellation;
// ─── ITENS DE COMANDA (adicionar/editar/remover manualmente) ────────────────
/** Recalcula subtotal e total da comanda a partir de todos os itens presentes. */
async function recomputeComandaTotals(comandaId, clinicId) {
    const { data: comanda } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('discount_amount')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .single();
    const discount = round2(Number(comanda?.discount_amount ?? 0));
    const { data: items } = await supabase_1.supabaseAdmin
        .from('hub_comanda_items')
        .select('line_total')
        .eq('comanda_id', comandaId);
    const sumAll = round2((items ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0));
    const total = round2(Math.max(0, sumAll - discount));
    await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .update({ subtotal_amount: sumAll, total_amount: total })
        .eq('id', comandaId)
        .eq('clinic_id', clinicId);
}
/**
 * Após editar desconto de comanda `series_invoice`, alinha recebível pending e total da fatura.
 * Rejeita se o novo total ficar abaixo do já pago.
 */
async function syncSeriesInvoiceTotalsAfterDiscount(comandaId, clinicId) {
    const { data: comanda } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, origin_type, origin_id, total_amount, discount_amount')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (!comanda || String(comanda.origin_type) !== 'series_invoice') {
        return { ok: true };
    }
    const newTotal = round2(Number(comanda.total_amount ?? 0));
    const { paid_total } = await computeComandaBalancePayload(comandaId, clinicId);
    if (newTotal + 0.009 < paid_total) {
        return {
            ok: false,
            error: `Desconto deixa o total (R$ ${newTotal.toFixed(2)}) abaixo do já pago (R$ ${paid_total.toFixed(2)}).`,
        };
    }
    const { data: receivables } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, status, original_amount, final_amount')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .eq('status', 'pending');
    for (const rec of receivables ?? []) {
        const patch = { final_amount: newTotal };
        if (paid_total <= 0.009) {
            patch.original_amount = newTotal;
        }
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .update(patch)
            .eq('id', rec.id)
            .eq('clinic_id', clinicId);
        if (error) {
            return { ok: false, error: error.message };
        }
    }
    const invoiceId = comanda.origin_id;
    if (invoiceId) {
        await supabase_1.supabaseAdmin
            .from('hub_series_invoices')
            .update({ total_amount: newTotal })
            .eq('id', invoiceId)
            .eq('clinic_id', clinicId);
    }
    return { ok: true };
}
const addComandaItemsBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    edit_context: comandaEditContextSchema,
    items: zod_1.z
        .array(zod_1.z.object({
        pet_id: uuidStr.optional().nullable(),
        hub_service_type_id: uuidStr.optional().nullable(),
        hub_inventory_item_id: uuidStr.optional().nullable(),
        hub_inventory_lot_id: uuidStr.optional().nullable(),
        description: zod_1.z.string().min(1).max(500),
        quantity: zod_1.z.number().positive().default(1),
        unit_amount: zod_1.z.number().min(0),
        discount_amount: zod_1.z.number().min(0).default(0),
        item_kind: zod_1.z.enum(['service', 'product', 'fee']).default('service'),
    }))
        .min(1),
})
    .strict();
const postHubComandaAddItems = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = addComandaItemsBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const comandaId = idParsed.data;
        const { clinic_id, items, edit_context } = parsed.data;
        const userId = req.user?.id ?? null;
        try {
            await assertComandaEditAllowed(comandaId, clinic_id, edit_context);
        }
        catch (e) {
            const msg = e.message;
            if (msg === 'NOT_FOUND')
                return res.status(404).json({ error: 'Comanda não encontrada' });
            return res.status(409).json({ error: msg });
        }
        const { data: comanda, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id, status, clinic_id, pet_id, guardian_id')
            .eq('id', comandaId)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (cErr)
            return res.status(500).json({ error: cErr.message });
        if (!comanda)
            return res.status(404).json({ error: 'Comanda não encontrada' });
        const defaultPetId = comanda.pet_id ?? null;
        const comandaGuardianId = comanda.guardian_id ?? null;
        const effectivePetIds = items.map((it) => it.pet_id ?? defaultPetId);
        // Isolamento: valida todos os pets efetivos (após default) antes de qualquer escrita.
        for (const petId of effectivePetIds) {
            if (!(await (0, hubTenantAsserts_1.assertPetInClinic)(clinic_id, petId))) {
                return res.status(400).json({ error: 'Pet inválido' });
            }
        }
        if (comandaGuardianId) {
            for (const petId of effectivePetIds) {
                if (!petId)
                    continue;
                if (!(await (0, hubTenantAsserts_1.assertGuardianLinkedToPet)(petId, comandaGuardianId))) {
                    return res.status(400).json({ error: 'Tutor inválido' });
                }
            }
        }
        const { data: maxSortRow } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .select('sort_order')
            .eq('comanda_id', comandaId)
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle();
        let sortBase = Number(maxSortRow?.sort_order ?? -1) + 1;
        const productItemIds = [
            ...new Set(items
                .filter((it) => it.item_kind === 'product' && it.hub_inventory_item_id)
                .map((it) => it.hub_inventory_item_id)),
        ];
        if (productItemIds.length > 0) {
            const { data: invRows, error: invErr } = await supabase_1.supabaseAdmin
                .from('hub_inventory_items')
                .select('id, name, sale_amount, max_sale_discount_pct, allow_price_override_on_sale')
                .eq('clinic_id', clinic_id)
                .in('id', productItemIds)
                .is('deleted_at', null);
            if (invErr)
                return res.status(500).json({ error: invErr.message });
            const invById = new Map((invRows ?? []).map((r) => [r.id, r]));
            for (const it of items) {
                if (it.item_kind !== 'product')
                    continue;
                if (!it.hub_inventory_item_id) {
                    return res.status(400).json({ error: 'Produto exige hub_inventory_item_id' });
                }
                if (!it.hub_inventory_lot_id) {
                    return res.status(400).json({ error: `Produto "${it.description}" exige lote` });
                }
                const inv = invById.get(it.hub_inventory_item_id);
                if (!inv) {
                    return res.status(400).json({ error: `Produto não encontrado: ${it.description}` });
                }
                const priced = (0, productSalePriceRules_1.validateProductSalePricing)({
                    item: inv,
                    quantity: it.quantity,
                    unit_amount: it.unit_amount,
                    discount_amount: it.discount_amount,
                });
                if (!priced.ok)
                    return res.status(400).json({ error: priced.error });
                const stockErr = await (0, hubInventoryStockUtils_1.validateLotStockForOut)(clinic_id, it.hub_inventory_item_id, it.hub_inventory_lot_id, it.quantity);
                if (stockErr) {
                    return res.status(400).json({
                        error: `${stockErr} (produto: ${it.description})`,
                    });
                }
            }
        }
        const sellerStaffId = items.some((it) => it.item_kind === 'product') && userId
            ? await (0, hubStaffResolve_1.resolveStaffIdForUser)(clinic_id, userId)
            : null;
        const insertRows = items.map((it) => ({
            clinic_id,
            comanda_id: comandaId,
            pet_id: it.pet_id ?? defaultPetId,
            hub_service_type_id: it.hub_service_type_id ?? null,
            hub_inventory_item_id: it.hub_inventory_item_id ?? null,
            hub_inventory_lot_id: it.hub_inventory_lot_id ?? null,
            description: it.description,
            quantity: it.quantity,
            unit_amount: it.unit_amount,
            discount_amount: it.discount_amount,
            line_total: round2(it.quantity * it.unit_amount - it.discount_amount),
            item_kind: it.item_kind,
            origin_type: 'manual',
            origin_id: null,
            sort_order: sortBase++,
            ...(it.item_kind === 'product' && sellerStaffId ? { sold_by_staff_id: sellerStaffId } : {}),
        }));
        const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').insert(insertRows);
        if (insErr)
            return res.status(500).json({ error: insErr.message });
        await recomputeComandaTotals(comandaId, clinic_id);
        for (const row of insertRows) {
            void (0, comandaEvents_1.recordComandaItemAddedEvent)({
                clinic_id,
                comanda_id: comandaId,
                item: {
                    description: String(row.description),
                    item_kind: String(row.item_kind),
                    quantity: Number(row.quantity),
                    unit_amount: Number(row.unit_amount),
                    line_total: Number(row.line_total),
                },
                actor_user_id: userId,
                edit_context,
                source: 'manual',
            });
        }
        const meta = (0, auditLog_1.extractRequestMetadata)(req);
        void (0, auditLog_1.createAuditLog)({
            user_id: userId ?? '',
            clinic_id,
            action: 'comanda_add_items',
            entity_type: 'hub_comandas',
            entity_id: comandaId,
            new_values: { count: items.length },
            ...meta,
        });
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        return res.status(201).json(detail);
    }
    catch (e) {
        console.error('postHubComandaAddItems', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubComandaAddItems = postHubComandaAddItems;
const patchComandaItemBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    edit_context: comandaEditContextSchema,
    description: zod_1.z.string().min(1).max(500).optional(),
    quantity: zod_1.z.number().positive().optional(),
    unit_amount: zod_1.z.number().min(0).optional(),
    discount_amount: zod_1.z.number().min(0).optional(),
    hub_inventory_lot_id: uuidStr.optional().nullable(),
})
    .strict();
const patchHubComandaItem = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const itemIdParsed = uuidStr.safeParse(req.params.itemId);
        const parsed = patchComandaItemBodySchema.safeParse(req.body);
        if (!idParsed.success || !itemIdParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const comandaId = idParsed.data;
        const itemId = itemIdParsed.data;
        const { clinic_id, edit_context, ...updates } = parsed.data;
        try {
            await assertComandaEditAllowed(comandaId, clinic_id, edit_context);
        }
        catch (e) {
            const msg = e.message;
            if (msg === 'NOT_FOUND')
                return res.status(404).json({ error: 'Comanda não encontrada' });
            return res.status(409).json({ error: msg });
        }
        const { data: item, error: iErr } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .select('id, comanda_id, origin_type, description, item_kind, quantity, unit_amount, discount_amount, line_total, hub_inventory_item_id, hub_inventory_lot_id')
            .eq('id', itemId)
            .eq('comanda_id', comandaId)
            .maybeSingle();
        if (iErr)
            return res.status(500).json({ error: iErr.message });
        if (!item)
            return res.status(404).json({ error: 'Item não encontrado' });
        // Permitir edição de qualquer item não faturado (manual ou operacional).
        // 'description' só pode ser alterada em itens manuais.
        if (item.origin_type !== 'manual' && updates.description !== undefined) {
            return res.status(409).json({ error: 'Descrição só pode ser editada em itens adicionados manualmente' });
        }
        if (updates.hub_inventory_lot_id !== undefined) {
            if (item.origin_type !== 'manual') {
                return res.status(409).json({ error: 'Lote só pode ser alterado em itens adicionados manualmente' });
            }
            if (String(item.item_kind) !== 'product' || !item.hub_inventory_item_id) {
                return res.status(400).json({ error: 'Lote só se aplica a produtos de estoque' });
            }
            if (!updates.hub_inventory_lot_id) {
                return res.status(400).json({ error: 'Produto exige lote' });
            }
        }
        const { data: invoicedLine } = await supabase_1.supabaseAdmin
            .from('hub_receivable_lines')
            .select('id')
            .eq('comanda_item_id', itemId)
            .limit(1)
            .maybeSingle();
        if (invoicedLine)
            return res.status(409).json({ error: 'Item já faturado e não pode ser editado' });
        const qty = updates.quantity ?? Number(item.quantity ?? 1);
        const unit = updates.unit_amount ?? Number(item.unit_amount ?? 0);
        const disc = updates.discount_amount ?? Number(item.discount_amount ?? 0);
        const nextLotId = updates.hub_inventory_lot_id !== undefined
            ? updates.hub_inventory_lot_id
            : (item.hub_inventory_lot_id ?? null);
        if (String(item.item_kind) === 'product' && item.hub_inventory_item_id) {
            const { data: inv, error: invErr } = await supabase_1.supabaseAdmin
                .from('hub_inventory_items')
                .select('id, name, sale_amount, max_sale_discount_pct, allow_price_override_on_sale')
                .eq('id', item.hub_inventory_item_id)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (invErr)
                return res.status(500).json({ error: invErr.message });
            if (!inv)
                return res.status(400).json({ error: 'Produto de estoque não encontrado' });
            const priced = (0, productSalePriceRules_1.validateProductSalePricing)({
                item: inv,
                quantity: qty,
                unit_amount: unit,
                discount_amount: disc,
            });
            if (!priced.ok)
                return res.status(400).json({ error: priced.error });
            if (!nextLotId) {
                return res.status(400).json({ error: 'Produto exige lote' });
            }
            const stockErr = await (0, hubInventoryStockUtils_1.validateLotStockForOut)(clinic_id, item.hub_inventory_item_id, nextLotId, qty);
            if (stockErr)
                return res.status(400).json({ error: stockErr });
        }
        const line_total = round2(qty * unit - disc);
        const { error: upErr } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .update({ ...updates, line_total })
            .eq('id', itemId);
        if (upErr)
            return res.status(500).json({ error: upErr.message });
        const changes = [];
        if (updates.description !== undefined && updates.description !== String(item.description ?? '')) {
            changes.push(`descrição alterada`);
        }
        if (updates.quantity !== undefined && updates.quantity !== Number(item.quantity ?? 1)) {
            changes.push(`quantidade ${Number(item.quantity ?? 1)} → ${updates.quantity}`);
        }
        if (updates.unit_amount !== undefined && updates.unit_amount !== Number(item.unit_amount ?? 0)) {
            const before = Number(item.unit_amount ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const after = updates.unit_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            changes.push(`valor unitário ${before} → ${after}`);
        }
        if (updates.discount_amount !== undefined && updates.discount_amount !== Number(item.discount_amount ?? 0)) {
            const before = Number(item.discount_amount ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const after = updates.discount_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            changes.push(`desconto ${before} → ${after}`);
        }
        if (updates.hub_inventory_lot_id !== undefined &&
            updates.hub_inventory_lot_id !== (item.hub_inventory_lot_id ?? null)) {
            changes.push('lote alterado');
        }
        if (changes.length > 0) {
            void (0, comandaEvents_1.recordComandaEvent)({
                clinic_id,
                comanda_id: comandaId,
                event_type: 'item_updated',
                title: (0, comandaEvents_1.comandaItemEventTitle)('updated', String(item.item_kind ?? 'service')),
                body: (0, comandaEvents_1.comandaItemUpdateBody)(String(item.description ?? 'Item'), changes),
                metadata: {
                    item_id: itemId,
                    changes,
                    line_total_before: Number(item.line_total ?? 0),
                    line_total_after: line_total,
                },
                actor_user_id: req.user?.id ?? null,
                edit_context,
            });
        }
        await recomputeComandaTotals(comandaId, clinic_id);
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        return res.json(detail);
    }
    catch (e) {
        console.error('patchHubComandaItem', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubComandaItem = patchHubComandaItem;
const deleteHubComandaItem = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const itemIdParsed = uuidStr.safeParse(req.params.itemId);
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id ?? req.body?.clinic_id);
        if (!idParsed.success || !itemIdParsed.success || !clinicParsed.success) {
            return res.status(400).json({ error: 'Parâmetros inválidos' });
        }
        const comandaId = idParsed.data;
        const itemId = itemIdParsed.data;
        const clinic_id = clinicParsed.data;
        const userId = req.user?.id ?? null;
        const editContextParsed = comandaEditContextSchema.safeParse(req.query.edit_context ?? req.body?.edit_context);
        const edit_context = editContextParsed.success ? editContextParsed.data : 'caixa';
        try {
            await assertComandaEditAllowed(comandaId, clinic_id, edit_context);
        }
        catch (e) {
            const msg = e.message;
            if (msg === 'NOT_FOUND')
                return res.status(404).json({ error: 'Comanda não encontrada' });
            return res.status(409).json({ error: msg });
        }
        const { data: item } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .select('id, comanda_id, origin_type, description, item_kind, quantity, unit_amount, line_total')
            .eq('id', itemId)
            .eq('comanda_id', comandaId)
            .maybeSingle();
        if (!item)
            return res.status(404).json({ error: 'Item não encontrado' });
        if (item.origin_type !== 'manual') {
            return res.status(409).json({ error: 'Apenas itens adicionados manualmente podem ser removidos' });
        }
        const { data: invoicedLine } = await supabase_1.supabaseAdmin
            .from('hub_receivable_lines')
            .select('id')
            .eq('comanda_item_id', itemId)
            .limit(1)
            .maybeSingle();
        if (invoicedLine)
            return res.status(409).json({ error: 'Item já faturado e não pode ser removido' });
        const itemSnap = (0, comandaEvents_1.itemSnapshotFromRow)(item);
        const { error: delErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').delete().eq('id', itemId);
        if (delErr)
            return res.status(500).json({ error: delErr.message });
        await recomputeComandaTotals(comandaId, clinic_id);
        void (0, comandaEvents_1.recordComandaItemRemovedEvent)({
            clinic_id,
            comanda_id: comandaId,
            item: itemSnap,
            actor_user_id: userId,
            edit_context,
            source: 'manual',
        });
        const meta = (0, auditLog_1.extractRequestMetadata)(req);
        void (0, auditLog_1.createAuditLog)({
            user_id: userId ?? '',
            clinic_id,
            action: 'comanda_remove_item',
            entity_type: 'hub_comandas',
            entity_id: comandaId,
            new_values: { item_id: itemId },
            ...meta,
        });
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        return res.json(detail);
    }
    catch (e) {
        console.error('deleteHubComandaItem', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteHubComandaItem = deleteHubComandaItem;
/** Sugestão de preço para item de comanda (mesmo motor do orçamento). */
const suggestComandaItemPriceBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    hub_service_type_id: uuidStr,
    pet: zod_1.z.object({
        size_tier: zod_1.z.string().default('medio'),
        birth_date: zod_1.z.string().optional().nullable(),
        coat_type: zod_1.z.string().optional().nullable(),
    }),
})
    .strict();
const postHubComandaSuggestItemPrice = async (req, res) => {
    try {
        const parsed = suggestComandaItemPriceBodySchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        const { clinic_id, hub_service_type_id, pet } = parsed.data;
        const { data: st } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, service_group, pricing_matrix, cost_amount, sale_amount')
            .eq('id', hub_service_type_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!st)
            return res.status(404).json({ error: 'Tipo de serviço não encontrado' });
        const { data: cs } = await supabase_1.supabaseAdmin
            .from('hub_clinic_settings')
            .select('pet_puppy_max_months')
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        const puppyMaxMonths = Number(cs?.pet_puppy_max_months ?? 8);
        const petFields = {
            size_tier: pet.size_tier,
            birth_date: pet.birth_date ?? null,
            coat_type: pet.coat_type ?? null,
        };
        try {
            const resolved = (0, hubPricingResolve_1.resolveServiceLinePricing)({
                serviceType: {
                    id: st.id,
                    service_group: st.service_group,
                    pricing_matrix: st.pricing_matrix,
                    cost_amount: Number(st.cost_amount ?? 0),
                    sale_amount: Number(st.sale_amount ?? 0),
                },
                pet: petFields,
                appointmentDateYmd: new Date().toISOString().slice(0, 10),
                puppyMaxMonths,
                overrideTier: null,
                overrideCoatType: null,
            });
            return res.json({
                unit_price: resolved.sale,
                applied_porte: resolved.porteTierApplied,
                applied_coat_type: resolved.coatTypeApplied,
            });
        }
        catch {
            return res.json({ unit_price: Number(st.sale_amount ?? 0), applied_porte: null, applied_coat_type: null });
        }
    }
    catch (e) {
        console.error('postHubComandaSuggestItemPrice', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubComandaSuggestItemPrice = postHubComandaSuggestItemPrice;
// ─── CHECKOUT EM CONJUNTO (várias comandas do mesmo tutor) ───────────────────
const checkoutBulkBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    comanda_ids: zod_1.z.array(uuidStr).min(1).max(20),
    grouping: zod_1.z.enum(['all', 'by_pet']).default('all'),
    action: zod_1.z.enum(['receive_now', 'leave_pending', 'cancel']),
    due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    payment_timing: zod_1.z.enum(['on_checkout', 'advance']).default('on_checkout'),
    /** Para receive_now: método e valor (aplicado a cada comanda proporcionalmente, ou por grupo). */
    payment_method: zod_1.z.string().optional().nullable(),
    cash_session_id: uuidStr.optional().nullable(),
    /** Mapa opcional comanda_id|receivable_id → idempotency_key (uuid) por pagamento. */
    idempotency_keys: zod_1.z.record(zod_1.z.string().uuid(), uuidStr).optional(),
})
    .strict();
const postHubComandaCheckoutBulk = async (req, res) => {
    try {
        const parsed = checkoutBulkBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, comanda_ids, action, due_date, payment_timing, payment_method, cash_session_id, idempotency_keys: bulkIdempotencyKeys, } = parsed.data;
        const userId = req.user?.id ?? null;
        if (action === 'leave_pending' && !due_date) {
            return res.status(400).json({ error: 'due_date obrigatório para deixar pendente' });
        }
        if (action === 'receive_now' && payment_method) {
            const clinicSettings = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinic_id);
            try {
                (0, hubPaymentMethods_1.assertPaymentMethodInList)(payment_method, clinicSettings.accepted_payment_methods);
            }
            catch (e) {
                if (e instanceof hubPaymentMethods_1.PaymentMethodNotAcceptedError) {
                    return res.status(400).json({ error: e.message });
                }
                throw e;
            }
        }
        // Valida que todas as comandas existem, pertencem à clínica e estão abertas
        const { data: comandas, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id, status, guardian_id, unit_id, total_amount')
            .eq('clinic_id', clinic_id)
            .in('id', comanda_ids)
            .is('deleted_at', null);
        if (cErr)
            return res.status(500).json({ error: cErr.message });
        if ((comandas ?? []).length !== comanda_ids.length) {
            return res.status(404).json({ error: 'Uma ou mais comandas não foram encontradas' });
        }
        const notOpen = (comandas ?? []).filter((c) => String(c.status) !== 'aberta');
        if (notOpen.length > 0) {
            const detail = notOpen
                .map((c) => {
                const st = String(c.status ?? 'desconhecido');
                const label = st === 'fechada'
                    ? 'fechada (já quitada ou encerrada)'
                    : st === 'cancelada'
                        ? 'cancelada'
                        : st;
                return `${c.id} (${label})`;
            })
                .join(', ');
            return res.status(409).json({
                error: `Comanda(s) não elegíveis para este lote — remova-as e tente de novo: ${detail}`,
            });
        }
        // leave_pending: caminho único (recebível + linhas + finance_handoff_at)
        if (action === 'leave_pending') {
            const results = [];
            for (const comanda of comandas ?? []) {
                const row = await leavePendingHandoffComanda(comanda.id, clinic_id, {
                    dueDate: due_date,
                    userId,
                });
                if (row.skipped && (!row.error || (0, comandaFinanceHandoff_1.isSkippableLeavePendingHandoffError)(row.error))) {
                    results.push({
                        comanda_id: row.comanda_id,
                        receivable_ids: row.receivable_ids,
                        error: row.error,
                        ...(row.code ? { code: row.code } : {}),
                    });
                    continue;
                }
                results.push({
                    comanda_id: row.comanda_id,
                    receivable_ids: row.receivable_ids,
                    error: row.error,
                    ...(row.code ? { code: row.code } : {}),
                });
            }
            const meta = (0, auditLog_1.extractRequestMetadata)(req);
            void (0, auditLog_1.createAuditLog)({
                user_id: userId ?? '',
                clinic_id,
                action: 'comanda_checkout_bulk',
                entity_type: 'hub_comandas',
                new_values: { comanda_ids, action, results },
                ...meta,
            });
            const hasErrors = results.some((r) => r.error && !(0, comandaFinanceHandoff_1.isSkippableLeavePendingHandoffError)(r.error));
            return res.status(hasErrors ? 207 : 201).json({ results, partial_errors: hasErrors });
        }
        // Processa cada comanda individualmente reaproveitando o checkout existente
        const results = [];
        const rolledBack = [];
        for (const comanda of comandas ?? []) {
            const comandaId = comanda.id;
            try {
                // Simulamos o body do checkout individual
                const checkoutBody = {
                    clinic_id,
                    grouping: 'all',
                    action,
                    payment_timing,
                };
                if (due_date)
                    checkoutBody.due_date = due_date;
                if (action === 'receive_now' && payment_method) {
                    checkoutBody.payments = [
                        {
                            group_index: 0,
                            amount: round2(Number(comanda.total_amount ?? 0)),
                            payment_method,
                            cash_session_id: cash_session_id ?? null,
                            installments: 1,
                        },
                    ];
                }
                // receive_now / cancel — leave_pending já foi tratado acima
                const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
                const items = detail.items.filter((it) => detail.open_item_ids.includes(it.id));
                const unitId = detail.comanda.unit_id;
                if (items.length === 0) {
                    if (action === 'receive_now') {
                        const bal = Number(detail.balance_due ?? 0);
                        const activeRecIds = detail.active_receivable_ids ?? [];
                        if (bal <= 0.02) {
                            await tryAutoCloseComanda(comandaId, clinic_id);
                            results.push({ comanda_id: comandaId, receivable_ids: activeRecIds });
                        }
                        else if (activeRecIds.length > 0 && payment_method) {
                            // Já faturada: liquidar recebíveis em aberto (sem recriar linhas).
                            const paidIds = [];
                            let payError = null;
                            for (const rid of activeRecIds) {
                                const { data: rec } = await supabase_1.supabaseAdmin
                                    .from('hub_receivables')
                                    .select('id, status, final_amount, unit_id, guardian_id, comanda_id')
                                    .eq('id', rid)
                                    .maybeSingle();
                                if (!rec || rec.status === 'cancelled' || rec.status === 'paid')
                                    continue;
                                const { data: pays } = await supabase_1.supabaseAdmin
                                    .from('hub_payments')
                                    .select('amount')
                                    .eq('receivable_id', rid)
                                    .eq('status', 'posted');
                                const paidSoFar = round2((pays ?? []).reduce((a, row) => a + Number(row.amount ?? 0), 0));
                                const due = round2(Math.max(0, Number(rec.final_amount ?? 0) - paidSoFar));
                                if (due <= 0.009)
                                    continue;
                                const { insertPostedPaymentWithIdempotency, validatePaymentCashSession, recalculateReceivableFromPosted } = await Promise.resolve().then(() => __importStar(require('./hubFinanceLedger.js')));
                                const cashCheck = await validatePaymentCashSession({
                                    clinicId: clinic_id,
                                    paymentMethod: payment_method,
                                    cashSessionId: cash_session_id ?? null,
                                    receivableUnitId: rec.unit_id ?? null,
                                });
                                if (!cashCheck.ok) {
                                    payError = cashCheck.error;
                                    break;
                                }
                                const validatedCashSessionId = cashCheck.cash_session_id;
                                if (payment_method === 'customer_credit') {
                                    const creditGuardianId = rec.guardian_id ??
                                        detail.comanda.guardian_id;
                                    if (!creditGuardianId) {
                                        payError = 'Comanda sem tutor — não é possível pagar com crédito.';
                                        break;
                                    }
                                    try {
                                        await (0, hubCustomerCredit_1.consumeHubCustomerCredit)({
                                            clinicId: clinic_id,
                                            guardianId: creditGuardianId,
                                            amount: due,
                                            reason: 'Pagamento com crédito do tutor (checkout em lote)',
                                            comandaId,
                                            receivableId: rid,
                                            createdByUserId: userId,
                                        });
                                    }
                                    catch (e) {
                                        payError =
                                            e instanceof hubCustomerCredit_1.CustomerCreditError
                                                ? e.message
                                                : e.message ?? 'Erro ao debitar crédito do tutor';
                                        break;
                                    }
                                }
                                const lineKey = bulkIdempotencyKeys?.[rid] ?? bulkIdempotencyKeys?.[comandaId] ?? null;
                                const inserted = await insertPostedPaymentWithIdempotency({
                                    clinicId: clinic_id,
                                    receivableId: rid,
                                    cashSessionId: validatedCashSessionId,
                                    amount: due,
                                    paymentMethod: payment_method,
                                    installments: 1,
                                    paymentDate: new Date().toISOString(),
                                    notes: null,
                                    createdByUserId: userId,
                                    paymentTiming: payment_timing,
                                    idempotencyKey: lineKey,
                                });
                                if (!inserted.ok) {
                                    payError = inserted.error;
                                    break;
                                }
                                const nextStatus = await recalculateReceivableFromPosted(rid);
                                paidIds.push(rid);
                                if (nextStatus === 'paid') {
                                    void (0, appointmentPaidFromBilling_1.markHubAppointmentPaidFromReceivable)({ clinicId: clinic_id, receivableId: rid });
                                }
                            }
                            if (payError) {
                                results.push({ comanda_id: comandaId, receivable_ids: paidIds, error: payError });
                            }
                            else if (paidIds.length === 0) {
                                results.push({
                                    comanda_id: comandaId,
                                    receivable_ids: [],
                                    error: 'Não há saldo em aberto para receber nesta comanda',
                                });
                            }
                            else {
                                await tryAutoCloseComanda(comandaId, clinic_id);
                                results.push({ comanda_id: comandaId, receivable_ids: paidIds });
                            }
                        }
                        else {
                            results.push({
                                comanda_id: comandaId,
                                receivable_ids: [],
                                error: 'Não há itens em aberto para faturar',
                            });
                        }
                    }
                    else {
                        results.push({
                            comanda_id: comandaId,
                            receivable_ids: [],
                        });
                    }
                    continue;
                }
                const guardianId = detail.comanda.guardian_id;
                const subtotal = round2(items.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
                const bulkExecutorCheck = await (0, hubCommissionAccrual_1.assertServiceLinesHaveExecutor)(clinic_id, items);
                if (!bulkExecutorCheck.ok) {
                    results.push({
                        comanda_id: comandaId,
                        receivable_ids: [],
                        error: bulkExecutorCheck.message,
                    });
                    continue;
                }
                const manualSourceId = (0, node_crypto_1.randomUUID)();
                const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
                    .from('hub_receivables')
                    .insert({
                    clinic_id,
                    unit_id: unitId,
                    guardian_id: guardianId,
                    source_type: 'manual',
                    source_id: manualSourceId,
                    comanda_id: comandaId,
                    original_amount: subtotal,
                    final_amount: subtotal,
                    net_amount_at_sale: subtotal,
                    returned_amount: 0,
                    status: 'pending',
                    due_date: null,
                    notes: null,
                })
                    .select('id')
                    .single();
                if (rErr || !rec) {
                    results.push({ comanda_id: comandaId, receivable_ids: [], error: rErr?.message ?? 'Erro ao criar recebível' });
                    continue;
                }
                const receivableId = rec.id;
                const batchCostByItem = await loadInventoryCostByItemId(clinic_id, items);
                const commissionByItem = await (0, hubCommissionAccrual_1.buildCommissionInsertFieldsForItems)({
                    clinicId: clinic_id,
                    items: items,
                    originalAmount: subtotal,
                    netAmountAtSale: subtotal,
                    actingUserId: userId,
                    allowActingUserAsSaleAuthor: false,
                });
                const { error: linesErr } = await supabase_1.supabaseAdmin.from('hub_receivable_lines').insert(items.map((it, sort) => {
                    const lineKind = String(it.item_kind ?? '') === 'product'
                        ? 'product'
                        : mapItemToReceivableLineKind(it.origin_type ?? null);
                    const snap = commissionByItem.get(String(it.id));
                    return {
                        clinic_id,
                        receivable_id: receivableId,
                        comanda_id: comandaId,
                        comanda_item_id: it.id,
                        pet_id: it.pet_id ?? null,
                        line_kind: lineKind,
                        source_line_id: it.origin_id ?? null,
                        hub_service_type_id: it.hub_service_type_id ?? null,
                        hub_inventory_item_id: it.hub_inventory_item_id ?? null,
                        hub_inventory_lot_id: it.hub_inventory_lot_id ?? null,
                        description: String(it.description),
                        quantity: Number(it.quantity ?? 1),
                        unit_sale_amount: Number(it.unit_amount ?? 0),
                        unit_cost_amount: productUnitCostSnapshot(batchCostByItem, it),
                        line_total: Number(it.line_total ?? 0),
                        sort_order: sort,
                        ...(0, hubCommissionAccrual_1.snapshotToInsertFields)(snap),
                    };
                }));
                if (linesErr) {
                    await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
                    results.push({
                        comanda_id: comandaId,
                        receivable_ids: [],
                        error: linesErr.message ?? 'Erro ao criar linhas do recebível',
                    });
                    continue;
                }
                if (action === 'receive_now' && payment_method) {
                    const { insertPostedPaymentWithIdempotency, validatePaymentCashSession, recalculateReceivableFromPosted } = await Promise.resolve().then(() => __importStar(require('./hubFinanceLedger.js')));
                    const cashCheck = await validatePaymentCashSession({
                        clinicId: clinic_id,
                        paymentMethod: payment_method,
                        cashSessionId: cash_session_id ?? null,
                        receivableUnitId: unitId,
                    });
                    if (!cashCheck.ok) {
                        await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', receivableId);
                        await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
                        results.push({ comanda_id: comandaId, receivable_ids: [], error: cashCheck.error });
                        continue;
                    }
                    const validatedCashSessionId = cashCheck.cash_session_id;
                    if (payment_method === 'customer_credit') {
                        if (!guardianId) {
                            await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', receivableId);
                            await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
                            results.push({
                                comanda_id: comandaId,
                                receivable_ids: [],
                                error: 'Comanda sem tutor — não é possível pagar com crédito.',
                            });
                            continue;
                        }
                        try {
                            await (0, hubCustomerCredit_1.consumeHubCustomerCredit)({
                                clinicId: clinic_id,
                                guardianId,
                                amount: round2(subtotal),
                                reason: 'Pagamento com crédito do tutor (checkout em lote)',
                                comandaId,
                                receivableId,
                                createdByUserId: userId,
                            });
                        }
                        catch (e) {
                            await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', receivableId);
                            await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
                            results.push({
                                comanda_id: comandaId,
                                receivable_ids: [],
                                error: e instanceof hubCustomerCredit_1.CustomerCreditError
                                    ? e.message
                                    : e.message ?? 'Erro ao debitar crédito do tutor',
                            });
                            continue;
                        }
                    }
                    const lineKey = bulkIdempotencyKeys?.[comandaId] ?? null;
                    const inserted = await insertPostedPaymentWithIdempotency({
                        clinicId: clinic_id,
                        receivableId,
                        cashSessionId: validatedCashSessionId,
                        amount: round2(subtotal),
                        paymentMethod: payment_method,
                        installments: 1,
                        paymentDate: new Date().toISOString(),
                        notes: null,
                        createdByUserId: userId,
                        paymentTiming: payment_timing,
                        idempotencyKey: lineKey,
                    });
                    if (!inserted.ok) {
                        await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', receivableId);
                        await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
                        results.push({ comanda_id: comandaId, receivable_ids: [], error: inserted.error });
                        continue;
                    }
                    const nextStatus = await recalculateReceivableFromPosted(receivableId);
                    if (nextStatus === 'paid') {
                        void (0, appointmentPaidFromBilling_1.markHubAppointmentPaidFromReceivable)({ clinicId: clinic_id, receivableId });
                    }
                }
                await tryAutoCloseComanda(comandaId, clinic_id);
                results.push({ comanda_id: comandaId, receivable_ids: [receivableId] });
            }
            catch (itemErr) {
                results.push({ comanda_id: comandaId, receivable_ids: [], error: itemErr?.message ?? 'Erro ao processar comanda' });
                rolledBack.push(comandaId);
            }
        }
        const meta = (0, auditLog_1.extractRequestMetadata)(req);
        void (0, auditLog_1.createAuditLog)({
            user_id: userId ?? '',
            clinic_id,
            action: 'comanda_checkout_bulk',
            entity_type: 'hub_comandas',
            new_values: { comanda_ids, results },
            ...meta,
        });
        const hasErrors = results.some((r) => r.error);
        return res.status(hasErrors ? 207 : 201).json({ results, partial_errors: hasErrors });
    }
    catch (e) {
        console.error('postHubComandaCheckoutBulk', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubComandaCheckoutBulk = postHubComandaCheckoutBulk;
// ── PATCH /api/hub/comandas/:id ──────────────────────────────────────────────
const patchComandaBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    edit_context: comandaEditContextSchema,
    discount_amount: zod_1.z.number().min(0).optional(),
    notes: zod_1.z.string().max(2000).optional().nullable(),
    finance_notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    client_notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    guardian_id: uuidStr.optional(),
})
    .strict();
const patchHubComanda = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = patchComandaBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const comandaId = idParsed.data;
        const { clinic_id, discount_amount, notes, finance_notes, client_notes, guardian_id, edit_context } = parsed.data;
        try {
            await assertComandaEditAllowed(comandaId, clinic_id, edit_context);
        }
        catch (e) {
            const msg = e.message;
            if (msg === 'NOT_FOUND')
                return res.status(404).json({ error: 'Comanda não encontrada' });
            return res.status(409).json({ error: msg });
        }
        const { data: comanda, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id, status, clinic_id, finance_handoff_at, origin_type, discount_amount')
            .eq('id', comandaId)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (cErr)
            return res.status(500).json({ error: cErr.message });
        if (!comanda)
            return res.status(404).json({ error: 'Comanda não encontrada' });
        if (notes !== undefined && edit_context === 'financeiro') {
            return res.status(409).json({ error: 'Observação do caixa não pode ser alterada pelo financeiro.' });
        }
        if (finance_notes !== undefined && edit_context === 'caixa') {
            return res.status(409).json({ error: 'Observação do financeiro só pode ser editada no módulo Financeiro.' });
        }
        if (finance_notes !== undefined && edit_context === 'financeiro' && !comanda.finance_handoff_at) {
            return res.status(409).json({ error: 'Observação do financeiro só pode ser registrada após o envio da comanda ao financeiro.' });
        }
        if (notes !== undefined && edit_context === 'caixa' && comanda.finance_handoff_at) {
            return res.status(409).json({ error: 'Comanda já enviada ao financeiro. A observação do caixa não pode mais ser alterada.' });
        }
        if (guardian_id !== undefined) {
            const currentDetail = await getHubComandaDetailPayload(comandaId, clinic_id);
            if ((currentDetail.invoiced_item_ids ?? []).length > 0) {
                return res.status(409).json({ error: 'Não é possível trocar o tutor após faturar itens' });
            }
            const petIds = [
                ...new Set((currentDetail.items ?? [])
                    .map((it) => it.pet_id)
                    .filter(Boolean)),
            ];
            if (petIds.length === 0) {
                return res.status(400).json({ error: 'Comanda sem pets — tutor não pode ser alterado' });
            }
            const allowed = await listAllowedGuardiansForPetIds(petIds);
            if (!allowed.some((g) => g.id === guardian_id)) {
                return res.status(400).json({ error: 'Tutor não permitido para os pets desta comanda' });
            }
        }
        const previousDiscount = Number(comanda.discount_amount ?? 0);
        const patch = {};
        if (discount_amount !== undefined)
            patch.discount_amount = discount_amount;
        if (notes !== undefined)
            patch.notes = notes;
        if (finance_notes !== undefined)
            patch.finance_notes = finance_notes?.trim() || null;
        if (client_notes !== undefined)
            patch.client_notes = client_notes?.trim() || null;
        if (guardian_id !== undefined)
            patch.guardian_id = guardian_id;
        if (Object.keys(patch).length > 0) {
            const { error: upErr } = await supabase_1.supabaseAdmin
                .from('hub_comandas')
                .update(patch)
                .eq('id', comandaId)
                .eq('clinic_id', clinic_id);
            if (upErr)
                return res.status(500).json({ error: upErr.message });
        }
        if (discount_amount !== undefined) {
            await recomputeComandaTotals(comandaId, clinic_id);
            const sync = await syncSeriesInvoiceTotalsAfterDiscount(comandaId, clinic_id);
            if (!sync.ok) {
                await supabase_1.supabaseAdmin
                    .from('hub_comandas')
                    .update({ discount_amount: previousDiscount })
                    .eq('id', comandaId)
                    .eq('clinic_id', clinic_id);
                await recomputeComandaTotals(comandaId, clinic_id);
                return res.status(409).json({ error: sync.error });
            }
        }
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        return res.json(detail);
    }
    catch (e) {
        console.error('patchHubComanda', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubComanda = patchHubComanda;
