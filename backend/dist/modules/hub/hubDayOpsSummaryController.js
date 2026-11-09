"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubDayOpsSummary = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const boardingOperational_1 = require("./boardingOperational");
const hubInventoryController_1 = require("./hubInventoryController");
const hubPayablesService_1 = require("./hubPayablesService");
const uuidStr = zod_1.z.string().uuid();
const dateYmdStr = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
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
const GROOMING_WAITING = new Set(['scheduled', 'checked_in', 'queued']);
const GROOMING_IN_SERVICE = new Set(['in_service', 'finishing']);
const GROOMING_READY = new Set(['ready']);
const GROOMING_DONE = new Set(['delivered', 'closed']);
function round2(n) {
    return Math.round(n * 100) / 100;
}
/**
 * GET /api/hub/day-ops-summary
 * Resumo leve do dia operacional por unidade. Blocos opcionais por permissão.
 */
const getHubDayOpsSummary = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        const unitParsed = uuidStr.safeParse(req.query.unit_id);
        const dateParsed = dateYmdStr.safeParse(typeof req.query.date === 'string' && req.query.date
            ? req.query.date
            : new Date().toISOString().slice(0, 10));
        if (!clinicParsed.success || !unitParsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
        }
        if (!dateParsed.success) {
            return res.status(400).json({ error: 'date inválida (YYYY-MM-DD)' });
        }
        const clinic_id = clinicParsed.data;
        const unit_id = unitParsed.data;
        const dateYmd = dateParsed.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const { from, to } = (0, boardingOperational_1.dayBoundsFromYmdSaoPaulo)(dateYmd);
        const fromUtc = `${dateYmd}T00:00:00.000Z`;
        const toUtc = `${dateYmd}T23:59:59.999Z`;
        const [canAgenda, canClinic, canGrooming, canBoarding, canPickup, canFinance, canInventory,] = await Promise.all([
            (0, authMiddleware_1.checkPermission)(userId, clinic_id, 'hub.appointments.read'),
            (0, authMiddleware_1.checkPermission)(userId, clinic_id, 'hub.clinic.read'),
            (0, authMiddleware_1.checkPermission)(userId, clinic_id, 'grooming.queue.read'),
            (0, authMiddleware_1.checkPermission)(userId, clinic_id, 'boarding.reservations.read'),
            (0, authMiddleware_1.checkPermission)(userId, clinic_id, 'pickup.routes.read'),
            (0, authMiddleware_1.checkPermission)(userId, clinic_id, 'hub.financial.read'),
            (0, authMiddleware_1.checkPermission)(userId, clinic_id, 'hub.inventory.read'),
        ]);
        if (!canAgenda &&
            !canClinic &&
            !canGrooming &&
            !canBoarding &&
            !canPickup &&
            !canFinance &&
            !canInventory) {
            return res.status(403).json({ error: 'Permissão negada' });
        }
        const out = { date: dateYmd };
        const tasks = [];
        const payableAlertPatch = {};
        if (canAgenda) {
            tasks.push((async () => {
                const { data: rows, error } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .select('hub_service_type_id')
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null)
                    .neq('status', 'cancelled')
                    .lt('starts_at', toUtc)
                    .gt('ends_at', fromUtc)
                    .or(`unit_id.eq.${unit_id},unit_id.is.null`);
                if (error)
                    throw new Error(error.message);
                const typeIds = [
                    ...new Set((rows ?? []).map((r) => r.hub_service_type_id).filter(Boolean)),
                ];
                const groupByType = new Map();
                if (typeIds.length > 0) {
                    const { data: types, error: te } = await supabase_1.supabaseAdmin
                        .from('hub_service_types')
                        .select('id, service_group')
                        .in('id', typeIds);
                    if (te)
                        throw new Error(te.message);
                    for (const t of types ?? []) {
                        const raw = String(t.service_group ?? '').trim();
                        groupByType.set(t.id, raw || 'outros');
                    }
                }
                const counts = new Map();
                for (const r of rows ?? []) {
                    const tid = r.hub_service_type_id;
                    if (!tid)
                        continue;
                    const g = groupByType.get(tid) ?? 'outros';
                    counts.set(g, (counts.get(g) ?? 0) + 1);
                }
                const by_group = [...counts.entries()]
                    .map(([key, count]) => ({
                    key,
                    label: SERVICE_GROUP_LABELS[key] ?? key.replace(/_/g, ' '),
                    count,
                }))
                    .sort((a, b) => b.count - a.count);
                out.agenda = {
                    total: by_group.reduce((a, g) => a + g.count, 0),
                    by_group,
                };
            })());
        }
        if (canClinic) {
            tasks.push((async () => {
                let encQ = supabase_1.supabaseAdmin
                    .from('hub_encounters')
                    .select('id, status')
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null)
                    .gte('started_at', from)
                    .lte('started_at', to);
                encQ = encQ.or(`unit_id.eq.${unit_id},care_location_kind.eq.partner_clinic`);
                const { data: encounters, error } = await encQ;
                if (error)
                    throw new Error(error.message);
                let waiting = 0;
                let in_progress = 0;
                let done = 0;
                for (const e of encounters ?? []) {
                    const st = String(e.status || '');
                    if (st === 'in_progress')
                        in_progress += 1;
                    else if (st === 'completed' || st === 'cancelled') {
                        if (st === 'completed')
                            done += 1;
                    }
                    else
                        waiting += 1;
                }
                // Slots clínicos do dia sem encounter aberto (aproximação via appointments clinica)
                const { data: types } = await supabase_1.supabaseAdmin
                    .from('hub_service_types')
                    .select('id')
                    .eq('clinic_id', clinic_id)
                    .eq('service_group', 'clinica')
                    .is('deleted_at', null);
                const clinicalIds = new Set((types ?? []).map((t) => t.id));
                if (clinicalIds.size > 0) {
                    let apptQ = supabase_1.supabaseAdmin
                        .from('hub_appointments')
                        .select('id, status, hub_service_type_id')
                        .eq('clinic_id', clinic_id)
                        .is('deleted_at', null)
                        .neq('status', 'cancelled')
                        .lt('starts_at', to)
                        .gt('ends_at', from);
                    apptQ = apptQ.or(`unit_id.eq.${unit_id},care_location_kind.eq.partner_clinic`);
                    const { data: appts } = await apptQ;
                    const encApptIds = new Set((await supabase_1.supabaseAdmin
                        .from('hub_encounters')
                        .select('hub_appointment_id')
                        .eq('clinic_id', clinic_id)
                        .is('deleted_at', null)
                        .not('hub_appointment_id', 'is', null)
                        .gte('started_at', from)
                        .lte('started_at', to)).data?.map((r) => r.hub_appointment_id) ?? []);
                    for (const a of appts ?? []) {
                        if (!clinicalIds.has(a.hub_service_type_id))
                            continue;
                        if (encApptIds.has(a.id))
                            continue;
                        const st = String(a.status || '');
                        if (st === 'in_progress')
                            in_progress += 1;
                        else if (st === 'done' || st === 'paid')
                            done += 1;
                        else
                            waiting += 1;
                    }
                }
                out.clinic = {
                    waiting,
                    in_progress,
                    done,
                    total: waiting + in_progress + done,
                };
            })());
        }
        if (canGrooming) {
            tasks.push((async () => {
                let sessQ = supabase_1.supabaseAdmin
                    .from('hub_grooming_sessions')
                    .select('id, grooming_stage, hub_appointment_id, created_at')
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null);
                if (unit_id)
                    sessQ = sessQ.eq('unit_id', unit_id);
                const { data: sessions, error } = await sessQ;
                if (error) {
                    if (String(error.message || '').includes('hub_grooming_sessions')) {
                        out.grooming = { total: 0, waiting: 0, in_service: 0, ready: 0, by_stage: {} };
                        return;
                    }
                    throw new Error(error.message);
                }
                // Filtra sessões ligadas a appointments do dia OU criadas no dia
                const apptIds = (sessions ?? [])
                    .map((s) => s.hub_appointment_id)
                    .filter(Boolean);
                const apptInDay = new Set();
                if (apptIds.length > 0) {
                    const { data: appts } = await supabase_1.supabaseAdmin
                        .from('hub_appointments')
                        .select('id')
                        .in('id', apptIds)
                        .lt('starts_at', to)
                        .gt('ends_at', from);
                    for (const a of appts ?? [])
                        apptInDay.add(a.id);
                }
                const by_stage = {};
                let waiting = 0;
                let in_service = 0;
                let ready = 0;
                let totalActive = 0;
                for (const s of sessions ?? []) {
                    const aid = s.hub_appointment_id;
                    const created = String(s.created_at || '').slice(0, 10);
                    const inDay = (aid && apptInDay.has(aid)) || created === dateYmd;
                    if (!inDay)
                        continue;
                    const stage = String(s.grooming_stage || 'scheduled');
                    by_stage[stage] = (by_stage[stage] ?? 0) + 1;
                    if (GROOMING_DONE.has(stage))
                        continue;
                    totalActive += 1;
                    if (GROOMING_WAITING.has(stage))
                        waiting += 1;
                    else if (GROOMING_IN_SERVICE.has(stage))
                        in_service += 1;
                    else if (GROOMING_READY.has(stage))
                        ready += 1;
                }
                out.grooming = { total: totalActive, waiting, in_service, ready, by_stage };
            })());
        }
        if (canBoarding) {
            tasks.push((async () => {
                let rQ = supabase_1.supabaseAdmin
                    .from('hub_boarding_reservations')
                    .select('id, mode, status')
                    .eq('clinic_id', clinic_id)
                    .in('status', ['reserved', 'checked_in'])
                    .lt('expected_check_in', to)
                    .gt('expected_check_out', from);
                if (unit_id)
                    rQ = rQ.eq('unit_id', unit_id);
                const { data: reservations, error } = await rQ;
                if (error)
                    throw new Error(error.message);
                let settingsQ = supabase_1.supabaseAdmin
                    .from('hub_unit_boarding_settings')
                    .select('hotel_slots, daycare_slots_per_shift')
                    .eq('clinic_id', clinic_id);
                if (unit_id)
                    settingsQ = settingsQ.eq('unit_id', unit_id);
                const { data: settingsRows } = await settingsQ;
                const settings = settingsRows?.[0] ?? null;
                const hotelMax = settings?.hotel_slots ?? null;
                const daycareMax = settings?.daycare_slots_per_shift ?? null;
                const hotelCount = (reservations ?? []).filter((r) => r.mode === 'hotel').length;
                const daycareCount = (reservations ?? []).filter((r) => r.mode === 'daycare').length;
                const checkins_today = (reservations ?? []).length;
                out.boarding = {
                    hotel: {
                        current: hotelCount,
                        max: hotelMax,
                        over_capacity: hotelMax != null ? hotelCount > hotelMax : false,
                    },
                    daycare: {
                        current: daycareCount,
                        max: daycareMax,
                        over_capacity: daycareMax != null ? daycareCount > daycareMax : false,
                    },
                    checkins_today,
                };
            })());
        }
        if (canPickup) {
            tasks.push((async () => {
                let routesQ = supabase_1.supabaseAdmin
                    .from('hub_pickup_routes')
                    .select('id, status, driver_staff_id')
                    .eq('clinic_id', clinic_id)
                    .eq('route_date', dateYmd);
                if (unit_id)
                    routesQ = routesQ.eq('unit_id', unit_id);
                const { data: routes, error: rErr } = await routesQ;
                if (rErr) {
                    if (String(rErr.message || '').includes('hub_pickup_routes')) {
                        out.pickup = { routes: 0, stops_pending: 0, routes_without_driver: 0 };
                        return;
                    }
                    throw new Error(rErr.message);
                }
                const active = (routes ?? []).filter((r) => r.status !== 'cancelled');
                const routes_without_driver = active.filter((r) => !r.driver_staff_id).length;
                let stopsPending = 0;
                const routeIds = active.map((r) => r.id);
                if (routeIds.length > 0) {
                    const { data: stops, error: sErr } = await supabase_1.supabaseAdmin
                        .from('hub_pickup_stops')
                        .select('id, status')
                        .in('hub_pickup_route_id', routeIds)
                        .in('status', ['pending', 'en_route', 'arrived', 'in_transit']);
                    if (!sErr)
                        stopsPending = (stops ?? []).length;
                }
                out.pickup = {
                    routes: active.length,
                    stops_pending: stopsPending,
                    routes_without_driver,
                };
            })());
        }
        if (canFinance) {
            tasks.push((async () => {
                const [{ data: cashSession }, { data: openComandas }, { data: openRecs }, { data: payPeriod }] = await Promise.all([
                    supabase_1.supabaseAdmin
                        .from('hub_cash_sessions')
                        .select('id, status, opened_at')
                        .eq('clinic_id', clinic_id)
                        .eq('unit_id', unit_id)
                        .eq('status', 'open')
                        .maybeSingle(),
                    supabase_1.supabaseAdmin
                        .from('hub_comandas')
                        .select('id')
                        .eq('clinic_id', clinic_id)
                        .eq('unit_id', unit_id)
                        .eq('status', 'aberta')
                        .is('finance_handoff_at', null),
                    supabase_1.supabaseAdmin
                        .from('hub_receivables')
                        .select('id, final_amount, due_date')
                        .eq('clinic_id', clinic_id)
                        .or(`unit_id.eq.${unit_id},unit_id.is.null`)
                        .is('deleted_at', null)
                        .in('status', ['pending', 'partially_paid']),
                    supabase_1.supabaseAdmin
                        .from('hub_payments')
                        .select('amount, payment_date, receivable_id')
                        .eq('clinic_id', clinic_id)
                        .gte('payment_date', fromUtc)
                        .lte('payment_date', toUtc),
                ]);
                const openRecsWithValue = (openRecs ?? []).filter((r) => Number(r.final_amount ?? 0) > 0.009);
                const recIds = openRecsWithValue.map((r) => r.id);
                let outstanding = 0;
                if (recIds.length > 0) {
                    const { data: payRows } = await supabase_1.supabaseAdmin
                        .from('hub_payments')
                        .select('receivable_id, amount')
                        .in('receivable_id', recIds);
                    const paidByRec = new Map();
                    for (const row of payRows ?? []) {
                        const id = row.receivable_id;
                        paidByRec.set(id, round2((paidByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
                    }
                    for (const r of openRecsWithValue) {
                        outstanding = round2(outstanding + round2(Number(r.final_amount ?? 0) - (paidByRec.get(r.id) ?? 0)));
                    }
                }
                // Filtra pagamentos do dia pela unidade do recebível
                const payRecIds = [...new Set((payPeriod ?? []).map((p) => p.receivable_id))];
                const unitByRec = new Map();
                if (payRecIds.length > 0) {
                    const { data: rrows } = await supabase_1.supabaseAdmin
                        .from('hub_receivables')
                        .select('id, unit_id')
                        .in('id', payRecIds);
                    for (const row of rrows ?? [])
                        unitByRec.set(row.id, row.unit_id ?? null);
                }
                let received_today = 0;
                for (const p of payPeriod ?? []) {
                    const u = unitByRec.get(p.receivable_id);
                    if (u === unit_id || u == null) {
                        received_today = round2(received_today + Number(p.amount ?? 0));
                    }
                }
                let overdueCount = 0;
                let overdueTotal = 0;
                for (const r of openRecsWithValue) {
                    if (r.due_date && String(r.due_date) < dateYmd) {
                        overdueCount += 1;
                        overdueTotal = round2(overdueTotal + Number(r.final_amount ?? 0));
                    }
                }
                let payableDueAlerts = (0, hubPayablesService_1.summarizePayableDueAlerts)([], dateYmd);
                try {
                    await (0, hubPayablesService_1.ensurePayableScheduleHorizon)({
                        clinicId: clinic_id,
                        unitId: unit_id,
                        todayYmd: dateYmd,
                    });
                    const withFlag = await supabase_1.supabaseAdmin
                        .from('hub_payables')
                        .select('amount, due_date, amount_confirmed')
                        .eq('clinic_id', clinic_id)
                        .eq('unit_id', unit_id)
                        .eq('status', 'pending')
                        .is('deleted_at', null);
                    let pendingRows = withFlag.error ? null : (withFlag.data ?? []);
                    let pendingErr = withFlag.error;
                    if (pendingErr && String(pendingErr.message || '').includes('amount_confirmed')) {
                        const plain = await supabase_1.supabaseAdmin
                            .from('hub_payables')
                            .select('amount, due_date')
                            .eq('clinic_id', clinic_id)
                            .eq('unit_id', unit_id)
                            .eq('status', 'pending')
                            .is('deleted_at', null);
                        pendingRows = plain.error ? null : (plain.data ?? []);
                        pendingErr = plain.error;
                    }
                    if (!pendingErr && pendingRows) {
                        payableDueAlerts = (0, hubPayablesService_1.summarizePayableDueAlerts)(pendingRows, dateYmd);
                    }
                }
                catch {
                    /* contas a pagar opcionais se a migração ainda não rodou */
                }
                payableAlertPatch.overdue_payables_count = payableDueAlerts.overdue_payables_count;
                payableAlertPatch.overdue_payables_total = payableDueAlerts.overdue_payables_total;
                payableAlertPatch.overdue_payables_unconfirmed_count = payableDueAlerts.overdue_payables_unconfirmed_count;
                payableAlertPatch.overdue_payables_estimated_total = payableDueAlerts.overdue_payables_estimated_total;
                payableAlertPatch.due_today_payables_count = payableDueAlerts.due_today_payables_count;
                payableAlertPatch.due_today_payables_total = payableDueAlerts.due_today_payables_total;
                payableAlertPatch.due_today_payables_unconfirmed_count = payableDueAlerts.due_today_payables_unconfirmed_count;
                payableAlertPatch.due_today_payables_estimated_total = payableDueAlerts.due_today_payables_estimated_total;
                out.finance = {
                    received_today,
                    outstanding,
                    cash_open: cashSession?.status === 'open',
                    cash_opened_at: cashSession?.opened_at ?? null,
                    pending_billing: (openComandas ?? []).length,
                };
                const prevAlerts = out.alerts ?? {
                    low_stock: 0,
                    vaccines_due: 0,
                    overdue_receivables_count: 0,
                    overdue_receivables_total: 0,
                };
                out.alerts = {
                    ...prevAlerts,
                    overdue_receivables_count: overdueCount,
                    overdue_receivables_total: overdueTotal,
                    overdue_payables_count: payableDueAlerts.overdue_payables_count,
                    overdue_payables_total: payableDueAlerts.overdue_payables_total,
                    overdue_payables_unconfirmed_count: payableDueAlerts.overdue_payables_unconfirmed_count,
                    overdue_payables_estimated_total: payableDueAlerts.overdue_payables_estimated_total,
                    due_today_payables_count: payableDueAlerts.due_today_payables_count,
                    due_today_payables_total: payableDueAlerts.due_today_payables_total,
                    due_today_payables_unconfirmed_count: payableDueAlerts.due_today_payables_unconfirmed_count,
                    due_today_payables_estimated_total: payableDueAlerts.due_today_payables_estimated_total,
                };
            })());
        }
        if (canClinic) {
            tasks.push((async () => {
                const in30 = new Date(`${dateYmd}T12:00:00Z`);
                in30.setUTCDate(in30.getUTCDate() + 30);
                const in30Str = in30.toISOString().slice(0, 10);
                const { data: vaccines, error } = await supabase_1.supabaseAdmin
                    .from('hub_vaccination_records')
                    .select('id')
                    .eq('clinic_id', clinic_id)
                    .is('deleted_at', null)
                    .not('next_dose_at', 'is', null)
                    .gte('next_dose_at', dateYmd)
                    .lte('next_dose_at', in30Str);
                if (error)
                    return;
                const prev = out.alerts ?? {
                    low_stock: 0,
                    vaccines_due: 0,
                    overdue_receivables_count: 0,
                    overdue_receivables_total: 0,
                };
                out.alerts = { ...prev, vaccines_due: (vaccines ?? []).length };
            })());
        }
        if (canInventory) {
            tasks.push((async () => {
                try {
                    const { data: items, error } = await supabase_1.supabaseAdmin
                        .from('hub_inventory_items')
                        .select('id, min_stock_qty')
                        .eq('clinic_id', clinic_id)
                        .is('deleted_at', null)
                        .eq('active', true);
                    if (error)
                        return;
                    const { byItem } = await (0, hubInventoryController_1.computeBalances)(clinic_id);
                    const low = (items ?? []).filter((it) => {
                        const qty = byItem.get(it.id) ?? 0;
                        const min = Number(it.min_stock_qty ?? 0);
                        return min > 0 && qty < min;
                    }).length;
                    const prev = out.alerts ?? {
                        low_stock: 0,
                        vaccines_due: 0,
                        overdue_receivables_count: 0,
                        overdue_receivables_total: 0,
                    };
                    out.alerts = { ...prev, low_stock: low };
                }
                catch {
                    /* estoque opcional */
                }
            })());
        }
        const results = await Promise.allSettled(tasks);
        for (const r of results) {
            if (r.status === 'rejected') {
                console.error('getHubDayOpsSummary block', r.reason);
            }
        }
        if (Object.keys(payableAlertPatch).length > 0) {
            const prev = out.alerts ?? {
                low_stock: 0,
                vaccines_due: 0,
                overdue_receivables_count: 0,
                overdue_receivables_total: 0,
            };
            out.alerts = { ...prev, ...payableAlertPatch };
        }
        return res.json(out);
    }
    catch (e) {
        console.error('getHubDayOpsSummary', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubDayOpsSummary = getHubDayOpsSummary;
