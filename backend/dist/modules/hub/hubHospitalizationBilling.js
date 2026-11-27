"use strict";
/** Resolução de diárias e lançamentos de internação para comanda / Caixa. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOSPITALIZATION_CLOSED_STATUSES = void 0;
exports.round2 = round2;
exports.isHospitalizationClosed = isHospitalizationClosed;
exports.resolveHospitalizationBillingOrigin = resolveHospitalizationBillingOrigin;
exports.shouldIncludeInUnbilledHospitalization = shouldIncludeInUnbilledHospitalization;
exports.computeHospitalizationDays = computeHospitalizationDays;
exports.buildHospitalizationDailyDescription = buildHospitalizationDailyDescription;
exports.hospitalizationChargeDescription = hospitalizationChargeDescription;
exports.buildHospitalizationDailyItems = buildHospitalizationDailyItems;
exports.buildHospitalizationChargeLine = buildHospitalizationChargeLine;
exports.estimateHospitalizationBillingAmount = estimateHospitalizationBillingAmount;
exports.loadHospitalizationComandaItems = loadHospitalizationComandaItems;
exports.isAppointmentLineReplacedByHospitalization = isAppointmentLineReplacedByHospitalization;
exports.dropAppointmentLinesReplacedByHospitalization = dropAppointmentLinesReplacedByHospitalization;
exports.mergeHospitalizationItemsIntoSnapshot = mergeHospitalizationItemsIntoSnapshot;
const supabase_1 = require("../../config/supabase");
const supabaseSchemaErrors_js_1 = require("../../utils/supabaseSchemaErrors.js");
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
exports.HOSPITALIZATION_CLOSED_STATUSES = ['discharged', 'death', 'transferred'];
function isHospitalizationClosed(status) {
    return exports.HOSPITALIZATION_CLOSED_STATUSES.includes(String(status ?? ''));
}
/** Origem cobrável da internação (comanda continua encounter/appointment). */
function resolveHospitalizationBillingOrigin(hosp) {
    const encId = hosp.hub_encounter_id ?? null;
    if (encId)
        return { origin_type: 'encounter', origin_id: encId };
    const apptId = hosp.hub_appointment_id ?? null;
    if (apptId)
        return { origin_type: 'appointment', origin_id: apptId };
    return null;
}
/**
 * Inclui internação encerrada na fila sem cobrança quando ainda não há comanda/recebível
 * na origem cobrável (encounter preferencial, senão appointment).
 */
function shouldIncludeInUnbilledHospitalization(hosp, ctx) {
    if (!isHospitalizationClosed(hosp.status))
        return false;
    if (hosp.billing_waived_at)
        return false;
    if (hosp.deleted_at)
        return false;
    const origin = resolveHospitalizationBillingOrigin(hosp);
    if (!origin)
        return false;
    const originKey = `${origin.origin_type}:${origin.origin_id}`;
    if (ctx.activeReceivableKeys.has(originKey))
        return false;
    if (ctx.comandaOpenKeys.has(originKey))
        return false;
    if (ctx.billedViaComandaKeys.has(originKey))
        return false;
    if (ctx.alreadyListedBillingOrigins.has(originKey))
        return false;
    // Também evita reaparecer se já houver recebível/comanda direto da internação (futuro).
    const hospKey = `hospitalization:${hosp.id}`;
    if (ctx.activeReceivableKeys.has(hospKey))
        return false;
    if (ctx.comandaOpenKeys.has(hospKey))
        return false;
    if (ctx.billedViaComandaKeys.has(hospKey))
        return false;
    return true;
}
/**
 * Número de diárias entre admissão e alta (ou agora, se ativa).
 * Conta o dia de admissão; mínimo 1 enquanto internado ou após alta no mesmo dia.
 */
function computeHospitalizationDays(admittedAt, dischargedAt, now = new Date()) {
    if (!admittedAt)
        return 0;
    const start = new Date(admittedAt);
    if (Number.isNaN(start.getTime()))
        return 0;
    const endRaw = dischargedAt ? new Date(dischargedAt) : now;
    if (Number.isNaN(endRaw.getTime()))
        return 0;
    // Normaliza para meia-noite local do calendário (diferença em dias civis).
    const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = Date.UTC(endRaw.getFullYear(), endRaw.getMonth(), endRaw.getDate());
    const days = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, days);
}
function buildHospitalizationDailyDescription(serviceName, quantity) {
    const name = (serviceName ?? 'Diária de internação').trim() || 'Diária de internação';
    return `${name} — ${quantity} ${quantity === 1 ? 'diária' : 'diárias'}`;
}
function hospitalizationChargeDescription(chargeKind, serviceName) {
    const kind = String(chargeKind ?? 'other');
    const prefix = kind === 'medication'
        ? 'Medicação (internação)'
        : kind === 'material'
            ? 'Material (internação)'
            : kind === 'procedure'
                ? 'Procedimento (internação)'
                : 'Internação';
    return `${prefix}: ${String(serviceName || 'Item')}`;
}
/**
 * Monta a linha de diária para a comanda.
 * Retorna null se não houver serviço de diária configurado ou valor inválido.
 * Itens `included` / cobranças extras ficam em hub_hospitalization_charges (outra origem).
 */
function buildHospitalizationDailyItems(hospitalization, now = new Date()) {
    if (!hospitalization.daily_hub_service_type_id)
        return null;
    if (hospitalization.status === 'cancelled')
        return null;
    const unitAmount = round2(Number(hospitalization.daily_unit_amount ?? 0));
    if (unitAmount < 0)
        return null;
    const quantity = computeHospitalizationDays(hospitalization.admitted_at, hospitalization.discharged_at, now);
    const lineTotal = round2(quantity * unitAmount);
    const line = {
        pet_id: hospitalization.pet_id ?? null,
        item_kind: 'service',
        hub_service_type_id: hospitalization.daily_hub_service_type_id,
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: buildHospitalizationDailyDescription(hospitalization.service_name, quantity),
        quantity,
        unit_amount: unitAmount,
        discount_amount: 0,
        line_total: lineTotal,
        service_date: hospitalization.admitted_at
            ? hospitalization.admitted_at.slice(0, 10)
            : null,
        origin_type: 'hospitalization_daily',
        origin_id: hospitalization.id,
        sort_order: 0,
    };
    return { line, subtotal: lineTotal };
}
function buildHospitalizationChargeLine(charge, petId, sortOrder = 0) {
    const qty = Number(charge.quantity ?? 1) || 1;
    const unit = round2(Number(charge.unit_amount ?? 0));
    return {
        pet_id: petId,
        item_kind: charge.hub_inventory_item_id ? 'product' : 'service',
        hub_service_type_id: charge.hub_service_type_id ?? null,
        hub_inventory_item_id: charge.hub_inventory_item_id ?? null,
        hub_inventory_lot_id: charge.hub_inventory_lot_id ?? null,
        description: hospitalizationChargeDescription(charge.charge_kind, charge.service_name),
        quantity: qty,
        unit_amount: unit,
        discount_amount: 0,
        line_total: round2(qty * unit),
        service_date: charge.service_date ?? null,
        origin_type: 'hospitalization_charge',
        origin_id: charge.id,
        sort_order: sortOrder,
    };
}
/** Estimativa rápida (diária + charges) para day board / unbilled. */
function estimateHospitalizationBillingAmount(hospitalization, charges = [], now = new Date()) {
    let total = 0;
    const daily = buildHospitalizationDailyItems(hospitalization, now);
    if (daily)
        total += daily.subtotal;
    for (const c of charges) {
        total += buildHospitalizationChargeLine(c, hospitalization.pet_id ?? null).line_total;
    }
    return round2(total);
}
/**
 * Carrega diárias + charges confirmados de internações ligadas ao encounter e/ou appointment.
 * Deduplica por id da internação.
 */
async function loadHospitalizationComandaItems(opts) {
    const { clinicId, encounterId, appointmentId, hospitalizationId, defaultPetId, now = new Date(), } = opts;
    if (!encounterId && !appointmentId && !hospitalizationId)
        return { items: [], subtotal: 0 };
    const byId = new Map();
    const selectCols = 'id, pet_id, status, admitted_at, discharged_at, daily_hub_service_type_id, daily_unit_amount, hub_encounter_id, hub_appointment_id';
    if (hospitalizationId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_hospitalizations')
            .select(selectCols)
            .eq('clinic_id', clinicId)
            .eq('id', hospitalizationId)
            .is('deleted_at', null)
            .maybeSingle();
        if (error && !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error))
            throw new Error(error.message);
        if (data)
            byId.set(data.id, data);
    }
    if (encounterId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_hospitalizations')
            .select(selectCols)
            .eq('clinic_id', clinicId)
            .eq('hub_encounter_id', encounterId)
            .is('deleted_at', null);
        if (error && !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error))
            throw new Error(error.message);
        for (const row of data ?? [])
            byId.set(row.id, row);
    }
    if (appointmentId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_hospitalizations')
            .select(selectCols)
            .eq('clinic_id', clinicId)
            .eq('hub_appointment_id', appointmentId)
            .is('deleted_at', null);
        if (error && !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error))
            throw new Error(error.message);
        for (const row of data ?? [])
            byId.set(row.id, row);
    }
    const hospList = [...byId.values()];
    if (!hospList.length)
        return { items: [], subtotal: 0 };
    const dailyServiceIds = [
        ...new Set(hospList
            .map((h) => h.daily_hub_service_type_id)
            .filter(Boolean)),
    ];
    const dailyNameById = new Map();
    if (dailyServiceIds.length > 0) {
        const { data: dailySvcs } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, name')
            .in('id', dailyServiceIds);
        for (const s of dailySvcs ?? []) {
            dailyNameById.set(s.id, String(s.name));
        }
    }
    const items = [];
    let subtotal = 0;
    for (const hosp of hospList) {
        const petId = hosp.pet_id ?? defaultPetId ?? null;
        const built = buildHospitalizationDailyItems({
            id: hosp.id,
            pet_id: petId,
            status: String(hosp.status ?? ''),
            admitted_at: String(hosp.admitted_at ?? ''),
            discharged_at: hosp.discharged_at ?? null,
            daily_hub_service_type_id: hosp.daily_hub_service_type_id ?? null,
            daily_unit_amount: hosp.daily_unit_amount == null ? null : Number(hosp.daily_unit_amount),
            service_name: hosp.daily_hub_service_type_id
                ? dailyNameById.get(hosp.daily_hub_service_type_id) ?? null
                : null,
        }, now);
        if (built) {
            items.push({ ...built.line, sort_order: items.length });
            subtotal += built.subtotal;
        }
    }
    const hospIds = hospList.map((h) => h.id);
    const { data: chargeRows, error: chargeErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_charges')
        .select('id, hospitalization_id, hub_service_type_id, hub_inventory_item_id, hub_inventory_lot_id, service_name, quantity, unit_amount, billing_mode, price_status, service_date, charge_kind')
        .in('hospitalization_id', hospIds)
        .eq('billing_mode', 'charge')
        .eq('price_status', 'confirmed')
        .is('deleted_at', null);
    if (chargeErr && !(0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(chargeErr))
        throw new Error(chargeErr.message);
    const petByHospId = new Map(hospList.map((h) => [
        h.id,
        h.pet_id ?? defaultPetId ?? null,
    ]));
    for (const raw of chargeRows ?? []) {
        const row = raw;
        const line = buildHospitalizationChargeLine({
            id: row.id,
            hub_service_type_id: row.hub_service_type_id ?? null,
            hub_inventory_item_id: row.hub_inventory_item_id ?? null,
            hub_inventory_lot_id: row.hub_inventory_lot_id ?? null,
            service_name: row.service_name ?? null,
            quantity: Number(row.quantity ?? 1),
            unit_amount: Number(row.unit_amount ?? 0),
            charge_kind: row.charge_kind ?? null,
            service_date: row.service_date ?? null,
        }, petByHospId.get(row.hospitalization_id) ?? defaultPetId ?? null, items.length);
        items.push(line);
        subtotal += line.line_total;
    }
    return { items, subtotal: round2(subtotal) };
}
/**
 * Linha de agenda espelhada da internação (grupo `internacao` ou mesmo serviço da diária)
 * é substituída por `hospitalization_daily` — evita cobrança dupla do mesmo valor.
 * Consultas (`clinica`) e outros grupos permanecem.
 */
function isAppointmentLineReplacedByHospitalization(lineServiceTypeId, lineServiceGroup, dailyServiceTypeIds) {
    const dailyIds = new Set([...dailyServiceTypeIds].filter((id) => Boolean(id)));
    if (lineServiceTypeId && dailyIds.has(lineServiceTypeId))
        return true;
    return lineServiceGroup === 'internacao';
}
/** Remove do snapshot as linhas de agenda cobertas pela diária da internação. */
function dropAppointmentLinesReplacedByHospitalization(items, serviceGroupById, hospItems) {
    const hasDaily = hospItems.some((it) => it.origin_type === 'hospitalization_daily');
    // Sempre devolver cópia: o caller costuma fazer `allItems.length = 0; push(...dropped.items)`.
    // Se devolver a mesma referência, o clear esvazia `dropped.items` antes do push.
    if (!hasDaily) {
        return {
            items: items.map((it, i) => ({ ...it, sort_order: i })),
            removedTotal: 0,
        };
    }
    const dailyServiceTypeIds = hospItems
        .filter((it) => it.origin_type === 'hospitalization_daily')
        .map((it) => it.hub_service_type_id);
    let removedTotal = 0;
    const kept = items.filter((it) => {
        if (it.origin_type !== 'appointment_service')
            return true;
        const sid = it.hub_service_type_id ?? null;
        const group = sid ? serviceGroupById.get(sid) : null;
        const replaced = isAppointmentLineReplacedByHospitalization(sid, group, dailyServiceTypeIds);
        if (replaced)
            removedTotal = round2(removedTotal + Number(it.line_total ?? 0));
        return !replaced;
    });
    return {
        items: kept.map((it, i) => ({ ...it, sort_order: i })),
        removedTotal,
    };
}
function mergeHospitalizationItemsIntoSnapshot(snapshot, hospItems, serviceGroupById) {
    if (!hospItems.length)
        return snapshot;
    let baseItems = snapshot.items;
    let subtotal = snapshot.subtotal;
    if (serviceGroupById) {
        const dropped = dropAppointmentLinesReplacedByHospitalization(baseItems, serviceGroupById, hospItems);
        baseItems = dropped.items;
        subtotal = round2(subtotal - dropped.removedTotal);
    }
    const existing = new Set(baseItems
        .filter((it) => it.origin_type && it.origin_id)
        .map((it) => `${it.origin_type}:${it.origin_id}`));
    const toAdd = hospItems.filter((it) => !existing.has(`${it.origin_type}:${it.origin_id}`));
    if (!toAdd.length) {
        return { ...snapshot, items: baseItems, subtotal };
    }
    const base = baseItems.length;
    const mapped = toAdd.map((it, i) => ({ ...it, sort_order: base + i }));
    const addTotal = round2(mapped.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
    return {
        ...snapshot,
        items: [...baseItems, ...mapped],
        subtotal: round2(subtotal + addTotal),
    };
}
