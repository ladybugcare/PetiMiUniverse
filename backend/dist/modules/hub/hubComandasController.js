"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubComandaResolveCancellation = exports.getHubComandaCancellationPendingCount = exports.listHubComandas = exports.getHubComandaByOrigin = exports.postHubComandaSyncFromOrigin = exports.postHubComandaCheckout = exports.getHubComandaDetail = exports.postHubComandaOpen = void 0;
exports.syncOpenComandasAfterGroomingClosed = syncOpenComandasAfterGroomingClosed;
exports.syncOpenComandasAfterEncounterCompleted = syncOpenComandasAfterEncounterCompleted;
exports.maybeFlagComandaCancellationPending = maybeFlagComandaCancellationPending;
exports.financialAdjustmentFlagsForAppointments = financialAdjustmentFlagsForAppointments;
exports.financialAdjustmentFlagsForEncounters = financialAdjustmentFlagsForEncounters;
exports.fetchOpenComandaOriginKeysExported = fetchOpenComandaOriginKeysExported;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubFinancialController_1 = require("./hubFinancialController");
const uuidStr = zod_1.z.string().uuid();
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
const comandaOriginSchema = zod_1.z.enum(['appointment', 'grooming_session', 'quote', 'encounter', 'manual']);
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
    return null;
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
    throw new Error('NOT_FOUND');
}
const openComandaBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    origin_type: zod_1.z.enum(['appointment', 'grooming_session', 'quote', 'encounter', 'manual']),
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
        if (!data.manual_lines?.length) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'manual_lines obrigatório para comanda manual' });
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
        if (origin_type === 'grooming_session' || origin_type === 'encounter') {
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
    const comandaRow = comanda;
    const { paid_total, balance_due } = await computeComandaBalancePayload(comandaId, clinicId);
    const operational_complete = await isOperationalCompleteForComanda(comandaRow);
    // Enriquecer com nomes de tutor/pet
    const guardianId = comandaRow.guardian_id;
    const petId = comandaRow.pet_id;
    const petIds = [...new Set((items ?? []).map((it) => it.pet_id).filter(Boolean))];
    const [guRes, petRes, itemPetsRes] = await Promise.all([
        guardianId
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').eq('id', guardianId).maybeSingle()
            : Promise.resolve({ data: null }),
        petId
            ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name').eq('id', petId).maybeSingle()
            : Promise.resolve({ data: null }),
        petIds.length
            ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name').in('id', petIds)
            : Promise.resolve({ data: [] }),
    ]);
    const guardian = guRes.data ? { id: guRes.data.id, full_name: guRes.data.full_name } : null;
    const pet = petRes.data ? { id: petRes.data.id, name: petRes.data.name } : null;
    const petNameMap = new Map((itemPetsRes.data ?? []).map((p) => [p.id, p.name]));
    const enrichedItems = (items ?? []).map((it) => ({
        ...it,
        pet_name: it.pet_id ? (petNameMap.get(it.pet_id) ?? null) : null,
    }));
    return {
        comanda: { ...comanda, guardian, pet },
        items: enrichedItems,
        open_item_ids: openItemIds,
        invoiced_item_ids: [...invoicedItemIds],
        paid_total,
        balance_due,
        operational_complete,
    };
}
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
        payment_method: zod_1.z.enum(['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'customer_credit']),
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
                const now = new Date().toISOString();
                await supabase_1.supabaseAdmin
                    .from('hub_comandas')
                    .update({ status: 'fechada', closed_at: now, financial_status: 'balanced' })
                    .eq('id', comandaId)
                    .eq('clinic_id', clinic_id);
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
        const unitId = comanda.unit_id ?? null;
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
                const lineKind = mapItemToReceivableLineKind(it.origin_type ?? null);
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
                if (Math.abs(got - expected) > 0.02) {
                    await rollbackReceivables();
                    return res.status(400).json({
                        error: `Valor pago do grupo ${gi} deve ser ${expected.toFixed(2)} (recebido ${got.toFixed(2)})`,
                    });
                }
            }
            for (const pay of payments) {
                const rid = receivableIdForGroupIndex(pay.group_index);
                const { data: recRow } = await supabase_1.supabaseAdmin.from('hub_receivables').select('final_amount, unit_id').eq('id', rid).single();
                const finalAmt = Number(recRow?.final_amount ?? 0);
                let validatedCashSessionId = null;
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
                    const recUnit = recRow?.unit_id;
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
                    // Pagamentos não-dinheiro: carimbar a sessão aberta da unidade para rastreamento do dia
                    validatedCashSessionId = await (0, hubFinancialController_1.resolveOpenCashSessionId)(clinic_id, recRow?.unit_id);
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
        const after = await getHubComandaDetailPayload(comandaId, clinic_id);
        const stillOpenItems = after.open_item_ids.length > 0;
        const balAfter = Number(after.balance_due ?? 0);
        const opComplete = Boolean(after.operational_complete);
        const shouldClose = !stillOpenItems && balAfter <= 0.02 && opComplete;
        if (shouldClose) {
            await supabase_1.supabaseAdmin
                .from('hub_comandas')
                .update({ status: 'fechada', closed_at: new Date().toISOString() })
                .eq('id', comandaId)
                .eq('clinic_id', clinic_id);
        }
        const { data: comandaFresh } = await supabase_1.supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();
        if (comandaFresh) {
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
    const openIds = [...detail.open_item_ids];
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
        const bodyParsed = zod_1.z.object({ clinic_id: uuidStr }).strict().safeParse(req.body);
        const clinicFromQuery = uuidStr.safeParse(req.query.clinic_id);
        const clinicId = bodyParsed.success ? bodyParsed.data.clinic_id : clinicFromQuery.success ? clinicFromQuery.data : null;
        if (!idParsed.success || !clinicId) {
            return res.status(400).json({ error: 'id e clinic_id (UUID) obrigatórios' });
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
        try {
            await applySyncComandaFromOrigin(clinicId, id);
        }
        catch (e) {
            console.error('syncOpenComandasAfterGroomingClosed', id, e);
        }
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
        try {
            await applySyncComandaFromOrigin(clinicId, id);
        }
        catch (e) {
            console.error('syncOpenComandasAfterEncounterCompleted', id, e);
        }
    }
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
    const [guRes, petRes, paidByComanda] = await Promise.all([
        guIds.length
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', guIds)
            : Promise.resolve({ data: [] }),
        petIds.length
            ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name').in('id', petIds)
            : Promise.resolve({ data: [] }),
        Promise.all(comandaIds.map(async (cid) => {
            const { paid_total } = await computeComandaBalancePayload(cid, clinicId);
            return [cid, paid_total];
        })),
    ]);
    const guMap = new Map((guRes.data ?? []).map((g) => [g.id, g]));
    const petMap = new Map((petRes.data ?? []).map((p) => [p.id, p]));
    const paidMap = new Map(paidByComanda);
    return rows.map((r) => {
        const gu = r.guardian_id ? guMap.get(r.guardian_id) : null;
        const pet = r.pet_id ? petMap.get(r.pet_id) : null;
        return {
            ...r,
            guardian: gu ? { id: gu.id, full_name: gu.full_name } : null,
            pet: pet ? { id: pet.id, name: pet.name } : null,
            paid_total: paidMap.get(r.id) ?? 0,
        };
    });
}
const getHubComandaByOrigin = async (req, res) => {
    try {
        const q = zod_1.z
            .object({
            clinic_id: uuidStr,
            origin_type: comandaOriginSchema,
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
