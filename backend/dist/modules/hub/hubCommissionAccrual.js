"use strict";
/**
 * Apuração imutável de comissão por linha de recebível.
 * Resolve profissional (matriz de origem), casa regra ativa no instante e congela valor.
 * Não recalcula finanças — usa base líquida de hubReceivableFinancialBalance.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.commissionAdjustmentForReturn = exports.matchRuleForLine = exports.computeCommissionAmount = void 0;
exports.loadActiveCommissionRules = loadActiveCommissionRules;
exports.resolveServiceExecutorStaff = resolveServiceExecutorStaff;
exports.resolveLineStaff = resolveLineStaff;
exports.accrueCommissionSnapshots = accrueCommissionSnapshots;
exports.snapshotToInsertFields = snapshotToInsertFields;
exports.comandaItemsToAccrualInputs = comandaItemsToAccrualInputs;
exports.buildCommissionInsertFieldsForItems = buildCommissionInsertFieldsForItems;
exports.assertServiceLinesHaveExecutor = assertServiceLinesHaveExecutor;
exports.backfillPickupLegCommissionStaff = backfillPickupLegCommissionStaff;
const supabase_1 = require("../../config/supabase");
const hubStaffResolve_1 = require("./hubStaffResolve");
const hubReceivableFinancialBalance_1 = require("./hubReceivableFinancialBalance");
Object.defineProperty(exports, "commissionAdjustmentForReturn", { enumerable: true, get: function () { return hubReceivableFinancialBalance_1.commissionAdjustmentForReturn; } });
const hubCommissionCalc_1 = require("./hubCommissionCalc");
Object.defineProperty(exports, "computeCommissionAmount", { enumerable: true, get: function () { return hubCommissionCalc_1.computeCommissionAmount; } });
Object.defineProperty(exports, "matchRuleForLine", { enumerable: true, get: function () { return hubCommissionCalc_1.matchRuleForLine; } });
async function loadActiveCommissionRules(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_commission_rules')
        .select('id, hub_service_type_id, hub_inventory_item_id, basis, rate')
        .eq('clinic_id', clinicId)
        .eq('active', true)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((r) => ({
        id: r.id,
        hub_service_type_id: r.hub_service_type_id ?? null,
        hub_inventory_item_id: r.hub_inventory_item_id ?? null,
        basis: r.basis,
        rate: Number(r.rate ?? 0),
    }));
}
async function assertStaffInClinic(clinicId, staffId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('id')
        .eq('id', staffId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return Boolean(data?.id);
}
/** Resolve executor de serviço conforme matriz do plano (sem inferências proibidas). */
async function resolveServiceExecutorStaff(opts) {
    const { clinicId, originType, originId } = opts;
    if (!originType || !originId)
        return null;
    if (originType === 'appointment_service') {
        const { data: svc } = await supabase_1.supabaseAdmin
            .from('hub_appointment_services')
            .select('id, executed_by_staff_id, appointment_id')
            .eq('id', originId)
            .maybeSingle();
        if (!svc)
            return null;
        if (svc.executed_by_staff_id) {
            const ok = await assertStaffInClinic(clinicId, svc.executed_by_staff_id);
            return ok ? svc.executed_by_staff_id : null;
        }
        // L&T: motorista da rota, se o agendamento for pickup_route
        const appointmentId = svc.appointment_id;
        if (!appointmentId)
            return null;
        const { data: appt } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, appointment_kind')
            .eq('id', appointmentId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (String(appt?.appointment_kind ?? '') !== 'pickup_route')
            return null;
        const { data: stop } = await supabase_1.supabaseAdmin
            .from('hub_pickup_stops')
            .select('hub_pickup_route_id')
            .eq('hub_appointment_id', appointmentId)
            .maybeSingle();
        if (!stop?.hub_pickup_route_id)
            return null;
        const { data: route } = await supabase_1.supabaseAdmin
            .from('hub_pickup_routes')
            .select('driver_staff_id')
            .eq('id', stop.hub_pickup_route_id)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        const driverId = route?.driver_staff_id ?? null;
        if (!driverId)
            return null;
        const ok = await assertStaffInClinic(clinicId, driverId);
        return ok ? driverId : null;
    }
    if (originType === 'grooming_extra') {
        // created_by_staff_id = cadastro, não executor — Sem profissional
        return null;
    }
    if (originType === 'vaccination') {
        const { data } = await supabase_1.supabaseAdmin
            .from('hub_vaccination_records')
            .select('hub_staff_member_id')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        const sid = data?.hub_staff_member_id ?? null;
        if (!sid)
            return null;
        return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
    }
    if (originType === 'medication_service') {
        const { data } = await supabase_1.supabaseAdmin
            .from('hub_encounter_medication_administrations')
            .select('hub_staff_member_id')
            .eq('id', originId)
            .maybeSingle();
        const sid = data?.hub_staff_member_id ?? null;
        if (!sid)
            return null;
        return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
    }
    if (originType === 'clinical_exam') {
        // requested_by = solicitante — proibido; Sem profissional
        return null;
    }
    if (originType === 'surgery_service') {
        const { data: ss } = await supabase_1.supabaseAdmin
            .from('hub_surgery_services')
            .select('surgery_id')
            .eq('id', originId)
            .maybeSingle();
        if (!ss?.surgery_id)
            return null;
        const { data: surg } = await supabase_1.supabaseAdmin
            .from('hub_surgeries')
            .select('hub_staff_member_id')
            .eq('id', ss.surgery_id)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        const sid = surg?.hub_staff_member_id ?? null;
        if (!sid)
            return null;
        return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
    }
    if (originType === 'encounter_service') {
        const { data: es } = await supabase_1.supabaseAdmin
            .from('hub_encounter_services')
            .select('hub_encounter_id')
            .eq('id', originId)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (!es?.hub_encounter_id)
            return null;
        const { data: enc } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('hub_staff_member_id')
            .eq('id', es.hub_encounter_id)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        const sid = enc?.hub_staff_member_id ?? null;
        if (!sid)
            return null;
        return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
    }
    if (originType === 'hospitalization_daily') {
        return null;
    }
    if (originType === 'hospitalization_charge') {
        // Só atribuir se houver dose 1:1 determinística (hospitalization_charge_id UNIQUE)
        const { data: dose } = await supabase_1.supabaseAdmin
            .from('hub_hospitalization_med_doses')
            .select('id, administered_by_staff_id')
            .eq('hospitalization_charge_id', originId)
            .maybeSingle();
        const sid = dose?.administered_by_staff_id ?? null;
        if (!sid)
            return null;
        return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
    }
    // boarding_*, quote_line, package_purchase, manual_line, etc.
    return null;
}
async function resolveLineStaff(opts) {
    const { clinicId, line, actingUserId, allowActingUserAsSaleAuthor } = opts;
    const isProduct = String(line.item_kind ?? '') === 'product' || Boolean(line.hub_inventory_item_id && !line.hub_service_type_id);
    if (isProduct) {
        if (line.sold_by_staff_id) {
            const ok = await assertStaffInClinic(clinicId, line.sold_by_staff_id);
            if (ok)
                return { staffId: line.sold_by_staff_id, source: 'sale_author' };
        }
        if (allowActingUserAsSaleAuthor && actingUserId) {
            const sid = await (0, hubStaffResolve_1.resolveStaffIdForUser)(clinicId, actingUserId);
            if (sid && (await assertStaffInClinic(clinicId, sid))) {
                return { staffId: sid, source: 'sale_author' };
            }
        }
        return { staffId: null, source: 'none' };
    }
    // Serviço
    const originId = line.origin_id ?? line.source_line_id ?? null;
    const executor = await resolveServiceExecutorStaff({
        clinicId,
        originType: line.origin_type,
        originId,
    });
    if (executor)
        return { staffId: executor, source: 'service_executor' };
    return { staffId: null, source: 'none' };
}
/**
 * Calcula snapshots para um grupo de linhas do mesmo recebível
 * (mesmo original_amount / net_amount_at_sale).
 */
async function accrueCommissionSnapshots(opts) {
    const accruedAt = opts.accruedAt ?? new Date().toISOString();
    const rules = opts.rules ?? (await loadActiveCommissionRules(opts.clinicId));
    const liquids = (0, hubReceivableFinancialBalance_1.allocateLiquidLineAmounts)({
        lineTotals: opts.lines.map((l) => Number(l.line_total ?? 0)),
        originalAmount: opts.originalAmount,
        netAmountAtSale: opts.netAmountAtSale,
    });
    const out = new Map();
    for (let i = 0; i < opts.lines.length; i++) {
        const line = opts.lines[i];
        const liquidBase = liquids[i] ?? 0;
        const staff = await resolveLineStaff({
            clinicId: opts.clinicId,
            line,
            actingUserId: opts.actingUserId,
            allowActingUserAsSaleAuthor: opts.allowActingUserAsSaleAuthor ?? false,
        });
        const rule = (0, hubCommissionCalc_1.matchRuleForLine)(rules, line);
        const commission = (0, hubCommissionCalc_1.computeCommissionAmount)(rule, liquidBase, line.quantity == null ? undefined : Number(line.quantity));
        out.set(line.key, {
            commission_staff_member_id: staff.staffId,
            commission_staff_source: staff.source,
            commission_attributed_at: accruedAt,
            commission_rule_id: rule?.id ?? null,
            commission_rule_basis: rule?.basis ?? null,
            commission_rule_rate: rule != null ? Number(rule.rate) : null,
            commission_basis_amount: liquidBase,
            commission_original_amount: commission,
            commission_accrued_at: accruedAt,
        });
    }
    return out;
}
/** Campos a mesclar no INSERT de hub_receivable_lines. */
function snapshotToInsertFields(snap) {
    if (!snap)
        return {};
    return { ...snap };
}
/** Converte itens de comanda (ou equivalentes) em inputs de apuração. */
function comandaItemsToAccrualInputs(items) {
    return items.map((it, idx) => ({
        key: String(it.id ?? `idx-${idx}`),
        line_total: Number(it.line_total ?? 0),
        quantity: Number(it.quantity ?? 1) || 1,
        hub_service_type_id: it.hub_service_type_id ?? null,
        hub_inventory_item_id: it.hub_inventory_item_id ?? null,
        item_kind: it.item_kind ?? null,
        origin_type: it.origin_type ?? null,
        origin_id: it.origin_id ?? null,
        sold_by_staff_id: it.sold_by_staff_id ?? null,
        source_line_id: it.origin_id ?? null,
    }));
}
/**
 * Apura snapshots para um grupo de itens e devolve Map key → campos de insert.
 * Falhas de regra/staff não interrompem o checkout — linha fica Sem profissional / sem regra.
 */
async function buildCommissionInsertFieldsForItems(opts) {
    const inputs = comandaItemsToAccrualInputs(opts.items);
    return accrueCommissionSnapshots({
        clinicId: opts.clinicId,
        lines: inputs,
        originalAmount: opts.originalAmount,
        netAmountAtSale: opts.netAmountAtSale,
        actingUserId: opts.actingUserId,
        allowActingUserAsSaleAuthor: opts.allowActingUserAsSaleAuthor,
    });
}
/**
 * Garante que linhas `appointment_service` que não são pernas de L&T
 * tenham `executed_by_staff_id` antes da cobrança.
 */
async function assertServiceLinesHaveExecutor(clinicId, items) {
    const serviceIds = [
        ...new Set(items
            .filter((it) => {
            const originType = String(it.origin_type ?? '');
            const lineKind = String(it.line_kind ?? '');
            const isApptSvc = originType === 'appointment_service' || lineKind === 'appointment_service';
            const id = it.origin_id ?? it.source_line_id ?? null;
            return isApptSvc && Boolean(id);
        })
            .map((it) => String(it.origin_id ?? it.source_line_id))),
    ];
    if (serviceIds.length === 0)
        return { ok: true };
    const { data: svcRows, error: svcErr } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('id, executed_by_staff_id, appointment_id')
        .in('id', serviceIds);
    if (svcErr)
        throw new Error(svcErr.message);
    const byId = new Map((svcRows ?? []).map((r) => [
        r.id,
        {
            executed_by_staff_id: r.executed_by_staff_id ?? null,
            appointment_id: r.appointment_id ?? null,
        },
    ]));
    const appointmentIds = [
        ...new Set([...byId.values()]
            .map((r) => r.appointment_id)
            .filter((id) => Boolean(id))),
    ];
    const kindByAppt = new Map();
    if (appointmentIds.length > 0) {
        const { data: appts, error: apptErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, appointment_kind')
            .eq('clinic_id', clinicId)
            .in('id', appointmentIds);
        if (apptErr)
            throw new Error(apptErr.message);
        for (const a of appts ?? []) {
            kindByAppt.set(a.id, String(a.appointment_kind ?? ''));
        }
    }
    const descByOrigin = new Map();
    for (const it of items) {
        const id = String(it.origin_id ?? it.source_line_id ?? '');
        if (id)
            descByOrigin.set(id, it.description ?? null);
    }
    const missing = [];
    for (const sid of serviceIds) {
        const row = byId.get(sid);
        if (!row?.appointment_id)
            continue;
        if (kindByAppt.get(row.appointment_id) === 'pickup_route')
            continue;
        if (row.executed_by_staff_id)
            continue;
        missing.push({ origin_id: sid, description: descByOrigin.get(sid) ?? null });
    }
    if (missing.length === 0)
        return { ok: true };
    return {
        ok: false,
        missing,
        message: 'Marque a execução do serviço antes de cobrar.',
    };
}
/**
 * Preenche `commission_staff_member_id` em linhas de L&T já cobradas sem profissional,
 * quando a rota ganha (ou já tem) motorista. Não altera valor/regra congelados nem staff existente.
 */
async function backfillPickupLegCommissionStaff(clinicId, routeId) {
    const { data: route, error: routeErr } = await supabase_1.supabaseAdmin
        .from('hub_pickup_routes')
        .select('id, driver_staff_id')
        .eq('id', routeId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (routeErr)
        throw new Error(routeErr.message);
    const driverId = route?.driver_staff_id ?? null;
    if (!driverId)
        return { updated: 0 };
    if (!(await assertStaffInClinic(clinicId, driverId)))
        return { updated: 0 };
    const { data: stops, error: stopsErr } = await supabase_1.supabaseAdmin
        .from('hub_pickup_stops')
        .select('hub_appointment_id')
        .eq('hub_pickup_route_id', routeId);
    if (stopsErr)
        throw new Error(stopsErr.message);
    const appointmentIds = [
        ...new Set((stops ?? [])
            .map((s) => s.hub_appointment_id)
            .filter((id) => Boolean(id))),
    ];
    if (appointmentIds.length === 0)
        return { updated: 0 };
    const { data: svcRows, error: svcErr } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('id')
        .in('appointment_id', appointmentIds);
    if (svcErr)
        throw new Error(svcErr.message);
    const serviceIds = (svcRows ?? []).map((r) => r.id);
    if (serviceIds.length === 0)
        return { updated: 0 };
    const now = new Date().toISOString();
    const { data: updatedRows, error: updErr } = await supabase_1.supabaseAdmin
        .from('hub_receivable_lines')
        .update({
        commission_staff_member_id: driverId,
        commission_staff_source: 'service_executor',
        commission_attributed_at: now,
    })
        .eq('clinic_id', clinicId)
        .in('source_line_id', serviceIds)
        .is('commission_staff_member_id', null)
        .select('id');
    if (updErr)
        throw new Error(updErr.message);
    return { updated: (updatedRows ?? []).length };
}
