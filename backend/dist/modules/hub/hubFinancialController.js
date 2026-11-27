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
exports.patchHubFinancePayable = exports.postHubFinancePayable = exports.listHubFinancePayables = exports.postHubFinanceCashMovement = exports.deleteHubFinanceExpense = exports.patchHubFinanceExpense = exports.postHubFinanceExpense = exports.listHubFinanceExpenses = exports.getHubFinancePackagesReport = exports.getHubFinanceTopClientsReport = exports.getHubFinanceMyCommissionsReport = exports.getHubFinanceCommissionsReport = exports.getHubFinanceSalesAdjustmentsReport = exports.getHubFinanceAgingReport = exports.getHubFinanceMovementBySectorReport = exports.getHubFinanceProductSalesReport = exports.getHubFinanceTopServicesReport = exports.getHubFinanceTicketAverageReport = exports.getHubFinanceRevenueSeries = exports.getHubFinanceRevenueReport = exports.getHubFinanceCashFlow = exports.getHubFinanceDashboardSummary = exports.getHubFinanceDayBoard = exports.getHubFinancePendingBillingCount = exports.getHubFinanceUnbilledCompleted = exports.getHubFinanceCashSessionSummary = exports.getHubFinanceCashSessionOpen = exports.listHubFinanceCashSessionsClosed = exports.postHubFinanceHandoffPending = exports.getHubFinanceCashSessionStatus = exports.postHubFinanceCashSessionsAutoCloseOverdue = exports.postHubFinanceCashSessionClose = exports.postHubFinanceCashSessionOpen = exports.listHubFinanceReceivables = exports.getHubFinancePaymentReceipt = exports.getHubFinanceReceivableDetail = exports.postHubFinanceReceivableProductReturn = exports.postHubFinanceReceivableCancel = exports.listHubFinancePayments = exports.getHubFinancePayment = exports.postHubFinanceReceivableHistoricalCash = exports.postHubFinancePaymentReverse = exports.deleteHubFinanceReceivableProductLine = exports.postHubFinanceReceivableProductLine = exports.postHubFinanceReceivablePayment = exports.postHubFinanceWaiveBilling = exports.postHubFinanceReceivable = exports.getHubFinancePreview = exports.patchHubFinancePaymentMethodSettings = exports.getHubFinancePaymentMethodSettings = void 0;
exports.postHubFinancePayableScheduleEnd = exports.patchHubFinancePayableSchedule = exports.postHubFinancePayableSchedule = exports.listHubFinancePayableSchedules = exports.postHubFinancePayableCancel = exports.postHubFinancePayablePay = void 0;
exports.resolveOpenCashSessionId = resolveOpenCashSessionId;
exports.resolvePaymentCashSessionId = resolvePaymentCashSessionId;
exports.linkOrphanPaymentsToSession = linkOrphanPaymentsToSession;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubStaffResolve_1 = require("./hubStaffResolve");
const hubInventoryStockUtils_1 = require("./hubInventoryStockUtils");
const hubProductReturnStatus_1 = require("./hubProductReturnStatus");
const productSalePriceRules_1 = require("./productSalePriceRules");
const hubPricingResolve_1 = require("./hubPricingResolve");
const hubPaymentReceiptPdf_1 = require("./hubPaymentReceiptPdf");
const hubComandasController_1 = require("./hubComandasController");
const cashSessionCloseService_1 = require("./cashSessionCloseService");
const hubFinanceLedger_1 = require("./hubFinanceLedger");
const hubReceivableFinancialBalance_1 = require("./hubReceivableFinancialBalance");
const hubCommissionAccrual_1 = require("./hubCommissionAccrual");
const hubReportCommercialNet_1 = require("./hubReportCommercialNet");
const hubQuoteDiscount_1 = require("./hubQuoteDiscount");
const hubClinicSettingsController_1 = require("./hubClinicSettingsController");
const hubPaymentMethods_1 = require("./hubPaymentMethods");
const hubCardMachineFees_1 = require("./hubCardMachineFees");
const boardingBilling_1 = require("./boardingBilling");
const boardingOperational_1 = require("./boardingOperational");
const hubHospitalizationBilling_1 = require("./hubHospitalizationBilling");
const hubFinancialDayBoard_1 = require("./hubFinancialDayBoard");
const hubFinanceDayBoardOpen_1 = require("./hubFinanceDayBoardOpen");
const hubFinanceDayBoardManual_1 = require("./hubFinanceDayBoardManual");
const hubFinanceSchemas_1 = require("./hubFinanceSchemas");
const hubNotifyEvents_1 = require("./hubNotifyEvents");
const hubPackagesService_1 = require("./hubPackagesService");
const hubSeriesBillingService_1 = require("./hubSeriesBillingService");
const hubCustomerCredit_1 = require("./hubCustomerCredit");
const hubPayablesService_1 = require("./hubPayablesService");
const uuidStr = zod_1.z.string().uuid();
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
/** Retorna o ID da sessão de caixa aberta para uma unidade, ou null se não houver. */
async function resolveOpenCashSessionId(clinicId, unitId) {
    if (!unitId)
        return null;
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_cash_sessions')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('unit_id', unitId)
        .eq('status', 'open')
        .maybeSingle();
    return data?.id ?? null;
}
/** Resolve unidade efetiva do recebível (recebível → comanda) e associa à sessão aberta. */
async function resolvePaymentCashSessionId(clinicId, recUnitId, comandaUnitId) {
    const unitId = recUnitId ?? comandaUnitId ?? null;
    return resolveOpenCashSessionId(clinicId, unitId);
}
/** Dia civil em America/Sao_Paulo (YYYY-MM-DD) para comparar pagamentos com sessão de caixa. */
function paymentYmdSaoPaulo(iso) {
    if (!iso)
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        const raw = String(iso);
        return raw.length >= 10 ? raw.slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    }
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
/**
 * @deprecated Removido: não vincular pagamentos órfãos automaticamente à sessão.
 * Mantido como no-op para imports legados de testes.
 */
async function linkOrphanPaymentsToSession(_clinicId, _session) {
    return;
}
/** Unidade principal da clínica, ou a primeira cadastrada (orçamentos sem unit_id herdavam null e sumiam no filtro do financeiro). */
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
async function recalculateReceivableStatus(receivableId) {
    return (0, hubFinanceLedger_1.recalculateReceivableFromPosted)(receivableId);
}
/** Sync financial_status da comanda (aberta ou fechada) sem reabrir. */
async function syncComandaFinancialAfterLedger(comandaId, clinicId) {
    if (!comandaId)
        return;
    const { data: comandaRow } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('*')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (!comandaRow)
        return;
    await (0, hubComandasController_1.refreshComandaFinancialStatus)(comandaId, clinicId, comandaRow);
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
/** Unidade estrita (Etapa B): unit_id null NÃO entra no total da unidade selecionada. */
function unitMatchesSelected(rowUnitId, selectedUnitId) {
    return rowUnitId === selectedUnitId;
}
/** Entradas de adiantamento em dinheiro na sessão (Fase 5; tabela pode não existir). */
async function sumCreditCashInSession(clinicId, sessionId) {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_customer_credit_movements')
            .select('amount')
            .eq('clinic_id', clinicId)
            .eq('cash_session_id', sessionId)
            .eq('direction', 'in')
            .eq('payment_method', 'cash');
        if (error) {
            if (String(error.message || '').includes('hub_customer_credit'))
                return 0;
            return 0;
        }
        return round2((data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0));
    }
    catch {
        return 0;
    }
}
async function enrichReceivableLines(lines) {
    const serviceIds = [...new Set(lines.map((l) => l.hub_service_type_id).filter(Boolean))];
    const itemIds = [...new Set(lines.map((l) => l.hub_inventory_item_id).filter(Boolean))];
    const lotIds = [...new Set(lines.map((l) => l.hub_inventory_lot_id).filter(Boolean))];
    const [serviceRes, itemRes, lotRes] = await Promise.all([
        serviceIds.length
            ? supabase_1.supabaseAdmin.from('hub_service_types').select('id, name, code, service_group').in('id', serviceIds)
            : Promise.resolve({ data: [], error: null }),
        itemIds.length
            ? supabase_1.supabaseAdmin.from('hub_inventory_items').select('id, name, store_sku, sale_amount').in('id', itemIds)
            : Promise.resolve({ data: [], error: null }),
        lotIds.length
            ? supabase_1.supabaseAdmin.from('hub_inventory_lots').select('id, lot_code, expiry_date').in('id', lotIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (serviceRes.error)
        throw new Error(serviceRes.error.message);
    if (itemRes.error)
        throw new Error(itemRes.error.message);
    if (lotRes.error)
        throw new Error(lotRes.error.message);
    const serviceById = new Map((serviceRes.data ?? []).map((s) => [s.id, s]));
    const itemById = new Map((itemRes.data ?? []).map((i) => [i.id, i]));
    const lotById = new Map((lotRes.data ?? []).map((l) => [l.id, l]));
    return lines.map((line) => ({
        ...line,
        service_type: line.hub_service_type_id ? serviceById.get(line.hub_service_type_id) ?? null : null,
        inventory_item: line.hub_inventory_item_id ? itemById.get(line.hub_inventory_item_id) ?? null : null,
        inventory_lot: line.hub_inventory_lot_id ? lotById.get(line.hub_inventory_lot_id) ?? null : null,
    }));
}
async function sumAppointmentServicesSale(appointmentId) {
    const { data: svcRows, error } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('id, hub_service_type_id, order_index, sale_amount_applied, hub_service_types(name, sale_amount)')
        .eq('appointment_id', appointmentId)
        .order('order_index', { ascending: true });
    if (error)
        throw new Error(error.message);
    const lines = [];
    let subtotal = 0;
    let idx = 0;
    for (const row of svcRows ?? []) {
        const st = row.hub_service_types;
        const stRow = Array.isArray(st) ? st[0] : st;
        const sale = (0, hubPricingResolve_1.resolveAppliedSaleAmount)(row.sale_amount_applied, stRow?.sale_amount);
        const desc = stRow?.name || 'Serviço';
        subtotal += sale;
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'appointment_service',
            source_line_id: row.id,
            hub_service_type_id: row.hub_service_type_id ?? null,
            description: desc,
            quantity: 1,
            unit_sale_amount: sale,
            line_total: sale,
            sort_order: idx++,
        });
    }
    return { lines, subtotal: round2(subtotal) };
}
async function sumGroomingExtras(sessionId, clinicId) {
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_session_extras')
        .select('id, hub_service_type_id, name_snapshot, sale_amount_snapshot')
        .eq('hub_grooming_session_id', sessionId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    const lines = [];
    let subtotal = 0;
    let idx = 1000;
    for (const row of rows ?? []) {
        const sale = Number(row.sale_amount_snapshot ?? 0);
        subtotal += sale;
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'grooming_extra',
            source_line_id: row.id,
            hub_service_type_id: row.hub_service_type_id ?? null,
            description: String(row.name_snapshot || 'Adicional'),
            quantity: 1,
            unit_sale_amount: sale,
            line_total: sale,
            sort_order: idx++,
        });
    }
    return { lines, subtotal: round2(subtotal) };
}
async function buildPreviewForBoardingReservation(clinicId, reservationId) {
    const { data: res, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('id, clinic_id, pet_id, guardian_id, unit_id, mode, status, expected_check_in, expected_check_out, checked_in_at, checked_out_at, daily_rate_cents, billing_waived_at')
        .eq('id', reservationId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!res)
        throw new Error('NOT_FOUND');
    if (!(0, boardingOperational_1.isBoardingStatusReadyForComanda)(String(res.status ?? ''), { allowIncomplete: true })) {
        throw new Error('NOT_READY');
    }
    if (res.billing_waived_at)
        throw new Error('WAIVED');
    const guardianId = res.guardian_id;
    if (!guardianId)
        throw new Error('NO_GUARDIAN');
    const unitIdForCutoff = res.unit_id ?? null;
    let cutoffTime = null;
    if (unitIdForCutoff) {
        const { data: settings } = await supabase_1.supabaseAdmin
            .from('hub_unit_boarding_settings')
            .select('checkout_cutoff_time')
            .eq('unit_id', unitIdForCutoff)
            .maybeSingle();
        cutoffTime = settings?.checkout_cutoff_time ?? null;
    }
    const { line, subtotal: baseSubtotal } = (0, boardingBilling_1.buildBoardingComandaLine)({
        id: res.id,
        mode: res.mode,
        pet_id: res.pet_id,
        expected_check_in: res.expected_check_in,
        expected_check_out: res.expected_check_out,
        checked_in_at: res.checked_in_at,
        checked_out_at: res.checked_out_at,
        daily_rate_cents: res.daily_rate_cents,
    }, { cutoffTime });
    const { data: extraRows } = await supabase_1.supabaseAdmin
        .from('hub_boarding_extras')
        .select('id, hub_service_type_id, description, quantity, unit_amount_cents, service_date, deleted_at')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', reservationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
    const extras = (0, boardingBilling_1.buildBoardingExtraLines)((extraRows ?? []), res.pet_id ?? null);
    const lines = [
        {
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: line.description,
            quantity: line.quantity,
            unit_sale_amount: line.unit_amount,
            line_total: line.line_total,
            sort_order: 0,
        },
        ...extras.lines.map((ex, i) => ({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: ex.origin_id,
            hub_service_type_id: ex.hub_service_type_id,
            description: ex.description,
            quantity: ex.quantity,
            unit_sale_amount: ex.unit_amount,
            line_total: ex.line_total,
            sort_order: i + 1,
        })),
    ];
    return {
        lines,
        subtotal: round2(baseSubtotal + extras.subtotal),
        unit_id: res.unit_id ?? null,
        guardian_id: guardianId,
    };
}
async function buildPreviewForGroomingSession(clinicId, sessionId) {
    const { data: session, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id, clinic_id, unit_id, guardian_id, hub_appointment_id, grooming_stage, billing_waived_at')
        .eq('id', sessionId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!session || session.clinic_id !== clinicId) {
        throw new Error('NOT_FOUND');
    }
    const allLines = [];
    let subtotal = 0;
    const apptId = session.hub_appointment_id;
    if (apptId) {
        const ap = await sumAppointmentServicesSale(apptId);
        allLines.push(...ap.lines);
        subtotal += ap.subtotal;
    }
    const ex = await sumGroomingExtras(sessionId, clinicId);
    allLines.push(...ex.lines);
    subtotal += ex.subtotal;
    if (allLines.length === 0) {
        allLines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: 'Banho e Tosa (sem linhas de serviço)',
            quantity: 1,
            unit_sale_amount: 0,
            line_total: 0,
            sort_order: 0,
        });
    }
    return {
        lines: allLines,
        subtotal: round2(subtotal),
        unit_id: session.unit_id ?? null,
        guardian_id: session.guardian_id ?? null,
    };
}
function hospComandaItemsToPreviewLines(items) {
    return items.map((it) => ({
        clinic_id: '',
        receivable_id: '',
        line_kind: 'manual',
        source_line_id: it.origin_id,
        hub_service_type_id: it.hub_service_type_id,
        description: it.description,
        quantity: it.quantity,
        unit_sale_amount: it.unit_amount,
        line_total: it.line_total,
        sort_order: it.sort_order,
    }));
}
async function buildPreviewForEncounter(clinicId, encounterId) {
    const { data: enc, error } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('id, clinic_id, unit_id, guardian_id, hub_appointment_id, status, billing_waived_at')
        .eq('id', encounterId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!enc || enc.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    const apptId = enc.hub_appointment_id;
    const allLines = [];
    let subtotal = 0;
    if (apptId) {
        const ap = await sumAppointmentServicesSale(apptId);
        allLines.push(...ap.lines);
        subtotal += ap.subtotal;
    }
    const hosp = await (0, hubHospitalizationBilling_1.loadHospitalizationComandaItems)({
        clinicId,
        encounterId,
        appointmentId: apptId,
    });
    if (hosp.items.length) {
        allLines.push(...hospComandaItemsToPreviewLines(hosp.items));
        subtotal = round2(subtotal + hosp.subtotal);
    }
    if (allLines.length === 0) {
        allLines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: 'Consulta / atendimento clínico',
            quantity: 1,
            unit_sale_amount: 0,
            line_total: 0,
            sort_order: 0,
        });
    }
    return {
        lines: allLines,
        subtotal: round2(subtotal),
        unit_id: enc.unit_id ?? null,
        guardian_id: enc.guardian_id ?? null,
    };
}
async function buildPreviewForAppointment(clinicId, appointmentId) {
    const { data: appt, error } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, clinic_id, unit_id, guardian_id, status, title')
        .eq('id', appointmentId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!appt || appt.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    const built = await sumAppointmentServicesSale(appointmentId);
    const hosp = await (0, hubHospitalizationBilling_1.loadHospitalizationComandaItems)({
        clinicId,
        appointmentId,
    });
    if (hosp.items.length) {
        built.lines.push(...hospComandaItemsToPreviewLines(hosp.items));
        built.subtotal = round2(built.subtotal + hosp.subtotal);
    }
    if (built.lines.length === 0) {
        built.lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: String(appt.title || 'Agendamento'),
            quantity: 1,
            unit_sale_amount: 0,
            line_total: 0,
            sort_order: 0,
        });
    }
    return {
        lines: built.lines,
        subtotal: built.subtotal,
        unit_id: appt.unit_id ?? null,
        guardian_id: appt.guardian_id ?? null,
    };
}
async function buildPreviewForHospitalization(clinicId, hospitalizationId) {
    const { data: hosp, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, clinic_id, unit_id, guardian_id, pet_id, status, admitted_at, discharged_at, billing_waived_at, hub_encounter_id, hub_appointment_id, daily_hub_service_type_id, daily_unit_amount, deleted_at')
        .eq('id', hospitalizationId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!hosp)
        throw new Error('NOT_FOUND');
    if (!(0, hubHospitalizationBilling_1.isHospitalizationClosed)(String(hosp.status)))
        throw new Error('NOT_READY');
    if (hosp.billing_waived_at)
        throw new Error('WAIVED');
    const loaded = await (0, hubHospitalizationBilling_1.loadHospitalizationComandaItems)({
        clinicId,
        hospitalizationId,
        encounterId: hosp.hub_encounter_id ?? null,
        appointmentId: hosp.hub_appointment_id ?? null,
        defaultPetId: hosp.pet_id ?? null,
    });
    const lines = hospComandaItemsToPreviewLines(loaded.items);
    const subtotal = loaded.subtotal;
    if (!lines.length) {
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: hospitalizationId,
            hub_service_type_id: null,
            description: 'Internação (sem linhas de cobrança)',
            quantity: 1,
            unit_sale_amount: 0,
            line_total: 0,
            sort_order: 0,
        });
    }
    return {
        lines,
        subtotal: round2(subtotal),
        unit_id: hosp.unit_id ?? null,
        guardian_id: hosp.guardian_id ?? null,
    };
}
async function buildPreviewForQuote(clinicId, quoteId) {
    const { data: quote, error: qErr } = await supabase_1.supabaseAdmin
        .from('hub_quotes')
        .select('id, clinic_id, unit_id, guardian_id, status, total_amount, discount_kind, discount_value, billing_state, billing_waived_at')
        .eq('id', quoteId)
        .maybeSingle();
    if (qErr)
        throw new Error(qErr.message);
    if (!quote || quote.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    const { data: qLines, error: lErr } = await supabase_1.supabaseAdmin
        .from('hub_quote_lines')
        .select('id, hub_service_type_id, description, quantity, unit_price, discount_amount, line_total, sort_order')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true });
    if (lErr)
        throw new Error(lErr.message);
    const serviceTypeIds = [
        ...new Set((qLines ?? []).map((row) => row.hub_service_type_id).filter(Boolean)),
    ];
    let serviceTypeNameById = new Map();
    if (serviceTypeIds.length) {
        const { data: serviceTypes, error: svcErr } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, name')
            .in('id', serviceTypeIds);
        if (svcErr)
            throw new Error(svcErr.message);
        serviceTypeNameById = new Map((serviceTypes ?? []).map((svc) => [svc.id, String(svc.name || 'Serviço')]));
    }
    const lines = [];
    let subtotal = 0;
    let idx = 0;
    for (const row of qLines ?? []) {
        const lt = Number(row.line_total ?? 0);
        const qty = Number(row.quantity ?? 1);
        const unit = qty > 0 ? round2(lt / qty) : lt;
        const serviceTypeId = row.hub_service_type_id ?? null;
        const description = String(row.description || '').trim() || (serviceTypeId ? serviceTypeNameById.get(serviceTypeId) : null) || 'Serviço';
        subtotal += lt;
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'quote_line',
            source_line_id: row.id,
            hub_service_type_id: serviceTypeId,
            description,
            quantity: qty,
            unit_sale_amount: unit,
            line_total: lt,
            sort_order: idx++,
        });
    }
    if (lines.length === 0) {
        const total = Number(quote.total_amount ?? 0);
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: 'Orçamento',
            quantity: 1,
            unit_sale_amount: total,
            line_total: total,
            sort_order: 0,
        });
        subtotal = total;
    }
    let unitId = quote.unit_id ?? null;
    if (!unitId) {
        unitId = await resolveClinicDefaultUnitId(clinicId);
    }
    const subtotalRounded = round2(subtotal);
    const usedFallbackTotal = (qLines ?? []).length === 0;
    const discountKind = quote.discount_kind ?? null;
    const discountValue = quote.discount_value;
    const discountAmount = usedFallbackTotal ? 0 : (0, hubQuoteDiscount_1.quoteDiscountAmount)(subtotalRounded, discountKind, discountValue);
    const finalAmount = usedFallbackTotal
        ? subtotalRounded
        : (0, hubQuoteDiscount_1.applyQuoteDiscount)(subtotalRounded, discountKind, discountValue);
    return {
        lines,
        subtotal: subtotalRounded,
        discount_amount: discountAmount,
        final_amount: finalAmount,
        unit_id: unitId,
        guardian_id: quote.guardian_id ?? null,
    };
}
const previewQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    source_type: hubFinanceSchemas_1.financeSourceTypeSchema,
    source_id: uuidStr,
})
    .strict();
const getHubFinancePaymentMethodSettings = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const settings = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(parsed.data);
        return res.json({
            accepted_payment_methods: settings.accepted_payment_methods,
            card_machine_fees: settings.card_machine_fees,
        });
    }
    catch (e) {
        console.error('[hub_finance] getPaymentMethodSettings', e);
        return res.status(500).json({ error: 'Erro ao carregar formas de pagamento' });
    }
};
exports.getHubFinancePaymentMethodSettings = getHubFinancePaymentMethodSettings;
const patchHubFinancePaymentMethodSettings = async (req, res) => {
    try {
        const body = hubPaymentMethods_1.patchPaymentMethodSettingsSchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, accepted_payment_methods, card_machine_fees: feesPatch } = body.data;
        await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinic_id);
        const patch = {};
        if (accepted_payment_methods !== undefined) {
            patch.accepted_payment_methods = accepted_payment_methods;
        }
        if (feesPatch !== undefined) {
            const { parseCardMachineFeesInput } = await Promise.resolve().then(() => __importStar(require('./hubCardMachineFees.js')));
            try {
                const current = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinic_id);
                patch.card_machine_fees = parseCardMachineFeesInput({
                    debit_card: feesPatch.debit_card ?? current.card_machine_fees.debit_card,
                    credit_card: feesPatch.credit_card ?? current.card_machine_fees.credit_card,
                });
            }
            catch (err) {
                return res.status(400).json({ error: err.message || 'Taxas da maquininha inválidas' });
            }
        }
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_clinic_settings')
            .update(patch)
            .eq('clinic_id', clinic_id);
        if (error) {
            console.error('[hub_finance] patchPaymentMethodSettings', error);
            return res.status(500).json({ error: error.message });
        }
        const settings = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinic_id);
        return res.json({
            accepted_payment_methods: settings.accepted_payment_methods,
            card_machine_fees: settings.card_machine_fees,
        });
    }
    catch (e) {
        console.error('[hub_finance] patchPaymentMethodSettings', e);
        return res.status(500).json({ error: 'Erro ao gravar formas de pagamento' });
    }
};
exports.patchHubFinancePaymentMethodSettings = patchHubFinancePaymentMethodSettings;
const getHubFinancePreview = async (req, res) => {
    try {
        const parsed = previewQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id, source_type e source_id (UUID) são obrigatórios' });
        }
        const { clinic_id, source_type, source_id } = parsed.data;
        let built;
        if (source_type === 'grooming_session') {
            built = await buildPreviewForGroomingSession(clinic_id, source_id);
        }
        else if (source_type === 'encounter') {
            built = await buildPreviewForEncounter(clinic_id, source_id);
        }
        else if (source_type === 'appointment') {
            built = await buildPreviewForAppointment(clinic_id, source_id);
        }
        else if (source_type === 'boarding_reservation') {
            built = await buildPreviewForBoardingReservation(clinic_id, source_id);
        }
        else if (source_type === 'hospitalization') {
            built = await buildPreviewForHospitalization(clinic_id, source_id);
        }
        else {
            built = await buildPreviewForQuote(clinic_id, source_id);
        }
        const chargeAmount = 'final_amount' in built && typeof built.final_amount === 'number' ? built.final_amount : built.subtotal;
        return res.json({
            preview: {
                source_type,
                source_id,
                estimated_amount: chargeAmount,
                unit_id: built.unit_id,
                guardian_id: built.guardian_id,
                lines: built.lines.map((l) => ({
                    line_kind: l.line_kind,
                    description: l.description,
                    quantity: l.quantity,
                    unit_sale_amount: l.unit_sale_amount,
                    line_total: l.line_total,
                })),
            },
        });
    }
    catch (e) {
        const msg = e?.message;
        if (msg === 'NOT_FOUND')
            return res.status(404).json({ error: 'Fonte não encontrada' });
        if (msg === 'NOT_READY')
            return res.status(409).json({ error: 'Origem não está pronta para cobrança' });
        if (msg === 'WAIVED')
            return res.status(409).json({ error: 'Origem marcada sem cobrança' });
        console.error('getHubFinancePreview', e);
        return res.status(500).json({ error: msg || 'Erro ao pré-visualizar' });
    }
};
exports.getHubFinancePreview = getHubFinancePreview;
const createReceivableBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    source_type: hubFinanceSchemas_1.receivableSourceTypeSchema,
    source_id: uuidStr.optional(),
    unit_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    competence_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    lines: zod_1.z
        .array(zod_1.z
        .object({
        description: zod_1.z.string().trim().min(1).max(300),
        quantity: zod_1.z.number().positive().optional(),
        unit_sale_amount: zod_1.z.number().min(0),
    })
        .strict())
        .optional(),
})
    .strict();
/**
 * Cobrança nascida vencida (ex.: dívida antiga lançada manualmente) já entra como
 * pendência para o caixa/financeiro. Varredura periódica de vencidos fica para depois.
 */
function maybeNotifyOverdueReceivable(opts) {
    if (!opts.dueDate)
        return;
    const today = new Date().toISOString().slice(0, 10);
    if (opts.dueDate >= today)
        return;
    void (0, hubNotifyEvents_1.notifyHubPaymentDue)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        receivableId: opts.receivableId,
        guardianId: opts.guardianId,
        amount: opts.amount,
        dueDate: opts.dueDate,
        reason: 'overdue',
    });
}
const postHubFinanceReceivable = async (req, res) => {
    try {
        const parsed = createReceivableBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, source_type, source_id, unit_id, guardian_id, due_date, competence_date, notes, lines: manualLines, } = parsed.data;
        if (source_type !== 'manual' && !source_id) {
            return res.status(400).json({ error: 'source_id é obrigatório para origem operacional' });
        }
        if (source_type === 'manual' && (!unit_id || !manualLines?.length)) {
            return res.status(400).json({ error: 'unit_id e linhas são obrigatórios para recebível manual' });
        }
        const keys = await fetchActiveReceivableKeys(clinic_id);
        if (source_id && keys.has(`${source_type}:${source_id}`)) {
            return res.status(409).json({ error: 'Já existe cobrança para esta origem' });
        }
        if (source_type === 'manual') {
            const manualSourceId = (0, node_crypto_1.randomUUID)();
            const builtLines = (manualLines ?? []).map((line, idx) => {
                const qty = Number(line.quantity ?? 1);
                const unit = round2(line.unit_sale_amount);
                return {
                    clinic_id: '',
                    receivable_id: '',
                    line_kind: 'manual',
                    source_line_id: null,
                    hub_service_type_id: null,
                    description: line.description.trim(),
                    quantity: qty,
                    unit_sale_amount: unit,
                    line_total: round2(qty * unit),
                    sort_order: idx,
                };
            });
            const subtotal = round2(builtLines.reduce((sum, line) => sum + Number(line.line_total ?? 0), 0));
            if (subtotal <= 0)
                return res.status(400).json({ error: 'Valor do recebível manual deve ser maior que zero' });
            const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .insert({
                clinic_id,
                unit_id,
                guardian_id: guardian_id ?? null,
                source_type,
                source_id: manualSourceId,
                original_amount: subtotal,
                final_amount: subtotal,
                net_amount_at_sale: subtotal,
                returned_amount: 0,
                status: 'pending',
                due_date: due_date ?? null,
                competence_date: competence_date ?? null,
                notes: notes ?? null,
            })
                .select('id')
                .single();
            if (rErr || !rec)
                return res.status(500).json({ error: rErr?.message || 'Erro ao criar recebível manual' });
            const receivableId = rec.id;
            const commissionByKey = await (0, hubCommissionAccrual_1.accrueCommissionSnapshots)({
                clinicId: clinic_id,
                lines: builtLines.map((line, idx) => ({
                    key: `manual-${idx}`,
                    line_total: Number(line.line_total ?? 0),
                    quantity: Number(line.quantity ?? 1) || 1,
                    hub_service_type_id: null,
                    hub_inventory_item_id: null,
                    item_kind: 'fee',
                    origin_type: 'manual_line',
                    origin_id: null,
                    sold_by_staff_id: null,
                })),
                originalAmount: subtotal,
                netAmountAtSale: subtotal,
                actingUserId: req.user?.id ?? null,
                allowActingUserAsSaleAuthor: false,
            });
            const { error: lnErr } = await supabase_1.supabaseAdmin.from('hub_receivable_lines').insert(builtLines.map((line, idx) => ({
                ...line,
                clinic_id,
                receivable_id: receivableId,
                ...(0, hubCommissionAccrual_1.snapshotToInsertFields)(commissionByKey.get(`manual-${idx}`)),
            })));
            if (lnErr) {
                await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
                return res.status(500).json({ error: lnErr.message });
            }
            maybeNotifyOverdueReceivable({
                clinicId: clinic_id,
                unitId: unit_id ?? null,
                receivableId,
                guardianId: guardian_id ?? null,
                amount: subtotal,
                dueDate: due_date ?? null,
            });
            const detail = await buildReceivableDetail(receivableId, clinic_id);
            return res.status(201).json({ receivable: detail });
        }
        if (source_type === 'grooming_session') {
            const { data: s, error: sErr } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('id, clinic_id, grooming_stage, billing_waived_at')
                .eq('id', source_id)
                .maybeSingle();
            if (sErr || !s || s.clinic_id !== clinic_id)
                return res.status(404).json({ error: 'Sessão não encontrada' });
            if (s.grooming_stage !== 'closed') {
                return res.status(409).json({ error: 'Só é possível gerar cobrança com sessão encerrada (closed)' });
            }
            if (s.billing_waived_at)
                return res.status(409).json({ error: 'Sessão marcada sem cobrança' });
        }
        else if (source_type === 'encounter') {
            const { data: e, error: eErr } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('id, clinic_id, status, billing_waived_at')
                .eq('id', source_id)
                .maybeSingle();
            if (eErr || !e || e.clinic_id !== clinic_id)
                return res.status(404).json({ error: 'Atendimento não encontrado' });
            if (e.status !== 'completed') {
                return res.status(409).json({ error: 'Só é possível gerar cobrança com encounter concluído' });
            }
            if (e.billing_waived_at)
                return res.status(409).json({ error: 'Atendimento marcado sem cobrança' });
        }
        else if (source_type === 'appointment') {
            const { data: a, error: aErr } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .select('id, clinic_id, status, billing_waived_at')
                .eq('id', source_id)
                .maybeSingle();
            if (aErr || !a || a.clinic_id !== clinic_id)
                return res.status(404).json({ error: 'Agendamento não encontrado' });
            if (!['done', 'paid'].includes(String(a.status))) {
                return res.status(409).json({ error: 'Só é possível gerar cobrança com agendamento concluído' });
            }
            const [{ data: enc }, { data: groom }] = await Promise.all([
                supabase_1.supabaseAdmin
                    .from('hub_encounters')
                    .select('id')
                    .eq('hub_appointment_id', source_id)
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null)
                    .maybeSingle(),
                supabase_1.supabaseAdmin
                    .from('hub_grooming_sessions')
                    .select('id')
                    .eq('hub_appointment_id', source_id)
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null)
                    .maybeSingle(),
            ]);
            if (enc || groom) {
                return res.status(409).json({
                    error: 'Este agendamento possui operação vinculada; gere a cobrança pela operação.',
                });
            }
            if (a.billing_waived_at)
                return res.status(409).json({ error: 'Agendamento marcado sem cobrança' });
        }
        else if (source_type === 'boarding_reservation') {
            const { data: b, error: bErr } = await supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .select('id, clinic_id, status, billing_waived_at')
                .eq('id', source_id)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (bErr || !b)
                return res.status(404).json({ error: 'Reserva não encontrada' });
            if (!(0, boardingOperational_1.isBoardingStatusReadyForComanda)(String(b.status ?? ''), { allowIncomplete: true })) {
                return res.status(409).json({ error: 'Reserva não está pronta para cobrança' });
            }
            if (b.billing_waived_at)
                return res.status(409).json({ error: 'Reserva marcada sem cobrança' });
        }
        else {
            const { data: q, error: qErr } = await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .select('id, clinic_id, status, billing_state, billing_waived_at')
                .eq('id', source_id)
                .maybeSingle();
            if (qErr || !q || q.clinic_id !== clinic_id)
                return res.status(404).json({ error: 'Orçamento não encontrado' });
            if (q.status !== 'accepted')
                return res.status(409).json({ error: 'Orçamento tem de estar aceite' });
            if (q.billing_state === 'receivable_created') {
                return res.status(409).json({ error: 'Orçamento já tem cobrança criada' });
            }
            if (q.billing_waived_at)
                return res.status(409).json({ error: 'Orçamento marcado sem cobrança' });
        }
        let built;
        if (source_type === 'grooming_session') {
            built = await buildPreviewForGroomingSession(clinic_id, source_id);
        }
        else if (source_type === 'encounter') {
            built = await buildPreviewForEncounter(clinic_id, source_id);
        }
        else if (source_type === 'appointment') {
            built = await buildPreviewForAppointment(clinic_id, source_id);
        }
        else if (source_type === 'boarding_reservation') {
            built = await buildPreviewForBoardingReservation(clinic_id, source_id);
        }
        else {
            built = await buildPreviewForQuote(clinic_id, source_id);
        }
        const finalAmount = 'final_amount' in built && typeof built.final_amount === 'number' ? built.final_amount : built.subtotal;
        if (source_type === 'appointment' || source_type === 'grooming_session') {
            const executorCheck = await (0, hubCommissionAccrual_1.assertServiceLinesHaveExecutor)(clinic_id, built.lines.map((l) => ({
                origin_type: l.line_kind === 'appointment_service'
                    ? 'appointment_service'
                    : l.line_kind === 'grooming_extra'
                        ? 'grooming_extra'
                        : null,
                origin_id: l.source_line_id ?? null,
                source_line_id: l.source_line_id ?? null,
                line_kind: l.line_kind ?? null,
                description: l.description ?? null,
            })));
            if (!executorCheck.ok) {
                return res.status(409).json({
                    error: executorCheck.message,
                    code: 'COMMISSION_EXECUTOR_REQUIRED',
                    missing: executorCheck.missing,
                });
            }
        }
        const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .insert({
            clinic_id,
            unit_id: built.unit_id,
            guardian_id: built.guardian_id,
            source_type,
            source_id: source_id,
            original_amount: built.subtotal,
            final_amount: finalAmount,
            net_amount_at_sale: finalAmount,
            returned_amount: 0,
            status: 'pending',
            notes: notes ?? null,
        })
            .select('id')
            .single();
        if (rErr || !rec) {
            console.error('postHubFinanceReceivable insert', rErr);
            return res.status(500).json({ error: rErr?.message || 'Erro ao criar recebível' });
        }
        const receivableId = rec.id;
        const commissionByKey = await (0, hubCommissionAccrual_1.accrueCommissionSnapshots)({
            clinicId: clinic_id,
            lines: built.lines.map((l, i) => ({
                key: String(l.source_line_id ?? `direct-${i}`),
                line_total: Number(l.line_total ?? 0),
                quantity: Number(l.quantity ?? 1) || 1,
                hub_service_type_id: l.hub_service_type_id ?? null,
                hub_inventory_item_id: l.hub_inventory_item_id ?? null,
                item_kind: l.hub_inventory_item_id ? 'product' : 'service',
                origin_type: l.line_kind === 'appointment_service'
                    ? 'appointment_service'
                    : l.line_kind === 'grooming_extra'
                        ? 'grooming_extra'
                        : l.line_kind === 'quote_line'
                            ? 'quote_line'
                            : l.hub_inventory_item_id
                                ? 'manual_line'
                                : null,
                origin_id: l.source_line_id ?? null,
                sold_by_staff_id: null,
                source_line_id: l.source_line_id ?? null,
            })),
            originalAmount: built.subtotal,
            netAmountAtSale: finalAmount,
            actingUserId: req.user?.id ?? null,
            allowActingUserAsSaleAuthor: false,
        });
        const lineRows = built.lines.map((l, i) => ({
            clinic_id,
            receivable_id: receivableId,
            line_kind: l.line_kind,
            source_line_id: l.source_line_id,
            hub_service_type_id: l.hub_service_type_id,
            hub_inventory_item_id: l.hub_inventory_item_id ?? null,
            hub_inventory_lot_id: l.hub_inventory_lot_id ?? null,
            description: l.description,
            quantity: l.quantity,
            unit_sale_amount: l.unit_sale_amount,
            line_total: l.line_total,
            sort_order: l.sort_order ?? i,
            ...(0, hubCommissionAccrual_1.snapshotToInsertFields)(commissionByKey.get(String(l.source_line_id ?? `direct-${i}`))),
        }));
        const { error: lnErr } = await supabase_1.supabaseAdmin.from('hub_receivable_lines').insert(lineRows);
        if (lnErr) {
            await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
            console.error('postHubFinanceReceivable lines', lnErr);
            return res.status(500).json({ error: lnErr.message });
        }
        if (source_type === 'quote') {
            await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_state: 'receivable_created' })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
        }
        const { data: full } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('*, lines:hub_receivable_lines(*)')
            .eq('id', receivableId)
            .single();
        return res.status(201).json({ receivable: full });
    }
    catch (e) {
        console.error('postHubFinanceReceivable', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivable = postHubFinanceReceivable;
const waiveBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    source_type: hubFinanceSchemas_1.financeSourceTypeSchema,
    source_id: uuidStr,
    reason: zod_1.z.string().trim().min(3).max(2000),
})
    .strict();
const postHubFinanceWaiveBilling = async (req, res) => {
    try {
        const parsed = waiveBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, source_type, source_id, reason } = parsed.data;
        const keys = await fetchActiveReceivableKeys(clinic_id);
        if (keys.has(`${source_type}:${source_id}`)) {
            return res.status(409).json({ error: 'Já existe cobrança; não é possível fazer waive' });
        }
        const now = new Date().toISOString();
        if (source_type === 'grooming_session') {
            const { data: groomRow, error } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id)
                .select('hub_appointment_id')
                .maybeSingle();
            if (error)
                return res.status(500).json({ error: error.message });
            const linkedApptId = groomRow?.hub_appointment_id ?? null;
            if (linkedApptId) {
                const { error: apptWaiveErr } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ billing_waived_at: now, billing_waive_reason: reason })
                    .eq('id', linkedApptId)
                    .eq('clinic_id', clinic_id)
                    .is('billing_waived_at', null);
                if (apptWaiveErr)
                    return res.status(500).json({ error: apptWaiveErr.message });
            }
        }
        else if (source_type === 'encounter') {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error)
                return res.status(500).json({ error: error.message });
            try {
                await cascadeWaiveLinkedHospitalizations({
                    clinicId: clinic_id,
                    originType: 'encounter',
                    originId: source_id,
                    waivedAt: now,
                    reason,
                });
            }
            catch (cascadeErr) {
                return res.status(500).json({ error: cascadeErr?.message || 'Erro ao dispensar internações vinculadas' });
            }
        }
        else if (source_type === 'appointment') {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error)
                return res.status(500).json({ error: error.message });
            const { error: groomWaiveErr } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('hub_appointment_id', source_id)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .is('billing_waived_at', null);
            if (groomWaiveErr)
                return res.status(500).json({ error: groomWaiveErr.message });
            try {
                await cascadeWaiveLinkedHospitalizations({
                    clinicId: clinic_id,
                    originType: 'appointment',
                    originId: source_id,
                    waivedAt: now,
                    reason,
                });
            }
            catch (cascadeErr) {
                return res.status(500).json({ error: cascadeErr?.message || 'Erro ao dispensar internações vinculadas' });
            }
        }
        else if (source_type === 'boarding_reservation') {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error)
                return res.status(500).json({ error: error.message });
        }
        else if (source_type === 'hospitalization') {
            const { data: hosp, error: hErr } = await supabase_1.supabaseAdmin
                .from('hub_hospitalizations')
                .select('id, status, billing_waived_at')
                .eq('id', source_id)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (hErr)
                return res.status(500).json({ error: hErr.message });
            if (!hosp)
                return res.status(404).json({ error: 'Internação não encontrada' });
            if (!(0, hubHospitalizationBilling_1.isHospitalizationClosed)(String(hosp.status))) {
                return res.status(409).json({ error: 'Só é possível dispensar cobrança após a alta da internação' });
            }
            if (hosp.billing_waived_at) {
                return res.status(409).json({ error: 'Internação já marcada sem cobrança' });
            }
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_hospitalizations')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error) {
                if (String(error.message || '').includes('billing_waived')) {
                    return res.status(503).json({
                        error: 'Colunas de waive da internação ausentes. Aplique 133_alter_hub_hospitalizations_billing.sql.',
                    });
                }
                return res.status(500).json({ error: error.message });
            }
        }
        else {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error)
                return res.status(500).json({ error: error.message });
        }
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('postHubFinanceWaiveBilling', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceWaiveBilling = postHubFinanceWaiveBilling;
const paymentBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    amount: zod_1.z.number().positive(),
    payment_method: hubPaymentMethods_1.hubPaymentMethodSchema,
    installments: zod_1.z.number().int().min(1).max(99).optional(),
    payment_date: zod_1.z.string().datetime({ offset: true }).optional(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    cash_session_id: uuidStr.optional().nullable(),
    idempotency_key: uuidStr.optional().nullable(),
    tendered_amount: zod_1.z.number().positive().optional().nullable(),
})
    .strict();
const postHubFinanceReceivablePayment = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = paymentBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'receivable id ou body inválidos' });
        }
        const receivableId = idParsed.data;
        const { clinic_id, amount, payment_method, installments, payment_date, notes, cash_session_id, idempotency_key, tendered_amount, } = parsed.data;
        const userId = req.user?.id ?? null;
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
        const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, clinic_id, unit_id, comanda_id, guardian_id, due_date, status, final_amount')
            .eq('id', receivableId)
            .maybeSingle();
        if (rErr || !rec || rec.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Recebível não encontrado' });
        if (rec.status === 'cancelled' || rec.status === 'refunded') {
            return res.status(409).json({ error: 'Recebível não aceita pagamentos neste estado' });
        }
        const cashCheck = await (0, hubFinanceLedger_1.validatePaymentCashSession)({
            clinicId: clinic_id,
            paymentMethod: payment_method,
            cashSessionId: cash_session_id ?? null,
            receivableUnitId: rec.unit_id ?? null,
        });
        if (!cashCheck.ok) {
            return res.status(cashCheck.status).json({ error: cashCheck.error });
        }
        const validatedCashSessionId = cashCheck.cash_session_id;
        const paidSoFar = await (0, hubFinanceLedger_1.netPaidEffectiveForReceivable)(receivableId);
        const finalAmt = Number(rec.final_amount ?? 0);
        const remaining = round2(finalAmt - paidSoFar);
        if (round2(amount) > remaining + 0.02) {
            return res.status(400).json({ error: `Valor excede o saldo em aberto (${remaining.toFixed(2)})` });
        }
        if (payment_method === 'cash' && tendered_amount != null) {
            const tendered = round2(Number(tendered_amount));
            if (round2(amount) > tendered + 0.009) {
                return res.status(400).json({
                    error: 'Valor do pagamento em dinheiro não pode exceder o valor recebido (tendered).',
                });
            }
        }
        if (payment_method === 'customer_credit') {
            const guardianId = rec.guardian_id;
            if (!guardianId) {
                return res.status(409).json({ error: 'Recebível sem tutor — não é possível pagar com crédito.' });
            }
            try {
                await (0, hubCustomerCredit_1.consumeHubCustomerCredit)({
                    clinicId: clinic_id,
                    guardianId,
                    amount: round2(amount),
                    reason: 'Pagamento com crédito do tutor',
                    comandaId: rec.comanda_id ?? null,
                    receivableId,
                    createdByUserId: userId,
                });
            }
            catch (e) {
                if (e instanceof hubCustomerCredit_1.CustomerCreditError) {
                    return res.status(e.status).json({ error: e.message });
                }
                throw e;
            }
        }
        const payAt = payment_date ?? new Date().toISOString();
        let tenderedAmount = null;
        let changeAmount = null;
        let paymentNotes = notes ?? null;
        if (payment_method === 'cash' && tendered_amount != null) {
            tenderedAmount = round2(Number(tendered_amount));
            const recorded = round2(amount);
            changeAmount = round2(Math.max(0, tenderedAmount - recorded));
            if (changeAmount > 0.009) {
                const trocoNote = `Troco R$ ${changeAmount.toFixed(2)} (recebido R$ ${tenderedAmount.toFixed(2)})`;
                paymentNotes = paymentNotes ? `${paymentNotes} | ${trocoNote}` : trocoNote;
            }
        }
        const { insertPostedPaymentWithIdempotency } = await Promise.resolve().then(() => __importStar(require('./hubFinanceLedger.js')));
        const inserted = await insertPostedPaymentWithIdempotency({
            clinicId: clinic_id,
            receivableId,
            cashSessionId: validatedCashSessionId,
            amount: round2(amount),
            paymentMethod: payment_method,
            installments: installments ?? 1,
            paymentDate: payAt,
            effectivePaymentDate: payAt,
            notes: paymentNotes,
            createdByUserId: userId,
            idempotencyKey: idempotency_key ?? null,
            tenderedAmount,
            changeAmount,
        });
        if (!inserted.ok) {
            return res.status(inserted.status ?? 500).json({
                error: inserted.error,
                ...(inserted.existing ? { existing_payment: inserted.existing } : {}),
            });
        }
        if (inserted.replayed) {
            const nextStatus = await (0, hubFinanceLedger_1.recalculateReceivableFromPosted)(receivableId);
            return res.status(200).json({
                payment: inserted.payment,
                receivable_status: nextStatus,
                replayed: true,
            });
        }
        const pay = inserted.payment;
        const nextStatus = await (0, hubFinanceLedger_1.recalculateReceivableFromPosted)(receivableId);
        const paid = await (0, hubFinanceLedger_1.sumPostedPaymentsForReceivable)(receivableId);
        // Encerra comanda aberta se quitada; sempre sincroniza financial_status (também se fechada).
        if (rec.comanda_id) {
            try {
                await (0, hubComandasController_1.tryAutoCloseComanda)(rec.comanda_id, clinic_id);
            }
            catch (closeErr) {
                console.error('postHubFinanceReceivablePayment tryAutoCloseComanda', rec.comanda_id, closeErr);
            }
            try {
                await syncComandaFinancialAfterLedger(rec.comanda_id, clinic_id);
            }
            catch (syncErr) {
                console.error('postHubFinanceReceivablePayment syncComandaFinancial', rec.comanda_id, syncErr);
            }
        }
        if (nextStatus === 'partially_paid') {
            void (0, hubNotifyEvents_1.notifyHubPaymentDue)({
                clinicId: clinic_id,
                unitId: rec.unit_id,
                receivableId,
                guardianId: rec.guardian_id,
                amount: round2(finalAmt - paid),
                dueDate: rec.due_date,
                reason: 'partial',
            });
        }
        return res.status(201).json({ payment: pay, receivable_status: nextStatus });
    }
    catch (e) {
        console.error('postHubFinanceReceivablePayment', e);
        if (e instanceof hubFinanceLedger_1.FinanceLedgerError) {
            return res.status(e.status).json({ error: e.message });
        }
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivablePayment = postHubFinanceReceivablePayment;
const receivableProductLineSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    item_id: uuidStr,
    lot_id: uuidStr,
    quantity: zod_1.z.number().positive(),
    unit_sale_amount: zod_1.z.number().min(0),
    description: zod_1.z.string().trim().max(300).optional().nullable(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
})
    .strict();
const postHubFinanceReceivableProductLine = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = receivableProductLineSchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const receivableId = idParsed.data;
        const { clinic_id, item_id, lot_id, quantity, unit_sale_amount, description, notes } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data: rec, error: recErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, clinic_id, status, original_amount, final_amount')
            .eq('id', receivableId)
            .maybeSingle();
        if (recErr || !rec || rec.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Recebível não encontrado' });
        if (['cancelled', 'refunded'].includes(String(rec.status))) {
            return res.status(409).json({ error: 'Recebível não aceita novos produtos neste estado' });
        }
        const { data: item, error: itemErr } = await supabase_1.supabaseAdmin
            .from('hub_inventory_items')
            .select('id, clinic_id, name, sale_amount, cost_amount, max_sale_discount_pct, allow_price_override_on_sale, deleted_at, active')
            .eq('id', item_id)
            .maybeSingle();
        if (itemErr || !item || item.clinic_id !== clinic_id || item.deleted_at || item.active === false) {
            return res.status(404).json({ error: 'Produto não encontrado ou inativo' });
        }
        const stockErr = await (0, hubInventoryStockUtils_1.validateLotStockForOut)(clinic_id, item_id, lot_id, quantity);
        if (stockErr) {
            return res.status(400).json({ error: stockErr });
        }
        const unitSale = round2(unit_sale_amount || Number(item.sale_amount ?? 0));
        const priced = (0, productSalePriceRules_1.validateProductSalePricing)({
            item: item,
            quantity,
            unit_amount: unitSale,
            discount_amount: 0,
        });
        if (!priced.ok)
            return res.status(400).json({ error: priced.error });
        const lineTotal = round2(unitSale * quantity);
        const productCommission = await (0, hubCommissionAccrual_1.accrueCommissionSnapshots)({
            clinicId: clinic_id,
            lines: [
                {
                    key: 'product-line',
                    line_total: lineTotal,
                    quantity,
                    hub_service_type_id: null,
                    hub_inventory_item_id: item_id,
                    item_kind: 'product',
                    origin_type: 'manual_line',
                    origin_id: null,
                    sold_by_staff_id: null,
                },
            ],
            originalAmount: lineTotal,
            netAmountAtSale: lineTotal,
            actingUserId: userId,
            allowActingUserAsSaleAuthor: true,
        });
        const [{ data: maxRows }, { data: line, error: lineErr }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_receivable_lines')
                .select('sort_order')
                .eq('receivable_id', receivableId)
                .order('sort_order', { ascending: false })
                .limit(1),
            supabase_1.supabaseAdmin
                .from('hub_receivable_lines')
                .insert({
                clinic_id,
                receivable_id: receivableId,
                line_kind: 'product',
                source_line_id: null,
                hub_service_type_id: null,
                hub_inventory_item_id: item_id,
                hub_inventory_lot_id: lot_id,
                description: description?.trim() || String(item.name || 'Produto'),
                quantity,
                unit_sale_amount: unitSale,
                unit_cost_amount: item.cost_amount != null && Number.isFinite(Number(item.cost_amount))
                    ? round2(Number(item.cost_amount))
                    : null,
                line_total: lineTotal,
                sort_order: 9999,
                ...(0, hubCommissionAccrual_1.snapshotToInsertFields)(productCommission.get('product-line')),
            })
                .select('*')
                .single(),
        ]);
        if (lineErr || !line)
            return res.status(500).json({ error: lineErr?.message || 'Erro ao adicionar produto' });
        const nextSort = Number(maxRows?.[0]?.sort_order ?? 0) + 1;
        await supabase_1.supabaseAdmin.from('hub_receivable_lines').update({ sort_order: nextSort }).eq('id', line.id);
        const stockResult = await (0, hubInventoryStockUtils_1.createSaleStockOut)({
            clinicId: clinic_id,
            itemId: item_id,
            lotId: lot_id,
            qty: quantity,
            unitCost: item.cost_amount != null && Number.isFinite(Number(item.cost_amount))
                ? Number(item.cost_amount)
                : null,
            notes: notes ?? `Venda vinculada ao recebível ${receivableId}`,
            referenceType: 'hub_receivable_line',
            referenceId: line.id,
            createdBy: userId,
        });
        if ('error' in stockResult) {
            await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('id', line.id);
            return res.status(400).json({ error: stockResult.error });
        }
        const original = round2(Number(rec.original_amount ?? 0) + lineTotal);
        const final = round2(Number(rec.final_amount ?? 0) + lineTotal);
        const { data: recMeta } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('returned_amount, net_amount_at_sale')
            .eq('id', receivableId)
            .maybeSingle();
        const returnedAmt = Number(recMeta?.returned_amount ?? 0);
        const patch = { original_amount: original, final_amount: final };
        // Snapshot ainda mutável: sem devolução e ainda não congelado por pagamento.
        if (returnedAmt <= 0.009) {
            const paid = await (0, hubFinanceLedger_1.sumPostedPaymentsForReceivable)(receivableId);
            if (paid <= 0.009)
                patch.net_amount_at_sale = final;
        }
        const { data: updated, error: updErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .update(patch)
            .eq('id', receivableId)
            .select('*, lines:hub_receivable_lines(*)')
            .single();
        if (updErr)
            return res.status(500).json({ error: updErr.message });
        await recalculateReceivableStatus(receivableId);
        return res.status(201).json({ receivable: updated, line: { ...line, sort_order: nextSort } });
    }
    catch (e) {
        console.error('postHubFinanceReceivableProductLine', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivableProductLine = postHubFinanceReceivableProductLine;
const deleteHubFinanceReceivableProductLine = async (req, res) => {
    try {
        const receivableId = uuidStr.safeParse(req.params.id);
        const lineId = uuidStr.safeParse(req.params.lineId);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!receivableId.success || !lineId.success || !clinicId.success) {
            return res.status(400).json({ error: 'receivable, lineId e clinic_id são obrigatórios' });
        }
        const { data: line, error: lineErr } = await supabase_1.supabaseAdmin
            .from('hub_receivable_lines')
            .select('*')
            .eq('id', lineId.data)
            .eq('receivable_id', receivableId.data)
            .eq('clinic_id', clinicId.data)
            .maybeSingle();
        if (lineErr || !line)
            return res.status(404).json({ error: 'Linha não encontrada' });
        if (line.line_kind !== 'product')
            return res.status(409).json({ error: 'Apenas linhas de produto podem ser removidas aqui' });
        const qty = Number(line.quantity ?? 0);
        // Remoção de linha = reversão comprovada de baixa indevida (não é devolução de cliente).
        if (line.hub_inventory_item_id && line.hub_inventory_lot_id && qty > 0) {
            const { restoreSaleStockIn } = await Promise.resolve().then(() => __importStar(require('./hubInventoryStockUtils.js')));
            const restored = await restoreSaleStockIn({
                clinicId: clinicId.data,
                itemId: line.hub_inventory_item_id,
                lotId: line.hub_inventory_lot_id,
                qty,
                referenceType: 'hub_receivable_line_removed',
                referenceId: line.id,
                notes: 'Reversão de produto removido de recebível',
                createdBy: req.user?.id ?? null,
            });
            if ('error' in restored) {
                return res.status(500).json({ error: restored.error });
            }
        }
        const { data: rec } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('original_amount, final_amount')
            .eq('id', receivableId.data)
            .single();
        await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('id', lineId.data);
        const delta = Number(line.line_total ?? 0);
        const original = round2(Math.max(0, Number(rec?.original_amount ?? 0) - delta));
        const final = round2(Math.max(0, Number(rec?.final_amount ?? 0) - delta));
        const { data: recMeta } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('returned_amount')
            .eq('id', receivableId.data)
            .maybeSingle();
        const returnedAmt = Number(recMeta?.returned_amount ?? 0);
        const patch = { original_amount: original, final_amount: final };
        if (returnedAmt <= 0.009) {
            const paid = await (0, hubFinanceLedger_1.sumPostedPaymentsForReceivable)(receivableId.data);
            if (paid <= 0.009)
                patch.net_amount_at_sale = final;
        }
        const { data: updated, error: updErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .update(patch)
            .eq('id', receivableId.data)
            .select('*, lines:hub_receivable_lines(*)')
            .single();
        if (updErr)
            return res.status(500).json({ error: updErr.message });
        await recalculateReceivableStatus(receivableId.data);
        return res.json({ receivable: updated });
    }
    catch (e) {
        console.error('deleteHubFinanceReceivableProductLine', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteHubFinanceReceivableProductLine = deleteHubFinanceReceivableProductLine;
const stockReturnLineSchema = zod_1.z
    .object({
    line_id: uuidStr,
    qty: zod_1.z.coerce.number().finite().positive().optional(),
})
    .strict();
const reversePaymentBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    reason: zod_1.z.string().trim().min(3).max(2000),
    mode: zod_1.z.enum(['payment_reversal', 'refund']).default('payment_reversal'),
    refund_method: hubPaymentMethods_1.hubPaymentMethodSchema.optional().nullable(),
    refund_effective_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    confirm_stock_return: zod_1.z.boolean().optional().default(false),
    stock_return_condition: zod_1.z.enum(['sellable', 'unsellable']).optional().nullable(),
    stock_return_lines: zod_1.z.array(stockReturnLineSchema).max(200).optional().nullable(),
})
    .strict()
    .superRefine((val, ctx) => {
    if (val.confirm_stock_return && !val.stock_return_condition) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'stock_return_condition é obrigatório quando confirm_stock_return=true',
            path: ['stock_return_condition'],
        });
    }
});
const postHubFinancePaymentReverse = async (req, res) => {
    try {
        const paymentId = uuidStr.safeParse(req.params.id);
        const parsed = reversePaymentBodySchema.safeParse(req.body);
        if (!paymentId.success || !parsed.success)
            return res.status(400).json({ error: 'Dados inválidos' });
        const { clinic_id, reason, mode, refund_method, refund_effective_date, confirm_stock_return, stock_return_condition, stock_return_lines, } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data: payment, error: pErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('id, clinic_id, receivable_id, status')
            .eq('id', paymentId.data)
            .maybeSingle();
        if (pErr || !payment || payment.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Pagamento não encontrado' });
        }
        const pendingCancellation = await paymentBelongsToPendingCancellation(clinic_id, payment.receivable_id);
        if (pendingCancellation) {
            return res.status(409).json({
                error: 'Este pagamento está em um cancelamento pendente. Resolva em Cancelamentos.',
            });
        }
        const result = await (0, hubFinanceLedger_1.reversePaymentSoft)({
            paymentId: paymentId.data,
            clinicId: clinic_id,
            userId,
            reason,
            mode: mode,
            refundMethod: refund_method ?? null,
            refundEffectiveDate: refund_effective_date ?? null,
            confirmStockReturn: confirm_stock_return,
            stockReturnCondition: stock_return_condition ?? undefined,
            stockReturnLines: stock_return_lines ?? undefined,
        });
        const { data: rec } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('comanda_id')
            .eq('id', result.receivable_id)
            .maybeSingle();
        const comandaId = rec?.comanda_id ?? null;
        // Reembolso total encerra a venda: anula a comanda para não voltar como pendência no caixa.
        // Anulação (payment_reversal) mantém a cobrança viva (T10 — re-cobrar).
        if (mode === 'refund' &&
            (result.receivable_status === 'refunded' || result.receivable_status === 'cancelled')) {
            await (0, hubComandasController_1.tryVoidComandaAfterSaleFinanciallyEnded)({
                clinicId: clinic_id,
                comandaId,
                reason,
            });
        }
        else {
            await syncComandaFinancialAfterLedger(comandaId, clinic_id);
        }
        return res.json({
            ok: true,
            receivable_status: result.receivable_status,
            reversal_mode: result.reversal_mode,
            adjustment_id: result.adjustment_id,
            warning: result.warning,
            stock_restored: result.stock_restored ?? 0,
            stock_unsellable: result.stock_unsellable ?? 0,
        });
    }
    catch (e) {
        if (e instanceof hubFinanceLedger_1.FinanceLedgerError) {
            return res.status(e.status).json({ error: e.message });
        }
        console.error('postHubFinancePaymentReverse', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinancePaymentReverse = postHubFinancePaymentReverse;
const historicalCashBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    amount: zod_1.z.number().positive(),
    effective_payment_date: zod_1.z.string().min(10),
    reason: zod_1.z.string().trim().min(3).max(2000),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    idempotency_key: uuidStr.optional().nullable(),
})
    .strict();
const postHubFinanceReceivableHistoricalCash = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = historicalCashBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Não autenticado' });
        const result = await (0, hubFinanceLedger_1.postHistoricalCashPayment)({
            receivableId: idParsed.data,
            clinicId: parsed.data.clinic_id,
            amount: parsed.data.amount,
            effectivePaymentDate: parsed.data.effective_payment_date,
            reason: parsed.data.reason,
            userId,
            notes: parsed.data.notes ?? null,
            idempotencyKey: parsed.data.idempotency_key ?? null,
        });
        const { data: rec } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('comanda_id')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (rec?.comanda_id) {
            try {
                await (0, hubComandasController_1.tryAutoCloseComanda)(rec.comanda_id, parsed.data.clinic_id);
            }
            catch (closeErr) {
                console.error('historicalCash tryAutoCloseComanda', rec.comanda_id, closeErr);
            }
            await syncComandaFinancialAfterLedger(rec.comanda_id, parsed.data.clinic_id);
        }
        return res.status(201).json({
            payment: result.payment,
            receivable_status: result.receivable_status,
        });
    }
    catch (e) {
        if (e instanceof hubFinanceLedger_1.FinanceLedgerError) {
            return res.status(e.status).json({ error: e.message });
        }
        console.error('postHubFinanceReceivableHistoricalCash', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivableHistoricalCash = postHubFinanceReceivableHistoricalCash;
const listPaymentsQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** posted = elegíveis a estorno (padrão); reversed = histórico já anulado. */
    status: zod_1.z.enum(['posted', 'reversed']).optional().default('posted'),
})
    .strict();
function oneEmbed(value) {
    if (value == null)
        return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}
function mapPaymentListRow(row, extras) {
    const receivable = oneEmbed(row.receivable);
    const guardian = receivable
        ? oneEmbed(receivable.guardian)
        : null;
    const session = oneEmbed(row.cash_session);
    const sessionStatus = session?.status === 'open' || session?.status === 'closed' ? session.status : null;
    const payStatus = String(row.status ?? 'posted') === 'reversed' ? 'reversed' : 'posted';
    const returnedAmount = Number(receivable?.returned_amount ?? 0);
    const lineRefundsAmount = round2(Number(extras?.lineRefundsAmount ?? 0));
    const isPartial = payStatus === 'posted' && (returnedAmount > 0.009 || lineRefundsAmount > 0.009);
    return {
        id: row.id,
        amount: Number(row.amount ?? 0),
        payment_method: row.payment_method,
        installments: Number(row.installments ?? 1),
        payment_date: row.payment_date,
        notes: row.notes ?? null,
        cash_session_status: sessionStatus,
        status: payStatus,
        list_kind: 'payment',
        settlement: isPartial ? 'partial' : 'full',
        line_refunds_amount: lineRefundsAmount,
        receivable: receivable
            ? {
                id: receivable.id,
                status: receivable.status,
                final_amount: Number(receivable.final_amount ?? 0),
                returned_amount: returnedAmount,
                source_type: receivable.source_type,
                comanda_id: receivable.comanda_id == null ? null : String(receivable.comanda_id),
                guardian_name: guardian?.full_name ?? null,
            }
            : null,
    };
}
function mapLineRefundListRow(adj) {
    const receivable = oneEmbed(adj.receivable);
    if (!receivable || receivable.deleted_at)
        return null;
    const guardian = oneEmbed(receivable.guardian);
    const amount = round2(Number(adj.amount ?? 0));
    if (amount <= 0.009)
        return null;
    // refund_effective_date é só calendário (date); fabricar T12:00 mostrava
    // sempre meio-dia em vez do horário real do lançamento. Usar created_at.
    return {
        id: `line-refund:${String(adj.id)}`,
        amount,
        payment_method: adj.refund_method ?? 'other',
        installments: 1,
        payment_date: adj.created_at,
        notes: adj.reason ?? null,
        cash_session_status: null,
        status: 'reversed',
        list_kind: 'line_refund',
        settlement: 'partial',
        line_refunds_amount: amount,
        receivable: {
            id: receivable.id,
            status: receivable.status,
            final_amount: Number(receivable.final_amount ?? 0),
            returned_amount: Number(receivable.returned_amount ?? 0),
            source_type: receivable.source_type,
            comanda_id: receivable.comanda_id == null ? null : String(receivable.comanda_id),
            guardian_name: guardian?.full_name ?? null,
        },
    };
}
async function sumLineRefundsByReceivable(clinicId, receivableIds) {
    const totals = new Map();
    if (receivableIds.length === 0)
        return totals;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_financial_adjustments')
        .select('receivable_id, amount')
        .eq('clinic_id', clinicId)
        .eq('adjustment_type', 'refund')
        .is('payment_id', null)
        .in('receivable_id', receivableIds);
    if (error) {
        if (/does not exist|schema cache|42P01/i.test(String(error.message)))
            return totals;
        throw new Error(error.message);
    }
    for (const row of data ?? []) {
        const id = String(row.receivable_id ?? '');
        if (!id)
            continue;
        totals.set(id, round2((totals.get(id) ?? 0) + Number(row.amount ?? 0)));
    }
    return totals;
}
/** Comandas com cancelamento operacional ainda sem decisão do financeiro. */
async function comandaIdsWithPendingCancellation(clinicId, comandaIds) {
    if (comandaIds.length === 0)
        return new Set();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id')
        .eq('clinic_id', clinicId)
        .in('id', comandaIds)
        .not('cancellation_pending_at', 'is', null)
        .is('cancellation_resolved_at', null)
        .is('deleted_at', null);
    if (error) {
        if (String(error.message || '').includes('cancellation_pending'))
            return new Set();
        throw new Error(error.message);
    }
    return new Set((data ?? []).map((row) => String(row.id)));
}
async function paymentBelongsToPendingCancellation(clinicId, receivableId) {
    const { data: receivable, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('comanda_id')
        .eq('id', receivableId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error || !receivable?.comanda_id)
        return false;
    const pending = await comandaIdsWithPendingCancellation(clinicId, [String(receivable.comanda_id)]);
    return pending.has(String(receivable.comanda_id));
}
/** Detalhe de um pagamento para o formulário de estorno (inclui fora do período da lista). */
const getHubFinancePayment = async (req, res) => {
    try {
        const paymentId = uuidStr.safeParse(req.params.id);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!paymentId.success || !clinicId.success) {
            return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
        }
        const { data: row, error } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select(`
        id, amount, payment_method, installments, payment_date, notes, status, clinic_id,
        cash_session:hub_cash_sessions(status),
        receivable:hub_receivables(
          id, unit_id, status, final_amount, returned_amount, source_type, comanda_id, deleted_at,
          guardian:hub_guardians(full_name)
        )
      `)
            .eq('id', paymentId.data)
            .eq('clinic_id', clinicId.data)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!row)
            return res.status(404).json({ error: 'Pagamento não encontrado' });
        const receivable = oneEmbed(row.receivable ??
            null);
        if (receivable?.deleted_at)
            return res.status(404).json({ error: 'Pagamento não encontrado' });
        const refundTotals = receivable?.id
            ? await sumLineRefundsByReceivable(clinicId.data, [String(receivable.id)])
            : new Map();
        return res.json({
            payment: mapPaymentListRow(row, {
                lineRefundsAmount: receivable?.id ? refundTotals.get(String(receivable.id)) ?? 0 : 0,
            }),
        });
    }
    catch (e) {
        console.error('getHubFinancePayment', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinancePayment = getHubFinancePayment;
const listHubFinancePayments = async (req, res) => {
    try {
        const parsed = listPaymentsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
        }
        const { clinic_id, unit_id, from, to, status: paymentStatus } = parsed.data;
        const select = `
      id, amount, payment_method, installments, payment_date, notes, status,
      cash_session:hub_cash_sessions(status),
      receivable:hub_receivables!inner(
        id, unit_id, status, final_amount, returned_amount, source_type, comanda_id, deleted_at,
        guardian:hub_guardians(full_name)
      )
    `;
        const build = (matchNullUnit) => {
            let q = supabase_1.supabaseAdmin
                .from('hub_payments')
                .select(select)
                .eq('clinic_id', clinic_id)
                .eq('status', paymentStatus)
                .order('payment_date', { ascending: false })
                .limit(300);
            q = matchNullUnit
                ? q.is('receivable.unit_id', null)
                : q.eq('receivable.unit_id', unit_id);
            if (from)
                q = q.gte('payment_date', `${from}T00:00:00.000-03:00`);
            if (to)
                q = q.lte('payment_date', `${to}T23:59:59.999-03:00`);
            return q;
        };
        const [byUnit, legacy] = await Promise.all([build(false), build(true)]);
        let rawRows = [];
        if (byUnit.error || legacy.error) {
            let fallback = supabase_1.supabaseAdmin
                .from('hub_payments')
                .select(select)
                .eq('clinic_id', clinic_id)
                .eq('status', paymentStatus)
                .order('payment_date', { ascending: false })
                .limit(400);
            if (from)
                fallback = fallback.gte('payment_date', `${from}T00:00:00.000-03:00`);
            if (to)
                fallback = fallback.lte('payment_date', `${to}T23:59:59.999-03:00`);
            const recovered = await fallback;
            if (recovered.error) {
                return res.status(500).json({ error: (byUnit.error ?? legacy.error ?? recovered.error).message });
            }
            rawRows = (recovered.data ?? []).filter((row) => {
                const receivable = oneEmbed(row.receivable);
                const rowUnit = receivable?.unit_id == null ? null : String(receivable.unit_id);
                return rowUnit == null || rowUnit === unit_id;
            });
        }
        else {
            rawRows = [...(byUnit.data ?? []), ...(legacy.data ?? [])];
        }
        const seen = new Set();
        const uniqueRows = rawRows.filter((row) => {
            const id = String(row.id ?? '');
            if (!id || seen.has(id))
                return false;
            seen.add(id);
            const receivable = oneEmbed(row.receivable);
            return !receivable?.deleted_at;
        });
        const receivableIds = [
            ...new Set(uniqueRows
                .map((row) => {
                const receivable = oneEmbed(row.receivable);
                return receivable?.id == null ? null : String(receivable.id);
            })
                .filter((id) => Boolean(id))),
        ];
        const refundTotals = await sumLineRefundsByReceivable(clinic_id, receivableIds);
        let payments = uniqueRows
            .map((row) => {
            const receivable = oneEmbed(row.receivable);
            const receivableId = receivable?.id == null ? null : String(receivable.id);
            return mapPaymentListRow(row, {
                lineRefundsAmount: receivableId ? refundTotals.get(receivableId) ?? 0 : 0,
            });
        })
            .sort((a, b) => String(b.payment_date ?? '').localeCompare(String(a.payment_date ?? '')));
        // Histórico: inclui devoluções parciais de produto (ajustes refund sem anular o payment).
        if (paymentStatus === 'reversed') {
            const lineRefundSelect = `
        id, amount, reason, created_at, refund_method, refund_effective_date, payment_id, adjustment_type,
        receivable:hub_receivables!inner(
          id, unit_id, status, final_amount, returned_amount, source_type, comanda_id, deleted_at,
          guardian:hub_guardians(full_name)
        )
      `;
            const buildLineRefunds = (matchNullUnit) => {
                let q = supabase_1.supabaseAdmin
                    .from('hub_financial_adjustments')
                    .select(lineRefundSelect)
                    .eq('clinic_id', clinic_id)
                    .eq('adjustment_type', 'refund')
                    .is('payment_id', null)
                    .order('created_at', { ascending: false })
                    .limit(300);
                q = matchNullUnit
                    ? q.is('receivable.unit_id', null)
                    : q.eq('receivable.unit_id', unit_id);
                if (from)
                    q = q.gte('created_at', `${from}T00:00:00.000-03:00`);
                if (to)
                    q = q.lte('created_at', `${to}T23:59:59.999-03:00`);
                return q;
            };
            const [lineByUnit, lineLegacy] = await Promise.all([
                buildLineRefunds(false),
                buildLineRefunds(true),
            ]);
            let lineRaw = [];
            if (lineByUnit.error || lineLegacy.error) {
                const errMsg = String((lineByUnit.error ?? lineLegacy.error)?.message ?? '');
                if (!/does not exist|schema cache|42P01/i.test(errMsg)) {
                    let fallback = supabase_1.supabaseAdmin
                        .from('hub_financial_adjustments')
                        .select(lineRefundSelect)
                        .eq('clinic_id', clinic_id)
                        .eq('adjustment_type', 'refund')
                        .is('payment_id', null)
                        .order('created_at', { ascending: false })
                        .limit(400);
                    if (from)
                        fallback = fallback.gte('created_at', `${from}T00:00:00.000-03:00`);
                    if (to)
                        fallback = fallback.lte('created_at', `${to}T23:59:59.999-03:00`);
                    const recovered = await fallback;
                    if (recovered.error) {
                        if (!/does not exist|schema cache|42P01/i.test(String(recovered.error.message))) {
                            return res.status(500).json({
                                error: (lineByUnit.error ?? lineLegacy.error ?? recovered.error).message,
                            });
                        }
                    }
                    else {
                        lineRaw = (recovered.data ?? []).filter((row) => {
                            const receivable = oneEmbed(row.receivable);
                            const rowUnit = receivable?.unit_id == null ? null : String(receivable.unit_id);
                            return rowUnit == null || rowUnit === unit_id;
                        });
                    }
                }
            }
            else {
                lineRaw = [...(lineByUnit.data ?? []), ...(lineLegacy.data ?? [])];
            }
            const lineSeen = new Set();
            const lineRows = lineRaw
                .filter((row) => {
                const id = String(row.id ?? '');
                if (!id || lineSeen.has(id))
                    return false;
                lineSeen.add(id);
                return true;
            })
                .map(mapLineRefundListRow)
                .filter((row) => row != null);
            payments = [...payments, ...lineRows].sort((a, b) => String(b.payment_date ?? '').localeCompare(String(a.payment_date ?? '')));
        }
        // Na lista de ação (posted), esconde pagamentos de cancelamento operacional ainda pendente.
        // No histórico (reversed) mostra tudo do período.
        let visiblePayments = payments;
        if (paymentStatus === 'posted') {
            const comandaIds = [
                ...new Set(payments
                    .map((payment) => payment.receivable?.comanda_id)
                    .filter((id) => Boolean(id))),
            ];
            const pendingComandaIds = await comandaIdsWithPendingCancellation(clinic_id, comandaIds);
            if (pendingComandaIds.size > 0) {
                visiblePayments = payments.filter((payment) => {
                    const comandaId = payment.receivable?.comanda_id;
                    return !comandaId || !pendingComandaIds.has(comandaId);
                });
            }
        }
        return res.json({ payments: visiblePayments });
    }
    catch (e) {
        console.error('listHubFinancePayments', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinancePayments = listHubFinancePayments;
const cancelReceivableBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    reason: zod_1.z.string().trim().min(3).max(2000),
    /**
     * void_sale (padrão): anula a venda — não reabre itens; encerra a comanda se for o último recebível ativo.
     * reissue_billing: corrige cobrança — reabre itens (e reabre comanda fechada).
     */
    intent: zod_1.z.enum(['void_sale', 'reissue_billing']).optional().default('void_sale'),
    confirm_stock_return: zod_1.z.boolean().optional().default(false),
    stock_return_condition: zod_1.z.enum(['sellable', 'unsellable']).optional().nullable(),
    stock_return_lines: zod_1.z.array(stockReturnLineSchema).max(200).optional().nullable(),
})
    .strict()
    .superRefine((val, ctx) => {
    if (val.confirm_stock_return && !val.stock_return_condition) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'stock_return_condition é obrigatório quando confirm_stock_return=true',
            path: ['stock_return_condition'],
        });
    }
});
async function applyComandaSideEffectsAfterReceivableCancel(opts) {
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
        await (0, hubComandasController_1.refreshComandaFinancialStatus)(comandaId, opts.clinicId, comandaRow);
        return { comanda_status: 'cancelada' };
    }
    if (opts.intent === 'reissue_billing') {
        if (currentStatus === 'fechada') {
            await supabase_1.supabaseAdmin
                .from('hub_comandas')
                .update({ status: 'aberta', closed_at: null })
                .eq('id', comandaId)
                .eq('clinic_id', opts.clinicId);
            const { data: reopened } = await supabase_1.supabaseAdmin
                .from('hub_comandas')
                .select('*')
                .eq('id', comandaId)
                .maybeSingle();
            if (reopened) {
                await (0, hubComandasController_1.refreshComandaFinancialStatus)(comandaId, opts.clinicId, reopened);
            }
            return { comanda_status: 'aberta' };
        }
        await (0, hubComandasController_1.refreshComandaFinancialStatus)(comandaId, opts.clinicId, comandaRow);
        return { comanda_status: currentStatus || null };
    }
    return (0, hubComandasController_1.tryVoidComandaAfterSaleFinanciallyEnded)({
        clinicId: opts.clinicId,
        comandaId,
        reason: opts.reason,
    });
}
const postHubFinanceReceivableCancel = async (req, res) => {
    try {
        const receivableId = uuidStr.safeParse(req.params.id);
        const parsed = cancelReceivableBodySchema.safeParse(req.body);
        if (!receivableId.success || !parsed.success)
            return res.status(400).json({ error: 'Dados inválidos' });
        const { clinic_id, reason, intent, confirm_stock_return, stock_return_condition, stock_return_lines, } = parsed.data;
        const cancelRebill = intent === 'reissue_billing';
        let rec = null;
        {
            const primary = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, clinic_id, comanda_id, status, final_amount, cancel_rebill, lines:hub_receivable_lines(*)')
                .eq('id', receivableId.data)
                .maybeSingle();
            if (primary.error && String(primary.error.message || '').includes('cancel_rebill')) {
                const legacy = await supabase_1.supabaseAdmin
                    .from('hub_receivables')
                    .select('id, clinic_id, comanda_id, status, final_amount, lines:hub_receivable_lines(*)')
                    .eq('id', receivableId.data)
                    .maybeSingle();
                if (legacy.error || !legacy.data || legacy.data.clinic_id !== clinic_id) {
                    return res.status(404).json({ error: 'Recebível não encontrado' });
                }
                rec = legacy.data;
            }
            else if (primary.error || !primary.data || primary.data.clinic_id !== clinic_id) {
                return res.status(404).json({ error: 'Recebível não encontrado' });
            }
            else {
                rec = primary.data;
            }
        }
        if (rec.status === 'cancelled') {
            return res.json({ receivable: rec, comanda_status: null });
        }
        const { data: payments } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('id')
            .eq('receivable_id', receivableId.data)
            .eq('status', 'posted');
        if ((payments ?? []).length > 0) {
            return res.status(409).json({ error: 'Estorne os pagamentos antes de cancelar o recebível' });
        }
        let stockRestored = 0;
        let stockUnsellable = 0;
        let stockWarning = 'Estoque não foi alterado. Cancelamento financeiro não presume devolução física.';
        if (confirm_stock_return) {
            const nestedLines = (rec.lines ?? []);
            const stock = await (0, hubInventoryStockUtils_1.restoreProductStockForReceivableLines)({
                clinicId: clinic_id,
                receivableId: receivableId.data,
                notes: `Devolução física confirmada no cancelamento: ${reason.trim()}`,
                createdBy: req.user?.id ?? null,
                lines: nestedLines.length > 0 ? nestedLines : undefined,
                condition: stock_return_condition ?? 'sellable',
                lineSpecs: stock_return_lines ?? undefined,
            });
            if (stock.errors.length) {
                return res.status(500).json({ error: `Falha ao processar devolução de estoque: ${stock.errors[0]}` });
            }
            stockRestored = stock.restored;
            stockUnsellable = stock.unsellable;
            if (stock_return_condition === 'unsellable') {
                stockWarning =
                    stockUnsellable > 0
                        ? `Devolução sem reentrada ao disponível (${stockUnsellable} linha(s) sem condição de revenda).`
                        : 'Devolução sem condição de revenda: estoque disponível inalterado.';
            }
            else {
                stockWarning = `Estoque reentrado (${stockRestored} nova(s), ${stock.skipped} já registrada(s)).`;
            }
        }
        await supabase_1.supabaseAdmin.from('hub_financial_adjustments').insert({
            clinic_id,
            receivable_id: receivableId.data,
            adjustment_type: 'write_off',
            amount: Number(rec.final_amount ?? 0),
            reason,
            created_by_user_id: req.user?.id ?? null,
        });
        let updated = null;
        {
            const upd = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .update({ status: 'cancelled', cancel_rebill: cancelRebill })
                .eq('id', receivableId.data)
                .select('*, lines:hub_receivable_lines(*)')
                .single();
            if (upd.error && String(upd.error.message || '').includes('cancel_rebill')) {
                const legacy = await supabase_1.supabaseAdmin
                    .from('hub_receivables')
                    .update({ status: 'cancelled' })
                    .eq('id', receivableId.data)
                    .select('*, lines:hub_receivable_lines(*)')
                    .single();
                if (legacy.error)
                    return res.status(500).json({ error: legacy.error.message });
                updated = legacy.data;
            }
            else if (upd.error) {
                return res.status(500).json({ error: upd.error.message });
            }
            else {
                updated = upd.data;
            }
        }
        try {
            const { syncPackageBalancesForReceivable } = await Promise.resolve().then(() => __importStar(require('./hubPackagesService.js')));
            await syncPackageBalancesForReceivable(receivableId.data);
        }
        catch (syncErr) {
            const msg = syncErr?.message ?? '';
            if (msg.startsWith('PACKAGE_BALANCE_HAS_REDEMPTIONS')) {
                await supabase_1.supabaseAdmin
                    .from('hub_receivables')
                    .update({ status: rec.status })
                    .eq('id', receivableId.data);
                return res.status(409).json({
                    error: 'Não é possível cancelar: o pacote já teve sessões consumidas. Estorne os resgates antes.',
                });
            }
            throw syncErr;
        }
        let comandaStatus = null;
        try {
            const side = await applyComandaSideEffectsAfterReceivableCancel({
                clinicId: clinic_id,
                comandaId: rec.comanda_id ?? null,
                intent,
                reason: reason.trim(),
            });
            comandaStatus = side.comanda_status;
        }
        catch (sideErr) {
            console.error('postHubFinanceReceivableCancel comanda side-effects', sideErr);
        }
        return res.json({
            receivable: updated,
            comanda_status: comandaStatus,
            stock_restored: stockRestored,
            stock_unsellable: stockUnsellable,
            warning: stockWarning,
        });
    }
    catch (e) {
        console.error('postHubFinanceReceivableCancel', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivableCancel = postHubFinanceReceivableCancel;
const productReturnBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    reason: zod_1.z.string().trim().min(3).max(2000),
    stock_return_condition: zod_1.z.enum(['sellable', 'unsellable']),
    stock_return_lines: zod_1.z.array(stockReturnLineSchema).min(1).max(200),
    /** Obrigatório somente quando houver valor financeiro a devolver. */
    refund_method: hubPaymentMethods_1.hubPaymentMethodSchema.optional().nullable(),
    refund_effective_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    /** UUID por abertura do formulário; reutilizar em retry da mesma operação. */
    idempotency_key: uuidStr,
})
    .strict();
/**
 * Devolução física por item (parcial ou total) via RPC atômica.
 * Comercial devolvido ≠ reembolso financeiro (matriz pago × líquido vigente).
 */
const postHubFinanceReceivableProductReturn = async (req, res) => {
    try {
        const receivableId = uuidStr.safeParse(req.params.id);
        const parsed = productReturnBodySchema.safeParse(req.body);
        if (!receivableId.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos (idempotency_key UUID obrigatória)' });
        }
        const { clinic_id, reason, stock_return_condition, stock_return_lines, refund_method, refund_effective_date, idempotency_key, } = parsed.data;
        const result = await (0, hubFinanceLedger_1.returnReceivableProductLines)({
            clinicId: clinic_id,
            receivableId: receivableId.data,
            userId: req.user?.id ?? null,
            reason,
            condition: stock_return_condition,
            lineSpecs: stock_return_lines,
            refundMethod: refund_method ?? null,
            refundEffectiveDate: refund_effective_date ?? null,
            idempotencyKey: idempotency_key,
        });
        const detail = await buildReceivableDetail(receivableId.data, clinic_id);
        return res.json({
            ok: true,
            receivable: detail,
            receivable_status: result.receivable_status,
            refund_amount: result.refund_amount,
            commercial_returned: result.commercial_returned ?? null,
            balance_due: result.balance_due ?? null,
            adjustment_id: result.adjustment_id,
            stock_restored: result.stock_restored,
            stock_unsellable: result.stock_unsellable,
            stock_return_status: detail?.stock_return_status ?? null,
            warning: result.warning,
            replayed: result.replayed ?? false,
        });
    }
    catch (e) {
        if (e instanceof hubFinanceLedger_1.FinanceLedgerError) {
            return res.status(e.status).json({ error: e.message });
        }
        console.error('postHubFinanceReceivableProductReturn', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivableProductReturn = postHubFinanceReceivableProductReturn;
async function loadReceivableSourceDetails(receivable) {
    const sourceType = String(receivable.source_type || '');
    const sourceId = receivable.source_id;
    const clinicId = receivable.clinic_id;
    if (!sourceId || sourceType === 'manual') {
        return sourceType === 'manual'
            ? { type: 'manual', id: sourceId, label: 'Lançamento manual', notes: receivable.notes ?? null }
            : null;
    }
    if (sourceType === 'appointment') {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select(`
        id, title, starts_at, ends_at, status, unit_id, guardian_id, pet_id, hub_staff_member_id,
        pet:hub_pets(id, name, species, breed),
        guardian:hub_guardians(id, full_name, phone, email),
        staff:hub_staff_members(id, full_name)
      `)
            .eq('id', sourceId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        return data ? { type: sourceType, label: 'Agendamento', ...data } : null;
    }
    if (sourceType === 'encounter') {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select(`
        id, status, started_at, completed_at, unit_id, guardian_id, pet_id, hub_staff_member_id, hub_appointment_id,
        chief_complaint, summary_notes,
        pet:hub_pets(id, name, species, breed),
        guardian:hub_guardians(id, full_name, phone, email),
        staff:hub_staff_members(id, full_name)
      `)
            .eq('id', sourceId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        return data ? { type: sourceType, label: 'Atendimento', ...data } : null;
    }
    if (sourceType === 'grooming_session') {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select(`
        id, grooming_stage, opened_at, closed_at, delivered_at, unit_id, guardian_id, pet_id, hub_staff_member_id, hub_appointment_id,
        pet:hub_pets(id, name, species, breed),
        guardian:hub_guardians(id, full_name, phone, email),
        staff:hub_staff_members(id, full_name)
      `)
            .eq('id', sourceId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        return data ? { type: sourceType, label: 'Banho e tosa', ...data } : null;
    }
    if (sourceType === 'quote') {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_quotes')
            .select(`
        id, status, total_amount, subtotal_amount, discount_kind, discount_value, sent_at, converted_at, created_at,
        unit_id, guardian_id, prospect_id,
        prospect:hub_prospects(id, full_name, phone, email),
        guardian:hub_guardians(id, full_name, phone, email)
      `)
            .eq('id', sourceId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        const { data: quotePets } = await supabase_1.supabaseAdmin
            .from('hub_quote_pets')
            .select('id, display_name, species, breed, size_tier, coat_type, sort_order')
            .eq('quote_id', sourceId)
            .order('sort_order', { ascending: true });
        return data ? { type: sourceType, label: 'Orçamento', ...data, pets: quotePets ?? [] } : null;
    }
    return null;
}
async function buildReceivableDetail(receivableId, clinicId) {
    const { data: rec, error: recErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('*, lines:hub_receivable_lines(*)')
        .eq('id', receivableId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (recErr)
        throw new Error(recErr.message);
    if (!rec)
        return null;
    let rawLines = (rec.lines ?? []);
    if (rawLines.length === 0) {
        const { data: flatLines, error: flatErr } = await supabase_1.supabaseAdmin
            .from('hub_receivable_lines')
            .select('*')
            .eq('receivable_id', receivableId)
            .eq('clinic_id', clinicId);
        if (flatErr)
            throw new Error(flatErr.message);
        rawLines = (flatLines ?? []);
    }
    const lines = await enrichReceivableLines(rawLines);
    const [{ data: guardian }, { data: unit }, { data: payments }, { data: adjustments }, { data: productReturns }, source] = await Promise.all([
        rec.guardian_id
            ? supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id, full_name, phone, email')
                .eq('id', rec.guardian_id)
                .eq('clinic_id', clinicId)
                .maybeSingle()
                .then((r) => {
                if (r.error)
                    throw new Error(r.error.message);
                return r;
            })
            : Promise.resolve({ data: null }),
        rec.unit_id
            ? supabase_1.supabaseAdmin
                .from('units')
                .select('id, name, nickname, phone, address, city, state')
                .eq('id', rec.unit_id)
                .maybeSingle()
                .then((r) => {
                if (r.error)
                    throw new Error(r.error.message);
                return r;
            })
            : Promise.resolve({ data: null }),
        supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('*, cash_session:hub_cash_sessions(status)')
            .eq('receivable_id', receivableId)
            .eq('clinic_id', clinicId)
            .order('payment_date', { ascending: false }),
        supabase_1.supabaseAdmin
            .from('hub_financial_adjustments')
            .select('*')
            .eq('receivable_id', receivableId)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false }),
        supabase_1.supabaseAdmin
            .from('hub_product_return_events')
            .select('id, receivable_line_id, item_id, lot_id, qty, condition, reason, created_by, created_at')
            .eq('receivable_id', receivableId)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false })
            .then((r) => {
            // Tabela pode não existir em ambientes sem migration 162.
            if (r.error && /does not exist|schema cache|42P01/i.test(String(r.error.message))) {
                return { data: [] };
            }
            if (r.error)
                throw new Error(r.error.message);
            return r;
        }),
        loadReceivableSourceDetails(rec),
    ]);
    const paymentRows = (payments ?? []).map((row) => {
        const session = oneEmbed(row.cash_session);
        const cash_session_status = session?.status === 'open' || session?.status === 'closed' ? session.status : null;
        return {
            ...row,
            cash_session: undefined,
            cash_session_status,
        };
    });
    const postedAmount = round2(paymentRows
        .filter((row) => String(row.status ?? 'posted') === 'posted')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const lineRefundsPaidOut = round2((adjustments ?? [])
        .filter((row) => String(row.adjustment_type ?? '') === 'refund' &&
        (row.payment_id == null || row.payment_id === undefined))
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const paidAmount = (0, hubReceivableFinancialBalance_1.netPaidEffective)({
        postedPayments: postedAmount,
        lineRefundsAlreadyPaidOut: lineRefundsPaidOut,
    });
    const finalAmount = Number(rec.final_amount ?? 0);
    const productLineIds = lines
        .filter((l) => (0, hubProductReturnStatus_1.isProductStockLine)(l))
        .map((l) => String(l.id));
    const stock_return_status = (0, hubProductReturnStatus_1.computeStockReturnStatus)({
        productLineIds,
        returns: (productReturns ?? []).map((r) => ({
            receivable_line_id: String(r.receivable_line_id),
            condition: String(r.condition ?? ''),
        })),
        receivableStatus: String(rec.status ?? ''),
    });
    return {
        ...rec,
        lines,
        guardian,
        unit,
        source,
        payments: paymentRows,
        adjustments: adjustments ?? [],
        product_returns: productReturns ?? [],
        stock_return_status,
        /** Pago líquido efetivo (posted − refunds de linha). */
        paid_amount: paidAmount,
        /** Soma bruta dos payments posted (antes de refunds de linha). */
        posted_amount: postedAmount,
        line_refunds_amount: lineRefundsPaidOut,
        returned_amount: Number(rec.returned_amount ?? 0),
        net_amount_at_sale: rec.net_amount_at_sale != null ? Number(rec.net_amount_at_sale) : null,
        balance_amount: (0, hubReceivableFinancialBalance_1.balanceDue)({
            finalAmount,
            postedPayments: postedAmount,
            lineRefundsAlreadyPaidOut: lineRefundsPaidOut,
        }),
    };
}
const getHubFinanceReceivableDetail = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic.success) {
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        }
        const detail = await buildReceivableDetail(id.data, clinic.data);
        if (!detail)
            return res.status(404).json({ error: 'Recebível não encontrado' });
        return res.json({ receivable: detail });
    }
    catch (e) {
        console.error('getHubFinanceReceivableDetail', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceReceivableDetail = getHubFinanceReceivableDetail;
const getHubFinancePaymentReceipt = async (req, res) => {
    try {
        const paymentId = uuidStr.safeParse(req.params.id);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!paymentId.success || !clinicId.success) {
            return res.status(400).json({ error: 'payment id e clinic_id são obrigatórios' });
        }
        const { data: payment, error: pErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('*')
            .eq('id', paymentId.data)
            .eq('clinic_id', clinicId.data)
            .maybeSingle();
        if (pErr)
            return res.status(500).json({ error: pErr.message });
        if (!payment)
            return res.status(404).json({ error: 'Pagamento não encontrado' });
        const receivable = await buildReceivableDetail(payment.receivable_id, clinicId.data);
        const { data: clinic } = await supabase_1.supabaseAdmin
            .from('clinics')
            .select('id, name, photo_url')
            .eq('id', clinicId.data)
            .maybeSingle();
        (0, hubPaymentReceiptPdf_1.streamPaymentReceiptPdf)(res, {
            ...payment,
            amount: Number(payment.amount ?? 0),
            receivable,
            clinic,
        });
    }
    catch (e) {
        console.error('getHubFinancePaymentReceipt', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinancePaymentReceipt = getHubFinancePaymentReceipt;
const listReceivablesQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    status: zod_1.z.enum(['pending', 'partially_paid', 'paid', 'cancelled', 'refunded']).optional(),
})
    .strict();
const listHubFinanceReceivables = async (req, res) => {
    try {
        const parsed = listReceivablesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id, unit_id, status } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('*, lines:hub_receivable_lines(*, pet:hub_pets(name)), guardian:hub_guardians(id,full_name)')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200);
        // Inclui recebíveis com unit_id null (legado / orçamento sem unidade) para não “sumirem” ao filtrar pela unidade do hub.
        if (unit_id)
            q = q.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        if (status)
            q = q.eq('status', status);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ receivables: data ?? [] });
    }
    catch (e) {
        console.error('listHubFinanceReceivables', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinanceReceivables = listHubFinanceReceivables;
const cashOpenSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    opening_balance: zod_1.z.number().min(0),
    opened_by_staff_id: uuidStr.optional().nullable(),
})
    .strict();
const postHubFinanceCashSessionOpen = async (req, res) => {
    try {
        const parsed = cashOpenSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, unit_id, opening_balance, opened_by_staff_id: bodyStaffId } = parsed.data;
        // Resolve o profissional vinculado ao usuário autenticado, se não informado no body
        let opened_by_staff_id = bodyStaffId ?? null;
        if (!opened_by_staff_id && req.user?.id) {
            const { data: clinicUser } = await supabase_1.supabaseAdmin
                .from('clinic_users')
                .select('id')
                .eq('clinic_id', clinic_id)
                .eq('user_id', req.user.id)
                .eq('status', 'active')
                .maybeSingle();
            if (clinicUser?.id) {
                const { data: staffRow } = await supabase_1.supabaseAdmin
                    .from('hub_staff_members')
                    .select('id')
                    .eq('clinic_id', clinic_id)
                    .eq('clinic_user_id', clinicUser.id)
                    .is('deleted_at', null)
                    .maybeSingle();
                opened_by_staff_id = staffRow?.id ?? null;
            }
        }
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id, opened_at')
            .eq('unit_id', unit_id)
            .eq('status', 'open')
            .maybeSingle();
        if (existing) {
            const openedAtDate = existing.opened_at
                ? new Date(existing.opened_at).toISOString().slice(0, 10)
                : null;
            const todayYmd = new Date().toISOString().slice(0, 10);
            const isPreviousDay = openedAtDate && openedAtDate < todayYmd;
            return res.status(409).json({
                error: 'Já existe caixa aberto nesta unidade',
                previous_session_id: existing.id,
                is_previous_day: isPreviousDay ?? false,
            });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .insert({
            clinic_id,
            unit_id,
            opening_balance: round2(opening_balance),
            opened_by_staff_id: opened_by_staff_id ?? null,
            status: 'open',
        })
            .select('*')
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        if (data) {
            await linkOrphanPaymentsToSession(clinic_id, {
                id: data.id,
                unit_id: data.unit_id,
                opened_at: data.opened_at,
            });
        }
        return res.status(201).json({ cash_session: data });
    }
    catch (e) {
        console.error('postHubFinanceCashSessionOpen', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceCashSessionOpen = postHubFinanceCashSessionOpen;
const cashCloseSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    closing_balance: zod_1.z.number().min(0),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
})
    .strict();
const postHubFinanceCashSessionClose = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = cashCloseSchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const { clinic_id, closing_balance, notes } = parsed.data;
        const result = await (0, cashSessionCloseService_1.closeCashSession)({
            sessionId: idParsed.data,
            clinicId: clinic_id,
            closingBalance: closing_balance,
            autoClosed: false,
            notes: notes ?? null,
            actorUserId: req.user?.id ?? null,
            abortOnHandoffErrors: false,
        });
        return res.json({
            cash_session: result.cash_session,
            auto_handoff_count: result.auto_handoff_count,
            auto_handoff_errors: result.auto_handoff_errors,
        });
    }
    catch (e) {
        const status = Number(e?.statusCode);
        if (status === 404)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        if (status === 409)
            return res.status(409).json({ error: e.message || 'Caixa já fechado' });
        console.error('postHubFinanceCashSessionClose', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceCashSessionClose = postHubFinanceCashSessionClose;
const autoCloseOverdueSchema = zod_1.z
    .object({
    dry_run: zod_1.z.boolean().optional(),
    clinic_id: uuidStr.optional(),
})
    .strict();
/**
 * POST /finance/cash-sessions/auto-close-overdue
 * Job de meia-noite: fecha sessões open com opened_at em dia civil SP anterior a hoje.
 * Auth: CRON_SECRET (Bearer ou X-Cron-Secret). clinic_id só fora de production.
 */
const postHubFinanceCashSessionsAutoCloseOverdue = async (req, res) => {
    try {
        const provided = (0, cashSessionCloseService_1.extractCronSecretFromRequest)(req.headers);
        const expected = process.env.CRON_SECRET;
        if (!(0, cashSessionCloseService_1.verifyCronSecret)(provided, expected)) {
            return res.status(401).json({ error: 'Não autorizado' });
        }
        const parsed = autoCloseOverdueSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        if (parsed.data.clinic_id && !(0, cashSessionCloseService_1.isCronClinicFilterAllowed)(process.env.NODE_ENV)) {
            return res.status(400).json({
                error: 'clinic_id não é permitido em production; o job fecha globalmente',
            });
        }
        const result = await (0, cashSessionCloseService_1.runAutoCloseOverdueJob)({
            dryRun: parsed.data.dry_run ?? false,
            clinicId: parsed.data.clinic_id ?? null,
        });
        return res.json(result);
    }
    catch (e) {
        console.error('postHubFinanceCashSessionsAutoCloseOverdue', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceCashSessionsAutoCloseOverdue = postHubFinanceCashSessionsAutoCloseOverdue;
/**
 * GET /finance/cash-sessions/status
 * Endpoint leve que agrega status do caixa + contagem de pendências em uma única chamada.
 * Usado pelo HubCashSessionContext para polling periódico no sidebar e no guard de saída.
 * Contagem sem montar preview/valores (includeAmounts: false) para evitar N+1.
 */
const getHubFinanceCashSessionStatus = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        const unitParsed = uuidStr.safeParse(req.query.unit_id);
        if (!clinicParsed.success || !unitParsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
        }
        const clinic_id = clinicParsed.data;
        const unit_id = unitParsed.data;
        const keys = await fetchActiveReceivableKeysExpanded(clinic_id).catch(() => new Set());
        const cashSessionRes = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id, status, opened_at, opening_balance, closed_at')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .eq('status', 'open')
            .maybeSingle();
        const pendingBillingResult = await collectUnbilledItems(clinic_id, unit_id, keys, {
            includeAmounts: false,
        }).catch(() => []);
        const openComandasAgg = await (0, hubComandasController_1.countOpenComandasPendingCaixa)(clinic_id, unit_id).catch(() => ({
            count: 0,
            total: 0,
        }));
        const openComandasCount = openComandasAgg.count;
        const openComandasTotal = openComandasAgg.total;
        return res.json({
            cash_session: cashSessionRes.data ?? null,
            pending_billing_count: pendingBillingResult.length,
            open_comandas_count: openComandasCount,
            open_comandas_total: openComandasTotal,
        });
    }
    catch (e) {
        console.error('getHubFinanceCashSessionStatus', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceCashSessionStatus = getHubFinanceCashSessionStatus;
const handoffPendingBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})
    .strict();
/**
 * POST /finance/handoff-pending
 * Envia em uma chamada todas as comandas abertas da unidade ao financeiro (leave_pending completo).
 */
const postHubFinanceHandoffPending = async (req, res) => {
    try {
        const parsed = handoffPendingBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, unit_id, due_date } = parsed.data;
        const dueDate = due_date || paymentYmdSaoPaulo(new Date().toISOString());
        const handoff = await (0, hubComandasController_1.leavePendingHandoffOpenComandasForUnit)(clinic_id, unit_id, {
            dueDate,
            userId: req.user?.id ?? null,
        });
        const hasErrors = handoff.errors.length > 0;
        return res.status(hasErrors ? 207 : 200).json({
            handoff_count: handoff.handoff_count,
            skipped_count: handoff.skipped_count,
            results: handoff.results,
            errors: handoff.errors,
            partial_errors: hasErrors,
        });
    }
    catch (e) {
        console.error('postHubFinanceHandoffPending', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceHandoffPending = postHubFinanceHandoffPending;
const listHubFinanceCashSessionsClosed = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        const unitParsed = uuidStr.safeParse(req.query.unit_id);
        const limitRaw = Number(req.query.limit ?? 20);
        const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 20;
        if (!clinicParsed.success || !unitParsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id, opened_at, closed_at, opening_balance, closing_balance, expected_balance, difference_amount, status, notes, auto_closed, opened_by_staff_id, opened_by_staff:hub_staff_members!opened_by_staff_id(id, full_name, display_name)')
            .eq('clinic_id', clinicParsed.data)
            .eq('unit_id', unitParsed.data)
            .eq('status', 'closed')
            .order('closed_at', { ascending: false })
            .limit(limit);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ sessions: data ?? [] });
    }
    catch (e) {
        console.error('listHubFinanceCashSessionsClosed', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinanceCashSessionsClosed = listHubFinanceCashSessionsClosed;
const getHubFinanceCashSessionOpen = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        const unitParsed = uuidStr.safeParse(req.query.unit_id);
        if (!clinicParsed.success || !unitParsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('*, opened_by_staff:hub_staff_members!opened_by_staff_id(id, full_name, display_name)')
            .eq('clinic_id', clinicParsed.data)
            .eq('unit_id', unitParsed.data)
            .eq('status', 'open')
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ cash_session: data });
    }
    catch (e) {
        console.error('getHubFinanceCashSessionOpen', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceCashSessionOpen = getHubFinanceCashSessionOpen;
const getHubFinanceCashSessionSummary = async (req, res) => {
    try {
        const sessionId = uuidStr.safeParse(req.params.id);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!sessionId.success || !clinicId.success) {
            return res.status(400).json({ error: 'session id e clinic_id são obrigatórios' });
        }
        const { data: session, error: sErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('*')
            .eq('id', sessionId.data)
            .eq('clinic_id', clinicId.data)
            .maybeSingle();
        if (sErr)
            return res.status(500).json({ error: sErr.message });
        if (!session)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        const sessionClosed = String(session.status) === 'closed';
        const [{ data: payments, error: pErr }, { data: allPayments, error: allPErr }, { data: allPaymentsDetailed, error: allDetErr }, { data: movements, error: mErr }, { data: postCloseRows, error: postCloseErr },] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_payments')
                .select('*, receivable:hub_receivables(id, comanda_id, source_type, source_id, guardian_id, final_amount, status)')
                .eq('clinic_id', clinicId.data)
                .eq('cash_session_id', sessionId.data)
                .eq('payment_method', 'cash')
                .eq('status', 'posted')
                .eq('posting_kind', 'operational')
                .order('payment_date', { ascending: false }),
            supabase_1.supabaseAdmin
                .from('hub_payments')
                .select('payment_method, amount, card_fee_amount, net_amount')
                .eq('clinic_id', clinicId.data)
                .eq('cash_session_id', sessionId.data)
                .eq('status', 'posted'),
            supabase_1.supabaseAdmin
                .from('hub_payments')
                .select('*, receivable:hub_receivables(id, comanda_id, source_type, source_id, guardian_id, final_amount, status)')
                .eq('clinic_id', clinicId.data)
                .eq('cash_session_id', sessionId.data)
                .eq('status', 'posted')
                .order('payment_date', { ascending: false }),
            supabase_1.supabaseAdmin
                .from('hub_cash_movements')
                .select('*')
                .eq('clinic_id', clinicId.data)
                .eq('cash_session_id', sessionId.data)
                .order('created_at', { ascending: false }),
            supabase_1.supabaseAdmin
                .from('hub_cash_session_post_close_adjustments')
                .select('*')
                .eq('clinic_id', clinicId.data)
                .eq('cash_session_id', sessionId.data)
                .order('created_at', { ascending: false }),
        ]);
        if (pErr)
            return res.status(500).json({ error: pErr.message });
        if (allPErr)
            return res.status(500).json({ error: allPErr.message });
        if (allDetErr)
            return res.status(500).json({ error: allDetErr.message });
        if (mErr)
            return res.status(500).json({ error: mErr.message });
        // Tabela pode não existir ainda em ambientes sem migration 137
        const postCloseAdjustments = postCloseErr ? [] : postCloseRows ?? [];
        // Enrich payments with comanda origin + product/service composition for Caixa history.
        const enrichPaymentsWithComandaContext = async (rows) => {
            const list = rows ?? [];
            if (!list.length)
                return list;
            const comandaIds = Array.from(new Set(list
                .map((row) => {
                const receivable = row.receivable;
                return receivable?.comanda_id ? String(receivable.comanda_id) : '';
            })
                .filter(Boolean)));
            if (!comandaIds.length)
                return list;
            const [{ data: comandas }, { data: items }] = await Promise.all([
                supabase_1.supabaseAdmin.from('hub_comandas').select('id, origin_type').in('id', comandaIds),
                supabase_1.supabaseAdmin
                    .from('hub_comanda_items')
                    .select('comanda_id, item_kind, hub_inventory_item_id')
                    .in('comanda_id', comandaIds),
            ]);
            const originByComanda = new Map();
            for (const c of comandas ?? []) {
                if (c?.id)
                    originByComanda.set(String(c.id), String(c.origin_type ?? 'manual'));
            }
            const compositionByComanda = new Map();
            for (const it of items ?? []) {
                const cid = String(it?.comanda_id ?? '');
                if (!cid)
                    continue;
                const prev = compositionByComanda.get(cid) ?? { has_product: false, has_service: false };
                const kind = String(it?.item_kind ?? '');
                const hasInventory = Boolean(it?.hub_inventory_item_id);
                if (kind === 'product' || hasInventory)
                    prev.has_product = true;
                else if (kind === 'service' || kind === 'fee')
                    prev.has_service = true;
                compositionByComanda.set(cid, prev);
            }
            return list.map((row) => {
                const receivable = row.receivable;
                if (!receivable?.comanda_id)
                    return row;
                const cid = String(receivable.comanda_id);
                const composition = compositionByComanda.get(cid) ?? { has_product: false, has_service: false };
                return {
                    ...row,
                    receivable: {
                        ...receivable,
                        comanda_origin_type: originByComanda.get(cid) ?? null,
                        has_product: composition.has_product,
                        has_service: composition.has_service,
                    },
                };
            });
        };
        const paymentsEnriched = await enrichPaymentsWithComandaContext(payments);
        const allPaymentsDetailedEnriched = await enrichPaymentsWithComandaContext(allPaymentsDetailed);
        const cashInBase = round2((paymentsEnriched ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
        const creditCashIn = await sumCreditCashInSession(clinicId.data, sessionId.data);
        const cashIn = round2(cashInBase + creditCashIn);
        const deposits = round2((movements ?? [])
            .filter((row) => row.movement_type === 'deposit')
            .reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
        const withdrawals = round2((movements ?? [])
            .filter((row) => row.movement_type === 'withdrawal')
            .reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
        const openingBalance = Number(session.opening_balance ?? 0);
        // Sessão fechada: snapshot congelado; aberta: cálculo ao vivo.
        const expectedBalance = sessionClosed
            ? round2(Number(session.expected_balance ?? openingBalance + cashIn + deposits - withdrawals))
            : round2(openingBalance + cashIn + deposits - withdrawals);
        const totalsMap = new Map();
        for (const p of allPayments ?? []) {
            const method = String(p.payment_method ?? 'outros');
            totalsMap.set(method, round2((totalsMap.get(method) ?? 0) + Number(p.amount ?? 0)));
        }
        const totals_by_method = Object.fromEntries(totalsMap.entries());
        const cardFeeTotals = (0, hubCardMachineFees_1.aggregateCardFeeTotals)((allPayments ?? []).map((p) => ({
            payment_method: String(p.payment_method ?? ''),
            amount: Number(p.amount ?? 0),
            card_fee_amount: p.card_fee_amount == null ||
                !Number.isFinite(Number(p.card_fee_amount))
                ? null
                : Number(p.card_fee_amount),
            net_amount: p.net_amount == null ||
                !Number.isFinite(Number(p.net_amount))
                ? null
                : Number(p.net_amount),
        })));
        return res.json({
            cash_session: session,
            payments: paymentsEnriched,
            all_payments: allPaymentsDetailedEnriched,
            movements: movements ?? [],
            post_close_adjustments: postCloseAdjustments,
            summary: {
                opening_balance: round2(openingBalance),
                cash_payments_total: cashIn,
                cash_payments_from_receivables: cashInBase,
                credit_cash_in_total: creditCashIn,
                deposits_total: deposits,
                withdrawals_total: withdrawals,
                expected_balance: expectedBalance,
                closing_balance: sessionClosed ? round2(Number(session.closing_balance ?? 0)) : null,
                difference_amount: sessionClosed ? round2(Number(session.difference_amount ?? 0)) : null,
                snapshot_frozen: sessionClosed,
                totals_by_method,
                card_gross_total: cardFeeTotals.card_gross_total,
                card_fee_total: cardFeeTotals.card_fee_total,
                card_net_total: cardFeeTotals.card_net_total,
                card_without_fee_gross_total: cardFeeTotals.card_without_fee_gross_total,
            },
        });
    }
    catch (e) {
        console.error('getHubFinanceCashSessionSummary', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceCashSessionSummary = getHubFinanceCashSessionSummary;
async function fetchBilledOriginKeysFromComandas(clinicId) {
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
        .select('comanda_id, status')
        .eq('clinic_id', clinicId)
        .in('comanda_id', comandaIds)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (rErr)
        throw new Error(rErr.message);
    const billedComandaIds = new Set((receivables ?? []).map((r) => r.comanda_id).filter(Boolean));
    for (const c of comandas) {
        // Fechada sem recebível = cobertura total (pacote/desconto) — também conta como cobrada.
        if (billedComandaIds.has(c.id) || String(c.status) === 'fechada') {
            keys.add(`${c.origin_type}:${c.origin_id}`);
        }
    }
    const { expandBoardingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./boardingOriginKeys')));
    const { expandGroomingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./groomingOriginKeys')));
    const withBoarding = await expandBoardingAppointmentOriginKeys(clinicId, keys);
    return expandGroomingAppointmentOriginKeys(clinicId, withBoarding);
}
async function collectUnbilledItems(clinicId, unitId, keys, opts) {
    // Quando false, pula buildPreview/loadHospitalization (N+1) — só conta itens.
    const includeAmounts = opts?.includeAmounts !== false;
    const items = [];
    let comandaOpenKeys;
    let billedViaComandaKeys;
    try {
        comandaOpenKeys = await (0, hubComandasController_1.fetchOpenComandaOriginKeysExported)(clinicId);
        billedViaComandaKeys = await fetchBilledOriginKeysFromComandas(clinicId);
    }
    catch {
        comandaOpenKeys = new Set();
        billedViaComandaKeys = new Set();
    }
    const unbilledBoardingCtx = {
        activeReceivableKeys: keys,
        comandaOpenKeys,
        billedViaComandaKeys,
    };
    let gq = supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select(`
      id, unit_id, closed_at, guardian_id, hub_staff_member_id, grooming_stage, billing_waived_at, hub_appointment_id,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .eq('grooming_stage', 'closed')
        .is('deleted_at', null)
        .is('billing_waived_at', null)
        .order('closed_at', { ascending: false })
        .limit(200);
    if (unitId)
        gq = gq.eq('unit_id', unitId);
    const { data: groomRows, error: gErr } = await gq;
    if (gErr)
        throw new Error(gErr.message);
    for (const row of groomRows ?? []) {
        if (keys.has(`grooming_session:${row.id}`))
            continue;
        if (comandaOpenKeys.has(`grooming_session:${row.id}`))
            continue;
        if (billedViaComandaKeys.has(`grooming_session:${row.id}`))
            continue;
        const apptId = row.hub_appointment_id;
        if (apptId && keys.has(`appointment:${apptId}`))
            continue;
        if (apptId && comandaOpenKeys.has(`appointment:${apptId}`))
            continue;
        if (apptId && billedViaComandaKeys.has(`appointment:${apptId}`))
            continue;
        const estimated_amount = includeAmounts
            ? (await buildPreviewForGroomingSession(clinicId, row.id)).subtotal
            : 0;
        const pet = row.pet;
        const g = row.guardian;
        items.push({
            source_type: 'grooming_session',
            source_id: row.id,
            origin_label: 'Banho e Tosa',
            completed_at: row.closed_at ?? null,
            unit_id: row.unit_id ?? null,
            guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
            pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
            staff: null,
            estimated_amount,
            operational_status: String(row.grooming_stage),
        });
    }
    let eq = supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select(`
      id, unit_id, completed_at, guardian_id, hub_staff_member_id, status, billing_waived_at, hub_appointment_id,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .is('billing_waived_at', null)
        .order('completed_at', { ascending: false })
        .limit(200);
    if (unitId)
        eq = eq.eq('unit_id', unitId);
    const { data: encRows, error: eErr } = await eq;
    if (eErr)
        throw new Error(eErr.message);
    for (const row of encRows ?? []) {
        if (keys.has(`encounter:${row.id}`))
            continue;
        if (comandaOpenKeys.has(`encounter:${row.id}`))
            continue;
        if (billedViaComandaKeys.has(`encounter:${row.id}`))
            continue;
        const apptIdEnc = row.hub_appointment_id;
        if (apptIdEnc && comandaOpenKeys.has(`appointment:${apptIdEnc}`))
            continue;
        if (apptIdEnc && billedViaComandaKeys.has(`appointment:${apptIdEnc}`))
            continue;
        const estimated_amount = includeAmounts
            ? (await buildPreviewForEncounter(clinicId, row.id)).subtotal
            : 0;
        const pet = row.pet;
        const g = row.guardian;
        items.push({
            source_type: 'encounter',
            source_id: row.id,
            origin_label: 'Clínica',
            completed_at: row.completed_at ?? null,
            unit_id: row.unit_id ?? null,
            guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
            pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
            staff: null,
            estimated_amount,
            operational_status: String(row.status),
        });
    }
    let qq = supabase_1.supabaseAdmin
        .from('hub_quotes')
        .select(`
      id, unit_id, status, converted_at, updated_at, billing_state, billing_waived_at, total_amount, guardian_id,
      prospect:hub_prospects(id, full_name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .eq('status', 'accepted')
        .is('billing_waived_at', null)
        .in('billing_state', ['awaiting_billing', 'none'])
        .order('converted_at', { ascending: false, nullsFirst: false })
        .limit(200);
    if (unitId)
        qq = qq.eq('unit_id', unitId);
    const { data: quoteRows, error: qErr } = await qq;
    if (qErr)
        throw new Error(qErr.message);
    for (const row of quoteRows ?? []) {
        if (keys.has(`quote:${row.id}`))
            continue;
        if (comandaOpenKeys.has(`quote:${row.id}`))
            continue;
        if (billedViaComandaKeys.has(`quote:${row.id}`))
            continue;
        const estimated_amount = includeAmounts
            ? (await buildPreviewForQuote(clinicId, row.id)).final_amount
            : Number(row.total_amount ?? 0);
        const prospect = row.prospect;
        const prospectName = prospect
            ? Array.isArray(prospect)
                ? prospect[0]?.full_name
                : prospect.full_name
            : null;
        const gEmbed = row.guardian;
        const guardianResolved = row.guardian_id
            ? gEmbed
                ? Array.isArray(gEmbed)
                    ? gEmbed[0]
                    : gEmbed
                : { id: row.guardian_id, full_name: '—' }
            : prospectName
                ? { id: '', full_name: String(prospectName) }
                : null;
        items.push({
            source_type: 'quote',
            source_id: row.id,
            origin_label: 'Orçamento',
            completed_at: row.converted_at ?? row.updated_at ?? null,
            unit_id: row.unit_id ?? null,
            guardian: guardianResolved,
            pet: null,
            staff: null,
            estimated_amount,
            operational_status: String(row.billing_state ?? 'awaiting_billing'),
        });
    }
    let aq = supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select(`
      id, unit_id, starts_at, ends_at, status, guardian_id, pet_id, hub_staff_member_id, billing_waived_at,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .in('status', ['done', 'paid'])
        .is('deleted_at', null)
        .is('billing_waived_at', null)
        .order('ends_at', { ascending: false })
        .limit(200);
    if (unitId)
        aq = aq.eq('unit_id', unitId);
    const { data: apptRows, error: aErr } = await aq;
    if (aErr)
        throw new Error(aErr.message);
    const apptIds = (apptRows ?? []).map((row) => row.id);
    const apptIdsWithOperation = new Set();
    if (apptIds.length > 0) {
        const [{ data: encOps }, { data: groomOps }, { data: boardingOps }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('hub_appointment_id')
                .in('hub_appointment_id', apptIds)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null),
            supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('hub_appointment_id')
                .in('hub_appointment_id', apptIds)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null),
            supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .select('hub_appointment_id')
                .in('hub_appointment_id', apptIds)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null),
        ]);
        for (const row of encOps ?? []) {
            if (row.hub_appointment_id)
                apptIdsWithOperation.add(row.hub_appointment_id);
        }
        for (const row of groomOps ?? []) {
            if (row.hub_appointment_id)
                apptIdsWithOperation.add(row.hub_appointment_id);
        }
        for (const row of boardingOps ?? []) {
            if (row.hub_appointment_id)
                apptIdsWithOperation.add(row.hub_appointment_id);
        }
    }
    for (const row of apptRows ?? []) {
        const id = row.id;
        if (keys.has(`appointment:${id}`))
            continue;
        if (comandaOpenKeys.has(`appointment:${id}`))
            continue;
        if (billedViaComandaKeys.has(`appointment:${id}`))
            continue;
        if (apptIdsWithOperation.has(id))
            continue;
        const estimated_amount = includeAmounts
            ? (await buildPreviewForAppointment(clinicId, id)).subtotal
            : 0;
        const pet = row.pet;
        const g = row.guardian;
        items.push({
            source_type: 'appointment',
            source_id: id,
            origin_label: 'Agendamento',
            completed_at: row.ends_at ?? row.starts_at ?? null,
            unit_id: row.unit_id ?? null,
            guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
            pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
            staff: null,
            estimated_amount,
            operational_status: String(row.status),
        });
    }
    let bq = supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select(`
      id, unit_id, checked_out_at, expected_check_out, expected_check_in, checked_in_at,
      guardian_id, pet_id, mode, status, daily_rate_cents, billing_waived_at, deleted_at,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .eq('status', 'checked_out')
        .is('deleted_at', null)
        .is('billing_waived_at', null)
        .order('checked_out_at', { ascending: false })
        .limit(200);
    if (unitId)
        bq = bq.eq('unit_id', unitId);
    const { data: boardingRows, error: bErr } = await bq;
    if (bErr)
        throw new Error(bErr.message);
    const boardingIds = (boardingRows ?? []).map((row) => row.id);
    const extrasByReservation = new Map();
    if (boardingIds.length > 0) {
        const { data: extraRows } = await supabase_1.supabaseAdmin
            .from('hub_boarding_extras')
            .select('id, hub_boarding_reservation_id, hub_service_type_id, description, quantity, unit_amount_cents, service_date, deleted_at')
            .eq('clinic_id', clinicId)
            .in('hub_boarding_reservation_id', boardingIds)
            .is('deleted_at', null);
        for (const ex of extraRows ?? []) {
            const rid = ex.hub_boarding_reservation_id;
            const list = extrasByReservation.get(rid) ?? [];
            list.push({
                id: ex.id,
                hub_service_type_id: ex.hub_service_type_id ?? null,
                description: String(ex.description ?? 'Adicional'),
                quantity: Number(ex.quantity) || 0,
                unit_amount_cents: Number(ex.unit_amount_cents) || 0,
                service_date: ex.service_date ?? null,
                deleted_at: ex.deleted_at ?? null,
            });
            extrasByReservation.set(rid, list);
        }
    }
    for (const row of boardingRows ?? []) {
        const reservation = {
            id: row.id,
            mode: row.mode,
            status: row.status,
            expected_check_in: row.expected_check_in,
            expected_check_out: row.expected_check_out,
            checked_in_at: row.checked_in_at,
            checked_out_at: row.checked_out_at,
            daily_rate_cents: row.daily_rate_cents,
            billing_waived_at: row.billing_waived_at,
            deleted_at: row.deleted_at,
        };
        if (!(0, boardingBilling_1.shouldIncludeInUnbilledBoarding)(reservation, unbilledBoardingCtx))
            continue;
        const modeLabel = row.mode === 'hotel' ? 'Hotel' : 'Creche';
        const pet = row.pet;
        const g = row.guardian;
        const checkOut = row.checked_out_at ?? row.expected_check_out;
        items.push({
            source_type: 'boarding_reservation',
            source_id: row.id,
            origin_label: `Hotel & Creche (${modeLabel})`,
            completed_at: checkOut,
            unit_id: row.unit_id ?? null,
            guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
            pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
            staff: null,
            estimated_amount: (0, boardingBilling_1.estimateBoardingUnbilledAmount)(reservation, extrasByReservation.get(row.id) ?? []),
            operational_status: 'checked_out',
        });
    }
    // C — Internações encerradas como origem explícita na fila sem cobrança.
    {
        let hq = supabase_1.supabaseAdmin
            .from('hub_hospitalizations')
            .select(`
        id, unit_id, status, discharged_at, admitted_at, guardian_id, pet_id,
        hub_encounter_id, hub_appointment_id, daily_hub_service_type_id, daily_unit_amount,
        billing_waived_at, deleted_at,
        pet:hub_pets(id, name),
        guardian:hub_guardians(id, full_name)
      `)
            .eq('clinic_id', clinicId)
            .in('status', [...hubHospitalizationBilling_1.HOSPITALIZATION_CLOSED_STATUSES])
            .is('deleted_at', null)
            .is('billing_waived_at', null)
            .not('discharged_at', 'is', null)
            .order('discharged_at', { ascending: false })
            .limit(200);
        if (unitId)
            hq = hq.eq('unit_id', unitId);
        const { data: hospRows, error: hErr } = await hq;
        if (hErr && !String(hErr.message || '').includes('hub_hospitalizations'))
            throw new Error(hErr.message);
        const alreadyListedBillingOrigins = new Set(items
            .filter((i) => i.source_type === 'encounter' || i.source_type === 'appointment')
            .map((i) => `${i.source_type}:${i.source_id}`));
        // Também considera billing_origin já emitido por outra internação.
        for (const i of items) {
            if (i.billing_origin_type && i.billing_origin_id) {
                alreadyListedBillingOrigins.add(`${i.billing_origin_type}:${i.billing_origin_id}`);
            }
        }
        const unbilledHospCtx = {
            activeReceivableKeys: keys,
            comandaOpenKeys,
            billedViaComandaKeys,
            alreadyListedBillingOrigins,
        };
        for (const row of hospRows ?? []) {
            const hospInput = {
                id: row.id,
                status: String(row.status ?? ''),
                billing_waived_at: row.billing_waived_at ?? null,
                deleted_at: row.deleted_at ?? null,
                hub_encounter_id: row.hub_encounter_id ?? null,
                hub_appointment_id: row.hub_appointment_id ?? null,
            };
            if (!(0, hubHospitalizationBilling_1.shouldIncludeInUnbilledHospitalization)(hospInput, unbilledHospCtx))
                continue;
            const origin = (0, hubHospitalizationBilling_1.resolveHospitalizationBillingOrigin)(hospInput);
            if (!origin)
                continue;
            let estimated_amount = 0;
            if (includeAmounts) {
                const hosp = await (0, hubHospitalizationBilling_1.loadHospitalizationComandaItems)({
                    clinicId,
                    hospitalizationId: row.id,
                    encounterId: origin.origin_type === 'encounter' ? origin.origin_id : null,
                    appointmentId: origin.origin_type === 'appointment' ? origin.origin_id : hospInput.hub_appointment_id,
                    defaultPetId: row.pet_id ?? null,
                });
                if (hosp.subtotal <= 0.009 && hosp.items.length === 0)
                    continue;
                estimated_amount = hosp.subtotal;
            }
            const pet = row.pet;
            const g = row.guardian;
            alreadyListedBillingOrigins.add(`${origin.origin_type}:${origin.origin_id}`);
            items.push({
                source_type: 'hospitalization',
                source_id: row.id,
                origin_label: 'Internação (alta)',
                completed_at: row.discharged_at ?? row.admitted_at ?? null,
                unit_id: row.unit_id ?? null,
                guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
                pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
                staff: null,
                estimated_amount,
                operational_status: String(row.status),
                billing_origin_type: origin.origin_type,
                billing_origin_id: origin.origin_id,
            });
        }
    }
    items.sort((a, b) => {
        const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return tb - ta;
    });
    return items;
}
const unbilledQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
})
    .strict();
async function fetchActiveReceivableKeysExpanded(clinicId) {
    const keys = await fetchActiveReceivableKeys(clinicId);
    const { expandBoardingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./boardingOriginKeys')));
    const { expandGroomingAppointmentOriginKeys } = await Promise.resolve().then(() => __importStar(require('./groomingOriginKeys')));
    const withBoarding = await expandBoardingAppointmentOriginKeys(clinicId, keys);
    return expandGroomingAppointmentOriginKeys(clinicId, withBoarding);
}
const getHubFinanceUnbilledCompleted = async (req, res) => {
    try {
        const parsed = unbilledQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id } = parsed.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const { resolveReportUnitScope } = await Promise.resolve().then(() => __importStar(require('./hubReportUnitScope')));
        const unitScope = await resolveReportUnitScope({
            userId,
            clinicId: clinic_id,
            requestedUnitId: parsed.data.unit_id ?? null,
            unitMode: 'required',
        });
        if (!unitScope.ok)
            return res.status(unitScope.status).json({ error: unitScope.error });
        const unit_id = unitScope.unitId ?? undefined;
        const keys = await fetchActiveReceivableKeysExpanded(clinic_id);
        const items = await collectUnbilledItems(clinic_id, unit_id, keys);
        return res.json({ items, count: items.length });
    }
    catch (e) {
        console.error('getHubFinanceUnbilledCompleted', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceUnbilledCompleted = getHubFinanceUnbilledCompleted;
const getHubFinancePendingBillingCount = async (req, res) => {
    try {
        const parsed = unbilledQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id } = parsed.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const { resolveReportUnitScope } = await Promise.resolve().then(() => __importStar(require('./hubReportUnitScope')));
        const unitScope = await resolveReportUnitScope({
            userId,
            clinicId: clinic_id,
            requestedUnitId: parsed.data.unit_id ?? null,
            unitMode: 'required',
        });
        if (!unitScope.ok)
            return res.status(unitScope.status).json({ error: unitScope.error });
        const unit_id = unitScope.unitId ?? undefined;
        const keys = await fetchActiveReceivableKeysExpanded(clinic_id);
        const items = await collectUnbilledItems(clinic_id, unit_id, keys);
        return res.json({ pending_billing_count: items.length });
    }
    catch (e) {
        console.error('getHubFinancePendingBillingCount', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinancePendingBillingCount = getHubFinancePendingBillingCount;
// ─── DAY BOARD (Caixa: todos os atendimentos do dia) ────────────────────────
/** Carrega comanda e status de recebível para um conjunto de origens em batch. */
async function fetchBillingStatusBatch(clinicId, originKeys) {
    const result = new Map();
    if (!originKeys.length)
        return result;
    // Carrega todas as comandas não canceladas para as origens
    const { data: comandas } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, origin_type, origin_id, status, finance_handoff_at')
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelada')
        .is('deleted_at', null)
        .not('origin_id', 'is', null);
    const comandaByKey = new Map();
    for (const c of comandas ?? []) {
        const key = `${c.origin_type}:${c.origin_id}`;
        comandaByKey.set(key, {
            id: c.id,
            status: c.status,
            finance_handoff_at: c.finance_handoff_at ?? null,
        });
    }
    const appointmentIdsWithoutComanda = originKeys
        .filter((k) => k.origin_type === 'appointment' && !comandaByKey.has(`appointment:${k.origin_id}`))
        .map((k) => k.origin_id);
    if (appointmentIdsWithoutComanda.length > 0) {
        const { data: encs } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('hub_appointment_id', appointmentIdsWithoutComanda)
            .is('deleted_at', null);
        for (const enc of encs ?? []) {
            const apptId = enc.hub_appointment_id;
            if (!apptId)
                continue;
            const encComanda = comandaByKey.get(`encounter:${enc.id}`);
            if (encComanda)
                comandaByKey.set(`appointment:${apptId}`, encComanda);
        }
    }
    // Alias Hotel/Creche ↔ agendamento: comanda appointment conta para boarding_reservation e vice-versa.
    const linkedSourceKeys = new Map();
    const pushLinkedSourceKey = (a, b) => {
        const list = linkedSourceKeys.get(a) ?? [];
        if (!list.includes(b))
            list.push(b);
        linkedSourceKeys.set(a, list);
    };
    const boardingIdsForAlias = originKeys
        .filter((k) => k.origin_type === 'boarding_reservation')
        .map((k) => k.origin_id);
    const appointmentIdsForAlias = originKeys
        .filter((k) => k.origin_type === 'appointment')
        .map((k) => k.origin_id);
    if (boardingIdsForAlias.length || appointmentIdsForAlias.length) {
        const { fetchBoardingAppointmentLinks } = await Promise.resolve().then(() => __importStar(require('./boardingOriginKeys')));
        const links = await fetchBoardingAppointmentLinks(clinicId, {
            boardingIds: boardingIdsForAlias,
            appointmentIds: appointmentIdsForAlias,
        });
        for (const [boardingId, apptId] of links.appointmentByBoardingId) {
            const boardKey = `boarding_reservation:${boardingId}`;
            const apptKey = `appointment:${apptId}`;
            const boardComanda = comandaByKey.get(boardKey);
            const apptComanda = comandaByKey.get(apptKey);
            if (!boardComanda && apptComanda)
                comandaByKey.set(boardKey, apptComanda);
            if (!apptComanda && boardComanda)
                comandaByKey.set(apptKey, boardComanda);
            pushLinkedSourceKey(boardKey, apptKey);
            pushLinkedSourceKey(apptKey, boardKey);
        }
    }
    // Alias Banho & Tosa ↔ agendamento: day-board prefere grooming_session, mas a comanda
    // pode ter nascido como appointment (ou o inverso) — sem isso a linha fica "Sem cobrança".
    const groomingIdsForAlias = originKeys
        .filter((k) => k.origin_type === 'grooming_session')
        .map((k) => k.origin_id);
    if (groomingIdsForAlias.length || appointmentIdsForAlias.length) {
        const { fetchGroomingAppointmentLinks } = await Promise.resolve().then(() => __importStar(require('./groomingOriginKeys')));
        const links = await fetchGroomingAppointmentLinks(clinicId, {
            sessionIds: groomingIdsForAlias,
            appointmentIds: appointmentIdsForAlias,
        });
        for (const [sessionId, apptId] of links.appointmentBySessionId) {
            const sessionKey = `grooming_session:${sessionId}`;
            const apptKey = `appointment:${apptId}`;
            const sessionComanda = comandaByKey.get(sessionKey);
            const apptComanda = comandaByKey.get(apptKey);
            if (!sessionComanda && apptComanda)
                comandaByKey.set(sessionKey, apptComanda);
            if (!apptComanda && sessionComanda)
                comandaByKey.set(apptKey, sessionComanda);
            pushLinkedSourceKey(sessionKey, apptKey);
            pushLinkedSourceKey(apptKey, sessionKey);
        }
    }
    // Carrega recebíveis ativos por source_key e comanda_id
    const { data: receivables } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, source_type, source_id, comanda_id, status, due_date, final_amount')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    const receivableRowsBySourceKey = new Map();
    const receivableRowsByComandaId = new Map();
    const pushReceivable = (map, mapKey, row) => {
        const list = map.get(mapKey) ?? [];
        list.push(row);
        map.set(mapKey, list);
    };
    for (const r of receivables ?? []) {
        const row = {
            id: r.id,
            status: String(r.status),
            due_date: r.due_date ?? null,
            final_amount: Number(r.final_amount ?? 0),
        };
        pushReceivable(receivableRowsBySourceKey, `${r.source_type}:${r.source_id}`, row);
        if (r.comanda_id) {
            pushReceivable(receivableRowsByComandaId, r.comanda_id, row);
        }
    }
    for (const { origin_type, origin_id } of originKeys) {
        const key = `${origin_type}:${origin_id}`;
        const comanda = comandaByKey.get(key) ?? null;
        const rowsById = new Map();
        for (const row of receivableRowsBySourceKey.get(key) ?? [])
            rowsById.set(row.id, row);
        for (const linkedKey of linkedSourceKeys.get(key) ?? []) {
            for (const row of receivableRowsBySourceKey.get(linkedKey) ?? [])
                rowsById.set(row.id, row);
        }
        if (comanda) {
            for (const row of receivableRowsByComandaId.get(comanda.id) ?? [])
                rowsById.set(row.id, row);
        }
        const receivableRows = [...rowsById.values()];
        const statuses = receivableRows.map((r) => r.status);
        const receivable_status = (0, hubFinancialDayBoard_1.aggregateReceivableStatus)(statuses);
        const has_receivable = statuses.length > 0;
        const activeId = (0, hubFinancialDayBoard_1.pickActiveReceivableId)(receivableRows);
        const activeRow = activeId ? receivableRows.find((r) => r.id === activeId) : undefined;
        result.set(key, {
            comanda_id: comanda?.id ?? null,
            comanda_status: comanda?.status ?? null,
            has_receivable,
            receivable_status,
            finance_handoff_at: comanda?.finance_handoff_at ?? null,
            active_receivable_id: activeId,
            due_date: activeRow?.due_date ?? null,
            // Placeholder: saldo real (final − pago) preenchido abaixo em lote.
            receivable_amount: activeRow != null ? Number(activeRow.final_amount ?? 0) : null,
            stock_return_status: null,
        });
    }
    const activeIds = [...result.values()]
        .map((b) => b.active_receivable_id)
        .filter((id) => Boolean(id));
    if (activeIds.length > 0) {
        const [{ data: productLines }, { data: returnEvents }, { data: postedPays }, { data: lineRefundAdj }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_receivable_lines')
                .select('id, receivable_id, line_kind, hub_inventory_item_id, hub_inventory_lot_id, quantity')
                .eq('clinic_id', clinicId)
                .in('receivable_id', activeIds),
            supabase_1.supabaseAdmin
                .from('hub_product_return_events')
                .select('receivable_id, receivable_line_id, condition')
                .eq('clinic_id', clinicId)
                .in('receivable_id', activeIds)
                .then((r) => {
                if (r.error && /does not exist|schema cache|42P01/i.test(String(r.error.message))) {
                    return { data: [] };
                }
                if (r.error)
                    throw new Error(r.error.message);
                return r;
            }),
            supabase_1.supabaseAdmin
                .from('hub_payments')
                .select('receivable_id, amount')
                .in('receivable_id', activeIds)
                .eq('status', 'posted'),
            supabase_1.supabaseAdmin
                .from('hub_financial_adjustments')
                .select('receivable_id, amount, payment_id')
                .in('receivable_id', activeIds)
                .eq('adjustment_type', 'refund'),
        ]);
        const postedByRec = new Map();
        for (const p of postedPays ?? []) {
            const rid = String(p.receivable_id);
            postedByRec.set(rid, round2((postedByRec.get(rid) ?? 0) + Number(p.amount ?? 0)));
        }
        const lineRefundByRec = new Map();
        for (const adj of lineRefundAdj ?? []) {
            if (adj.payment_id != null)
                continue;
            const rid = String(adj.receivable_id);
            lineRefundByRec.set(rid, round2((lineRefundByRec.get(rid) ?? 0) + Number(adj.amount ?? 0)));
        }
        for (const billing of result.values()) {
            const rid = billing.active_receivable_id;
            if (!rid)
                continue;
            const finalAmt = Number(billing.receivable_amount ?? 0);
            billing.receivable_amount = (0, hubReceivableFinancialBalance_1.balanceDue)({
                finalAmount: finalAmt,
                postedPayments: postedByRec.get(rid) ?? 0,
                lineRefundsAlreadyPaidOut: lineRefundByRec.get(rid) ?? 0,
            });
        }
        const linesByRec = new Map();
        for (const line of productLines ?? []) {
            if (!(0, hubProductReturnStatus_1.isProductStockLine)(line))
                continue;
            const rid = String(line.receivable_id);
            const list = linesByRec.get(rid) ?? [];
            list.push(String(line.id));
            linesByRec.set(rid, list);
        }
        const returnsByRec = new Map();
        for (const ev of returnEvents ?? []) {
            const rid = String(ev.receivable_id);
            const list = returnsByRec.get(rid) ?? [];
            list.push({
                receivable_line_id: String(ev.receivable_line_id),
                condition: String(ev.condition),
            });
            returnsByRec.set(rid, list);
        }
        for (const billing of result.values()) {
            const rid = billing.active_receivable_id;
            if (!rid)
                continue;
            billing.stock_return_status = (0, hubProductReturnStatus_1.computeStockReturnStatus)({
                productLineIds: linesByRec.get(rid) ?? [],
                returns: returnsByRec.get(rid) ?? [],
                receivableStatus: billing.receivable_status,
            });
        }
    }
    return result;
}
const SERVICE_GROUP_LABELS = {
    clinica: 'Clínica',
    banho_tosa: 'Banho & Tosa',
    hotel: 'Hotel',
    creche: 'Creche',
    leva_traz: 'Leva e Traz',
    cirurgia: 'Cirurgia',
    internacao: 'Internação',
    outros: 'Outros',
};
function resolveServiceGroupLabel(group) {
    return SERVICE_GROUP_LABELS[group] ?? group.replace(/_/g, ' ');
}
function timestampInUtcDayRange(iso, dayStart, dayEnd) {
    if (!iso)
        return false;
    return iso >= dayStart && iso <= dayEnd;
}
function resolveAppointmentDayBoardMeta(row, serviceTypeMetaById) {
    const services = row.appointment_services ?? [];
    const primarySvc = row.hub_service_type_id != null
        ? services.find((s) => s.hub_service_type_id === row.hub_service_type_id) ?? services[0]
        : services[0];
    const primaryTypeId = (primarySvc?.hub_service_type_id ?? row.hub_service_type_id);
    const metaFromMap = primaryTypeId ? serviceTypeMetaById?.get(primaryTypeId) : undefined;
    const group = String(primarySvc?.service_type?.service_group ?? metaFromMap?.service_group ?? 'outros').trim() || 'outros';
    const groupLabel = resolveServiceGroupLabel(group);
    const title = String(row.title ?? '').trim();
    const primaryName = String(primarySvc?.service_type?.name ?? metaFromMap?.name ?? '').trim();
    let origin_label;
    if (title && title !== 'Agendamento') {
        origin_label = `${groupLabel} — ${title}`;
    }
    else if (primaryName) {
        origin_label = `${groupLabel} — ${primaryName}`;
    }
    else {
        origin_label = groupLabel;
    }
    return { service_group: group, origin_label };
}
/** Waive em cascata: alta cobrada via encounter/appointment também sai da fila C. */
async function cascadeWaiveLinkedHospitalizations(opts) {
    const col = opts.originType === 'encounter' ? 'hub_encounter_id' : 'hub_appointment_id';
    const { error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .update({ billing_waived_at: opts.waivedAt, billing_waive_reason: opts.reason })
        .eq('clinic_id', opts.clinicId)
        .eq(col, opts.originId)
        .in('status', [...hubHospitalizationBilling_1.HOSPITALIZATION_CLOSED_STATUSES])
        .is('deleted_at', null)
        .is('billing_waived_at', null);
    if (error && !String(error.message || '').includes('billing_waived')) {
        throw new Error(error.message);
    }
}
const ymdSchema = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dayBoardQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    date: ymdSchema.optional(),
    from: ymdSchema.optional(),
    to: ymdSchema.optional(),
    /** Lista tudo em aberto / enviado ao financeiro, sem filtro de data do atendimento. */
    open: zod_1.z.enum(['1', 'true', 'yes']).optional(),
    billing_scope: zod_1.z.enum(['financeiro']).optional(),
})
    .strict();
const getHubFinanceDayBoard = async (req, res) => {
    try {
        const parsed = dayBoardQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id, unit_id, billing_scope } = parsed.data;
        const openMode = Boolean(parsed.data.open);
        const fromYmd = parsed.data.from ?? parsed.data.date ?? ymdTodayUtc();
        const toYmd = parsed.data.to ?? parsed.data.date ?? fromYmd;
        if (!openMode && fromYmd > toYmd) {
            return res.status(400).json({ error: 'from deve ser anterior ou igual a to' });
        }
        const dayStart = utcDayStartIso(fromYmd);
        const dayEnd = utcDayEndIso(toYmd);
        const dateYmd = parsed.data.date ?? toYmd;
        const openOriginKeys = openMode ? await (0, hubFinanceDayBoardOpen_1.collectOpenFinanceiroOriginKeys)(clinic_id, unit_id) : null;
        const openIdsByType = new Map();
        if (openOriginKeys) {
            for (const k of openOriginKeys) {
                const list = openIdsByType.get(k.origin_type) ?? [];
                list.push(k.origin_id);
                openIdsByType.set(k.origin_type, list);
            }
        }
        const items = [];
        const originKeys = [];
        // ── 1. Agendamentos (por período ou por IDs em aberto) ──
        const openAppointmentIds = openIdsByType.get('appointment') ?? [];
        let apptRows = null;
        if (!openMode || openAppointmentIds.length > 0) {
            let aq = supabase_1.supabaseAdmin
                .from('hub_appointments')
                .select(`id, unit_id, starts_at, ends_at, status, guardian_id, pet_id, billing_waived_at, title, hub_service_type_id,
          parent_appointment_id, visit_group_id, appointment_kind,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name),
          appointment_services:hub_appointment_services(id, hub_service_type_id, sale_amount_applied, service_type:hub_service_types(name, service_group, sale_amount))`)
                .eq('clinic_id', clinic_id)
                .not('status', 'in', '("cancelled","no_show")')
                .is('deleted_at', null)
                .order('starts_at', { ascending: true });
            if (openMode) {
                aq = aq.in('id', openAppointmentIds);
            }
            else {
                aq = aq.gte('starts_at', dayStart).lte('starts_at', dayEnd);
            }
            if (unit_id)
                aq = aq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
            const apptRes = await aq;
            if (apptRes.error)
                throw new Error(apptRes.error.message);
            apptRows = apptRes.data ?? [];
        }
        else {
            apptRows = [];
        }
        const appointmentServiceTypeIds = new Set();
        for (const row of apptRows ?? []) {
            const primaryTypeId = row.hub_service_type_id;
            if (primaryTypeId)
                appointmentServiceTypeIds.add(primaryTypeId);
            const svcRows = row.appointment_services ?? [];
            for (const svc of svcRows) {
                if (svc.hub_service_type_id)
                    appointmentServiceTypeIds.add(svc.hub_service_type_id);
            }
        }
        const serviceTypeMetaById = new Map();
        if (appointmentServiceTypeIds.size > 0) {
            const { data: serviceTypeRows, error: stErr } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, name, service_group, sale_amount')
                .in('id', [...appointmentServiceTypeIds]);
            if (stErr)
                throw new Error(stErr.message);
            for (const st of serviceTypeRows ?? []) {
                serviceTypeMetaById.set(String(st.id), {
                    name: String(st.name ?? 'Serviço'),
                    service_group: String(st.service_group ?? 'outros').trim() || 'outros',
                    sale_amount: st.sale_amount == null ? null : Number(st.sale_amount),
                });
            }
        }
        const enrichApptServices = (services) => services.map((sv) => {
            const embedded = sv.service_type;
            if (embedded?.service_group != null && embedded?.sale_amount != null)
                return sv;
            const typeId = sv.hub_service_type_id;
            const meta = typeId ? serviceTypeMetaById.get(typeId) : undefined;
            if (!meta)
                return sv;
            return {
                ...sv,
                service_type: {
                    name: embedded?.name ?? meta.name,
                    service_group: embedded?.service_group ?? meta.service_group,
                    sale_amount: embedded?.sale_amount ?? meta.sale_amount,
                },
            };
        });
        /** Pernas L&T anexadas (com parent) cobram na comanda do ancestral — não entram soltas no caixa. */
        const attachedPickupLegsByParent = new Map();
        for (const row of apptRows ?? []) {
            const kind = String(row.appointment_kind ?? '');
            const parentId = row.parent_appointment_id ?? null;
            if (kind === 'pickup_route' && parentId) {
                const list = attachedPickupLegsByParent.get(parentId) ?? [];
                list.push(row);
                attachedPickupLegsByParent.set(parentId, list);
            }
        }
        for (const row of apptRows ?? []) {
            if (row.billing_waived_at)
                continue;
            const kind = String(row.appointment_kind ?? '');
            const parentId = row.parent_appointment_id ?? null;
            // L&T anexado: omitir do day board (valor sobe no ancestral). Standalone (sem parent) permanece.
            if (kind === 'pickup_route' && parentId)
                continue;
            const id = row.id;
            const pet = row.pet;
            const g = row.guardian;
            const services = row.appointment_services ?? [];
            const servicesEnriched = enrichApptServices(services);
            const rolledLegServices = [];
            for (const leg of attachedPickupLegsByParent.get(id) ?? []) {
                if (leg.billing_waived_at)
                    continue;
                const legStatus = String(leg.status ?? '');
                if (legStatus === 'cancelled' || legStatus === 'no_show')
                    continue;
                const legSvcs = enrichApptServices(leg.appointment_services ?? []);
                rolledLegServices.push(...legSvcs);
            }
            const allServicesForEstimate = [...servicesEnriched, ...rolledLegServices];
            const estimated = round2(allServicesForEstimate.reduce((s, sv) => s + (0, hubPricingResolve_1.resolveAppliedSaleAmount)(sv.sale_amount_applied, sv.service_type?.sale_amount), 0));
            const { service_group, origin_label } = resolveAppointmentDayBoardMeta({
                title: row.title,
                hub_service_type_id: row.hub_service_type_id,
                appointment_services: servicesEnriched,
            }, serviceTypeMetaById);
            originKeys.push({ origin_type: 'appointment', origin_id: id });
            items.push({
                origin_type: 'appointment',
                origin_id: id,
                origin_label,
                service_group,
                starts_at: row.starts_at ?? null,
                guardian_id: row.guardian_id ?? null,
                guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
                pet_id: row.pet_id ?? null,
                pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
                operational_status: String(row.status),
                estimated_amount: estimated,
                services: allServicesForEstimate.map((sv) => ({
                    name: String(sv.service_type?.name ?? 'Serviço'),
                    amount: (0, hubPricingResolve_1.resolveAppliedSaleAmount)(sv.sale_amount_applied, sv.service_type?.sale_amount),
                    kind: 'service',
                })),
                billing: {
                    comanda_id: null,
                    comanda_status: null,
                    has_receivable: false,
                    receivable_status: null,
                    finance_handoff_at: null,
                    active_receivable_id: null,
                    due_date: null,
                },
                parent_appointment_id: parentId,
                visit_group_id: row.visit_group_id ?? null,
                appointment_kind: row.appointment_kind ?? null,
            });
        }
        // ── 2. Sessões B&T (walk-ins do dia + encerradas do dia c/ agenda, ou IDs em aberto) ──
        // Antes só entravam walk-ins (hub_appointment_id null): banho da agenda encerrado
        // ficava só no relatório "Cobrança não gerada" e o Caixa via appointment com valor sem adicional.
        const openGroomingIds = openIdsByType.get('grooming_session') ?? [];
        let groomRows = [];
        if (openMode) {
            if (openGroomingIds.length > 0) {
                let gq = supabase_1.supabaseAdmin
                    .from('hub_grooming_sessions')
                    .select(`id, unit_id, created_at, closed_at, grooming_stage, guardian_id, pet_id, billing_waived_at, hub_appointment_id,
            pet:hub_pets(id, name),
            guardian:hub_guardians(id, full_name)`)
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null)
                    .neq('grooming_stage', 'cancelled')
                    .in('id', openGroomingIds)
                    .order('created_at', { ascending: true });
                if (unit_id)
                    gq = gq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
                const groomRes = await gq;
                if (groomRes.error)
                    throw new Error(groomRes.error.message);
                groomRows = groomRes.data ?? [];
            }
        }
        else {
            const groomSelect = `id, unit_id, created_at, closed_at, grooming_stage, guardian_id, pet_id, billing_waived_at, hub_appointment_id,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name)`;
            let walkInQ = supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select(groomSelect)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .neq('grooming_stage', 'cancelled')
                .is('hub_appointment_id', null)
                .gte('created_at', dayStart)
                .lte('created_at', dayEnd)
                .order('created_at', { ascending: true });
            let closedQ = supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select(groomSelect)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .eq('grooming_stage', 'closed')
                .gte('closed_at', dayStart)
                .lte('closed_at', dayEnd)
                .order('closed_at', { ascending: true });
            if (unit_id) {
                walkInQ = walkInQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
                closedQ = closedQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
            }
            const [walkInRes, closedRes] = await Promise.all([walkInQ, closedQ]);
            if (walkInRes.error)
                throw new Error(walkInRes.error.message);
            if (closedRes.error)
                throw new Error(closedRes.error.message);
            const byId = new Map();
            for (const row of [...(walkInRes.data ?? []), ...(closedRes.data ?? [])]) {
                byId.set(String(row.id), row);
            }
            groomRows = [...byId.values()];
        }
        const groomingLinkedAppointmentIds = new Set();
        for (const row of groomRows) {
            if (row.billing_waived_at)
                continue;
            const id = row.id;
            const apptId = row.hub_appointment_id ?? null;
            if (apptId)
                groomingLinkedAppointmentIds.add(apptId);
            const pet = row.pet;
            const petObj = pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null;
            const g = row.guardian;
            let estimated = 0;
            let services = [];
            try {
                const pv = await buildPreviewForGroomingSession(clinic_id, id);
                estimated = pv.subtotal;
                services = pv.lines.map((line) => ({
                    name: String(line.description ?? 'Serviço'),
                    amount: round2(Number(line.line_total ?? 0)),
                    kind: 'service',
                }));
            }
            catch {
                // Mantém zero se a prévia falhar — billing/enrichment ainda aplica.
            }
            const startsAt = row.closed_at ?? row.created_at ?? null;
            originKeys.push({ origin_type: 'grooming_session', origin_id: id });
            items.push({
                origin_type: 'grooming_session',
                origin_id: id,
                origin_label: apptId ? 'Banho & Tosa' : 'Banho & Tosa (walk-in)',
                service_group: 'banho_tosa',
                starts_at: startsAt,
                guardian_id: row.guardian_id ?? null,
                guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
                pet_id: row.pet_id ?? petObj?.id ?? null,
                pet: petObj,
                operational_status: String(row.grooming_stage),
                estimated_amount: estimated,
                services,
                billing: {
                    comanda_id: null,
                    comanda_status: null,
                    has_receivable: false,
                    receivable_status: null,
                    finance_handoff_at: null,
                    active_receivable_id: null,
                    due_date: null,
                },
            });
        }
        // Preferir a sessão B&T (valor + adicional) ao appointment espelho na listagem do Caixa.
        if (groomingLinkedAppointmentIds.size > 0) {
            for (let i = items.length - 1; i >= 0; i--) {
                const it = items[i];
                if (it.origin_type === 'appointment' && groomingLinkedAppointmentIds.has(it.origin_id)) {
                    items.splice(i, 1);
                }
            }
            for (let i = originKeys.length - 1; i >= 0; i--) {
                const k = originKeys[i];
                if (k.origin_type === 'appointment' && groomingLinkedAppointmentIds.has(k.origin_id)) {
                    originKeys.splice(i, 1);
                }
            }
        }
        // ── 3. Encounters walk-in (período ou IDs em aberto) ──
        const openEncounterIds = openIdsByType.get('encounter') ?? [];
        let encRows = [];
        if (!openMode || openEncounterIds.length > 0) {
            let eq = supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select(`id, unit_id, created_at, status, guardian_id, billing_waived_at, hub_appointment_id,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name)`)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .not('status', 'in', '("cancelled")')
                .order('created_at', { ascending: true });
            if (openMode) {
                eq = eq.in('id', openEncounterIds);
            }
            else {
                eq = eq.is('hub_appointment_id', null).gte('created_at', dayStart).lte('created_at', dayEnd);
            }
            if (unit_id)
                eq = eq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
            const encRes = await eq;
            if (encRes.error)
                throw new Error(encRes.error.message);
            encRows = encRes.data ?? [];
        }
        for (const row of encRows ?? []) {
            if (row.billing_waived_at)
                continue;
            const id = row.id;
            const pet = row.pet;
            const g = row.guardian;
            originKeys.push({ origin_type: 'encounter', origin_id: id });
            items.push({
                origin_type: 'encounter',
                origin_id: id,
                origin_label: 'Clínica (walk-in)',
                service_group: 'clinica',
                starts_at: row.created_at ?? null,
                guardian_id: row.guardian_id ?? null,
                guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
                pet_id: null,
                pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
                operational_status: String(row.status),
                estimated_amount: 0,
                services: [],
                billing: {
                    comanda_id: null,
                    comanda_status: null,
                    has_receivable: false,
                    receivable_status: null,
                    finance_handoff_at: null,
                    active_receivable_id: null,
                    due_date: null,
                },
            });
        }
        // ── 4. Boarding: check-in/out no período, ou IDs em aberto ──
        const appointmentIdsInBoard = new Set(items.filter((i) => i.origin_type === 'appointment').map((i) => i.origin_id));
        const boardingIdsInBoard = new Set();
        const openBoardingIds = new Set(openIdsByType.get('boarding_reservation') ?? []);
        let boardingRowsAll = [];
        if (!openMode || openBoardingIds.size > 0) {
            let bq = supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .select(`id, unit_id, hub_appointment_id, expected_check_in, expected_check_out, checked_in_at, checked_out_at, status, guardian_id, pet_id, mode, daily_rate_cents,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name)`)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .not('status', 'in', '("cancelled")')
                .order('expected_check_out', { ascending: true });
            if (openMode) {
                bq = bq.in('id', [...openBoardingIds]);
            }
            if (unit_id)
                bq = bq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
            const boardingRes = await bq;
            if (boardingRes.error)
                throw new Error(boardingRes.error.message);
            boardingRowsAll = boardingRes.data ?? [];
        }
        for (const row of boardingRowsAll ?? []) {
            const id = row.id;
            const expectedCheckIn = row.expected_check_in ?? null;
            const expectedCheckOut = row.expected_check_out ?? null;
            const isCheckInDay = timestampInUtcDayRange(expectedCheckIn, dayStart, dayEnd);
            const isCheckOutDay = timestampInUtcDayRange(expectedCheckOut, dayStart, dayEnd);
            if (!openMode && !isCheckInDay && !isCheckOutDay)
                continue;
            if (openMode && !openBoardingIds.has(id))
                continue;
            const apptId = row.hub_appointment_id ?? null;
            if (!openMode && isCheckInDay && !isCheckOutDay && apptId && appointmentIdsInBoard.has(apptId)) {
                continue;
            }
            if (boardingIdsInBoard.has(id))
                continue;
            boardingIdsInBoard.add(id);
            const modeLabel = row.mode === 'hotel' ? 'Hotel' : 'Creche';
            const serviceGroup = row.mode === 'hotel' ? 'hotel' : 'creche';
            const pet = row.pet;
            const g = row.guardian;
            const dailyRateCents = row.daily_rate_cents ?? 0;
            const estimated = (0, boardingBilling_1.estimateBoardingStayTotal)({
                id,
                mode: String(row.mode ?? 'hotel'),
                expected_check_in: expectedCheckIn,
                expected_check_out: expectedCheckOut,
                checked_in_at: row.checked_in_at ?? null,
                checked_out_at: row.checked_out_at ?? null,
                daily_rate_cents: dailyRateCents,
            }, []).total;
            originKeys.push({ origin_type: 'boarding_reservation', origin_id: id });
            items.push({
                origin_type: 'boarding_reservation',
                origin_id: id,
                origin_label: `Hotel & Creche (${modeLabel})`,
                service_group: serviceGroup,
                starts_at: (isCheckOutDay ? expectedCheckOut : null) ?? expectedCheckOut ?? expectedCheckIn,
                guardian_id: row.guardian_id ?? null,
                guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
                pet_id: row.pet_id ?? null,
                pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
                operational_status: String(row.status),
                estimated_amount: estimated,
                services: [],
                billing: {
                    comanda_id: null,
                    comanda_status: null,
                    has_receivable: false,
                    receivable_status: null,
                    finance_handoff_at: null,
                    active_receivable_id: null,
                    due_date: null,
                },
            });
        }
        // ── 4a. Internações com alta no período → origem explícita (gap C) ──
        if (!openMode) {
            let hq = supabase_1.supabaseAdmin
                .from('hub_hospitalizations')
                .select(`id, unit_id, status, admitted_at, discharged_at, guardian_id, pet_id, hub_encounter_id, hub_appointment_id,
           daily_hub_service_type_id, daily_unit_amount, billing_waived_at,
           pet:hub_pets(id, name),
           guardian:hub_guardians(id, full_name)`)
                .eq('clinic_id', clinic_id)
                .in('status', [...hubHospitalizationBilling_1.HOSPITALIZATION_CLOSED_STATUSES])
                .is('deleted_at', null)
                .is('billing_waived_at', null)
                .not('discharged_at', 'is', null)
                .gte('discharged_at', dayStart)
                .lte('discharged_at', dayEnd)
                .order('discharged_at', { ascending: true });
            if (unit_id)
                hq = hq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
            const hospRes = await hq;
            if (hospRes.error && !String(hospRes.error.message || '').includes('hub_hospitalizations')) {
                throw new Error(hospRes.error.message);
            }
            const hospRows = hospRes.data ?? [];
            const seenBoardKeys = new Set(items.map((i) => `${i.origin_type}:${i.origin_id}`));
            for (const row of hospRows) {
                if (!(0, hubHospitalizationBilling_1.isHospitalizationClosed)(String(row.status)))
                    continue;
                const origin = (0, hubHospitalizationBilling_1.resolveHospitalizationBillingOrigin)({
                    hub_encounter_id: row.hub_encounter_id ?? null,
                    hub_appointment_id: row.hub_appointment_id ?? null,
                });
                if (!origin)
                    continue;
                const encId = origin.origin_type === 'encounter' ? origin.origin_id : null;
                const apptId = origin.origin_type === 'appointment'
                    ? origin.origin_id
                    : (row.hub_appointment_id ?? null);
                const hospEstimate = (await (0, hubHospitalizationBilling_1.loadHospitalizationComandaItems)({
                    clinicId: clinic_id,
                    hospitalizationId: row.id,
                    encounterId: encId,
                    appointmentId: apptId,
                    defaultPetId: row.pet_id ?? null,
                })).subtotal;
                // Se a origem cobrável já está no board, só anexa estimativa (evita duplicar linha).
                const existing = items.find((i) => i.origin_type === origin.origin_type && i.origin_id === origin.origin_id);
                if (existing) {
                    existing.estimated_amount = round2(Number(existing.estimated_amount ?? 0) + hospEstimate);
                    if (!String(existing.origin_label).includes('Internação')) {
                        existing.origin_label = `${existing.origin_label} · Internação (alta)`;
                    }
                    continue;
                }
                const billingOriginKey = `${origin.origin_type}:${origin.origin_id}`;
                const hospKey = `hospitalization:${row.id}`;
                if (seenBoardKeys.has(hospKey) || seenBoardKeys.has(billingOriginKey))
                    continue;
                seenBoardKeys.add(hospKey);
                seenBoardKeys.add(billingOriginKey);
                const pet = row.pet;
                const g = row.guardian;
                // Billing da comanda vive na origem cobrável (encounter/appointment).
                originKeys.push({ origin_type: origin.origin_type, origin_id: origin.origin_id });
                items.push({
                    origin_type: 'hospitalization',
                    origin_id: row.id,
                    origin_label: 'Internação (alta)',
                    service_group: 'clinica',
                    starts_at: row.discharged_at ?? row.admitted_at ?? null,
                    guardian_id: row.guardian_id ?? null,
                    guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
                    pet_id: row.pet_id ?? null,
                    pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
                    operational_status: String(row.status),
                    estimated_amount: hospEstimate,
                    services: [],
                    billing_origin_type: origin.origin_type,
                    billing_origin_id: origin.origin_id,
                    billing: {
                        comanda_id: null,
                        comanda_status: null,
                        has_receivable: false,
                        receivable_status: null,
                        finance_handoff_at: null,
                        active_receivable_id: null,
                        due_date: null,
                    },
                });
            }
        }
        // ── 4b. Vendas rápidas (comandas origin_type=manual) ──
        {
            const openManualIds = openIdsByType.get('manual') ?? [];
            const seenManual = new Set(items.filter((i) => i.origin_type === 'manual').map((i) => i.origin_id));
            let loadManuals = !openMode;
            if (openMode && openManualIds.length > 0)
                loadManuals = true;
            if (loadManuals) {
                let mq = supabase_1.supabaseAdmin
                    .from('hub_comandas')
                    .select(`id, origin_id, status, opened_at, total_amount, finance_handoff_at, guardian_id, pet_id,
            guardian:hub_guardians(id, full_name),
            pet:hub_pets(id, name)`)
                    .eq('clinic_id', clinic_id)
                    .eq('origin_type', 'manual')
                    .neq('status', 'cancelada')
                    .is('deleted_at', null)
                    .not('origin_id', 'is', null);
                if (openMode) {
                    mq = mq.in('origin_id', openManualIds);
                }
                else {
                    mq = mq.gte('opened_at', dayStart).lte('opened_at', dayEnd);
                }
                if (unit_id)
                    mq = mq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
                const { data: manualRows, error: manualErr } = await mq;
                if (manualErr)
                    throw new Error(manualErr.message);
                const manualComandas = [];
                for (const row of manualRows ?? []) {
                    const originId = row.origin_id;
                    if (!originId || seenManual.has(originId))
                        continue;
                    seenManual.add(originId);
                    const g = row.guardian;
                    const p = row.pet;
                    manualComandas.push({
                        id: row.id,
                        origin_id: originId,
                        status: String(row.status ?? 'aberta'),
                        opened_at: row.opened_at ?? null,
                        total_amount: row.total_amount == null ? null : Number(row.total_amount),
                        finance_handoff_at: row.finance_handoff_at ?? null,
                        guardian_id: row.guardian_id ?? null,
                        pet_id: row.pet_id ?? null,
                        guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
                        pet: p ? (Array.isArray(p) ? (p[0] ?? null) : p) : null,
                    });
                }
                const manualComandaIds = manualComandas.map((c) => c.id);
                const linesByComanda = new Map();
                if (manualComandaIds.length > 0) {
                    const { data: lineRows, error: lineErr } = await supabase_1.supabaseAdmin
                        .from('hub_comanda_items')
                        .select('comanda_id, description, line_total, quantity, item_kind, pet_id')
                        .eq('clinic_id', clinic_id)
                        .in('comanda_id', manualComandaIds);
                    if (lineErr)
                        throw new Error(lineErr.message);
                    for (const ln of lineRows ?? []) {
                        const cid = ln.comanda_id;
                        const list = linesByComanda.get(cid) ?? [];
                        list.push({
                            comanda_id: cid,
                            description: ln.description ?? null,
                            line_total: ln.line_total == null ? null : Number(ln.line_total),
                            quantity: ln.quantity == null ? null : Number(ln.quantity),
                            item_kind: ln.item_kind ?? null,
                            pet_id: ln.pet_id ?? null,
                            status: null,
                        });
                        linesByComanda.set(cid, list);
                    }
                }
                for (const comanda of manualComandas) {
                    const built = (0, hubFinanceDayBoardManual_1.buildManualDayBoardItem)(comanda, linesByComanda.get(comanda.id) ?? []);
                    originKeys.push({ origin_type: 'manual', origin_id: comanda.origin_id });
                    items.push({
                        ...built,
                        billing: {
                            comanda_id: null,
                            comanda_status: null,
                            has_receivable: false,
                            receivable_status: null,
                            finance_handoff_at: null,
                            active_receivable_id: null,
                            due_date: null,
                        },
                    });
                }
            }
        }
        // ── 4c. Origens em aberto sem entidade operacional carregada (orçamento, pacote, etc.) ──
        if (openMode && openOriginKeys) {
            const seen = new Set(items.map((i) => `${i.origin_type}:${i.origin_id}`));
            for (const k of openOriginKeys) {
                const key = `${k.origin_type}:${k.origin_id}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                originKeys.push(k);
                items.push({
                    origin_type: k.origin_type,
                    origin_id: k.origin_id,
                    origin_label: resolveOpenOriginLabel(k.origin_type),
                    service_group: null,
                    starts_at: null,
                    guardian_id: null,
                    guardian: null,
                    pet_id: null,
                    pet: null,
                    operational_status: 'open',
                    estimated_amount: 0,
                    services: [],
                    billing: {
                        comanda_id: null,
                        comanda_status: null,
                        has_receivable: false,
                        receivable_status: null,
                        finance_handoff_at: null,
                        active_receivable_id: null,
                        due_date: null,
                    },
                });
            }
        }
        // ── 5. Enriquecer billing em batch ──
        const billingMap = await fetchBillingStatusBatch(clinic_id, originKeys);
        for (const item of items) {
            const key = item.origin_type === 'hospitalization' && item.billing_origin_type && item.billing_origin_id
                ? `${item.billing_origin_type}:${item.billing_origin_id}`
                : `${item.origin_type}:${item.origin_id}`;
            const billing = billingMap.get(key);
            if (billing)
                item.billing = billing;
        }
        // ── 5b. Enriquecer stubs manuais restantes (recebível avulso sem comanda carregada) ──
        {
            const stubs = items.filter((i) => i.origin_type === 'manual' &&
                (!i.services.length || !i.guardian_id) &&
                (i.billing.active_receivable_id || i.billing.comanda_id));
            if (stubs.length > 0) {
                const recIds = stubs
                    .map((s) => s.billing.active_receivable_id)
                    .filter((id) => Boolean(id));
                const comandaIds = stubs
                    .map((s) => s.billing.comanda_id)
                    .filter((id) => Boolean(id));
                const guardianByRec = new Map();
                const linesByRec = new Map();
                if (recIds.length > 0) {
                    const { data: recRows } = await supabase_1.supabaseAdmin
                        .from('hub_receivables')
                        .select('id, guardian_id, guardian:hub_guardians(id, full_name)')
                        .eq('clinic_id', clinic_id)
                        .in('id', recIds);
                    for (const r of recRows ?? []) {
                        const g = r.guardian;
                        guardianByRec.set(r.id, g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null);
                    }
                    const { data: lnRows } = await supabase_1.supabaseAdmin
                        .from('hub_receivable_lines')
                        .select('receivable_id, description, line_total, quantity, line_kind')
                        .eq('clinic_id', clinic_id)
                        .in('receivable_id', recIds);
                    for (const ln of lnRows ?? []) {
                        const rid = ln.receivable_id;
                        const list = linesByRec.get(rid) ?? [];
                        list.push({
                            description: ln.description ?? null,
                            line_total: ln.line_total == null ? null : Number(ln.line_total),
                            quantity: ln.quantity == null ? null : Number(ln.quantity),
                            line_kind: ln.line_kind ?? null,
                        });
                        linesByRec.set(rid, list);
                    }
                }
                const comandaById = new Map();
                const linesByComandaId = new Map();
                if (comandaIds.length > 0) {
                    const { data: cmdRows } = await supabase_1.supabaseAdmin
                        .from('hub_comandas')
                        .select(`id, origin_id, status, opened_at, total_amount, finance_handoff_at, guardian_id, pet_id,
              guardian:hub_guardians(id, full_name),
              pet:hub_pets(id, name)`)
                        .eq('clinic_id', clinic_id)
                        .in('id', comandaIds);
                    for (const row of cmdRows ?? []) {
                        const g = row.guardian;
                        const p = row.pet;
                        comandaById.set(row.id, {
                            id: row.id,
                            origin_id: row.origin_id ?? '',
                            status: String(row.status ?? 'aberta'),
                            opened_at: row.opened_at ?? null,
                            total_amount: row.total_amount == null ? null : Number(row.total_amount),
                            finance_handoff_at: row.finance_handoff_at ?? null,
                            guardian_id: row.guardian_id ?? null,
                            pet_id: row.pet_id ?? null,
                            guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
                            pet: p ? (Array.isArray(p) ? (p[0] ?? null) : p) : null,
                        });
                    }
                    const { data: cmdLines } = await supabase_1.supabaseAdmin
                        .from('hub_comanda_items')
                        .select('comanda_id, description, line_total, quantity, item_kind, pet_id')
                        .eq('clinic_id', clinic_id)
                        .in('comanda_id', comandaIds);
                    for (const ln of cmdLines ?? []) {
                        const cid = ln.comanda_id;
                        const list = linesByComandaId.get(cid) ?? [];
                        list.push({
                            comanda_id: cid,
                            description: ln.description ?? null,
                            line_total: ln.line_total == null ? null : Number(ln.line_total),
                            quantity: ln.quantity == null ? null : Number(ln.quantity),
                            item_kind: ln.item_kind ?? null,
                            pet_id: ln.pet_id ?? null,
                            status: null,
                        });
                        linesByComandaId.set(cid, list);
                    }
                }
                for (const item of stubs) {
                    const cid = item.billing.comanda_id;
                    if (cid && comandaById.has(cid)) {
                        const built = (0, hubFinanceDayBoardManual_1.buildManualDayBoardItem)(comandaById.get(cid), linesByComandaId.get(cid) ?? []);
                        item.origin_label = built.origin_label;
                        item.starts_at = item.starts_at ?? built.starts_at;
                        item.guardian_id = item.guardian_id ?? built.guardian_id;
                        item.guardian = item.guardian ?? built.guardian;
                        item.pet_id = item.pet_id ?? built.pet_id;
                        item.pet = item.pet ?? built.pet;
                        item.operational_status = built.operational_status;
                        if (!item.services.length)
                            item.services = built.services;
                        if (!(item.estimated_amount > 0.009))
                            item.estimated_amount = built.estimated_amount;
                        continue;
                    }
                    const rid = item.billing.active_receivable_id;
                    if (!rid)
                        continue;
                    const g = guardianByRec.get(rid);
                    if (g && !item.guardian) {
                        item.guardian = g;
                        item.guardian_id = g.id;
                    }
                    if (!item.services.length) {
                        item.services = (0, hubFinanceDayBoardManual_1.buildManualServicesFromReceivableLines)(linesByRec.get(rid) ?? []);
                        item.estimated_amount = item.services.reduce((s, sv) => s + sv.amount, 0);
                    }
                    if (item.origin_label === 'Cobrança avulsa' || !item.origin_label) {
                        item.origin_label = 'Venda rápida';
                    }
                }
            }
        }
        const clinicBalances = await (0, hubPackagesService_1.listActivePackageBalances)({ clinicId: clinic_id });
        const appointmentIds = items.filter((i) => i.origin_type === 'appointment').map((i) => i.origin_id);
        const seriesCoverage = await (0, hubSeriesBillingService_1.findSeriesInvoiceCoverageForAppointments)(appointmentIds);
        const periodicPendingIds = await (0, hubSeriesBillingService_1.findPeriodicInvoiceSeriesAppointments)(appointmentIds);
        for (const item of items) {
            item.coverage_kind = 'none';
            item.series_invoice_comanda_id = null;
            const invCov = item.origin_type === 'appointment' ? seriesCoverage.get(item.origin_id) : undefined;
            if (invCov && invCov.comanda_id) {
                item.coverage_kind = 'series_invoice';
                item.series_invoice_comanda_id = invCov.comanda_id;
                item.has_package_balance = false;
                item.estimated_amount = 0;
                item.services = item.services.map((s) => ({ ...s, amount: 0 }));
                // Preferir comanda da fatura no badge de cobrança se ainda não houver billing da ocorrência
                if (!item.billing.comanda_id) {
                    item.billing = {
                        ...item.billing,
                        comanda_id: invCov.comanda_id,
                        comanda_status: item.billing.comanda_status ?? 'aberta',
                    };
                }
                continue;
            }
            // Fatura em série ainda não emitida: não cobrar no dia (nem cair no ramo de pacote).
            if (item.origin_type === 'appointment' && periodicPendingIds.has(item.origin_id)) {
                item.coverage_kind = 'series_pending';
                item.has_package_balance = false;
                item.estimated_amount = 0;
                item.services = item.services.map((s) => ({ ...s, amount: 0 }));
                continue;
            }
            const serviceTypeIds = [];
            if (item.origin_type === 'appointment') {
                const apptRow = (apptRows ?? []).find((r) => r.id === item.origin_id);
                const svcs = apptRow?.appointment_services ?? [];
                for (const s of svcs) {
                    if (s.hub_service_type_id)
                        serviceTypeIds.push(s.hub_service_type_id);
                }
                if (!serviceTypeIds.length) {
                    const primary = apptRow?.hub_service_type_id;
                    if (primary)
                        serviceTypeIds.push(primary);
                }
            }
            else {
                for (let idx = 0; idx < item.services.length; idx++) {
                    const apptRow = (apptRows ?? []).find((r) => r.id === item.origin_id);
                    const svcs = apptRow?.appointment_services ?? [];
                    const st = svcs[idx]?.hub_service_type_id;
                    if (st)
                        serviceTypeIds.push(st);
                }
            }
            const coveredByPkg = (0, hubPackagesService_1.hasPackageBalanceForServices)(clinicBalances, item.guardian_id, item.pet_id, [...new Set(serviceTypeIds)]);
            item.has_package_balance = coveredByPkg;
            if (coveredByPkg && item.services.length > 0) {
                const adj = (0, hubPackagesService_1.applyPackageCoverageToEstimate)({
                    balances: clinicBalances,
                    guardianId: item.guardian_id,
                    petId: item.pet_id,
                    serviceTypeIds,
                    services: item.services,
                    estimatedAmount: item.estimated_amount,
                });
                item.services = adj.services;
                item.estimated_amount = adj.estimated_amount;
                if (adj.covered)
                    item.coverage_kind = 'package';
            }
        }
        let filteredItems = items;
        if (billing_scope === 'financeiro') {
            filteredItems = items.filter((item) => {
                const { billing } = item;
                if ((0, hubFinancialDayBoard_1.isDayBoardPaidAndComplete)(item.origin_type, item.operational_status, billing.receivable_status)) {
                    return false;
                }
                if (!(0, hubFinancialDayBoard_1.matchesFinanceiroDayBoardScope)(billing))
                    return false;
                return (0, hubFinancialDayBoard_1.hasFinanceiroChargeableAmount)({
                    estimated_amount: item.estimated_amount,
                    billing,
                });
            });
        }
        filteredItems.sort((a, b) => {
            const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
            const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
            return ta - tb;
        });
        return res.json({
            items: filteredItems,
            date: dateYmd,
            from: openMode ? null : fromYmd,
            to: openMode ? null : toYmd,
            open: openMode,
            count: filteredItems.length,
        });
    }
    catch (e) {
        console.error('getHubFinanceDayBoard', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceDayBoard = getHubFinanceDayBoard;
function resolveOpenOriginLabel(originType) {
    switch (originType) {
        case 'quote':
            return 'Orçamento';
        case 'package':
            return 'Pacote';
        case 'series_invoice':
            return 'Fatura de série';
        case 'manual':
            return 'Venda rápida';
        case 'appointment':
            return 'Agenda';
        case 'grooming_session':
            return 'Banho & Tosa';
        case 'encounter':
            return 'Atendimento clínico';
        case 'boarding_reservation':
            return 'Hotel & Creche';
        case 'hospitalization':
            return 'Internação';
        default:
            return originType.replace(/_/g, ' ');
    }
}
/** Início do dia UTC (YYYY-MM-DD) → ISO start */
function utcDayStartIso(dateYmd) {
    return `${dateYmd}T00:00:00.000Z`;
}
/** Fim do dia UTC */
function utcDayEndIso(dateYmd) {
    return `${dateYmd}T23:59:59.999Z`;
}
function addDaysYmd(ymd, delta) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function ymdTodayUtc() {
    const dt = new Date();
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function parseDateBasis(raw, fallback = 'payment_date') {
    const parsed = zod_1.z.enum(['payment_date', 'created_at', 'competence_date', 'due_date']).safeParse(raw);
    return parsed.success ? parsed.data : fallback;
}
function parsePeriodQuery(q) {
    const clinic = uuidStr.safeParse(q.clinic_id);
    const unit = uuidStr.safeParse(q.unit_id);
    if (!clinic.success || !unit.success) {
        return { ok: false, error: 'clinic_id e unit_id são obrigatórios (UUID)' };
    }
    const date_basis = parseDateBasis(q.date_basis, 'payment_date');
    const fromRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.from);
    const toRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.to);
    if (fromRaw.success && toRaw.success) {
        if (fromRaw.data > toRaw.data)
            return { ok: false, error: 'from não pode ser maior que to' };
        return {
            ok: true,
            clinic_id: clinic.data,
            unit_id: unit.data,
            fromYmd: fromRaw.data,
            toYmd: toRaw.data,
            date_basis,
        };
    }
    const days = zod_1.z.coerce.number().int().min(1).max(366).safeParse(q.days);
    const n = days.success ? days.data : 30;
    const toYmd = ymdTodayUtc();
    const fromYmd = addDaysYmd(toYmd, -(n - 1));
    return { ok: true, clinic_id: clinic.data, unit_id: unit.data, fromYmd, toYmd, date_basis };
}
/** Parse de período financeiro + membership de unidade (unit.view.all / vínculo). */
async function parsePeriodQueryAuthorized(req) {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok)
        return { ok: false, status: 400, error: parsed.error };
    const userId = req.user?.id;
    if (!userId)
        return { ok: false, status: 401, error: 'Usuário não autenticado' };
    const { resolveReportUnitScope } = await Promise.resolve().then(() => __importStar(require('./hubReportUnitScope')));
    const scope = await resolveReportUnitScope({
        userId,
        clinicId: parsed.clinic_id,
        requestedUnitId: parsed.unit_id,
        unitMode: 'required',
    });
    if (!scope.ok)
        return { ok: false, status: scope.status, error: scope.error };
    return {
        ok: true,
        clinic_id: parsed.clinic_id,
        unit_id: scope.unitId ?? parsed.unit_id,
        fromYmd: parsed.fromYmd,
        toYmd: parsed.toYmd,
        date_basis: parsed.date_basis,
    };
}
const expenseCategorySchema = zod_1.z.enum([
    'supplies',
    'services',
    'utilities',
    'payroll',
    'rent',
    'marketing',
    'other',
]);
const expensePaymentMethodSchema = zod_1.z
    .enum(['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'other'])
    .optional()
    .nullable();
const getHubFinanceDashboardSummary = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const keys = await fetchActiveReceivableKeysExpanded(clinic_id);
        const unbilled = await collectUnbilledItems(clinic_id, unit_id, keys);
        const { data: openRecs, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, final_amount')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .is('deleted_at', null)
            .in('status', ['pending', 'partially_paid']);
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        const openRecsWithValue = (openRecs ?? []).filter((r) => Number(r.final_amount ?? 0) > 0.009);
        const recIds = openRecsWithValue.map((r) => r.id);
        let receivables_outstanding = 0;
        if (recIds.length > 0) {
            const postedByRec = new Map();
            const lineRefundByRec = new Map();
            for (let i = 0; i < recIds.length; i += 200) {
                const chunk = recIds.slice(i, i + 200);
                const { data: payRows, error: pErr } = await supabase_1.supabaseAdmin
                    .from('hub_payments')
                    .select('receivable_id, amount')
                    .in('receivable_id', chunk)
                    .eq('status', 'posted');
                if (pErr)
                    return res.status(500).json({ error: pErr.message });
                for (const row of payRows ?? []) {
                    const id = row.receivable_id;
                    postedByRec.set(id, round2((postedByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
                }
                const { data: adjRows, error: aErr } = await supabase_1.supabaseAdmin
                    .from('hub_financial_adjustments')
                    .select('receivable_id, amount, payment_id')
                    .in('receivable_id', chunk)
                    .eq('adjustment_type', 'refund')
                    .is('payment_id', null);
                if (aErr)
                    return res.status(500).json({ error: aErr.message });
                for (const row of adjRows ?? []) {
                    const id = row.receivable_id;
                    lineRefundByRec.set(id, round2((lineRefundByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
                }
            }
            for (const r of openRecsWithValue) {
                receivables_outstanding = round2(receivables_outstanding +
                    (0, hubReceivableFinancialBalance_1.balanceDue)({
                        finalAmount: Number(r.final_amount ?? 0),
                        postedPayments: postedByRec.get(r.id) ?? 0,
                        lineRefundsAlreadyPaidOut: lineRefundByRec.get(r.id) ?? 0,
                    }));
            }
        }
        const { data: payPeriod, error: ppErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount, payment_date, receivable_id')
            .eq('clinic_id', clinic_id)
            .eq('status', 'posted')
            .gte('payment_date', fromIso)
            .lte('payment_date', toIso);
        if (ppErr)
            return res.status(500).json({ error: ppErr.message });
        const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id))];
        const unitByRec = new Map();
        if (recIdsPeriod.length > 0) {
            const { data: rrows, error: rrErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, unit_id')
                .in('id', recIdsPeriod);
            if (rrErr)
                return res.status(500).json({ error: rrErr.message });
            for (const row of rrows ?? [])
                unitByRec.set(row.id, row.unit_id ?? null);
        }
        let payments_total_period = 0;
        for (const p of payPeriod ?? []) {
            if (unitMatchesSelected(unitByRec.get(p.receivable_id), unit_id)) {
                payments_total_period = round2(payments_total_period + Number(p.amount ?? 0));
            }
        }
        const { data: expRows, error: eErr } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .select('amount')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .gte('expense_date', fromYmd)
            .lte('expense_date', toYmd);
        if (eErr) {
            if (String(eErr.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: eErr.message });
        }
        const expensesOnly = round2((expRows ?? []).reduce((a, row) => a + Number(row.amount ?? 0), 0));
        const paidPayables = await (0, hubPayablesService_1.sumPaidPayablesInPeriod)({
            clinicId: clinic_id,
            unitId: unit_id,
            fromYmd,
            toYmd,
        });
        if (paidPayables.error)
            return res.status(500).json({ error: paidPayables.error });
        const pendingPayables = await (0, hubPayablesService_1.sumPendingPayables)({ clinicId: clinic_id, unitId: unit_id });
        if (pendingPayables.error)
            return res.status(500).json({ error: pendingPayables.error });
        const expenses_total_period = round2(expensesOnly + paidPayables.total);
        let pets_attended_distinct = 0;
        const { data: apptPetRows, error: apptErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('pet_id')
            .eq('clinic_id', clinic_id)
            .or(`unit_id.eq.${unit_id},unit_id.is.null`)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .gte('starts_at', fromIso)
            .lte('starts_at', toIso);
        if (!apptErr && apptPetRows) {
            const seen = new Set();
            for (const row of apptPetRows) {
                const pid = row.pet_id;
                if (pid)
                    seen.add(pid);
            }
            pets_attended_distinct = seen.size;
        }
        return res.json({
            period: { from: fromYmd, to: toYmd },
            pending_billing_count: unbilled.length,
            receivables_pending_count: openRecsWithValue.length,
            receivables_open_count: openRecsWithValue.length,
            receivables_outstanding,
            payments_total_period,
            expenses_total_period,
            payables_pending_count: pendingPayables.count,
            payables_outstanding: pendingPayables.total,
            payables_unconfirmed_count: pendingPayables.unconfirmedCount,
            payables_estimated_total: pendingPayables.estimatedTotal,
            net_operational_period: round2(payments_total_period - expenses_total_period),
            pets_attended_distinct,
        });
    }
    catch (e) {
        console.error('getHubFinanceDashboardSummary', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceDashboardSummary = getHubFinanceDashboardSummary;
const getHubFinanceCashFlow = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd, date_basis } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        // Fluxo de caixa: payment_date (efetivo) ou created_at (registro). competence/due não aplicam a pagamentos.
        const payDateCol = date_basis === 'created_at' ? 'created_at' : 'payment_date';
        const { data: sessions, error: sErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id);
        if (sErr)
            return res.status(500).json({ error: sErr.message });
        const sessionIds = (sessions ?? []).map((s) => s.id);
        const { data: payPeriod, error: ppErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select(`amount, payment_date, created_at, receivable_id`)
            .eq('clinic_id', clinic_id)
            .eq('status', 'posted')
            .gte(payDateCol, fromIso)
            .lte(payDateCol, toIso);
        if (ppErr)
            return res.status(500).json({ error: ppErr.message });
        const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id))];
        const unitByRec = new Map();
        if (recIdsPeriod.length > 0) {
            const { data: rrows, error: rrErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, unit_id')
                .in('id', recIdsPeriod);
            if (rrErr)
                return res.status(500).json({ error: rrErr.message });
            for (const row of rrows ?? [])
                unitByRec.set(row.id, row.unit_id ?? null);
        }
        let expRows = [];
        const { data: ex, error: eErr } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .select('amount, expense_date')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .gte('expense_date', fromYmd)
            .lte('expense_date', toYmd);
        if (eErr) {
            if (String(eErr.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: eErr.message });
        }
        expRows = (ex ?? []);
        const paidPayablesCf = await (0, hubPayablesService_1.sumPaidPayablesInPeriod)({
            clinicId: clinic_id,
            unitId: unit_id,
            fromYmd,
            toYmd,
        });
        if (paidPayablesCf.error)
            return res.status(500).json({ error: paidPayablesCf.error });
        let movRows = [];
        if (sessionIds.length > 0) {
            const { data: mv, error: mErr } = await supabase_1.supabaseAdmin
                .from('hub_cash_movements')
                .select('amount, movement_type, created_at')
                .in('cash_session_id', sessionIds)
                .gte('created_at', fromIso)
                .lte('created_at', toIso);
            if (mErr)
                return res.status(500).json({ error: mErr.message });
            movRows = (mv ?? []);
        }
        const dayKeys = [];
        for (let d = fromYmd; d <= toYmd; d = addDaysYmd(d, 1)) {
            dayKeys.push(d);
            if (d === toYmd)
                break;
        }
        const payByDay = new Map();
        for (const p of payPeriod ?? []) {
            if (!unitMatchesSelected(unitByRec.get(p.receivable_id), unit_id))
                continue;
            const rawDate = payDateCol === 'created_at'
                ? String(p.created_at ?? p.payment_date ?? '')
                : String(p.payment_date ?? '');
            const key = rawDate.slice(0, 10);
            if (!key)
                continue;
            payByDay.set(key, round2((payByDay.get(key) ?? 0) + Number(p.amount ?? 0)));
        }
        const expByDay = new Map();
        for (const row of expRows) {
            const key = row.expense_date.slice(0, 10);
            expByDay.set(key, round2((expByDay.get(key) ?? 0) + Number(row.amount ?? 0)));
        }
        for (const [key, amt] of paidPayablesCf.byDay) {
            expByDay.set(key, round2((expByDay.get(key) ?? 0) + amt));
        }
        const witByDay = new Map();
        const depByDay = new Map();
        for (const row of movRows) {
            const key = row.created_at.slice(0, 10);
            const amt = Number(row.amount ?? 0);
            if (row.movement_type === 'withdrawal') {
                witByDay.set(key, round2((witByDay.get(key) ?? 0) + amt));
            }
            else if (row.movement_type === 'deposit') {
                depByDay.set(key, round2((depByDay.get(key) ?? 0) + amt));
            }
        }
        const days = dayKeys.map((date) => {
            const payments_in = payByDay.get(date) ?? 0;
            const expenses_out = expByDay.get(date) ?? 0;
            const withdrawals_out = witByDay.get(date) ?? 0;
            const deposits_in = depByDay.get(date) ?? 0;
            const net = round2(payments_in + deposits_in - expenses_out - withdrawals_out);
            return { date, payments_in, expenses_out, withdrawals_out, deposits_in, net };
        });
        return res.json({
            period: { from: fromYmd, to: toYmd },
            date_basis: payDateCol === 'created_at' ? 'created_at' : 'payment_date',
            kind: 'movimentacao_caixa',
            days,
            notes: 'Movimentação física de dinheiro/pagamentos (não é receita líquida comercial). Saídas de caixa por reembolso em dinheiro entram em withdrawals. Unidade estrita.',
        });
    }
    catch (e) {
        console.error('getHubFinanceCashFlow', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceCashFlow = getHubFinanceCashFlow;
const getHubFinanceRevenueReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd, date_basis } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const payDateCol = date_basis === 'created_at' ? 'created_at' : 'payment_date';
        const { data: payments, error } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount, payment_method, payment_date, created_at, receivable_id')
            .eq('clinic_id', clinic_id)
            .eq('status', 'posted')
            .gte(payDateCol, fromIso)
            .lte(payDateCol, toIso);
        if (error)
            return res.status(500).json({ error: error.message });
        const recIds = [...new Set((payments ?? []).map((p) => p.receivable_id))];
        const unitByRec = new Map();
        if (recIds.length > 0) {
            const { data: recs, error: recErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, unit_id')
                .in('id', recIds);
            if (recErr)
                return res.status(500).json({ error: recErr.message });
            for (const rec of recs ?? [])
                unitByRec.set(rec.id, rec.unit_id ?? null);
        }
        const by_method = {};
        let total = 0;
        for (const p of payments ?? []) {
            if (!unitMatchesSelected(unitByRec.get(p.receivable_id), unit_id))
                continue;
            const amount = Number(p.amount ?? 0);
            const method = String(p.payment_method ?? 'unknown');
            by_method[method] = round2((by_method[method] ?? 0) + amount);
            total = round2(total + amount);
        }
        return res.json({
            period: { from: fromYmd, to: toYmd },
            date_basis: payDateCol === 'created_at' ? 'created_at' : 'payment_date',
            kind: 'recebimentos',
            total,
            by_method,
            notes: 'Recebimentos (pagamentos posted). Não é receita líquida comercial. Unidade estrita — registros sem unidade ficam fora deste total.',
        });
    }
    catch (e) {
        console.error('getHubFinanceRevenueReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceRevenueReport = getHubFinanceRevenueReport;
function utcDateToYmd(dt) {
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
/** Segunda-feira (UTC) da semana que contém `ymd` (YYYY-MM-DD). */
function utcMondayOfWeekYmd(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    const offset = (dow + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - offset);
    return utcDateToYmd(dt);
}
const revenueSeriesBucketSchema = zod_1.z.enum(['day', 'week', 'month']);
/** Pagamentos no período agregados por dia/semana/mês (mesma regra de unidade do fluxo de caixa). */
const getHubFinanceRevenueSeries = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const bucketParsed = revenueSeriesBucketSchema.safeParse(typeof req.query.bucket === 'string' ? req.query.bucket : 'day');
        const bucket = bucketParsed.success ? bucketParsed.data : 'day';
        const { data: payPeriod, error: ppErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount, payment_date, receivable_id')
            .eq('clinic_id', clinic_id)
            .eq('status', 'posted')
            .gte('payment_date', fromIso)
            .lte('payment_date', toIso);
        if (ppErr)
            return res.status(500).json({ error: ppErr.message });
        const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id))];
        const unitByRec = new Map();
        if (recIdsPeriod.length > 0) {
            const { data: rrows, error: rrErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, unit_id')
                .in('id', recIdsPeriod);
            if (rrErr)
                return res.status(500).json({ error: rrErr.message });
            for (const row of rrows ?? [])
                unitByRec.set(row.id, row.unit_id ?? null);
        }
        const payByDay = new Map();
        for (const p of payPeriod ?? []) {
            if (!unitMatchesSelected(unitByRec.get(p.receivable_id), unit_id))
                continue;
            const key = p.payment_date.slice(0, 10);
            payByDay.set(key, round2((payByDay.get(key) ?? 0) + Number(p.amount ?? 0)));
        }
        const dayKeys = [];
        for (let d = fromYmd; d <= toYmd; d = addDaysYmd(d, 1)) {
            dayKeys.push(d);
            if (d === toYmd)
                break;
        }
        if (bucket === 'day') {
            const points = dayKeys.map((date) => ({
                key: date,
                label: date.slice(5),
                amount: payByDay.get(date) ?? 0,
            }));
            return res.json({ period: { from: fromYmd, to: toYmd }, bucket, points });
        }
        const merged = new Map();
        for (const date of dayKeys) {
            const amt = payByDay.get(date) ?? 0;
            let gkey;
            let label;
            if (bucket === 'week') {
                gkey = utcMondayOfWeekYmd(date);
                const endW = addDaysYmd(gkey, 6);
                label = `${gkey.slice(8, 10)}/${gkey.slice(5, 7)}–${endW.slice(8, 10)}/${endW.slice(5, 7)}`;
            }
            else {
                gkey = date.slice(0, 7);
                const [yy, mm] = gkey.split('-');
                label = `${mm}/${yy}`;
            }
            const cur = merged.get(gkey) ?? { key: gkey, label, amount: 0 };
            cur.amount = round2(cur.amount + amt);
            merged.set(gkey, cur);
        }
        const points = [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
        return res.json({ period: { from: fromYmd, to: toYmd }, bucket, points });
    }
    catch (e) {
        console.error('getHubFinanceRevenueSeries', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceRevenueSeries = getHubFinanceRevenueSeries;
const getHubFinanceTicketAverageReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const bundle = await (0, hubReportCommercialNet_1.loadCommercialPeriodBundle)({
            clinicId: clinic_id,
            unitFilter: { mode: 'unit', unitId: unit_id },
            fromYmd,
            toYmd,
        });
        if (!bundle.ok)
            return res.status(500).json({ error: bundle.error });
        const ticket = (0, hubReportCommercialNet_1.computeHistoricalTicketAverage)(bundle.salesHeaders);
        return res.json({
            period: { from: fromYmd, to: toYmd },
            kind: 'historical_commercial_ticket',
            receivables_count: ticket.sales_count,
            total: ticket.total_at_sale,
            ticket_average: ticket.ticket_average,
            reliable_snapshot_count: ticket.reliable_snapshot_count,
            legacy_incomplete_count: ticket.legacy_incomplete_count,
            competence: ticket.competence,
            formula: ticket.formula,
            notes: 'Ticket histórico do período da cobrança (net_amount_at_sale ÷ nº de cobranças). Devoluções posteriores não alteram. Período só com devoluções → ticket N/A. Unidade estrita.',
        });
    }
    catch (e) {
        console.error('getHubFinanceTicketAverageReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceTicketAverageReport = getHubFinanceTicketAverageReport;
const getHubFinanceTopServicesReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const { data: recs, error: recErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .gte('created_at', fromIso)
            .lte('created_at', toIso);
        if (recErr)
            return res.status(500).json({ error: recErr.message });
        const ids = (recs ?? []).map((r) => r.id);
        if (ids.length === 0)
            return res.json({ period: { from: fromYmd, to: toYmd }, items: [] });
        const { data: lines, error: lineErr } = await supabase_1.supabaseAdmin
            .from('hub_receivable_lines')
            .select('hub_service_type_id, description, quantity, line_total')
            .eq('clinic_id', clinic_id)
            .in('receivable_id', ids)
            .not('hub_service_type_id', 'is', null);
        if (lineErr)
            return res.status(500).json({ error: lineErr.message });
        const serviceIds = [...new Set((lines ?? []).map((l) => l.hub_service_type_id).filter(Boolean))];
        const labels = new Map();
        if (serviceIds.length > 0) {
            const { data: services } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, name')
                .in('id', serviceIds);
            for (const svc of services ?? [])
                labels.set(svc.id, String(svc.name || svc.id));
        }
        const byService = new Map();
        for (const line of lines ?? []) {
            const serviceId = line.hub_service_type_id;
            if (!serviceId)
                continue;
            const cur = byService.get(serviceId) ?? { service_id: serviceId, name: labels.get(serviceId) ?? String(line.description || 'Serviço'), quantity: 0, total: 0 };
            cur.quantity = round2(cur.quantity + Number(line.quantity ?? 0));
            cur.total = round2(cur.total + Number(line.line_total ?? 0));
            byService.set(serviceId, cur);
        }
        const items = [...byService.values()].sort((a, b) => b.total - a.total).slice(0, 20);
        return res.json({ period: { from: fromYmd, to: toYmd }, items });
    }
    catch (e) {
        console.error('getHubFinanceTopServicesReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceTopServicesReport = getHubFinanceTopServicesReport;
/**
 * Vendas por produto + mix (serviços vs produtos vs demais) + margem/COGS.
 * COGS só com unit_cost_amount histórico da linha — sem fallback de catálogo.
 */
const getHubFinanceProductSalesReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const bundle = await (0, hubReportCommercialNet_1.loadCommercialPeriodBundle)({
            clinicId: clinic_id,
            unitFilter: { mode: 'unit', unitId: unit_id },
            fromYmd,
            toYmd,
        });
        if (!bundle.ok)
            return res.status(500).json({ error: bundle.error });
        const itemIds = [
            ...new Set([...bundle.saleLines, ...bundle.returnLinesById.values()]
                .map((l) => l.hub_inventory_item_id)
                .filter((id) => Boolean(id))),
        ];
        const catalogName = new Map();
        const catalogKind = new Map();
        for (let i = 0; i < itemIds.length; i += 200) {
            const chunk = itemIds.slice(i, i + 200);
            if (!chunk.length)
                continue;
            const { data: inv } = await supabase_1.supabaseAdmin
                .from('hub_inventory_items')
                .select('id, name, item_kind')
                .in('id', chunk);
            for (const it of inv ?? []) {
                catalogName.set(it.id, String(it.name ?? ''));
                catalogKind.set(it.id, String(it.item_kind ?? 'product'));
            }
        }
        const { items: aggItems, totals, mix } = (0, hubReportCommercialNet_1.aggregateProductSalesNet)({
            saleLines: bundle.saleLines,
            returnEvents: bundle.returnEvents,
            returnLinesById: bundle.returnLinesById,
            returnHeadersById: bundle.returnHeadersById,
            catalogName,
            catalogKind,
        });
        const items = aggItems.slice(0, 200).map((r) => ({
            item_id: r.item_id,
            name: r.name,
            item_kind: r.item_kind,
            quantity: r.quantity_net,
            quantity_sold: r.quantity_sold,
            quantity_returned: r.quantity_returned,
            revenue: r.revenue_net,
            revenue_gross: r.revenue_gross,
            returns_commercial: r.returns_commercial,
            cogs: r.cogs_net,
            cogs_recorded: r.cogs_recorded,
            cogs_recovered: r.cogs_recovered,
            margin: r.margin,
            margin_pct: r.margin_pct,
            margin_complete: r.margin_complete,
            cost_unregistered_revenue: r.cost_unregistered_revenue,
        }));
        return res.json({
            period: { from: fromYmd, to: toYmd },
            competence: {
                sales: 'receivable.created_at (data da cobrança gerada)',
                returns: 'hub_product_return_events.created_at',
            },
            mix,
            summary: {
                items_count: items.length,
                quantity: totals.quantity_net,
                quantity_sold: totals.quantity_sold,
                quantity_returned: totals.quantity_returned,
                revenue: totals.revenue_net,
                revenue_gross: totals.revenue_gross,
                returns_commercial: totals.returns_commercial,
                cogs: totals.cogs_net,
                margin: totals.margin,
                margin_pct: totals.margin_pct,
                margin_complete: totals.margin_complete,
                cost_unregistered_revenue: totals.cost_unregistered_revenue,
                unallocated_financial_refunds: bundle.unallocatedFinancialRefunds,
                legacy_snapshot_incomplete_count: bundle.legacy_snapshot_incomplete_count,
                unassigned_unit_excluded: true,
            },
            items,
            notes: 'Receita líquida = bruta do período − devoluções comerciais no período (return events + rateio). COGS só com unit_cost_amount histórico; sem snapshot = custo não registrado (margem incompleta). Unidade estrita (sem misturar unit_id null). Reembolsos financeiros sem linha → Não alocado (financeiro).',
        });
    }
    catch (e) {
        console.error('getHubFinanceProductSalesReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceProductSalesReport = getHubFinanceProductSalesReport;
/**
 * Movimentação de vendas no período, agregada por setor (service_group) e detalhe por serviço.
 * Produtos de estoque entram no bucket sintético `produtos` — não divide sessão de caixa.
 */
const getHubFinanceMovementBySectorReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const bundle = await (0, hubReportCommercialNet_1.loadCommercialPeriodBundle)({
            clinicId: clinic_id,
            unitFilter: { mode: 'unit', unitId: unit_id },
            fromYmd,
            toYmd,
        });
        if (!bundle.ok)
            return res.status(500).json({ error: bundle.error });
        const serviceIds = [
            ...new Set([...bundle.saleLines, ...bundle.returnLinesById.values()]
                .map((l) => l.hub_service_type_id)
                .filter((id) => Boolean(id))),
        ];
        const serviceMeta = new Map();
        for (let i = 0; i < serviceIds.length; i += 200) {
            const chunk = serviceIds.slice(i, i + 200);
            if (!chunk.length)
                continue;
            const { data: services } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, name, service_group')
                .in('id', chunk);
            for (const svc of services ?? []) {
                serviceMeta.set(svc.id, {
                    name: String(svc.name || svc.id),
                    service_group: String(svc.service_group ?? 'outros').trim() || 'outros',
                });
            }
        }
        const agg = (0, hubReportCommercialNet_1.aggregateMovementBySectorNet)({
            saleLines: bundle.saleLines,
            returnEvents: bundle.returnEvents,
            returnLinesById: bundle.returnLinesById,
            returnHeadersById: bundle.returnHeadersById,
            serviceMeta,
        });
        // Bucket explícito para reembolsos financeiros sem linha
        const by_group = [...agg.by_group];
        if (bundle.unallocatedFinancialRefunds > 0.009) {
            by_group.push({
                service_group: 'nao_alocado_financeiro',
                lines_count: bundle.unallocatedFinancialRefundRows.length,
                quantity: 0,
                total: (0, hubReportCommercialNet_1.round2Report)(-bundle.unallocatedFinancialRefunds),
                share_pct: 0,
            });
        }
        return res.json({
            period: { from: fromYmd, to: toYmd },
            competence: {
                sales: 'receivable.created_at (data da cobrança gerada)',
                returns: 'hub_product_return_events.created_at',
            },
            summary: {
                receivables_count: bundle.salesHeaders.length,
                lines_count: agg.summary.lines_count,
                total: agg.summary.total,
                groups_count: by_group.length,
                returns_commercial: agg.summary.returns_commercial,
                unallocated_financial_refunds: bundle.unallocatedFinancialRefunds,
            },
            by_group,
            by_service: agg.by_service,
            notes: 'Totais líquidos comerciais (vendas − devoluções no período). “nao_alocado_financeiro” = reembolso sem vínculo de linha (não é devolução comercial). Unidade estrita.',
        });
    }
    catch (e) {
        console.error('getHubFinanceMovementBySectorReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceMovementBySectorReport = getHubFinanceMovementBySectorReport;
const getHubFinanceAgingReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        const unit = uuidStr.safeParse(req.query.unit_id);
        if (!clinic.success || !unit.success)
            return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const { resolveReportUnitScope } = await Promise.resolve().then(() => __importStar(require('./hubReportUnitScope')));
        const unitScope = await resolveReportUnitScope({
            userId,
            clinicId: clinic.data,
            requestedUnitId: unit.data,
            unitMode: 'required',
        });
        if (!unitScope.ok)
            return res.status(unitScope.status).json({ error: unitScope.error });
        const unitId = unitScope.unitId ?? unit.data;
        const asOfRaw = typeof req.query.as_of === 'string' ? req.query.as_of.trim() : '';
        const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) && !Number.isNaN(Date.parse(`${asOfRaw}T00:00:00Z`)) ? asOfRaw : ymdTodayUtc();
        const { data: recs, error } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, final_amount, due_date')
            .eq('clinic_id', clinic.data)
            .eq('unit_id', unitId)
            .is('deleted_at', null)
            .in('status', ['pending', 'partially_paid']);
        if (error)
            return res.status(500).json({ error: error.message });
        const recIds = (recs ?? []).map((r) => r.id);
        const postedByRec = new Map();
        const lineRefundByRec = new Map();
        for (let i = 0; i < recIds.length; i += 200) {
            const chunk = recIds.slice(i, i + 200);
            if (!chunk.length)
                continue;
            const { data: payRows } = await supabase_1.supabaseAdmin
                .from('hub_payments')
                .select('receivable_id, amount')
                .in('receivable_id', chunk)
                .eq('status', 'posted');
            for (const row of payRows ?? []) {
                const id = row.receivable_id;
                postedByRec.set(id, round2((postedByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
            }
            const { data: adjRows } = await supabase_1.supabaseAdmin
                .from('hub_financial_adjustments')
                .select('receivable_id, amount')
                .in('receivable_id', chunk)
                .eq('adjustment_type', 'refund')
                .is('payment_id', null);
            for (const row of adjRows ?? []) {
                const id = row.receivable_id;
                lineRefundByRec.set(id, round2((lineRefundByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
            }
        }
        const buckets = {
            no_due_date: { count: 0, total: 0 },
            not_due: { count: 0, total: 0 },
            overdue_1_30: { count: 0, total: 0 },
            overdue_31_60: { count: 0, total: 0 },
            overdue_61_plus: { count: 0, total: 0 },
        };
        for (const rec of recs ?? []) {
            const amount = (0, hubReceivableFinancialBalance_1.balanceDue)({
                finalAmount: Number(rec.final_amount ?? 0),
                postedPayments: postedByRec.get(rec.id) ?? 0,
                lineRefundsAlreadyPaidOut: lineRefundByRec.get(rec.id) ?? 0,
            });
            if (amount <= 0.009)
                continue;
            let key = 'no_due_date';
            if (rec.due_date) {
                if (String(rec.due_date) >= asOf) {
                    key = 'not_due';
                }
                else {
                    const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${rec.due_date}T00:00:00Z`)) / 86_400_000);
                    if (days <= 30)
                        key = 'overdue_1_30';
                    else if (days <= 60)
                        key = 'overdue_31_60';
                    else
                        key = 'overdue_61_plus';
                }
            }
            buckets[key].count += 1;
            buckets[key].total = round2(buckets[key].total + amount);
        }
        return res.json({
            as_of: asOf,
            buckets,
            notes: 'Totais = saldo a receber (final − pago líquido efetivo). Unidade estrita.',
        });
    }
    catch (e) {
        console.error('getHubFinanceAgingReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceAgingReport = getHubFinanceAgingReport;
/** Vendas (recebíveis criados) e acertos (descontos, estornos, write-offs) no período. */
const getHubFinanceSalesAdjustmentsReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const { data: recs, error: recErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, final_amount, original_amount, net_amount_at_sale, returned_amount, status, created_at, guardian_id, guardian:hub_guardians(id, full_name)')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .is('deleted_at', null)
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
        if (recErr)
            return res.status(500).json({ error: recErr.message });
        const salesByStatus = {};
        let salesTotalAtSale = 0;
        let salesFinalTotal = 0;
        let salesCount = 0;
        let cancelledWithoutReturn = 0;
        for (const rec of recs ?? []) {
            if (rec.status === 'cancelled' && Number(rec.returned_amount ?? 0) <= 0.009) {
                cancelledWithoutReturn += 1;
                continue;
            }
            if (rec.status === 'cancelled')
                continue;
            const atSale = rec.net_amount_at_sale != null && Number.isFinite(Number(rec.net_amount_at_sale))
                ? Number(rec.net_amount_at_sale)
                : Number(rec.final_amount ?? 0) + Number(rec.returned_amount ?? 0);
            const finalAmt = Number(rec.final_amount ?? 0);
            const st = String(rec.status ?? 'unknown');
            const cur = salesByStatus[st] ?? { count: 0, total_at_sale: 0, final_total: 0 };
            cur.count += 1;
            cur.total_at_sale = round2(cur.total_at_sale + atSale);
            cur.final_total = round2(cur.final_total + finalAmt);
            salesByStatus[st] = cur;
            salesTotalAtSale = round2(salesTotalAtSale + atSale);
            salesFinalTotal = round2(salesFinalTotal + finalAmt);
            salesCount += 1;
        }
        const { data: adjustments, error: adjErr } = await supabase_1.supabaseAdmin
            .from('hub_financial_adjustments')
            .select('id, receivable_id, adjustment_type, amount, reason, created_at, clinic_id')
            .eq('clinic_id', clinic_id)
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .order('created_at', { ascending: false })
            .limit(500);
        if (adjErr)
            return res.status(500).json({ error: adjErr.message });
        const adjRecIds = [...new Set((adjustments ?? []).map((a) => a.receivable_id))];
        const recMeta = new Map();
        if (adjRecIds.length > 0) {
            const { data: adjRecs, error: adjRecErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, unit_id, guardian:hub_guardians(full_name)')
                .in('id', adjRecIds);
            if (adjRecErr)
                return res.status(500).json({ error: adjRecErr.message });
            for (const row of adjRecs ?? []) {
                const g = row.guardian;
                const name = Array.isArray(g) ? g[0]?.full_name : g?.full_name;
                recMeta.set(row.id, {
                    unit_id: row.unit_id ?? null,
                    guardian_name: name ?? null,
                });
            }
        }
        const by_type = {};
        const items = [];
        let adjustmentsTotal = 0;
        for (const adj of adjustments ?? []) {
            const meta = recMeta.get(adj.receivable_id);
            // Unidade estrita: sem meta ou unit diferente → exclui; null unit não entra na unidade selecionada
            if (!meta || meta.unit_id !== unit_id)
                continue;
            const amount = Number(adj.amount ?? 0);
            const type = String(adj.adjustment_type ?? 'unknown');
            const cur = by_type[type] ?? { count: 0, total: 0 };
            cur.count += 1;
            cur.total = round2(cur.total + amount);
            by_type[type] = cur;
            adjustmentsTotal = round2(adjustmentsTotal + amount);
            items.push({
                id: adj.id,
                receivable_id: adj.receivable_id,
                adjustment_type: type,
                amount,
                reason: adj.reason ?? null,
                created_at: adj.created_at,
                guardian_name: meta?.guardian_name ?? null,
            });
        }
        return res.json({
            period: { from: fromYmd, to: toYmd },
            sales: {
                receivables_count: salesCount,
                total_at_sale: salesTotalAtSale,
                total: salesFinalTotal,
                by_status: salesByStatus,
                cancelled_without_commercial_return: cancelledWithoutReturn,
            },
            adjustments: {
                count: items.length,
                total: adjustmentsTotal,
                by_type,
                items: items.slice(0, 200),
                note: 'Acertos financeiros (refund/discount/reversal). Não confundir refund financeiro com devolução comercial.',
            },
            notes: 'Vendas na data da cobrança (total_at_sale = líquido na venda). Cancelamentos sem devolução comercial excluídos. Unidade estrita.',
        });
    }
    catch (e) {
        console.error('getHubFinanceSalesAdjustmentsReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceSalesAdjustmentsReport = getHubFinanceSalesAdjustmentsReport;
const SEM_PROFISSIONAL_KEY = '__none__';
async function buildCommissionsReport(params) {
    const { clinic_id, unit_id, fromYmd, toYmd, onlyStaffId } = params;
    const bundle = await (0, hubReportCommercialNet_1.loadCommercialPeriodBundle)({
        clinicId: clinic_id,
        unitFilter: { mode: 'unit', unitId: unit_id },
        fromYmd,
        toYmd,
    });
    if (!bundle.ok)
        return { ok: false, status: 500, error: bundle.error };
    // Somente linhas do novo regime (commission_accrued_at preenchido).
    const accruedSales = bundle.saleLines.filter((ln) => Boolean(ln.commission_accrued_at));
    const accruedReturnLineIds = new Set([...bundle.returnLinesById.values()]
        .filter((ln) => Boolean(ln.commission_accrued_at))
        .map((ln) => ln.id));
    const staffIds = [
        ...new Set([
            ...accruedSales.map((l) => l.commission_staff_member_id),
            ...[...bundle.returnLinesById.values()].map((l) => l.commission_staff_member_id),
        ].filter((id) => Boolean(id))),
    ];
    const staffNames = new Map();
    for (let i = 0; i < staffIds.length; i += 200) {
        const chunk = staffIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const { data: staffRows } = await supabase_1.supabaseAdmin
            .from('hub_staff_members')
            .select('id, full_name, display_name')
            .in('id', chunk);
        for (const s of staffRows ?? []) {
            staffNames.set(s.id, String(s.display_name || s.full_name || s.id));
        }
    }
    const allLines = [
        ...accruedSales,
        ...[...bundle.returnLinesById.values()].filter((l) => l.commission_accrued_at),
    ];
    const serviceIds = [
        ...new Set(allLines.map((l) => l.hub_service_type_id).filter((id) => Boolean(id))),
    ];
    const serviceNames = new Map();
    for (let i = 0; i < serviceIds.length; i += 200) {
        const chunk = serviceIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const { data: svcRows } = await supabase_1.supabaseAdmin.from('hub_service_types').select('id, name').in('id', chunk);
        for (const s of svcRows ?? [])
            serviceNames.set(s.id, String(s.name ?? s.id));
    }
    const productIds = [
        ...new Set(allLines.map((l) => l.hub_inventory_item_id).filter((id) => Boolean(id))),
    ];
    const productNames = new Map();
    for (let i = 0; i < productIds.length; i += 200) {
        const chunk = productIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const { data: itemRows } = await supabase_1.supabaseAdmin.from('hub_inventory_items').select('id, name').in('id', chunk);
        for (const p of itemRows ?? [])
            productNames.set(p.id, String(p.name ?? p.id));
    }
    const byService = new Map();
    const byProduct = new Map();
    const byStaff = new Map();
    const items = [];
    let totalCommission = 0;
    let totalSales = 0;
    let linesWithCommission = 0;
    const receivableIdsWithKeptLines = new Set();
    const pushEntry = (opts) => {
        if (onlyStaffId) {
            if (!opts.staffId || opts.staffId !== onlyStaffId)
                return;
        }
        const signedSales = round2(opts.sign * opts.commercialBase);
        // KPI e by_* contam só linhas de venda; devoluções ajustam o $ sem inflar a contagem.
        if (opts.sign === 1) {
            linesWithCommission += 1;
        }
        totalCommission = round2(totalCommission + opts.commissionSigned);
        totalSales = round2(totalSales + signedSales);
        receivableIdsWithKeptLines.add(opts.receivableId);
        if (opts.stId) {
            const cur = byService.get(opts.stId) ?? {
                service_id: opts.stId,
                name: serviceNames.get(opts.stId) ?? 'Serviço',
                lines_count: 0,
                sales_total: 0,
                commission_total: 0,
            };
            cur.lines_count += opts.sign === 1 ? 1 : 0;
            cur.sales_total = round2(cur.sales_total + signedSales);
            cur.commission_total = round2(cur.commission_total + opts.commissionSigned);
            byService.set(opts.stId, cur);
        }
        if (opts.itemId) {
            const cur = byProduct.get(opts.itemId) ?? {
                product_id: opts.itemId,
                name: productNames.get(opts.itemId) ?? 'Produto',
                lines_count: 0,
                sales_total: 0,
                commission_total: 0,
            };
            cur.lines_count += opts.sign === 1 ? 1 : 0;
            cur.sales_total = round2(cur.sales_total + signedSales);
            cur.commission_total = round2(cur.commission_total + opts.commissionSigned);
            byProduct.set(opts.itemId, cur);
        }
        const staffBucket = opts.staffId ?? (onlyStaffId ? null : SEM_PROFISSIONAL_KEY);
        if (staffBucket) {
            const cur = byStaff.get(staffBucket) ?? {
                staff_id: staffBucket === SEM_PROFISSIONAL_KEY ? '' : staffBucket,
                name: staffBucket === SEM_PROFISSIONAL_KEY
                    ? 'Sem profissional'
                    : staffNames.get(staffBucket) ?? 'Profissional',
                lines_count: 0,
                sales_total: 0,
                commission_total: 0,
            };
            cur.lines_count += opts.sign === 1 ? 1 : 0;
            cur.sales_total = round2(cur.sales_total + signedSales);
            cur.commission_total = round2(cur.commission_total + opts.commissionSigned);
            byStaff.set(staffBucket, cur);
        }
        items.push({
            receivable_id: opts.receivableId,
            line_id: opts.lineId,
            description: opts.description,
            service_name: opts.stId ? serviceNames.get(opts.stId) ?? null : null,
            product_name: opts.itemId ? productNames.get(opts.itemId) ?? null : null,
            staff_name: opts.staffId
                ? staffNames.get(opts.staffId) ?? null
                : onlyStaffId
                    ? null
                    : 'Sem profissional',
            staff_id: opts.staffId,
            line_total: signedSales,
            commission_amount: opts.commissionSigned,
            commission_original_amount: round2(opts.sign === 1 ? opts.commissionOriginal : -opts.commissionOriginal),
            commission_adjustment: round2(opts.sign === 1 ? 0 : -opts.commissionAdjustment),
            basis: opts.basis,
            rate: opts.rate,
        });
    };
    for (const ln of accruedSales) {
        const stId = ln.hub_service_type_id ?? null;
        const itemId = ln.hub_inventory_item_id ?? null;
        const staffId = ln.commission_staff_member_id ?? null;
        const basisAmount = round2(Number(ln.commission_basis_amount ?? ln.line_total ?? 0));
        const originalCommission = round2(Number(ln.commission_original_amount ?? 0));
        pushEntry({
            receivableId: ln.receivable_id,
            lineId: ln.id,
            description: String(ln.description ?? ''),
            stId,
            itemId,
            staffId,
            commercialBase: basisAmount,
            commissionOriginal: originalCommission,
            commissionAdjustment: 0,
            commissionSigned: originalCommission,
            basis: ln.commission_rule_basis ?? null,
            rate: ln.commission_rule_rate != null ? Number(ln.commission_rule_rate) : null,
            sign: 1,
        });
    }
    const commissionAdjustedByLineId = new Map();
    for (const ev of bundle.returnEvents) {
        if (!accruedReturnLineIds.has(ev.receivable_line_id))
            continue;
        const ln = bundle.returnLinesById.get(ev.receivable_line_id);
        const hdr = bundle.returnHeadersById.get(ev.receivable_id);
        if (!ln || !hdr)
            continue;
        const netInfo = (0, hubReportCommercialNet_1.netAtSaleFromHeader)(hdr);
        const originalHdr = Number(hdr.original_amount ?? 0);
        const returnedCommercial = (0, hubReportCommercialNet_1.commercialAmountForReturnedLine)({
            lineTotal: Number(ln.line_total ?? 0),
            originalAmount: originalHdr > 0.009 ? originalHdr : netInfo.net,
            netAmountAtSale: netInfo.net,
        });
        const basisAmount = round2(Number(ln.commission_basis_amount ?? 0));
        const originalCommission = round2(Number(ln.commission_original_amount ?? 0));
        const alreadyAdjusted = commissionAdjustedByLineId.get(ln.id) ?? 0;
        const adj = (0, hubCommissionAccrual_1.commissionAdjustmentForReturn)({
            commissionOriginalAmount: originalCommission,
            commissionBasisAmount: basisAmount > 0.009 ? basisAmount : returnedCommercial,
            returnedCommercial,
            alreadyAdjusted,
        });
        commissionAdjustedByLineId.set(ln.id, round2(alreadyAdjusted + adj));
        const stId = ln.hub_service_type_id ?? null;
        const itemId = ln.hub_inventory_item_id ?? null;
        const staffId = ln.commission_staff_member_id ?? null;
        pushEntry({
            receivableId: ln.receivable_id,
            lineId: ln.id,
            description: `Devolução: ${String(ln.description ?? '')}`,
            stId,
            itemId,
            staffId,
            commercialBase: returnedCommercial,
            commissionOriginal: originalCommission,
            commissionAdjustment: adj,
            commissionSigned: round2(-adj),
            basis: ln.commission_rule_basis ?? null,
            rate: ln.commission_rule_rate != null ? Number(ln.commission_rule_rate) : null,
            sign: -1,
        });
    }
    const byStaffList = [...byStaff.values()].sort((a, b) => {
        if (a.name === 'Sem profissional')
            return 1;
        if (b.name === 'Sem profissional')
            return -1;
        return b.commission_total - a.commission_total;
    });
    return {
        ok: true,
        data: {
            period: { from: fromYmd, to: toYmd },
            summary: {
                receivables_count: onlyStaffId
                    ? receivableIdsWithKeptLines.size
                    : new Set(accruedSales.map((l) => l.receivable_id)).size,
                lines_with_commission: linesWithCommission,
                total_commission: totalCommission,
                total_sales: totalSales,
            },
            by_service: [...byService.values()].sort((a, b) => b.commission_total - a.commission_total),
            by_product: [...byProduct.values()].sort((a, b) => b.commission_total - a.commission_total),
            by_staff: byStaffList,
            items: items.slice(0, 300),
            estimation: true,
            notes: 'Comissões a partir da nova apuração (snapshot por linha). Alterações de regras afetam somente vendas futuras. Devoluções ajustam o saldo com a regra original. Linhas anteriores à implantação não entram. Unidade estrita.',
        },
    };
}
/** Comissões estimadas no período (regras ativas × linhas de recebíveis não cancelados). */
const getHubFinanceCommissionsReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const built = await buildCommissionsReport({ clinic_id, unit_id, fromYmd, toYmd });
        if (!built.ok)
            return res.status(built.status).json({ error: built.error });
        return res.json(built.data);
    }
    catch (e) {
        console.error('getHubFinanceCommissionsReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceCommissionsReport = getHubFinanceCommissionsReport;
/**
 * Comissões do profissional logado (self-scoped).
 * Ignora qualquer staff_id da query — sempre resolve pelo usuário autenticado.
 */
const getHubFinanceMyCommissionsReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const myStaffId = await (0, hubStaffResolve_1.resolveStaffIdForUser)(clinic_id, req.user?.id);
        if (!myStaffId) {
            return res.status(403).json({
                error: 'Seu usuário não está vinculado a um profissional da equipe nesta clínica.',
            });
        }
        const built = await buildCommissionsReport({
            clinic_id,
            unit_id,
            fromYmd,
            toYmd,
            onlyStaffId: myStaffId,
        });
        if (!built.ok)
            return res.status(built.status).json({ error: built.error });
        return res.json({
            ...built.data,
            staff_id: myStaffId,
            by_staff: built.data.by_staff.filter((s) => s.staff_id === myStaffId),
        });
    }
    catch (e) {
        console.error('getHubFinanceMyCommissionsReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceMyCommissionsReport = getHubFinanceMyCommissionsReport;
/** Top clientes por faturamento (pagamentos) no período. */
const getHubFinanceTopClientsReport = async (req, res) => {
    try {
        const parsed = await parsePeriodQueryAuthorized(req);
        if (!parsed.ok)
            return res.status(parsed.status).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const limitRaw = zod_1.z.coerce.number().int().min(5).max(100).safeParse(req.query.limit);
        const limit = limitRaw.success ? limitRaw.data : 25;
        const { data: payments, error } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount, payment_date, receivable_id')
            .eq('clinic_id', clinic_id)
            .eq('status', 'posted')
            .gte('payment_date', fromIso)
            .lte('payment_date', toIso)
            .limit(20000);
        if (error)
            return res.status(500).json({ error: error.message });
        const recIds = [...new Set((payments ?? []).map((p) => p.receivable_id))];
        const recMeta = new Map();
        if (recIds.length > 0) {
            const chunk = 500;
            for (let i = 0; i < recIds.length; i += chunk) {
                const slice = recIds.slice(i, i + chunk);
                const { data: recs, error: recErr } = await supabase_1.supabaseAdmin
                    .from('hub_receivables')
                    .select('id, unit_id, guardian_id')
                    .in('id', slice);
                if (recErr)
                    return res.status(500).json({ error: recErr.message });
                for (const rec of recs ?? []) {
                    recMeta.set(rec.id, {
                        unit_id: rec.unit_id ?? null,
                        guardian_id: rec.guardian_id ?? null,
                    });
                }
            }
        }
        const byGuardian = new Map();
        let grandTotal = 0;
        for (const p of payments ?? []) {
            const meta = recMeta.get(p.receivable_id);
            if (!meta || !unitMatchesSelected(meta.unit_id, unit_id))
                continue;
            const gid = meta.guardian_id;
            if (!gid)
                continue;
            const amount = Number(p.amount ?? 0);
            const cur = byGuardian.get(gid) ?? { total: 0, payments_count: 0 };
            cur.total = round2(cur.total + amount);
            cur.payments_count += 1;
            byGuardian.set(gid, cur);
            grandTotal = round2(grandTotal + amount);
        }
        const ranked = [...byGuardian.entries()]
            .map(([guardian_id, v]) => ({ guardian_id, ...v }))
            .sort((a, b) => b.total - a.total);
        const top = ranked.slice(0, limit);
        const nameById = new Map();
        if (top.length > 0) {
            const { data: gRows, error: gErr } = await supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id, full_name, phone')
                .in('id', top.map((t) => t.guardian_id));
            if (gErr)
                return res.status(500).json({ error: gErr.message });
            for (const g of gRows ?? []) {
                nameById.set(g.id, {
                    full_name: String(g.full_name ?? ''),
                    phone: g.phone ?? null,
                });
            }
        }
        return res.json({
            period: { from: fromYmd, to: toYmd },
            summary: {
                clients_with_payments: ranked.length,
                total_revenue: grandTotal,
            },
            items: top.map((t, idx) => {
                const meta = nameById.get(t.guardian_id);
                return {
                    rank: idx + 1,
                    guardian_id: t.guardian_id,
                    full_name: meta?.full_name ?? '—',
                    phone: meta?.phone ?? null,
                    payments_count: t.payments_count,
                    total: t.total,
                    share_pct: grandTotal > 0 ? Math.round((t.total / grandTotal) * 1000) / 10 : 0,
                };
            }),
        });
    }
    catch (e) {
        console.error('getHubFinanceTopClientsReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceTopClientsReport = getHubFinanceTopClientsReport;
/** Pacotes: vendidos no período, consumos, saldos ativos e a vencer. */
const getHubFinancePackagesReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const unitRaw = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
        const { resolveReportUnitScope } = await Promise.resolve().then(() => __importStar(require('./hubReportUnitScope')));
        const unitScope = await resolveReportUnitScope({
            userId,
            clinicId: clinic_id,
            requestedUnitId: unitRaw || null,
            unitMode: 'clinic_aggregate_if_allowed',
        });
        if (!unitScope.ok)
            return res.status(unitScope.status).json({ error: unitScope.error });
        // Pacotes hoje são agregados por clínica; membership já validado acima.
        const period = (() => {
            const fromRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.from);
            const toRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.to);
            if (fromRaw.success && toRaw.success) {
                if (fromRaw.data > toRaw.data)
                    return { ok: false, error: 'from não pode ser maior que to' };
                return { ok: true, fromYmd: fromRaw.data, toYmd: toRaw.data };
            }
            const days = zod_1.z.coerce.number().int().min(1).max(366).safeParse(req.query.days);
            const n = days.success ? days.data : 30;
            const toYmd = ymdTodayUtc();
            const fromYmd = addDaysYmd(toYmd, -(n - 1));
            return { ok: true, fromYmd, toYmd };
        })();
        if (!period.ok)
            return res.status(400).json({ error: period.error });
        const { fromYmd, toYmd } = period;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const asOf = ymdTodayUtc();
        const expiringDaysParsed = zod_1.z.coerce.number().int().min(1).max(180).safeParse(req.query.expiring_days);
        const expiringDays = expiringDaysParsed.success ? expiringDaysParsed.data : 30;
        const expiringUntil = addDaysYmd(asOf, expiringDays);
        const { data: balances, error: bErr } = await supabase_1.supabaseAdmin
            .from('hub_customer_package_balances')
            .select(`id, guardian_id, pet_id, package_id, sessions_remaining, sessions_total, expires_at, purchased_at, created_at, purchase_group_id,
        hub_packages(id, name),
        hub_guardians(id, full_name),
        hub_pets(id, name),
        hub_service_types(id, name)`)
            .eq('clinic_id', clinic_id)
            .order('purchased_at', { ascending: false })
            .limit(5000);
        if (bErr) {
            if (String(bErr.message || '').includes('hub_customer_package_balances')) {
                return res.json({
                    period: { from: fromYmd, to: toYmd },
                    expiring_until: expiringUntil,
                    summary: {
                        purchased_lines: 0,
                        sessions_sold: 0,
                        sessions_redeemed: 0,
                        active_with_balance: 0,
                        expiring_soon: 0,
                    },
                    purchased: [],
                    active: [],
                    expiring: [],
                });
            }
            return res.status(500).json({ error: bErr.message });
        }
        const purchased = [];
        const active = [];
        const expiring = [];
        let sessionsSold = 0;
        let activeCount = 0;
        let expiringCount = 0;
        const mapRow = (row) => {
            const pkg = row.hub_packages;
            const g = row.hub_guardians;
            const pet = row.hub_pets;
            const svc = row.hub_service_types;
            const pkgName = Array.isArray(pkg) ? pkg[0]?.name : pkg?.name;
            const gName = Array.isArray(g) ? g[0]?.full_name : g?.full_name;
            const petName = Array.isArray(pet) ? pet[0]?.name : pet?.name;
            const svcName = Array.isArray(svc) ? svc[0]?.name : svc?.name;
            return {
                id: row.id,
                package_name: pkgName ?? null,
                service_name: svcName ?? null,
                guardian_id: row.guardian_id,
                guardian_name: gName ?? null,
                pet_name: petName ?? null,
                sessions_total: Number(row.sessions_total ?? 0),
                sessions_remaining: Number(row.sessions_remaining ?? 0),
                purchased_at: row.purchased_at ?? row.created_at ?? null,
                expires_at: row.expires_at ?? null,
            };
        };
        for (const row of balances ?? []) {
            const mapped = mapRow(row);
            const purchasedAt = mapped.purchased_at;
            if (purchasedAt && purchasedAt >= fromIso && purchasedAt <= toIso) {
                purchased.push(mapped);
                sessionsSold += mapped.sessions_total || 0;
            }
            if (mapped.sessions_remaining > 0) {
                activeCount += 1;
                if (active.length < 200)
                    active.push(mapped);
                const exp = mapped.expires_at;
                if (exp && exp >= asOf && exp <= expiringUntil) {
                    expiringCount += 1;
                    expiring.push(mapped);
                }
            }
        }
        let sessionsRedeemed = 0;
        const { data: redemptions, error: redErr } = await supabase_1.supabaseAdmin
            .from('hub_package_redemptions')
            .select('id, redeemed_at, reversed_at')
            .eq('clinic_id', clinic_id)
            .is('reversed_at', null)
            .gte('redeemed_at', fromIso)
            .lte('redeemed_at', toIso)
            .limit(8000);
        if (!redErr && redemptions) {
            sessionsRedeemed = redemptions.length;
        }
        else if (redErr && !String(redErr.message || '').includes('hub_package_redemptions')) {
            return res.status(500).json({ error: redErr.message });
        }
        expiring.sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)));
        return res.json({
            period: { from: fromYmd, to: toYmd },
            expiring_until: expiringUntil,
            summary: {
                purchased_lines: purchased.length,
                sessions_sold: sessionsSold,
                sessions_redeemed: sessionsRedeemed,
                active_with_balance: activeCount,
                expiring_soon: expiringCount,
            },
            purchased: purchased.slice(0, 200),
            active: active.slice(0, 100),
            expiring: expiring.slice(0, 100),
        });
    }
    catch (e) {
        console.error('getHubFinancePackagesReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinancePackagesReport = getHubFinancePackagesReport;
const listExpensesQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
    .strict();
const listHubFinanceExpenses = async (req, res) => {
    try {
        const parsed = listExpensesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
        }
        const { clinic_id, unit_id, from, to } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_expenses')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(500);
        if (from)
            q = q.gte('expense_date', from);
        if (to)
            q = q.lte('expense_date', to);
        const { data, error } = await q;
        if (error) {
            if (String(error.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ expenses: data ?? [] });
    }
    catch (e) {
        console.error('listHubFinanceExpenses', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinanceExpenses = listHubFinanceExpenses;
const postExpenseBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    amount: zod_1.z.number().positive(),
    category: expenseCategorySchema,
    description: zod_1.z.string().trim().min(1).max(2000),
    expense_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    payment_method: expensePaymentMethodSchema,
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
})
    .strict();
const postHubFinanceExpense = async (req, res) => {
    try {
        const parsed = postExpenseBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, unit_id, amount, category, description, expense_date, payment_method, notes } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .insert({
            clinic_id,
            unit_id,
            amount: round2(amount),
            category,
            description,
            expense_date: expense_date ?? ymdTodayUtc(),
            payment_method: payment_method ?? null,
            notes: notes ?? null,
            created_by_user_id: userId,
        })
            .select('*')
            .single();
        if (error) {
            if (String(error.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ expense: data });
    }
    catch (e) {
        console.error('postHubFinanceExpense', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceExpense = postHubFinanceExpense;
const patchHubFinanceExpense = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = postExpenseBodySchema.safeParse(req.body);
        if (!id.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const { clinic_id, unit_id, amount, category, description, expense_date, payment_method, notes } = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .update({
            amount: round2(amount),
            category,
            description,
            expense_date: expense_date ?? ymdTodayUtc(),
            payment_method: payment_method ?? null,
            notes: notes ?? null,
        })
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .select('*')
            .maybeSingle();
        if (error) {
            if (String(error.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        if (!data)
            return res.status(404).json({ error: 'Despesa não encontrada' });
        return res.json({ expense: data });
    }
    catch (e) {
        console.error('patchHubFinanceExpense', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubFinanceExpense = patchHubFinanceExpense;
const deleteExpenseQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
})
    .strict();
const deleteHubFinanceExpense = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = deleteExpenseQuerySchema.safeParse(req.query);
        if (!id.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const { clinic_id, unit_id } = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .delete()
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .select('id')
            .maybeSingle();
        if (error) {
            if (String(error.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        if (!data)
            return res.status(404).json({ error: 'Despesa não encontrada' });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('deleteHubFinanceExpense', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteHubFinanceExpense = deleteHubFinanceExpense;
const postCashMovementBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    movement_type: zod_1.z.enum(['withdrawal', 'deposit']),
    amount: zod_1.z.number().positive(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
})
    .strict();
const postHubFinanceCashMovement = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = postCashMovementBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const sessionId = idParsed.data;
        const { clinic_id, movement_type, amount, notes } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data: sess, error: sErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id, clinic_id, status')
            .eq('id', sessionId)
            .maybeSingle();
        if (sErr || !sess || sess.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        if (sess.status !== 'open')
            return res.status(409).json({ error: 'Só é possível movimentar caixa aberto' });
        const { data: row, error: iErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_movements')
            .insert({
            clinic_id,
            cash_session_id: sessionId,
            movement_type,
            amount: round2(amount),
            notes: notes ?? null,
            created_by_user_id: userId,
        })
            .select('*')
            .single();
        if (iErr)
            return res.status(500).json({ error: iErr.message });
        return res.status(201).json({ movement: row });
    }
    catch (e) {
        console.error('postHubFinanceCashMovement', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceCashMovement = postHubFinanceCashMovement;
const payableCategorySchema = zod_1.z.enum(hubPayablesService_1.PAYABLE_CATEGORIES);
const payablePaymentMethodSchema = zod_1.z.enum(hubPayablesService_1.PAYABLE_PAYMENT_METHODS);
const payableStatusSchema = zod_1.z.enum(['pending', 'paid', 'cancelled']);
const missingPayablesTable = (msg) => String(msg || '').includes('hub_payables')
    ? 'Tabela hub_payables não encontrada. Aplique a migração 113_create_hub_payables.sql.'
    : null;
const missingPayableSchedulesTable = (msg) => String(msg || '').includes('hub_payable_schedules') || String(msg || '').includes('recurrence_detached')
    ? 'Recorrência de contas a pagar indisponível. Aplique a migração 117_create_hub_payable_schedules.sql.'
    : null;
const missingEstimatedAmountColumns = (msg) => String(msg || '').includes('amount_confirmed') || String(msg || '').includes('amount_mode')
    ? 'Valor estimado de contas a pagar indisponível. Aplique a migração 118_alter_hub_payables_estimated_amount.sql.'
    : null;
function payableWriteError(message, statusFallback = () => 500) {
    const estimated = missingEstimatedAmountColumns(message);
    if (estimated)
        return { status: 503, error: estimated };
    const schedule = missingPayableSchedulesTable(message);
    if (schedule)
        return { status: 503, error: schedule };
    const table = missingPayablesTable(message);
    if (table)
        return { status: 503, error: table };
    return { status: statusFallback(message), error: message };
}
function payableSourceLabel(payable, surgeryMeta) {
    if (payable.source_type === 'recurrence')
        return 'Recorrente';
    if (payable.source_type === 'surgery' && payable.source_id) {
        const meta = surgeryMeta.get(payable.source_id);
        if (!meta)
            return 'Cirurgia';
        return meta.pet_name ? `Cirurgia: ${meta.title} (${meta.pet_name})` : `Cirurgia: ${meta.title}`;
    }
    return 'Manual';
}
const listPayablesQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    status: payableStatusSchema.optional(),
    source_type: zod_1.z.enum(['surgery', 'manual', 'recurrence']).optional(),
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
    .strict();
const listHubFinancePayables = async (req, res) => {
    try {
        const parsed = listPayablesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
        }
        const { clinic_id, unit_id, status, source_type, from, to } = parsed.data;
        const horizon = await (0, hubPayablesService_1.ensurePayableScheduleHorizon)({ clinicId: clinic_id, unitId: unit_id });
        if (horizon.error && !horizon.missingTable) {
            console.error('ensurePayableScheduleHorizon', horizon.error);
        }
        let q = supabase_1.supabaseAdmin
            .from('hub_payables')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .is('deleted_at', null)
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(500);
        if (status)
            q = q.eq('status', status);
        else
            q = q.neq('status', 'cancelled');
        if (source_type)
            q = q.eq('source_type', source_type);
        const { data, error } = await q;
        if (error) {
            const hint = missingPayablesTable(error.message);
            if (hint)
                return res.status(503).json({ error: hint });
            return res.status(500).json({ error: error.message });
        }
        let payables = (data ?? []);
        if (from || to) {
            payables = payables.filter((p) => {
                const ref = p.status === 'paid' && p.paid_at
                    ? String(p.paid_at).slice(0, 10)
                    : p.due_date
                        ? String(p.due_date).slice(0, 10)
                        : String(p.created_at).slice(0, 10);
                if (from && ref < from)
                    return false;
                if (to && ref > to)
                    return false;
                return true;
            });
        }
        const surgeryIds = [
            ...new Set(payables
                .filter((p) => p.source_type === 'surgery' && p.source_id)
                .map((p) => p.source_id)),
        ];
        const surgeryMeta = new Map();
        if (surgeryIds.length) {
            const { data: surgeries } = await supabase_1.supabaseAdmin
                .from('hub_surgeries')
                .select('id, title, hub_pets(name)')
                .eq('clinic_id', clinic_id)
                .in('id', surgeryIds);
            for (const s of surgeries ?? []) {
                const pet = s.hub_pets;
                const petName = Array.isArray(pet) ? pet[0]?.name : pet?.name;
                surgeryMeta.set(s.id, { title: String(s.title ?? ''), pet_name: petName ?? null });
            }
        }
        return res.json({
            payables: payables.map((p) => ({
                ...p,
                source_label: payableSourceLabel(p, surgeryMeta),
            })),
        });
    }
    catch (e) {
        console.error('listHubFinancePayables', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinancePayables = listHubFinancePayables;
const postPayableBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    amount: zod_1.z.number().positive(),
    category: payableCategorySchema.default('professional_fee'),
    description: zod_1.z.string().trim().min(1).max(2000),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    payee_staff_member_id: uuidStr.optional().nullable(),
    payee_supplier_id: uuidStr.optional().nullable(),
    payee_name: zod_1.z.string().trim().min(1).max(200).optional(),
    status: zod_1.z.enum(['pending', 'paid']).default('pending'),
    due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    payment_method: payablePaymentMethodSchema.optional().nullable(),
    paid_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
})
    .strict()
    .superRefine((v, ctx) => {
    if (v.payee_staff_member_id && v.payee_supplier_id) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Informe profissional ou fornecedor, não os dois',
            path: ['payee_supplier_id'],
        });
    }
    if (!v.payee_staff_member_id && !v.payee_supplier_id && !(v.payee_name && v.payee_name.trim())) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Informe o profissional, o fornecedor ou o nome do credor',
            path: ['payee_name'],
        });
    }
    if (v.status === 'paid') {
        if (!v.payment_method) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Forma de pagamento obrigatória quando já pago',
                path: ['payment_method'],
            });
        }
    }
});
const postHubFinancePayable = async (req, res) => {
    try {
        const parsed = postPayableBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const b = parsed.data;
        let payeeName = (b.payee_name || '').trim();
        let payeeStaffId = b.payee_staff_member_id ?? null;
        let payeeSupplierId = b.payee_supplier_id ?? null;
        if (payeeStaffId && payeeSupplierId) {
            return res.status(400).json({ error: 'Informe profissional ou fornecedor, não os dois' });
        }
        if (payeeStaffId) {
            const { data: staff } = await supabase_1.supabaseAdmin
                .from('hub_staff_members')
                .select('id, full_name, display_name')
                .eq('id', payeeStaffId)
                .eq('clinic_id', b.clinic_id)
                .maybeSingle();
            if (!staff)
                return res.status(400).json({ error: 'Profissional não encontrado nesta clínica' });
            if (!payeeName) {
                payeeName = String(staff.full_name || staff.display_name || 'Profissional');
            }
        }
        if (payeeSupplierId) {
            const { data: supplier } = await supabase_1.supabaseAdmin
                .from('hub_suppliers')
                .select('id, name, party_name')
                .eq('id', payeeSupplierId)
                .eq('clinic_id', b.clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (!supplier)
                return res.status(400).json({ error: 'Fornecedor não encontrado nesta clínica' });
            if (!payeeName) {
                payeeName = String(supplier.name || supplier.party_name || 'Fornecedor');
            }
        }
        const status = b.status;
        const paidAt = status === 'paid' ? b.paid_at ?? new Date().toISOString() : null;
        const paymentMethod = status === 'paid' ? b.payment_method ?? null : null;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .insert({
            clinic_id: b.clinic_id,
            unit_id: b.unit_id,
            amount: round2(b.amount),
            category: b.category,
            description: b.description,
            notes: b.notes ?? null,
            payee_staff_member_id: payeeStaffId,
            payee_supplier_id: payeeSupplierId,
            payee_name: payeeName,
            source_type: 'manual',
            source_id: null,
            source_role: null,
            status,
            due_date: status === 'pending' ? b.due_date ?? null : b.due_date ?? null,
            paid_at: paidAt,
            payment_method: paymentMethod,
            created_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error) {
            const hint = missingPayablesTable(error.message);
            if (hint)
                return res.status(503).json({ error: hint });
            if (String(error.message || '').includes('payee_supplier_id')) {
                return res.status(503).json({
                    error: 'Coluna payee_supplier_id ausente. Aplique a migração 115_alter_hub_payables_supplier.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ payable: data });
    }
    catch (e) {
        console.error('postHubFinancePayable', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinancePayable = postHubFinancePayable;
const patchPayableBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    amount: zod_1.z.number().positive().optional(),
    category: payableCategorySchema.optional(),
    description: zod_1.z.string().trim().min(1).max(2000).optional(),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    payee_staff_member_id: uuidStr.optional().nullable(),
    payee_supplier_id: uuidStr.optional().nullable(),
    payee_name: zod_1.z.string().trim().min(1).max(200).optional(),
    due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})
    .strict()
    .superRefine((v, ctx) => {
    if (v.payee_staff_member_id && v.payee_supplier_id) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Informe profissional ou fornecedor, não os dois',
            path: ['payee_supplier_id'],
        });
    }
});
const patchHubFinancePayable = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = patchPayableBodySchema.safeParse(req.body);
        if (!id.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const { clinic_id, ...fields } = parsed.data;
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .select('*')
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr) {
            const hint = missingPayablesTable(exErr.message);
            if (hint)
                return res.status(503).json({ error: hint });
            return res.status(500).json({ error: exErr.message });
        }
        if (!existing)
            return res.status(404).json({ error: 'Conta a pagar não encontrada' });
        if (existing.status !== 'pending') {
            return res.status(409).json({ error: 'Só é possível editar títulos pendentes' });
        }
        const update = {};
        if (fields.amount != null)
            update.amount = round2(fields.amount);
        if (fields.category != null)
            update.category = fields.category;
        if (fields.description != null)
            update.description = fields.description;
        if (fields.notes !== undefined)
            update.notes = fields.notes;
        if (fields.due_date !== undefined)
            update.due_date = fields.due_date;
        const nextStaff = fields.payee_staff_member_id !== undefined
            ? fields.payee_staff_member_id
            : existing.payee_staff_member_id;
        const nextSupplier = fields.payee_supplier_id !== undefined
            ? fields.payee_supplier_id
            : (existing.payee_supplier_id ?? null);
        if (fields.payee_staff_member_id !== undefined || fields.payee_supplier_id !== undefined) {
            if (nextStaff && nextSupplier) {
                return res.status(400).json({ error: 'Informe profissional ou fornecedor, não os dois' });
            }
            if (fields.payee_staff_member_id !== undefined) {
                update.payee_staff_member_id = fields.payee_staff_member_id;
                if (fields.payee_staff_member_id) {
                    update.payee_supplier_id = null;
                    const { data: staff } = await supabase_1.supabaseAdmin
                        .from('hub_staff_members')
                        .select('full_name, display_name')
                        .eq('id', fields.payee_staff_member_id)
                        .eq('clinic_id', clinic_id)
                        .maybeSingle();
                    if (!staff)
                        return res.status(400).json({ error: 'Profissional não encontrado nesta clínica' });
                    if (!fields.payee_name) {
                        update.payee_name = String(staff.full_name || staff.display_name || existing.payee_name);
                    }
                }
            }
            if (fields.payee_supplier_id !== undefined) {
                update.payee_supplier_id = fields.payee_supplier_id;
                if (fields.payee_supplier_id) {
                    update.payee_staff_member_id = null;
                    const { data: supplier } = await supabase_1.supabaseAdmin
                        .from('hub_suppliers')
                        .select('id, name, party_name')
                        .eq('id', fields.payee_supplier_id)
                        .eq('clinic_id', clinic_id)
                        .is('deleted_at', null)
                        .maybeSingle();
                    if (!supplier)
                        return res.status(400).json({ error: 'Fornecedor não encontrado nesta clínica' });
                    if (!fields.payee_name) {
                        update.payee_name = String(supplier.name || supplier.party_name || existing.payee_name);
                    }
                }
            }
        }
        if (fields.payee_name != null)
            update.payee_name = fields.payee_name;
        if (Object.keys(update).length === 0) {
            return res.json({ payable: existing });
        }
        const confirmingAmount = fields.amount != null && existing.source_type === 'recurrence';
        if (existing.source_type === 'recurrence') {
            update.recurrence_detached = true;
            if (confirmingAmount)
                update.amount_confirmed = true;
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .update(update)
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .select('*')
            .maybeSingle();
        if (error) {
            if (String(error.message || '').includes('payee_supplier_id')) {
                return res.status(503).json({
                    error: 'Coluna payee_supplier_id ausente. Aplique a migração 115_alter_hub_payables_supplier.sql.',
                });
            }
            const estimatedHint = missingEstimatedAmountColumns(error.message);
            if (estimatedHint)
                return res.status(503).json({ error: estimatedHint });
            const scheduleHint = missingPayableSchedulesTable(error.message);
            if (scheduleHint)
                return res.status(503).json({ error: scheduleHint });
            if (error.code === '23505' || String(error.message || '').includes('uniq_hub_payables_recurrence_due')) {
                return res.status(409).json({ error: 'Já existe uma competência desta recorrência nessa data.' });
            }
            return res.status(500).json({ error: error.message });
        }
        if (!data)
            return res.status(404).json({ error: 'Conta a pagar não encontrada' });
        if (confirmingAmount && existing.source_id) {
            const synced = await (0, hubPayablesService_1.applyConfirmedEstimateToSchedule)({
                clinicId: clinic_id,
                scheduleId: String(existing.source_id),
                amount: round2(fields.amount),
            });
            if (synced.error) {
                const mapped = payableWriteError(synced.error);
                return res.status(mapped.status).json({ error: mapped.error });
            }
        }
        return res.json({ payable: data });
    }
    catch (e) {
        console.error('patchHubFinancePayable', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubFinancePayable = patchHubFinancePayable;
const payPayableBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    payment_method: payablePaymentMethodSchema,
    paid_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    amount: zod_1.z.number().positive().optional(),
})
    .strict();
const postHubFinancePayablePay = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = payPayableBodySchema.safeParse(req.body);
        if (!id.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const { clinic_id, payment_method, paid_at, amount } = parsed.data;
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .select('*')
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr) {
            const hint = missingPayablesTable(exErr.message);
            if (hint)
                return res.status(503).json({ error: hint });
            return res.status(500).json({ error: exErr.message });
        }
        if (!existing)
            return res.status(404).json({ error: 'Conta a pagar não encontrada' });
        if (existing.status !== 'pending') {
            return res.status(409).json({ error: 'Só é possível pagar títulos pendentes' });
        }
        const needsInvoice = existing.amount_confirmed === false;
        if (needsInvoice && amount == null) {
            return res.status(409).json({ error: 'Informe o valor da fatura' });
        }
        const invoiceAmount = needsInvoice ? round2(amount) : null;
        if (invoiceAmount != null && existing.source_type === 'recurrence') {
            const { error: confirmErr } = await supabase_1.supabaseAdmin
                .from('hub_payables')
                .update({
                amount: invoiceAmount,
                amount_confirmed: true,
                recurrence_detached: true,
            })
                .eq('id', id.data)
                .eq('clinic_id', clinic_id)
                .eq('status', 'pending');
            if (confirmErr) {
                const mapped = payableWriteError(confirmErr.message);
                return res.status(mapped.status).json({ error: mapped.error });
            }
            if (existing.source_id) {
                const synced = await (0, hubPayablesService_1.applyConfirmedEstimateToSchedule)({
                    clinicId: clinic_id,
                    scheduleId: String(existing.source_id),
                    amount: invoiceAmount,
                });
                if (synced.error) {
                    const mapped = payableWriteError(synced.error);
                    return res.status(mapped.status).json({ error: mapped.error });
                }
            }
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .update({
            status: 'paid',
            payment_method,
            paid_at: paid_at ?? new Date().toISOString(),
            ...(invoiceAmount != null ? { amount: invoiceAmount, amount_confirmed: true } : {}),
        })
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .eq('status', 'pending')
            .select('*')
            .maybeSingle();
        if (error) {
            const mapped = payableWriteError(error.message);
            return res.status(mapped.status).json({ error: mapped.error });
        }
        if (!data)
            return res.status(409).json({ error: 'Título já não está pendente' });
        return res.json({ payable: data });
    }
    catch (e) {
        console.error('postHubFinancePayablePay', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinancePayablePay = postHubFinancePayablePay;
const cancelPayableBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
})
    .strict();
const postHubFinancePayableCancel = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = cancelPayableBodySchema.safeParse(req.body);
        if (!id.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const { clinic_id } = parsed.data;
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .select('*')
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr) {
            const hint = missingPayablesTable(exErr.message);
            if (hint)
                return res.status(503).json({ error: hint });
            return res.status(500).json({ error: exErr.message });
        }
        if (!existing)
            return res.status(404).json({ error: 'Conta a pagar não encontrada' });
        if (existing.status !== 'pending') {
            return res.status(409).json({ error: 'Só é possível cancelar títulos pendentes' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .update({ status: 'cancelled' })
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .eq('status', 'pending')
            .select('*')
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(409).json({ error: 'Título já não está pendente' });
        return res.json({ payable: data });
    }
    catch (e) {
        console.error('postHubFinancePayableCancel', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinancePayableCancel = postHubFinancePayableCancel;
const payableScheduleFrequencySchema = zod_1.z.enum(hubPayablesService_1.PAYABLE_SCHEDULE_FREQUENCIES);
const schedulePayeeSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    amount: zod_1.z.number().positive(),
    category: payableCategorySchema.optional(),
    description: zod_1.z.string().trim().min(1).max(2000),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    payee_staff_member_id: uuidStr.optional().nullable(),
    payee_supplier_id: uuidStr.optional().nullable(),
    payee_name: zod_1.z.string().trim().min(1).max(200).optional(),
    amount_mode: zod_1.z.enum(hubPayablesService_1.PAYABLE_SCHEDULE_AMOUNT_MODES).optional(),
    frequency: payableScheduleFrequencySchema.optional(),
    anchor_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    until_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    status: zod_1.z.enum(['active', 'paused']).optional(),
})
    .strict();
async function resolvePayablePayee(params) {
    let payeeName = params.payeeName.trim();
    const payeeStaffId = params.payeeStaffId;
    const payeeSupplierId = params.payeeSupplierId;
    if (payeeStaffId && payeeSupplierId) {
        return { payeeName, payeeStaffId, payeeSupplierId, error: 'Informe profissional ou fornecedor, não os dois' };
    }
    if (payeeStaffId) {
        const { data: staff } = await supabase_1.supabaseAdmin
            .from('hub_staff_members')
            .select('id, full_name, display_name')
            .eq('id', payeeStaffId)
            .eq('clinic_id', params.clinicId)
            .maybeSingle();
        if (!staff) {
            return { payeeName, payeeStaffId, payeeSupplierId, error: 'Profissional não encontrado nesta clínica' };
        }
        if (!payeeName)
            payeeName = String(staff.full_name || staff.display_name || 'Profissional');
    }
    if (payeeSupplierId) {
        const { data: supplier } = await supabase_1.supabaseAdmin
            .from('hub_suppliers')
            .select('id, name, party_name')
            .eq('id', payeeSupplierId)
            .eq('clinic_id', params.clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        if (!supplier) {
            return { payeeName, payeeStaffId, payeeSupplierId, error: 'Fornecedor não encontrado nesta clínica' };
        }
        if (!payeeName)
            payeeName = String(supplier.name || supplier.party_name || 'Fornecedor');
    }
    if (!payeeStaffId && !payeeSupplierId && !payeeName) {
        return { payeeName, payeeStaffId, payeeSupplierId, error: 'Informe o profissional, o fornecedor ou o nome do credor' };
    }
    return { payeeName, payeeStaffId, payeeSupplierId };
}
const listHubFinancePayableSchedules = async (req, res) => {
    try {
        const parsed = zod_1.z
            .object({ clinic_id: uuidStr, unit_id: uuidStr })
            .strict()
            .safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
        const listed = await (0, hubPayablesService_1.listPayableSchedules)({
            clinicId: parsed.data.clinic_id,
            unitId: parsed.data.unit_id,
        });
        if (listed.missingTable) {
            return res.status(503).json({
                error: 'Recorrência de contas a pagar indisponível. Aplique a migração 117_create_hub_payable_schedules.sql.',
            });
        }
        if (listed.error)
            return res.status(500).json({ error: listed.error });
        return res.json({ schedules: listed.schedules });
    }
    catch (e) {
        console.error('listHubFinancePayableSchedules', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinancePayableSchedules = listHubFinancePayableSchedules;
const postHubFinancePayableSchedule = async (req, res) => {
    try {
        const parsed = schedulePayeeSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const b = parsed.data;
        if (!b.unit_id)
            return res.status(400).json({ error: 'unit_id obrigatório' });
        if (!b.frequency)
            return res.status(400).json({ error: 'Informe a frequência' });
        if (!b.anchor_date)
            return res.status(400).json({ error: 'Informe o primeiro vencimento' });
        if (b.until_date && b.until_date < b.anchor_date) {
            return res.status(400).json({ error: 'A data final não pode ser anterior ao primeiro vencimento' });
        }
        const payee = await resolvePayablePayee({
            clinicId: b.clinic_id,
            payeeStaffId: b.payee_staff_member_id ?? null,
            payeeSupplierId: b.payee_supplier_id ?? null,
            payeeName: b.payee_name ?? '',
        });
        if (payee.error)
            return res.status(400).json({ error: payee.error });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_payable_schedules')
            .insert({
            clinic_id: b.clinic_id,
            unit_id: b.unit_id,
            amount: round2(b.amount),
            category: b.category ?? 'rent',
            description: b.description,
            notes: b.notes ?? null,
            payee_staff_member_id: payee.payeeStaffId,
            payee_supplier_id: payee.payeeSupplierId,
            payee_name: payee.payeeName,
            amount_mode: b.amount_mode ?? 'fixed',
            frequency: b.frequency,
            anchor_date: b.anchor_date,
            until_date: b.until_date ?? null,
            status: 'active',
            created_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error) {
            const mapped = payableWriteError(error.message);
            return res.status(mapped.status).json({ error: mapped.error });
        }
        const schedule = data;
        const horizon = await (0, hubPayablesService_1.ensurePayableScheduleHorizon)({
            clinicId: b.clinic_id,
            unitId: b.unit_id,
        });
        if (horizon.error && !horizon.missingTable) {
            const mapped = payableWriteError(horizon.error);
            return res.status(mapped.status).json({ error: mapped.error });
        }
        return res.status(201).json({
            schedule: {
                ...schedule,
                anchor_date: String(schedule.anchor_date).slice(0, 10),
                until_date: schedule.until_date ? String(schedule.until_date).slice(0, 10) : null,
            },
        });
    }
    catch (e) {
        console.error('postHubFinancePayableSchedule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinancePayableSchedule = postHubFinancePayableSchedule;
const patchHubFinancePayableSchedule = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = schedulePayeeSchema
            .partial()
            .extend({ clinic_id: uuidStr })
            .safeParse(req.body);
        if (!id.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
        }
        const b = parsed.data;
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_payable_schedules')
            .select('*')
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr) {
            const hint = missingPayableSchedulesTable(exErr.message);
            if (hint)
                return res.status(503).json({ error: hint });
            return res.status(500).json({ error: exErr.message });
        }
        if (!existing)
            return res.status(404).json({ error: 'Recorrência não encontrada' });
        if (existing.status === 'ended') {
            return res.status(409).json({ error: 'Recorrência encerrada não pode ser alterada' });
        }
        const nextAnchor = String(existing.anchor_date).slice(0, 10);
        const nextUntil = b.until_date !== undefined ? b.until_date : existing.until_date ? String(existing.until_date).slice(0, 10) : null;
        if (nextUntil && nextUntil < nextAnchor) {
            return res.status(400).json({ error: 'A data final não pode ser anterior ao primeiro vencimento' });
        }
        const nextStaff = b.payee_staff_member_id !== undefined
            ? b.payee_staff_member_id
            : existing.payee_staff_member_id;
        const nextSupplier = b.payee_supplier_id !== undefined
            ? b.payee_supplier_id
            : existing.payee_supplier_id;
        const payee = await resolvePayablePayee({
            clinicId: b.clinic_id,
            payeeStaffId: nextStaff,
            payeeSupplierId: nextSupplier,
            payeeName: b.payee_name ?? String(existing.payee_name ?? ''),
        });
        if (payee.error)
            return res.status(400).json({ error: payee.error });
        const update = {
            payee_staff_member_id: payee.payeeStaffId,
            payee_supplier_id: payee.payeeSupplierId,
            payee_name: payee.payeeName,
        };
        if (b.amount != null)
            update.amount = round2(b.amount);
        if (b.amount_mode != null)
            update.amount_mode = b.amount_mode;
        if (b.category != null)
            update.category = b.category;
        if (b.description != null)
            update.description = b.description;
        if (b.notes !== undefined)
            update.notes = b.notes;
        if (b.until_date !== undefined)
            update.until_date = b.until_date;
        if (b.status != null)
            update.status = b.status;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_payable_schedules')
            .update(update)
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .select('*')
            .maybeSingle();
        if (error) {
            const mapped = payableWriteError(error.message);
            return res.status(mapped.status).json({ error: mapped.error });
        }
        if (!data)
            return res.status(404).json({ error: 'Recorrência não encontrada' });
        const schedule = data;
        const propagated = await (0, hubPayablesService_1.propagatePayableSchedule)(schedule);
        if (propagated.error) {
            const mapped = payableWriteError(propagated.error);
            return res.status(mapped.status).json({ error: mapped.error });
        }
        if (schedule.status === 'active') {
            const horizon = await (0, hubPayablesService_1.ensurePayableScheduleHorizon)({
                clinicId: schedule.clinic_id,
                unitId: schedule.unit_id,
            });
            if (horizon.error && !horizon.missingTable) {
                const mapped = payableWriteError(horizon.error);
                return res.status(mapped.status).json({ error: mapped.error });
            }
        }
        return res.json({ schedule });
    }
    catch (e) {
        console.error('patchHubFinancePayableSchedule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubFinancePayableSchedule = patchHubFinancePayableSchedule;
const postHubFinancePayableScheduleEnd = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = zod_1.z.object({ clinic_id: uuidStr }).strict().safeParse(req.body);
        if (!id.success || !parsed.success)
            return res.status(400).json({ error: 'Dados inválidos' });
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_payable_schedules')
            .select('*')
            .eq('id', id.data)
            .eq('clinic_id', parsed.data.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr) {
            const hint = missingPayableSchedulesTable(exErr.message);
            if (hint)
                return res.status(503).json({ error: hint });
            return res.status(500).json({ error: exErr.message });
        }
        if (!existing)
            return res.status(404).json({ error: 'Recorrência não encontrada' });
        if (existing.status === 'ended')
            return res.json({ schedule: existing });
        const ended = await (0, hubPayablesService_1.endPayableSchedule)({ schedule: existing, todayYmd: (0, hubPayablesService_1.todayYmdSaoPaulo)() });
        if (ended.error) {
            const hint = missingPayableSchedulesTable(ended.error);
            if (hint)
                return res.status(503).json({ error: hint });
            return res.status(500).json({ error: ended.error });
        }
        return res.json({ schedule: { ...existing, status: 'ended' } });
    }
    catch (e) {
        console.error('postHubFinancePayableScheduleEnd', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinancePayableScheduleEnd = postHubFinancePayableScheduleEnd;
