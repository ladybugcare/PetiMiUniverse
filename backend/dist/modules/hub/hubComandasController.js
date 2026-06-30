"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchHubComanda = exports.postHubComandaCheckoutBulk = exports.postHubComandaSuggestItemPrice = exports.deleteHubComandaItem = exports.patchHubComandaItem = exports.postHubComandaAddItems = exports.postHubComandaResolveCancellation = exports.getHubComandaCancellationPendingCount = exports.listHubComandas = exports.getHubComandaByOrigin = exports.postHubComandaSyncFromOrigin = exports.postHubComandaCheckout = exports.getHubComandaDetail = exports.getHubComandaPdf = exports.getPublicComanda = exports.ensureComandaPublicToken = exports.postHubComandaOpen = void 0;
exports.tryAutoCloseComanda = tryAutoCloseComanda;
exports.syncOpenComandasAfterGroomingClosed = syncOpenComandasAfterGroomingClosed;
exports.syncOpenComandasAfterEncounterCompleted = syncOpenComandasAfterEncounterCompleted;
exports.syncOpenComandasAfterAppointmentOperationalComplete = syncOpenComandasAfterAppointmentOperationalComplete;
exports.maybeFlagComandaCancellationPending = maybeFlagComandaCancellationPending;
exports.financialAdjustmentFlagsForAppointments = financialAdjustmentFlagsForAppointments;
exports.financialAdjustmentFlagsForEncounters = financialAdjustmentFlagsForEncounters;
exports.fetchOpenComandaOriginKeysExported = fetchOpenComandaOriginKeysExported;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubFinancialController_1 = require("./hubFinancialController");
const hubPricingResolve_1 = require("./hubPricingResolve");
const auditLog_1 = require("../../utils/auditLog");
const hubComandaPdf_1 = require("./hubComandaPdf");
const hubClinicSettingsController_1 = require("./hubClinicSettingsController");
const hubPaymentMethods_1 = require("./hubPaymentMethods");
const uuidStr = zod_1.z.string().uuid();
const comandaEditContextSchema = zod_1.z.enum(['caixa', 'financeiro']).optional().default('caixa');
function computeComandaEditScopes(comandaRow, operationalComplete, balanceDue) {
    const status = String(comandaRow.status ?? '');
    const financeHandoffAt = comandaRow.finance_handoff_at;
    const paidAndComplete = operationalComplete && balanceDue <= 0.02;
    if (status !== 'aberta') {
        return { caixa: false, financeiro: false, locked_reason: 'closed' };
    }
    if (paidAndComplete) {
        return { caixa: false, financeiro: false, locked_reason: 'paid_and_complete' };
    }
    if (financeHandoffAt) {
        return { caixa: false, financeiro: true, locked_reason: 'finance_handoff' };
    }
    return { caixa: true, financeiro: true, locked_reason: null };
}
function editScopeErrorMessage(scopes, context) {
    if (scopes.locked_reason === 'paid_and_complete') {
        return 'Comanda quitada e serviço concluído. Use estorno para ajustes financeiros.';
    }
    if (scopes.locked_reason === 'finance_handoff' && context === 'caixa') {
        return 'Comanda enviada ao financeiro. Edite apenas pelo módulo Financeiro.';
    }
    if (scopes.locked_reason === 'closed') {
        return 'Comanda não está aberta';
    }
    return 'Comanda não pode ser editada neste contexto';
}
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
    const scopes = computeComandaEditScopes(comandaRow, operational_complete, balance_due);
    if (!scopes[context]) {
        throw new Error(editScopeErrorMessage(scopes, context));
    }
}
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
const boardingBilling_1 = require("./boardingBilling");
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
    return set;
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
/** Reutiliza comanda aberta do agendamento ao abrir checkout pela sessão B&T ou pelo encounter. */
async function resolveExistingOpenComandaIdForOpen(clinicId, originType, originId) {
    if (originType === 'grooming_session') {
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
    if (originType === 'appointment') {
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
        return String(s?.grooming_stage ?? '') === 'closed';
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
    return true;
}
async function sumPaymentsForComandaReceivables(comandaId, clinicId) {
    const { data: recs, error: rErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelled');
    if (rErr)
        throw new Error(rErr.message);
    const ids = (recs ?? []).map((r) => r.id);
    if (ids.length === 0)
        return 0;
    const { data: pays, error: pErr } = await supabase_1.supabaseAdmin.from('hub_payments').select('amount').in('receivable_id', ids);
    if (pErr)
        throw new Error(pErr.message);
    return round2((pays ?? []).reduce((s, row) => s + Number(row.amount ?? 0), 0));
}
/** Saldo em linhas ainda não faturadas + resíduo dos recebíveis (pendente / parcial). */
async function computeComandaBalancePayload(comandaId, clinicId) {
    const { data: comandaRow, error: cErr } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('total_amount')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (cErr)
        throw new Error(cErr.message);
    const totalAmount = Number(comandaRow?.total_amount ?? 0);
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
    let activeRecById = new Map();
    if (recIds.length) {
        const { data: recs } = await supabase_1.supabaseAdmin.from('hub_receivables').select('id, status').in('id', recIds);
        activeRecById = new Map((recs ?? []).map((r) => [r.id, String(r.status) !== 'cancelled']));
    }
    const invoicedItemIds = new Set();
    for (const row of lineRows ?? []) {
        const cid = row.comanda_item_id;
        const rid = row.receivable_id;
        if (cid && activeRecById.get(rid))
            invoicedItemIds.add(cid);
    }
    const openItemIds = (items ?? []).map((it) => it.id).filter((id) => !invoicedItemIds.has(id));
    const openSet = new Set(openItemIds);
    const openLinesTotal = round2((items ?? []).filter((it) => openSet.has(it.id)).reduce((s, it) => s + Number(it.line_total ?? 0), 0));
    const paid = await sumPaymentsForComandaReceivables(comandaId, clinicId);
    const { data: recs, error: rErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, final_amount, status')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelled');
    if (rErr)
        throw new Error(rErr.message);
    let receivableResidual = 0;
    for (const r of recs ?? []) {
        const rid = r.id;
        const fa = Number(r.final_amount ?? 0);
        const { data: pays } = await supabase_1.supabaseAdmin.from('hub_payments').select('amount').eq('receivable_id', rid);
        const paidRec = round2((pays ?? []).reduce((a, row) => a + Number(row.amount ?? 0), 0));
        receivableResidual += round2(Math.max(0, fa - paidRec));
    }
    const balance_due = round2(openLinesTotal + receivableResidual);
    return { paid_total: paid, balance_due, total_amount: totalAmount };
}
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
/** Fecha comanda aberta quando saldo quitado, sem itens em aberto e operação concluída. */
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
    const detail = await getHubComandaDetailPayload(comandaId, clinicId);
    const stillOpenItems = detail.open_item_ids.length > 0;
    const balAfter = Number(detail.balance_due ?? 0);
    const opComplete = Boolean(detail.operational_complete);
    if (stillOpenItems || balAfter > 0.02 || !opComplete)
        return false;
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
async function sumAppointmentServicesSaleForComanda(appointmentId, defaultPetId) {
    const { data: svcRows, error } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('id, hub_service_type_id, order_index, sale_amount_applied, hub_service_types(name)')
        .eq('appointment_id', appointmentId)
        .order('order_index', { ascending: true });
    if (error)
        throw new Error(error.message);
    const items = [];
    let subtotal = 0;
    let idx = 0;
    for (const row of svcRows ?? []) {
        const sale = Number(row.sale_amount_applied ?? 0);
        const st = row.hub_service_types;
        const name = Array.isArray(st) ? st[0]?.name : st?.name;
        const desc = name || 'Serviço';
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
    if (built.items.length === 0) {
        built.items.push({
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
    return {
        items: built.items,
        subtotal: built.subtotal,
        unit_id: appt.unit_id ?? null,
        guardian_id: guardianId,
        pet_id: petId,
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
    let subtotal = round2(svc.subtotal + extras.subtotal);
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
    return {
        items: allItems,
        subtotal,
        unit_id: session.unit_id ?? null,
        guardian_id: guardianId,
        pet_id: petId,
    };
}
async function buildComandaItemsFromQuote(clinicId, quoteId) {
    const { data: quote, error: qErr } = await supabase_1.supabaseAdmin
        .from('hub_quotes')
        .select('id, clinic_id, unit_id, guardian_id, status, billing_state, billing_waived_at')
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
    return {
        items,
        subtotal: round2(subtotal),
        unit_id: unitId,
        guardian_id: guardianId,
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
    const apptIdEarly = enc.hub_appointment_id;
    if (opts?.allowIncomplete && encStatus !== 'completed') {
        let guardianId = enc.guardian_id;
        let petId = enc.pet_id ?? null;
        // Resolver identidade via caso clínico quando encounter não tem tutor/pet
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
        if (apptIdEarly) {
            // Encounter com agendamento — usar itens do agendamento como rascunho
            if (!petId)
                throw new Error('NO_PET');
            const ap = await sumAppointmentServicesSaleForComanda(apptIdEarly, petId);
            const allItems = [...ap.items];
            let subtotal = ap.subtotal;
            if (allItems.length === 0) {
                allItems.push({
                    pet_id: petId,
                    item_kind: 'fee',
                    hub_service_type_id: null,
                    hub_inventory_item_id: null,
                    hub_inventory_lot_id: null,
                    description: 'Consulta / atendimento clínico (parcial)',
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
            return {
                items: allItems,
                subtotal: round2(subtotal),
                unit_id: enc.unit_id ?? null,
                guardian_id: guardianId,
                pet_id: petId,
            };
        }
        else {
            // Walk-in clínico antecipado — sem agendamento, item de placeholder com tutor/pet do encounter
            return {
                items: [
                    {
                        pet_id: petId,
                        item_kind: 'fee',
                        hub_service_type_id: null,
                        hub_inventory_item_id: null,
                        hub_inventory_lot_id: null,
                        description: 'Consulta / atendimento clínico (parcial)',
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
                unit_id: enc.unit_id ?? null,
                guardian_id: guardianId,
                pet_id: petId,
            };
        }
    }
    if (enc.status !== 'completed')
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
    if (!petId)
        throw new Error('NO_PET');
    const apptId = enc.hub_appointment_id;
    const allItems = [];
    let subtotal = 0;
    // 1. Appointment service items (existing behaviour)
    if (apptId) {
        const ap = await sumAppointmentServicesSaleForComanda(apptId, petId);
        allItems.push(...ap.items);
        subtotal += ap.subtotal;
    }
    // 2. Vaccinations applied in-clinic during this encounter
    const { data: vaxRows } = await supabase_1.supabaseAdmin
        .from('hub_vaccination_records')
        .select('id, vaccine_name, hub_inventory_item_id, price')
        .eq('hub_encounter_id', encounterId)
        .eq('source', 'in_clinic')
        .is('deleted_at', null);
    for (const vax of vaxRows ?? []) {
        const vaxRow = vax;
        const amount = typeof vaxRow.price === 'number' ? vaxRow.price : 0;
        allItems.push({
            pet_id: petId,
            item_kind: 'service',
            hub_service_type_id: null,
            hub_inventory_item_id: vaxRow.hub_inventory_item_id,
            hub_inventory_lot_id: null,
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
    // 4. Clinical exams requested in this encounter
    const { data: examRows } = await supabase_1.supabaseAdmin
        .from('hub_clinical_exams')
        .select('id, exam_type, lab_kind, lab_name, external_lab_name, price')
        .eq('hub_encounter_id', encounterId)
        .neq('status', 'cancelled')
        .is('deleted_at', null);
    for (const exam of examRows ?? []) {
        const examRow = exam;
        const amount = typeof examRow.price === 'number' ? examRow.price : 0;
        const labLabel = examRow.lab_kind === 'external'
            ? examRow.external_lab_name
                ? ` — ${String(examRow.external_lab_name)}`
                : ' (externo)'
            : examRow.lab_name
                ? ` — ${String(examRow.lab_name)}`
                : '';
        allItems.push({
            pet_id: petId,
            item_kind: 'service',
            hub_service_type_id: null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: `Exame: ${String(examRow.exam_type || 'Exame')}${labLabel}`,
            quantity: 1,
            unit_amount: amount,
            discount_amount: 0,
            line_total: amount,
            service_date: null,
            origin_type: 'clinical_exam',
            origin_id: examRow.id,
            sort_order: allItems.length,
        });
        subtotal += amount;
    }
    // Fallback: generic consultation fee if nothing was found
    if (allItems.length === 0) {
        allItems.push({
            pet_id: petId,
            item_kind: 'fee',
            hub_service_type_id: null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: 'Consulta / atendimento clínico',
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
    return {
        items: allItems,
        subtotal: round2(subtotal),
        unit_id: enc.unit_id ?? null,
        guardian_id: guardianId,
        pet_id: petId,
    };
}
async function buildComandaItemsFromBoardingReservation(clinicId, reservationId) {
    const { data: res, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('id, pet_id, guardian_id, unit_id, mode, status, expected_check_in, expected_check_out, checked_in_at, checked_out_at, daily_rate_cents, hub_appointment_id')
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
    if (res.status !== 'checked_out')
        throw new Error('NOT_READY');
    const { line, subtotal } = (0, boardingBilling_1.buildBoardingComandaLine)({
        id: reservationId,
        mode: res.mode,
        pet_id: res.pet_id,
        expected_check_in: res.expected_check_in,
        expected_check_out: res.expected_check_out,
        checked_in_at: res.checked_in_at,
        checked_out_at: res.checked_out_at,
        daily_rate_cents: res.daily_rate_cents,
    });
    return {
        items: [line],
        subtotal,
        unit_id: res.unit_id ?? null,
        guardian_id: guardianId,
        pet_id: res.pet_id,
    };
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
        const base = await buildComandaItemsFromAppointment(clinicId, oid, { allowIncompleteStatus: true });
        const closedSess = await findLatestClosedGroomingSessionIdForAppointment(clinicId, oid);
        if (closedSess) {
            const extras = await sumGroomingExtrasForComanda(closedSess, clinicId, base.pet_id);
            const items = [...base.items, ...extras.items];
            return { ...base, items, subtotal: round2(base.subtotal + extras.subtotal) };
        }
        return base;
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
        return await buildComandaItemsFromBoardingReservation(clinicId, oid);
    }
    throw new Error('NOT_FOUND');
}
const openComandaBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    origin_type: zod_1.z.enum(['appointment', 'grooming_session', 'quote', 'encounter', 'manual', 'boarding_reservation']),
    origin_id: uuidStr.optional(),
    guardian_id: uuidStr.optional(),
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
    if (data.origin_type === 'manual') {
        if (!data.guardian_id) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'guardian_id obrigatório para comanda manual' });
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
        const { clinic_id, origin_type, hub_case_id, hub_encounter_id } = b;
        const effectiveOriginId = origin_type === 'manual' ? (b.origin_id ?? (0, node_crypto_1.randomUUID)()) : b.origin_id;
        if (origin_type !== 'manual') {
            const keys = await fetchActiveReceivableKeys(clinic_id);
            if (keys.has(`${origin_type}:${effectiveOriginId}`)) {
                return res.status(409).json({ error: 'Já existe cobrança para esta origem' });
            }
        }
        if (origin_type === 'grooming_session' || origin_type === 'encounter' || origin_type === 'boarding_reservation') {
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
            return res.status(409).json({
                error: 'Já existe comanda aberta para esta origem',
                comanda_id: existing?.id ?? null,
            });
        }
        let built;
        if (origin_type === 'manual') {
            const lines = b.manual_lines ?? [];
            const items = [];
            let subtotal = 0;
            let sort = 0;
            for (const ln of lines) {
                const qty = Number(ln.quantity ?? 1);
                const unit = round2(ln.unit_amount);
                const lineTotal = round2(qty * unit);
                subtotal += lineTotal;
                items.push({
                    pet_id: ln.pet_id ?? null,
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
                guardian_id: b.guardian_id,
            };
        }
        else if (origin_type === 'appointment') {
            const a = await buildComandaItemsFromAppointment(clinic_id, effectiveOriginId, {
                allowIncompleteStatus: true,
            });
            built = a;
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
            built = await buildComandaItemsFromBoardingReservation(clinic_id, effectiveOriginId);
        }
        else {
            // Encounter: permite comanda antecipada (allowIncomplete) para recebimento antes de concluir
            built = await buildComandaItemsFromEncounter(clinic_id, effectiveOriginId, { allowIncomplete: true });
        }
        const discount = 0;
        const total = round2(Math.max(0, built.subtotal - discount));
        const resolvedEncounterId = hub_encounter_id ?? (origin_type === 'encounter' ? effectiveOriginId : null);
        let resolvedCaseId = hub_case_id ?? null;
        if (!resolvedCaseId && resolvedEncounterId) {
            const { data: encCase } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('hub_case_id')
                .eq('id', resolvedEncounterId)
                .maybeSingle();
            resolvedCaseId = encCase?.hub_case_id ?? null;
        }
        const { data: comanda, error: cErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .insert({
            clinic_id,
            unit_id: built.unit_id,
            guardian_id: built.guardian_id,
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
        })
            .select('id')
            .single();
        if (cErr || !comanda) {
            console.error('postHubComandaOpen', cErr);
            return res.status(500).json({ error: cErr?.message || 'Erro ao criar comanda' });
        }
        const comandaId = comanda.id;
        const rows = built.items.map((it) => ({
            clinic_id,
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
        }));
        const { error: iErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').insert(rows);
        if (iErr) {
            await supabase_1.supabaseAdmin.from('hub_comandas').delete().eq('id', comandaId);
            return res.status(500).json({ error: iErr.message });
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
    let activeRecById = new Map();
    if (recIds.length) {
        const { data: recs } = await supabase_1.supabaseAdmin.from('hub_receivables').select('id, status').in('id', recIds);
        activeRecById = new Map((recs ?? []).map((r) => [r.id, String(r.status) !== 'cancelled']));
    }
    const invoicedItemIds = new Set();
    for (const row of lineRows ?? []) {
        const cid = row.comanda_item_id;
        const rid = row.receivable_id;
        if (cid && activeRecById.get(rid))
            invoicedItemIds.add(cid);
    }
    const openItemIds = (items ?? []).map((it) => it.id).filter((id) => !invoicedItemIds.has(id));
    const activeReceivableIds = recIds.filter((id) => activeRecById.get(id));
    const comandaRow = comanda;
    const { paid_total, balance_due } = await computeComandaBalancePayload(comandaId, clinicId);
    const operational_complete = await isOperationalCompleteForComanda(comandaRow);
    const edit_scopes = computeComandaEditScopes(comandaRow, operational_complete, balance_due);
    // Enriquecer com nomes de tutor/pet
    const guardianId = comandaRow.guardian_id;
    const petId = comandaRow.pet_id;
    const petIds = [...new Set((items ?? []).map((it) => it.pet_id).filter(Boolean))];
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
    return {
        comanda: { ...comanda, guardian, pet },
        items: enrichedItems,
        pets,
        open_item_ids: openItemIds,
        invoiced_item_ids: [...invoicedItemIds],
        active_receivable_ids: activeReceivableIds,
        paid_total,
        balance_due,
        operational_complete,
        edit_scopes,
        allowed_guardians: allowedGuardians,
    };
}
async function loadComandaPdfPayload(comandaId, clinicId) {
    const detail = await getHubComandaDetailPayload(comandaId, clinicId);
    const comanda = detail.comanda;
    const { data: clinicRow } = await supabase_1.supabaseAdmin.from('clinics').select('name').eq('id', clinicId).maybeSingle();
    const guardianRaw = comanda.guardian;
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
            }
            : null,
        clinic: clinicRow ? { name: clinicRow.name } : null,
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
        const { notes: _notes, ...comandaPublic } = comandaRow;
        const { data: clinicRow } = await supabase_1.supabaseAdmin.from('clinics').select('name').eq('id', clinicId).maybeSingle();
        return res.json({
            comanda: {
                ...comandaPublic,
                clinic: clinicRow ? { name: clinicRow.name } : null,
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
        (0, hubComandaPdf_1.streamComandaPdf)(res, payload);
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
        const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
        const comanda = detail.comanda;
        if (String(comanda.status) !== 'aberta') {
            return res.status(409).json({ error: 'Comanda não está aberta' });
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
            return res.status(409).json({ error: 'Não há itens em aberto para faturar' });
        }
        const userId = req.user?.id ?? null;
        if (action === 'cancel') {
            if (!waive_reason) {
                return res.status(400).json({ error: 'Informe waive_reason (motivo) para cancelar' });
            }
            const originType = String(comanda.origin_type);
            const originId = comanda.origin_id;
            if (originType !== 'manual') {
                const keys = await fetchActiveReceivableKeys(clinic_id);
                if (keys.has(`${originType}:${originId}`)) {
                    return res.status(409).json({ error: 'Já existe cobrança; não é possível cancelar comanda desta forma' });
                }
            }
            const now = new Date().toISOString();
            if (originType === 'grooming_session') {
                await supabase_1.supabaseAdmin
                    .from('hub_grooming_sessions')
                    .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
                    .eq('id', originId)
                    .eq('clinic_id', clinic_id);
            }
            else if (originType === 'encounter') {
                await supabase_1.supabaseAdmin
                    .from('hub_encounters')
                    .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
                    .eq('id', originId)
                    .eq('clinic_id', clinic_id);
            }
            else if (originType === 'appointment') {
                await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
                    .eq('id', originId)
                    .eq('clinic_id', clinic_id);
            }
            else if (originType === 'quote') {
                await supabase_1.supabaseAdmin
                    .from('hub_quotes')
                    .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
                    .eq('id', originId)
                    .eq('clinic_id', clinic_id);
            }
            else if (originType === 'boarding_reservation') {
                await supabase_1.supabaseAdmin
                    .from('hub_boarding_reservations')
                    .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
                    .eq('id', originId)
                    .eq('clinic_id', clinic_id);
            }
            else if (originType === 'manual') {
                /* comanda manual: sem entidade operacional a dispensar */
            }
            await supabase_1.supabaseAdmin.from('hub_comandas').update({ status: 'cancelada', closed_at: now }).eq('id', comandaId);
            return res.json({ ok: true, comanda: { ...comanda, status: 'cancelada' } });
        }
        if (action === 'leave_pending' && !due_date) {
            return res.status(400).json({ error: 'due_date obrigatório para deixar pendente' });
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
        let unitId = comanda.unit_id ?? null;
        if (!unitId)
            unitId = await resolveClinicDefaultUnitId(clinic_id);
        const guardianId = comanda.guardian_id;
        const rollbackReceivables = async () => {
            for (const rid of receivableIds) {
                await supabase_1.supabaseAdmin.from('hub_payments').delete().eq('receivable_id', rid);
                await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', rid);
                await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', rid);
            }
            if (String(comanda.origin_type) === 'quote' && comanda.origin_id) {
                await supabase_1.supabaseAdmin.from('hub_quotes').update({ billing_state: 'awaiting_billing' }).eq('id', comanda.origin_id);
            }
        };
        for (let gi = 0; gi < groups.length; gi++) {
            const gids = groups[gi];
            const groupItems = gids.map((id) => itemById.get(id));
            const subtotal = round2(groupItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
            if (subtotal <= 0.009)
                continue;
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
            let sort = 0;
            for (const it of groupItems) {
                const lineKind = String(it.item_kind ?? '') === 'product'
                    ? 'product'
                    : mapItemToReceivableLineKind(it.origin_type ?? null);
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
                    line_total: Number(it.line_total ?? 0),
                    sort_order: sort++,
                });
                if (lnErr) {
                    await rollbackReceivables();
                    return res.status(500).json({ error: lnErr.message });
                }
            }
        }
        if (receivableIds.length === 0) {
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
        if (action === 'receive_now') {
            if (!payments?.length) {
                await rollbackReceivables();
                return res.status(400).json({ error: 'payments obrigatório para receber agora' });
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
            for (let gi = 0; gi < groups.length; gi++) {
                const sub = round2(groups[gi].map((id) => itemById.get(id)).reduce((s, it) => s + Number(it.line_total ?? 0), 0));
                if (sub > 0.009)
                    expectedByGroup.set(gi, sub);
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
                const finalAmt = Number(recRow?.final_amount ?? 0);
                let validatedCashSessionId = null;
                const recUnit = recRow?.unit_id;
                if (pay.payment_method === 'cash') {
                    if (!pay.cash_session_id) {
                        await rollbackReceivables();
                        return res.status(409).json({ error: 'Abra o caixa para receber em dinheiro.' });
                    }
                    const { data: cashSession, error: cashErr } = await supabase_1.supabaseAdmin
                        .from('hub_cash_sessions')
                        .select('id, clinic_id, unit_id, status')
                        .eq('id', pay.cash_session_id)
                        .maybeSingle();
                    if (cashErr ||
                        !cashSession ||
                        cashSession.clinic_id !== clinic_id ||
                        cashSession.status !== 'open' ||
                        (recUnit && cashSession.unit_id !== recUnit)) {
                        await rollbackReceivables();
                        return res.status(409).json({ error: 'Sessão de caixa inválida ou fechada.' });
                    }
                    validatedCashSessionId = cashSession.id;
                }
                else if (pay.cash_session_id) {
                    const { data: cashSession, error: cashErr } = await supabase_1.supabaseAdmin
                        .from('hub_cash_sessions')
                        .select('id, clinic_id, unit_id, status')
                        .eq('id', pay.cash_session_id)
                        .maybeSingle();
                    if (cashErr ||
                        !cashSession ||
                        cashSession.clinic_id !== clinic_id ||
                        cashSession.status !== 'open' ||
                        (recUnit && cashSession.unit_id !== recUnit)) {
                        await rollbackReceivables();
                        return res.status(409).json({ error: 'Sessão de caixa inválida ou fechada.' });
                    }
                    validatedCashSessionId = cashSession.id;
                }
                else {
                    validatedCashSessionId = await (0, hubFinancialController_1.resolvePaymentCashSessionId)(clinic_id, recUnit, unitId);
                }
                const { error: pErr } = await supabase_1.supabaseAdmin.from('hub_payments').insert({
                    clinic_id,
                    receivable_id: rid,
                    cash_session_id: validatedCashSessionId,
                    amount: round2(pay.amount),
                    payment_method: pay.payment_method,
                    installments: pay.installments ?? 1,
                    payment_date: new Date().toISOString(),
                    notes: null,
                    created_by_user_id: userId,
                    payment_timing: payment_timing,
                });
                if (pErr) {
                    await rollbackReceivables();
                    return res.status(500).json({ error: pErr.message });
                }
                const { data: sumRows } = await supabase_1.supabaseAdmin.from('hub_payments').select('amount').eq('receivable_id', rid);
                const paid = round2((sumRows ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0));
                let nextStatus = 'partially_paid';
                if (paid >= finalAmt - 0.009)
                    nextStatus = 'paid';
                await supabase_1.supabaseAdmin.from('hub_receivables').update({ status: nextStatus }).eq('id', rid);
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
async function applySyncComandaFromOrigin(clinicId, comandaId) {
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
    // Preserva itens adicionados manualmente pelo Caixa — só deleta os que vieram da origem operacional
    const allItems = detail.items;
    const openIdsSet = new Set(detail.open_item_ids);
    const manualOpenIds = new Set(allItems
        .filter((it) => openIdsSet.has(it.id) && it.origin_type === 'manual')
        .map((it) => it.id));
    const openIds = [...openIdsSet].filter((id) => !manualOpenIds.has(id));
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
    const discount = Number(comanda.discount_amount ?? 0);
    const insertRows = desiredFiltered.map((it) => ({
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
        sort_order: sortBase++,
    }));
    if (insertRows.length) {
        const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').insert(insertRows);
        if (insErr)
            throw new Error(insErr.message);
    }
    const { data: remaining } = await supabase_1.supabaseAdmin.from('hub_comanda_items').select('line_total').eq('comanda_id', comandaId);
    const sumAll = round2((remaining ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0));
    const total = round2(Math.max(0, sumAll - discount));
    await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .update({
        subtotal_amount: sumAll,
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
            const detail = await applySyncComandaFromOrigin(clinicId, idParsed.data);
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
async function syncOpenComandasAfterEncounterCompleted(clinicId, encounterId) {
    const { data: enc } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('hub_appointment_id')
        .eq('id', encounterId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    const apptId = enc?.hub_appointment_id ?? null;
    const ids = new Set();
    const idE = await findOpenComandaIdByOrigin(clinicId, 'encounter', encounterId);
    if (idE)
        ids.add(idE);
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
    const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, final_amount, status')
        .eq('id', receivableId)
        .maybeSingle();
    if (rErr || !rec)
        throw new Error(rErr?.message || 'Recebível não encontrado');
    if (['cancelled', 'refunded'].includes(String(rec.status)))
        return String(rec.status);
    const { data: payments, error: pErr } = await supabase_1.supabaseAdmin
        .from('hub_payments')
        .select('amount')
        .eq('receivable_id', receivableId);
    if (pErr)
        throw new Error(pErr.message);
    const paid = round2((payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const finalAmount = Number(rec.final_amount ?? 0);
    const nextStatus = paid <= 0.009 ? 'pending' : paid >= finalAmount - 0.009 ? 'paid' : 'partially_paid';
    await supabase_1.supabaseAdmin.from('hub_receivables').update({ status: nextStatus }).eq('id', receivableId);
    return nextStatus;
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
            .select('id, cancellation_pending_at, cancellation_resolved_at')
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
        if (!existing.cancellation_pending_at) {
            patch.cancellation_pending_at = now;
        }
        await supabase_1.supabaseAdmin.from('hub_comandas').update(patch).eq('id', comandaId).eq('clinic_id', clinicId);
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
        return 0;
    const recIds = recRows.map((r) => r.id);
    const { data: payments, error: pErr } = await supabase_1.supabaseAdmin
        .from('hub_payments')
        .select('id, clinic_id, receivable_id, amount, payment_method, cash_session_id')
        .in('receivable_id', recIds);
    if (pErr)
        throw new Error(pErr.message);
    let totalReversed = 0;
    for (const payment of payments ?? []) {
        if (payment.clinic_id !== clinicId)
            continue;
        let warning = null;
        if (payment.payment_method === 'cash' && payment.cash_session_id) {
            const { data: session } = await supabase_1.supabaseAdmin
                .from('hub_cash_sessions')
                .select('id, status')
                .eq('id', payment.cash_session_id)
                .eq('clinic_id', clinicId)
                .maybeSingle();
            if (session?.status === 'closed') {
                warning = 'Pagamento em dinheiro estornado de caixa já fechado; revise a conferência da sessão.';
            }
        }
        await supabase_1.supabaseAdmin.from('hub_financial_adjustments').insert({
            clinic_id: clinicId,
            receivable_id: payment.receivable_id,
            adjustment_type: 'refund',
            amount: payment.amount,
            reason: warning ? `${reason} (${warning})` : reason,
            created_by_user_id: userId,
        });
        const { error: delErr } = await supabase_1.supabaseAdmin.from('hub_payments').delete().eq('id', payment.id);
        if (delErr)
            throw new Error(delErr.message);
        totalReversed = round2(totalReversed + Number(payment.amount ?? 0));
        await recalculateReceivableStatusLocal(payment.receivable_id);
    }
    for (const rec of recRows) {
        const rid = rec.id;
        const { data: paysLeft } = await supabase_1.supabaseAdmin.from('hub_payments').select('id').eq('receivable_id', rid).limit(1);
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
        await supabase_1.supabaseAdmin.from('hub_receivables').update({ status: 'cancelled' }).eq('id', rid);
    }
    return totalReversed;
}
async function enrichCancellationQueueRows(clinicId, rows) {
    if (!rows.length)
        return rows;
    const guIds = [...new Set(rows.map((r) => r.guardian_id).filter(Boolean))];
    const petIds = [...new Set(rows.map((r) => r.pet_id).filter(Boolean))];
    const comandaIds = rows.map((r) => r.id);
    const [guRes, petRes, enrichedByComanda] = await Promise.all([
        guIds.length
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', guIds)
            : Promise.resolve({ data: [] }),
        petIds.length
            ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name').in('id', petIds)
            : Promise.resolve({ data: [] }),
        Promise.all(comandaIds.map(async (cid) => {
            const row = rows.find((r) => r.id === cid);
            if (!row) {
                const { paid_total, balance_due } = await computeComandaBalancePayload(cid, clinicId);
                return [cid, { paid_total, balance_due, operational_complete: true, edit_scopes: null }];
            }
            const { paid_total, balance_due } = await computeComandaBalancePayload(cid, clinicId);
            const operational_complete = await isOperationalCompleteForComanda(row);
            const edit_scopes = computeComandaEditScopes(row, operational_complete, balance_due);
            return [cid, { paid_total, balance_due, operational_complete, edit_scopes }];
        })),
    ]);
    const guMap = new Map((guRes.data ?? []).map((g) => [g.id, g]));
    const petMap = new Map((petRes.data ?? []).map((p) => [p.id, p]));
    const enrichedMap = new Map(enrichedByComanda);
    return rows.map((r) => {
        const gu = r.guardian_id ? guMap.get(r.guardian_id) : null;
        const pet = r.pet_id ? petMap.get(r.pet_id) : null;
        const extra = enrichedMap.get(r.id);
        return {
            ...r,
            guardian: gu ? { id: gu.id, full_name: gu.full_name } : null,
            pet: pet ? { id: pet.id, name: pet.name } : null,
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
                    error: 'Colunas de cancelamento na comanda não encontradas. Execute alter_hub_comandas_cancellation_resolution.sql.',
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
            const reversed = await reverseAllComandaPayments(clinic_id, comandaId, reason, userId);
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
                amount: reversed,
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
            .select('id, status, clinic_id')
            .eq('id', comandaId)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (cErr)
            return res.status(500).json({ error: cErr.message });
        if (!comanda)
            return res.status(404).json({ error: 'Comanda não encontrada' });
        const { data: maxSortRow } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .select('sort_order')
            .eq('comanda_id', comandaId)
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle();
        let sortBase = Number(maxSortRow?.sort_order ?? -1) + 1;
        const insertRows = items.map((it) => ({
            clinic_id,
            comanda_id: comandaId,
            pet_id: it.pet_id ?? null,
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
        }));
        const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').insert(insertRows);
        if (insErr)
            return res.status(500).json({ error: insErr.message });
        await recomputeComandaTotals(comandaId, clinic_id);
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
            .select('id, comanda_id, origin_type, quantity, unit_amount, discount_amount')
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
        const line_total = round2(qty * unit - disc);
        const { error: upErr } = await supabase_1.supabaseAdmin
            .from('hub_comanda_items')
            .update({ ...updates, line_total })
            .eq('id', itemId);
        if (upErr)
            return res.status(500).json({ error: upErr.message });
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
            .select('id, comanda_id, origin_type')
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
        const { error: delErr } = await supabase_1.supabaseAdmin.from('hub_comanda_items').delete().eq('id', itemId);
        if (delErr)
            return res.status(500).json({ error: delErr.message });
        await recomputeComandaTotals(comandaId, clinic_id);
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
})
    .strict();
const postHubComandaCheckoutBulk = async (req, res) => {
    try {
        const parsed = checkoutBulkBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, comanda_ids, action, due_date, payment_timing, payment_method, cash_session_id } = parsed.data;
        const userId = req.user?.id ?? null;
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
            return res.status(409).json({ error: `Comanda(s) não abertas: ${notOpen.map((c) => c.id).join(', ')}` });
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
                // Chamada interna ao core do checkout (reutiliza a lógica existente via supabase direto)
                // Para simplificar, usa o endpoint internamente construindo um fake request/response
                // Na prática: chamamos a lógica diretamente replicando o essencial do postHubComandaCheckout
                const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
                const items = detail.items.filter((it) => detail.open_item_ids.includes(it.id));
                if (items.length === 0) {
                    results.push({ comanda_id: comandaId, receivable_ids: [] });
                    continue;
                }
                const guardianId = detail.comanda.guardian_id;
                const unitId = detail.comanda.unit_id;
                const subtotal = round2(items.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
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
                    status: 'pending',
                    due_date: action === 'leave_pending' ? due_date : null,
                    notes: null,
                })
                    .select('id')
                    .single();
                if (rErr || !rec) {
                    results.push({ comanda_id: comandaId, receivable_ids: [], error: rErr?.message ?? 'Erro ao criar recebível' });
                    continue;
                }
                const receivableId = rec.id;
                let sort = 0;
                for (const it of items) {
                    await supabase_1.supabaseAdmin.from('hub_receivable_lines').insert({
                        clinic_id,
                        receivable_id: receivableId,
                        comanda_id: comandaId,
                        comanda_item_id: it.id,
                        pet_id: it.pet_id ?? null,
                        line_kind: 'service',
                        source_line_id: it.origin_id ?? null,
                        hub_service_type_id: it.hub_service_type_id ?? null,
                        description: String(it.description),
                        quantity: Number(it.quantity ?? 1),
                        unit_sale_amount: Number(it.unit_amount ?? 0),
                        line_total: Number(it.line_total ?? 0),
                        sort_order: sort++,
                    });
                }
                if (action === 'receive_now' && payment_method) {
                    let validatedCashSessionId = null;
                    if (payment_method === 'cash') {
                        if (!cash_session_id) {
                            await supabase_1.supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', receivableId);
                            await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
                            results.push({ comanda_id: comandaId, receivable_ids: [], error: 'Abra o caixa para receber em dinheiro.' });
                            continue;
                        }
                        validatedCashSessionId = cash_session_id;
                    }
                    else {
                        validatedCashSessionId = await (0, hubFinancialController_1.resolvePaymentCashSessionId)(clinic_id, unitId, unitId);
                    }
                    await supabase_1.supabaseAdmin.from('hub_payments').insert({
                        clinic_id,
                        receivable_id: receivableId,
                        cash_session_id: validatedCashSessionId,
                        amount: round2(subtotal),
                        payment_method,
                        installments: 1,
                        payment_date: new Date().toISOString(),
                        notes: null,
                        created_by_user_id: userId,
                        payment_timing,
                    });
                    await supabase_1.supabaseAdmin.from('hub_receivables').update({ status: 'paid' }).eq('id', receivableId);
                }
                if (action === 'leave_pending') {
                    await supabase_1.supabaseAdmin
                        .from('hub_comandas')
                        .update({ finance_handoff_at: new Date().toISOString() })
                        .eq('id', comandaId)
                        .eq('clinic_id', clinic_id);
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
        const { clinic_id, discount_amount, notes, guardian_id, edit_context } = parsed.data;
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
            .select('id, status, clinic_id')
            .eq('id', comandaId)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (cErr)
            return res.status(500).json({ error: cErr.message });
        if (!comanda)
            return res.status(404).json({ error: 'Comanda não encontrada' });
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
        const patch = {};
        if (discount_amount !== undefined)
            patch.discount_amount = discount_amount;
        if (notes !== undefined)
            patch.notes = notes;
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
