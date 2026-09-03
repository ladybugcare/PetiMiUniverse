"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHubAppointmentBatch = exports.deleteHubAgendaCalendarBlock = exports.upsertHubAgendaCalendarBlock = exports.listHubAgendaCalendarBlocks = exports.patchHubAppointment = exports.createHubAppointment = exports.listHubSeriesEndingSoon = exports.getHubAppointmentsStatsByServiceGroup = exports.listHubAppointments = void 0;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubServiceGroupsController_1 = require("./hubServiceGroupsController");
const hubClinicSettingsController_1 = require("./hubClinicSettingsController");
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
const hubPickupPricing_1 = require("./hubPickupPricing");
const hubPricingResolve_1 = require("./hubPricingResolve");
const hubComandasController_1 = require("./hubComandasController");
const hubPackagesService_1 = require("./hubPackagesService");
const hubSeriesBillingService_1 = require("./hubSeriesBillingService");
const hubSeriesEndingSoonService_1 = require("./hubSeriesEndingSoonService");
const hubCareLocation_1 = require("./hubCareLocation");
const hubSpecialPrices_1 = require("./hubSpecialPrices");
const hubSpecialPricesController_1 = require("./hubSpecialPricesController");
function validateLevaTrazServiceType(st) {
    if (!st)
        return 'Tipo de serviço de Leva e Traz inválido.';
    const g = String(st.service_group ?? '').trim();
    if (g !== 'leva_traz')
        return 'O serviço de transporte deve pertencer ao grupo Leva e Traz.';
    return null;
}
function pickupLegMinutes(startsAt, endsAt) {
    const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
    const m = Math.round(ms / 60_000);
    return Math.max(1, Number.isFinite(m) ? m : 1);
}
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
const uuidStr = zod_1.z.string().uuid();
const optionalTrim = (max) => zod_1.z
    .union([zod_1.z.string(), zod_1.z.null(), zod_1.z.undefined()])
    .transform((v) => (v === undefined || v === null ? undefined : String(v).trim()))
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || v === undefined || v.length <= max, { message: 'Texto muito longo' });
const appointmentStatusSchema = zod_1.z.enum([
    'pending_confirm',
    'confirmed',
    'checked_in',
    'in_progress',
    'done',
    'cancelled',
    'paid',
]);
const appointmentKindSchema = zod_1.z.enum([
    'standard',
    'hotel_stay',
    'daycare_block',
    'pickup_route',
    'clinical_walk_in',
    'clinical_emergency',
    'walk_in',
]);
function isLevaTrazServiceGroup(st) {
    return String(st?.service_group ?? '').trim().toLowerCase() === 'leva_traz';
}
/**
 * Serviço principal do grupo Leva e Traz vira parada operacional (`pickup_route`),
 * a menos que o cliente tenha pedido explicitamente outro kind (ex.: walk-in).
 */
function resolveAppointmentKindForCreate(explicitKind, primaryService) {
    if (explicitKind && explicitKind !== 'standard')
        return explicitKind;
    if (isLevaTrazServiceGroup(primaryService))
        return 'pickup_route';
    return explicitKind ?? 'standard';
}
const WALK_IN_APPOINTMENT_KINDS = new Set([
    'walk_in',
    'clinical_walk_in',
    'clinical_emergency',
]);
function isWalkInAppointmentKind(kind) {
    return !!kind && WALK_IN_APPOINTMENT_KINDS.has(kind);
}
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
    return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
}
function isStaffConflict(staffId, other) {
    if (!staffId || !other.hub_staff_member_id)
        return false;
    return staffId === other.hub_staff_member_id;
}
function isResourceConflict(resourceLabel, unitId, other) {
    const r1 = resourceLabel?.trim();
    const r2 = other.resource_label?.trim();
    if (!r1 || !r2)
        return false;
    if (r1 !== r2)
        return false;
    return String(unitId ?? '') === String(other.unit_id ?? '');
}
function rowConflictsWith(row, staffId, resourceLabel, unitId, startsAt, endsAt) {
    if (row.status === 'cancelled')
        return false;
    if (!intervalsOverlap(startsAt, endsAt, row.starts_at, row.ends_at))
        return false;
    return isStaffConflict(staffId, row) || isResourceConflict(resourceLabel, unitId, row);
}
async function loadOverlappingRows(clinicId, startsAt, endsAt, excludeIds) {
    let q = supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, hub_staff_member_id, resource_label, unit_id, starts_at, ends_at, status')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .lt('starts_at', endsAt)
        .gt('ends_at', startsAt);
    if (excludeIds.length === 1)
        q = q.neq('id', excludeIds[0]);
    else if (excludeIds.length > 1)
        q = q.not('id', 'in', `(${excludeIds.join(',')})`);
    const { data, error } = await q;
    if (error)
        throw error;
    return (data ?? []);
}
async function assertNoScheduleConflict(clinicId, excludeIds, staffId, resourceLabel, unitId, startsAt, endsAt) {
    const rows = await loadOverlappingRows(clinicId, startsAt, endsAt, excludeIds);
    for (const row of rows) {
        if (rowConflictsWith(row, staffId, resourceLabel, unitId, startsAt, endsAt)) {
            const reason = isStaffConflict(staffId, row) && staffId
                ? 'Horário em conflito com outro atendimento do mesmo profissional.'
                : 'Horário em conflito com outro atendimento no mesmo recurso/sala.';
            return { conflict: true, reason, conflictingId: row.id };
        }
    }
    return { conflict: false, reason: '' };
}
async function assertServiceTypeInClinic(clinicId, serviceTypeId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('id', serviceTypeId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        return false;
    return !!data;
}
async function assertStaffInClinicOptional(clinicId, staffId) {
    if (!staffId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('id')
        .eq('id', staffId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data)
        return false;
    return true;
}
async function assertPetInClinic(clinicId, petId) {
    if (!petId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('id')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data)
        return false;
    return true;
}
async function assertGuardianInClinic(clinicId, guardianId) {
    if (!guardianId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_guardians')
        .select('id')
        .eq('id', guardianId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data)
        return false;
    return true;
}
async function assertUnitInClinic(clinicId, unitId) {
    if (!unitId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('units')
        .select('id, clinic_id')
        .eq('id', unitId)
        .maybeSingle();
    if (error || !data || data.clinic_id !== clinicId)
        return false;
    return true;
}
const PRICING_TIER_SET = new Set(hubServiceTypesPricingMatrix_1.PORTE_VALUES);
const PRICING_COAT_SET = new Set(hubServiceTypesPricingMatrix_1.COAT_TYPE_VALUES);
const PET_BODY_SET = new Set(hubPricingResolve_1.PET_BODY_SIZE_TIERS);
const optionalPricingPorte = zod_1.z
    .union([zod_1.z.string(), zod_1.z.null(), zod_1.z.undefined()])
    .transform((v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim()));
const optionalPricingCoat = zod_1.z
    .union([zod_1.z.string(), zod_1.z.null(), zod_1.z.undefined()])
    .transform((v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim()));
async function fetchServiceTypesMap(clinicId, ids) {
    const uniq = [...new Set(ids)];
    if (uniq.length === 0)
        return new Map();
    let rows = [];
    {
        const first = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, service_group, pricing_matrix, cost_amount, sale_amount, pickup_price_scope')
            .eq('clinic_id', clinicId)
            .in('id', uniq)
            .is('deleted_at', null);
        if (first.error && String(first.error.message ?? '').includes('pickup_price_scope')) {
            const legacy = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, service_group, pricing_matrix, cost_amount, sale_amount')
                .eq('clinic_id', clinicId)
                .in('id', uniq)
                .is('deleted_at', null);
            if (legacy.error)
                throw new Error(legacy.error.message);
            rows = (legacy.data ?? []);
        }
        else if (first.error) {
            throw new Error(first.error.message);
        }
        else {
            rows = (first.data ?? []);
        }
    }
    const m = new Map();
    for (const r of rows) {
        m.set(String(r.id), {
            id: String(r.id),
            service_group: String(r.service_group ?? ''),
            pricing_matrix: r.pricing_matrix,
            cost_amount: Number(r.cost_amount) || 0,
            sale_amount: Number(r.sale_amount) || 0,
            pickup_price_scope: (0, hubPickupPricing_1.normalizePickupPriceScope)(r.pickup_price_scope),
        });
    }
    return m;
}
async function fetchPetPricingFields(clinicId, petId) {
    if (!petId)
        return { size_tier: 'medio', birth_date: null, coat_type: null };
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('size_tier, birth_date, coat_type')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data)
        return { size_tier: 'medio', birth_date: null, coat_type: null };
    const d = data;
    const st = d.size_tier && PET_BODY_SET.has(String(d.size_tier)) ? String(d.size_tier) : 'medio';
    const bd = d.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(String(d.birth_date)) ? String(d.birth_date) : null;
    const ct = d.coat_type && PRICING_COAT_SET.has(String(d.coat_type)) ? String(d.coat_type) : null;
    return { size_tier: st, birth_date: bd, coat_type: ct };
}
function validatePricingPorteInputs(params) {
    const { appointmentOverride, appointmentCoatOverride, pet, lines, stMap } = params;
    const checkTier = (t) => {
        if (!t)
            return undefined;
        if (!PRICING_TIER_SET.has(t))
            return `Porte de preço inválido: ${t}`;
        return undefined;
    };
    const checkCoat = (t) => {
        if (!t)
            return undefined;
        if (!PRICING_COAT_SET.has(t))
            return `Pelagem inválida: ${t}`;
        return undefined;
    };
    const e0 = checkTier(appointmentOverride);
    if (e0)
        return { error: e0 };
    const c0 = checkCoat(appointmentCoatOverride);
    if (c0)
        return { error: c0 };
    for (const line of lines) {
        const te = checkTier(line.pricing_porte_tier ?? null);
        if (te)
            return { error: te };
        const ce = checkCoat(line.pricing_coat_type ?? null);
        if (ce)
            return { error: ce };
    }
    const stListForAppt = [...new Set(lines.map((l) => l.hub_service_type_id))]
        .map((id) => stMap.get(id))
        .filter(Boolean);
    const v = (0, hubPricingResolve_1.validatePorteOverrideForServiceTypes)(stListForAppt, appointmentOverride);
    if (v !== true)
        return { error: v.error };
    const cv = (0, hubPricingResolve_1.validateCoatOverrideForServiceTypes)(stListForAppt, appointmentCoatOverride);
    if (cv !== true)
        return { error: cv.error };
    for (const st of stListForAppt) {
        if ((0, hubPricingResolve_1.requiresCoatPricing)(st) && !(appointmentCoatOverride || pet.coat_type)) {
            return { error: 'Selecione a pelagem do pet para precificar serviços de Banho & Tosa por pelagem.' };
        }
    }
    for (const line of lines) {
        const t = line.pricing_porte_tier?.trim() || null;
        if (!t)
            continue;
        const st = stMap.get(line.hub_service_type_id);
        if (!st)
            continue;
        const vv = (0, hubPricingResolve_1.validatePorteOverrideForServiceTypes)([st], t);
        if (vv !== true)
            return { error: vv.error };
    }
    for (const line of lines) {
        const t = line.pricing_coat_type?.trim() || null;
        if (!t)
            continue;
        const st = stMap.get(line.hub_service_type_id);
        if (!st)
            continue;
        const vv = (0, hubPricingResolve_1.validateCoatOverrideForServiceTypes)([st], t);
        if (vv !== true)
            return { error: vv.error };
    }
    return {};
}
function normalizeCreateServiceLines(b) {
    if (b.services && b.services.length > 0) {
        return b.services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            duration_minutes: s.duration_minutes,
            pricing_porte_tier: s.pricing_porte_tier ?? null,
            pricing_coat_type: s.pricing_coat_type ?? null,
            pricing_variant: s.pricing_variant ?? null,
            sale_amount_override: s.sale_amount_override ?? null,
            persist_special_price: s.persist_special_price === true,
            persist_special_scope: s.persist_special_scope ?? 'pet',
        }));
    }
    return [
        {
            hub_service_type_id: b.hub_service_type_id,
            duration_minutes: 60,
            pricing_porte_tier: null,
            pricing_coat_type: null,
            pricing_variant: null,
        },
    ];
}
function buildServiceLineSnapshots(params) {
    const { lines, stMap, pet, appointmentYmd, puppyMaxMonths, appointmentOverride, appointmentCoatOverride, specialByServiceId, } = params;
    return lines.map((line, idx) => {
        const st = stMap.get(line.hub_service_type_id);
        if (!st) {
            throw new Error(`Tipo de serviço não encontrado: ${line.hub_service_type_id}`);
        }
        const lineOverride = line.pricing_porte_tier?.trim() || null;
        const lineCoatOverride = line.pricing_coat_type?.trim() || null;
        const effPorte = lineOverride ?? appointmentOverride;
        const effCoat = lineCoatOverride ?? appointmentCoatOverride;
        const r = (0, hubPricingResolve_1.resolveServiceLinePricing)({
            serviceType: st,
            pet,
            appointmentDateYmd: appointmentYmd,
            puppyMaxMonths,
            overrideTier: effPorte,
            overrideCoatType: effCoat,
            pricing_variant: line.pricing_variant ?? undefined,
        });
        const special = specialByServiceId?.get(line.hub_service_type_id) ?? null;
        let sale = r.sale;
        let cost = r.cost;
        let pricing_source = 'catalog';
        let special_price_id = null;
        if (special) {
            sale = special.sale_amount;
            if (special.cost_amount != null)
                cost = special.cost_amount;
            pricing_source = special.pricing_source;
            special_price_id = special.special_price_id;
        }
        if (line.sale_amount_override != null && Number.isFinite(line.sale_amount_override)) {
            sale = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(line.sale_amount_override);
            pricing_source = 'manual';
            // Mantém special_price_id se o manual veio de um acordo persistido na mesma request.
        }
        if (line.cost_amount_override != null && Number.isFinite(line.cost_amount_override)) {
            cost = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(line.cost_amount_override);
        }
        return {
            hub_service_type_id: line.hub_service_type_id,
            duration_minutes: line.duration_minutes,
            order_index: idx,
            pricing_porte_tier_applied: r.porteTierApplied,
            pricing_coat_type_applied: r.coatTypeApplied,
            cost_amount_applied: cost,
            sale_amount_applied: sale,
            pricing_variant: r.pricing_variant,
            pricing_source,
            special_price_id,
        };
    });
}
function appointmentServiceInsertRows(appointmentId, snapRows) {
    return snapRows.map((row) => ({
        appointment_id: appointmentId,
        hub_service_type_id: row.hub_service_type_id,
        duration_minutes: row.duration_minutes,
        order_index: row.order_index,
        pricing_porte_tier_applied: row.pricing_porte_tier_applied,
        pricing_coat_type_applied: row.pricing_coat_type_applied,
        cost_amount_applied: row.cost_amount_applied,
        sale_amount_applied: row.sale_amount_applied,
        pricing_variant: row.pricing_variant,
        pricing_source: row.pricing_source,
        special_price_id: row.special_price_id,
    }));
}
async function refreshSnapshotsForAppointment(clinicId, appointmentId, startsAt, petId, pricingPorteTier, pricingCoatType, guardianId) {
    const { data: lines, error: le } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('id, hub_service_type_id, duration_minutes, order_index, pricing_variant')
        .eq('appointment_id', appointmentId)
        .order('order_index');
    if (le || !lines?.length)
        return;
    const ids = [...new Set(lines.map((l) => l.hub_service_type_id))];
    const stMap = await fetchServiceTypesMap(clinicId, ids);
    const pet = await fetchPetPricingFields(clinicId, petId);
    const { pet_puppy_max_months } = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinicId);
    const ymd = startsAt.slice(0, 10);
    let resolvedGuardianId = guardianId ?? null;
    if (!resolvedGuardianId && petId) {
        const { data: appt } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('guardian_id')
            .eq('id', appointmentId)
            .maybeSingle();
        resolvedGuardianId = appt?.guardian_id ?? null;
    }
    const catalogSaleByServiceId = new Map();
    for (const [sid, st] of stMap) {
        catalogSaleByServiceId.set(sid, (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(st.sale_amount) || 0));
    }
    const specialByServiceId = await (0, hubSpecialPrices_1.resolveSpecialPricesForServices)({
        clinicId,
        petId,
        guardianId: resolvedGuardianId,
        hubServiceTypeIds: ids,
        onDateYmd: ymd,
        catalogSaleByServiceId,
    });
    const normLines = lines.map((l) => ({
        hub_service_type_id: l.hub_service_type_id,
        duration_minutes: l.duration_minutes,
        pricing_porte_tier: null,
        pricing_coat_type: null,
        pricing_variant: l.pricing_variant ?? null,
    }));
    const snaps = buildServiceLineSnapshots({
        lines: normLines,
        stMap,
        pet,
        appointmentYmd: ymd,
        puppyMaxMonths: pet_puppy_max_months,
        appointmentOverride: pricingPorteTier,
        appointmentCoatOverride: pricingCoatType,
        specialByServiceId,
    });
    for (let i = 0; i < lines.length; i++) {
        const row = lines[i];
        const s = snaps[i];
        if (!s)
            continue;
        await supabase_1.supabaseAdmin
            .from('hub_appointment_services')
            .update({
            pricing_porte_tier_applied: s.pricing_porte_tier_applied,
            pricing_coat_type_applied: s.pricing_coat_type_applied,
            cost_amount_applied: s.cost_amount_applied,
            sale_amount_applied: s.sale_amount_applied,
            pricing_variant: s.pricing_variant,
            pricing_source: s.pricing_source,
            special_price_id: s.special_price_id,
        })
            .eq('id', row.id);
    }
}
// ── Recurrence helpers ──────────────────────────────────────────────────────
const MAX_OCCURRENCES = 52;
function generateOccurrenceDates(startDate, rule) {
    const dates = [];
    let current = new Date(startDate + 'T00:00:00Z');
    const cap = Math.min(rule.occurrences ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
    const until = rule.until_date ? new Date(rule.until_date + 'T23:59:59Z') : null;
    while (dates.length < cap) {
        if (until && current > until)
            break;
        if (rule.kind === 'daily') {
            dates.push(current.toISOString().slice(0, 10));
            current = new Date(current);
            current.setUTCDate(current.getUTCDate() + rule.interval_value);
        }
        else if (rule.kind === 'weekly') {
            const targetDays = rule.days_of_week && rule.days_of_week.length > 0 ? rule.days_of_week : [1];
            // iso weekday: 1=mon..7=sun
            const dow = ((current.getUTCDay() + 6) % 7) + 1;
            if (targetDays.includes(dow)) {
                dates.push(current.toISOString().slice(0, 10));
            }
            current = new Date(current);
            current.setUTCDate(current.getUTCDate() + 1);
            // skip to next week start if past all target days this week
            if (dates.length > 0 && rule.interval_value > 1) {
                const curDow = ((current.getUTCDay() + 6) % 7) + 1;
                const maxTarget = Math.max(...targetDays);
                if (curDow > maxTarget) {
                    // jump to monday of next Nth week
                    const daysUntilMon = (8 - current.getUTCDay()) % 7 || 7;
                    current.setUTCDate(current.getUTCDate() + daysUntilMon + (rule.interval_value - 1) * 7);
                }
            }
            if (dates.length >= cap)
                break;
            continue;
        }
        else {
            // monthly
            dates.push(current.toISOString().slice(0, 10));
            current = new Date(current);
            current.setUTCMonth(current.getUTCMonth() + rule.interval_value);
            if (rule.day_of_month) {
                const maxDay = new Date(current.getUTCFullYear(), current.getUTCMonth() + 1, 0).getUTCDate();
                current.setUTCDate(Math.min(rule.day_of_month, maxDay));
            }
        }
    }
    return dates;
}
function shiftTimestampToDate(originalTs, newDate) {
    // keep time portion from originalTs, apply to newDate
    const orig = new Date(originalTs);
    const [y, m, d] = newDate.split('-').map(Number);
    orig.setUTCFullYear(y, m - 1, d);
    return orig.toISOString();
}
/** UUID determinístico por data — agrupa irmãos multi-pet na mesma visita recorrente. */
function visitGroupIdForOccurrence(baseGroupId, occDate) {
    const hash = (0, crypto_1.createHash)('sha256').update(`${baseGroupId}:${occDate}`).digest();
    hash[6] = (hash[6] & 0x0f) | 0x40;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
async function enrichAppointments(rows) {
    if (rows.length === 0)
        return [];
    const staffIds = [...new Set(rows.map((r) => r.hub_staff_member_id).filter(Boolean))];
    const petIds = [...new Set(rows.map((r) => r.pet_id).filter(Boolean))];
    const guIds = [...new Set(rows.map((r) => r.guardian_id).filter(Boolean))];
    const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))];
    const partnerIds = [...new Set(rows.map((r) => r.hub_partner_clinic_id).filter(Boolean))];
    const apptIds = rows.map((r) => r.id);
    const enrichClinicId = rows[0]?.clinic_id ?? null;
    const svcLinesRes = apptIds.length
        ? await supabase_1.supabaseAdmin
            .from('hub_appointment_services')
            .select('id, appointment_id, hub_service_type_id, duration_minutes, order_index, pricing_porte_tier_applied, pricing_coat_type_applied, cost_amount_applied, sale_amount_applied, pricing_variant')
            .in('appointment_id', apptIds)
            .order('order_index')
        : { data: [], error: null };
    const stIds = [
        ...new Set([
            ...rows.map((r) => r.hub_service_type_id),
            ...(svcLinesRes.data ?? []).map((l) => l.hub_service_type_id),
        ]),
    ];
    const [stRes, staffRes, petsRes, guRes, unitsRes, encRes, partnerMap] = await Promise.all([
        stIds.length
            ? supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, name, code, service_group, agenda_color, default_duration_minutes, is_addon')
                .in('id', stIds)
            : Promise.resolve({ data: [] }),
        staffIds.length
            ? supabase_1.supabaseAdmin.from('hub_staff_members').select('id, full_name, agenda_color').in('id', staffIds)
            : Promise.resolve({ data: [] }),
        petIds.length
            ? supabase_1.supabaseAdmin
                .from('hub_pets')
                .select('id, name, species, breed, size_tier, coat_type, birth_date, behavior_tags')
                .in('id', petIds)
            : Promise.resolve({ data: [] }),
        guIds.length
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', guIds)
            : Promise.resolve({ data: [] }),
        unitIds.length
            ? supabase_1.supabaseAdmin.from('units').select('id, name').in('id', unitIds)
            : Promise.resolve({ data: [] }),
        apptIds.length
            ? supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('id, hub_appointment_id, status')
                .in('hub_appointment_id', apptIds)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] }),
        enrichClinicId
            ? (0, hubCareLocation_1.loadPartnerClinicMap)(enrichClinicId, partnerIds)
            : Promise.resolve(new Map()),
    ]);
    const clinicId = rows[0]?.clinic_id || '';
    const groupColorBySlug = new Map();
    if (clinicId) {
        await (0, hubServiceGroupsController_1.ensureDefaultHubServiceGroups)(clinicId);
        const { data: grpRows } = await supabase_1.supabaseAdmin
            .from('hub_service_groups')
            .select('slug, color')
            .eq('clinic_id', clinicId);
        for (const g of grpRows ?? []) {
            const gr = g;
            if (gr.slug && gr.color && /^#[0-9A-Fa-f]{6}$/.test(gr.color)) {
                groupColorBySlug.set(gr.slug, gr.color);
            }
        }
    }
    const stMap = new Map((stRes.data ?? []).map((x) => {
        const sg = String(x.service_group || 'outros').trim();
        return [x.id, { ...x, group_color: groupColorBySlug.get(sg) ?? null }];
    }));
    const staffMap = new Map((staffRes.data ?? []).map((x) => [x.id, x]));
    const petMap = new Map((petsRes.data ?? []).map((x) => [x.id, x]));
    const guMap = new Map((guRes.data ?? []).map((x) => [x.id, x]));
    const unitMap = new Map((unitsRes.data ?? []).map((x) => [x.id, x]));
    const encByAppt = new Map();
    for (const enc of (encRes.data ?? [])) {
        const apptId = enc.hub_appointment_id;
        if (apptId)
            encByAppt.set(apptId, { id: enc.id, status: String(enc.status) });
    }
    // group service lines by appointment
    const svcByAppt = new Map();
    for (const line of (svcLinesRes.data ?? [])) {
        const apptId = line.appointment_id;
        const arr = svcByAppt.get(apptId) ?? [];
        arr.push(line);
        svcByAppt.set(apptId, arr);
    }
    const [adjustmentFlags, openComandaByAppt] = clinicId
        ? await Promise.all([
            (0, hubComandasController_1.financialAdjustmentFlagsForAppointments)(clinicId, apptIds),
            (0, hubComandasController_1.openComandaIdsForAppointments)(clinicId, apptIds),
        ])
        : [
            new Map(),
            new Map(),
        ];
    const clinicBalances = clinicId ? await (0, hubPackagesService_1.listActivePackageBalances)({ clinicId }) : [];
    return rows.map((r) => {
        const st = stMap.get(r.hub_service_type_id);
        const sm = r.hub_staff_member_id ? staffMap.get(r.hub_staff_member_id) : null;
        const pet = r.pet_id ? petMap.get(r.pet_id) : null;
        const gu = r.guardian_id ? guMap.get(r.guardian_id) : null;
        const un = r.unit_id ? unitMap.get(r.unit_id) : null;
        const partner = r.hub_partner_clinic_id
            ? partnerMap.get(r.hub_partner_clinic_id) ?? null
            : null;
        const rawLines = svcByAppt.get(r.id) ?? [];
        const services = rawLines.map((l) => ({
            id: l.id,
            hub_service_type_id: l.hub_service_type_id,
            duration_minutes: l.duration_minutes,
            order_index: l.order_index,
            pricing_porte_tier_applied: l.pricing_porte_tier_applied ?? null,
            pricing_coat_type_applied: l.pricing_coat_type_applied ?? null,
            cost_amount_applied: l.cost_amount_applied != null && l.cost_amount_applied !== ''
                ? Number(l.cost_amount_applied)
                : null,
            sale_amount_applied: l.sale_amount_applied != null && l.sale_amount_applied !== ''
                ? Number(l.sale_amount_applied)
                : null,
            pricing_variant: l.pricing_variant ?? null,
            service_type: stMap.get(l.hub_service_type_id) ?? null,
        }));
        const linked = encByAppt.get(r.id);
        const adj = adjustmentFlags.get(r.id);
        const serviceTypeIds = services.map((s) => s.hub_service_type_id);
        const hasPackageBalance = (0, hubPackagesService_1.hasPackageBalanceForServices)(clinicBalances, r.guardian_id ?? null, r.pet_id ?? null, serviceTypeIds);
        return {
            ...r,
            service_type: st ?? null,
            staff_member: sm ?? null,
            pet: pet ?? null,
            guardian: gu ?? null,
            unit: un ?? null,
            partner_clinic: partner,
            services,
            hub_encounter_id: linked?.id ?? null,
            hub_encounter_status: linked?.status ?? null,
            financial_adjustment_pending: adj?.financial_adjustment_pending ?? false,
            comanda_id: openComandaByAppt.get(r.id) ?? adj?.comanda_id ?? null,
            has_package_balance: hasPackageBalance,
        };
    });
}
// ── Schemas ──────────────────────────────────────────────────────────────────
const listQuerySchema = zod_1.z.object({
    clinic_id: uuidStr,
    from: zod_1.z.string().datetime({ offset: true }),
    to: zod_1.z.string().datetime({ offset: true }),
    unit_id: uuidStr.optional(),
    care_location_kind: hubCareLocation_1.careLocationKindSchema.optional(),
    hub_partner_clinic_id: uuidStr.optional(),
    hub_staff_member_id: zod_1.z.union([uuidStr, zod_1.z.literal('__na__')]).optional(),
    hub_service_type_id: uuidStr.optional(),
    service_group: zod_1.z.string().trim().min(1).max(64).optional(),
    status: appointmentStatusSchema.optional(),
    resource_label: zod_1.z.string().trim().max(120).optional(),
});
const seriesEndingSoonQuerySchema = zod_1.z.object({
    clinic_id: uuidStr,
    max_remaining: zod_1.z.coerce.number().int().min(1).max(20).optional().default(hubSeriesEndingSoonService_1.DEFAULT_SERIES_ENDING_MAX_REMAINING),
    within_days: zod_1.z.coerce.number().int().min(1).max(90).optional().default(hubSeriesEndingSoonService_1.DEFAULT_SERIES_ENDING_WITHIN_DAYS),
});
const statsByServiceGroupQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hub_staff_member_id: zod_1.z.union([uuidStr, zod_1.z.literal('__na__')]).optional(),
    hub_service_type_id: uuidStr.optional(),
})
    .strict();
const linePricingVariantSchema = zod_1.z
    .object({
    km_tier_index: zod_1.z.number().int().min(0).optional(),
    custom_tier_index: zod_1.z.number().int().min(0).optional(),
    period: zod_1.z.enum(['full_day', 'half_day']).optional(),
    consult_type: zod_1.z.enum(['padrao', 'retorno']).optional(),
})
    .strict()
    .optional()
    .nullable();
const serviceLineSchema = zod_1.z.object({
    hub_service_type_id: uuidStr,
    duration_minutes: zod_1.z.number().int().positive(),
    pricing_porte_tier: optionalPricingPorte.optional(),
    pricing_coat_type: optionalPricingCoat.optional(),
    pricing_variant: linePricingVariantSchema,
    /** Valor absoluto para este agendamento (opcional). */
    sale_amount_override: zod_1.z.number().finite().min(0).max(99_999_999.99).optional().nullable(),
    /** Se true, persiste o override como preço especial (pet ou tutor). */
    persist_special_price: zod_1.z.boolean().optional(),
    persist_special_scope: zod_1.z.enum(['pet', 'guardian']).optional(),
});
const pickupBlockSchema = zod_1.z.object({
    starts_at: zod_1.z.string().datetime({ offset: true }),
    ends_at: zod_1.z.string().datetime({ offset: true }),
    resource_label: optionalTrim(120).optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
});
const extraBlockSchema = zod_1.z.object({
    starts_at: zod_1.z.string().datetime({ offset: true }),
    ends_at: zod_1.z.string().datetime({ offset: true }),
    services: zod_1.z.array(serviceLineSchema).min(1),
    hub_staff_member_id: uuidStr.optional().nullable(),
    resource_label: optionalTrim(120).optional(),
    status: appointmentStatusSchema.optional(),
    notes: optionalTrim(8000).optional(),
    title: optionalTrim(200).optional(),
});
const patchExtraBlockSchema = extraBlockSchema.extend({
    id: uuidStr.optional(),
});
const pickupRoutePricingSchema = zod_1.z
    .object({
    hub_service_type_id: uuidStr,
    pricing_variant: zod_1.z
        .object({
        km_tier_index: zod_1.z.number().int().min(0).optional(),
        custom_tier_index: zod_1.z.number().int().min(0).optional(),
    })
        .strict(),
})
    .strict();
const recurrenceSchema = zod_1.z.object({
    kind: zod_1.z.enum(['daily', 'weekly', 'monthly']),
    interval_value: zod_1.z.number().int().positive().default(1),
    days_of_week: zod_1.z.array(zod_1.z.number().int().min(1).max(7)).optional().nullable(),
    day_of_month: zod_1.z.number().int().min(1).max(31).optional().nullable(),
    until_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    occurrences: zod_1.z.number().int().positive().max(MAX_OCCURRENCES).optional().nullable(),
    billing_mode: zod_1.z.enum(['per_occurrence', 'periodic_invoice']).optional().default('per_occurrence'),
    invoice_issue_rule: zod_1.z.enum(['fixed_day', 'first_business_day']).optional().nullable(),
    invoice_issue_day: zod_1.z.number().int().min(1).max(28).optional().nullable(),
    invoice_due_rule: zod_1.z.enum(['same_day', 'plus_days', 'fixed_day']).optional().nullable(),
    invoice_due_day: zod_1.z.number().int().min(1).max(28).optional().nullable(),
    invoice_due_plus_days: zod_1.z.number().int().min(0).max(90).optional().nullable(),
});
const createAppointmentSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    hub_service_type_id: uuidStr,
    hub_staff_member_id: uuidStr.optional().nullable(),
    pet_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    starts_at: zod_1.z.string().datetime({ offset: true }),
    ends_at: zod_1.z.string().datetime({ offset: true }),
    status: appointmentStatusSchema.optional(),
    resource_label: optionalTrim(120).optional(),
    notes: optionalTrim(8000).optional(),
    appointment_kind: appointmentKindSchema.optional(),
    title: optionalTrim(200).optional(),
    description: optionalTrim(8000).optional(),
    financial_notes: optionalTrim(8000).optional(),
    services: zod_1.z.array(serviceLineSchema).optional(),
    pricing_porte_tier: optionalPricingPorte.optional(),
    pricing_coat_type: optionalPricingCoat.optional(),
    with_pickup_route_before: pickupBlockSchema.optional().nullable(),
    with_pickup_route_after: pickupBlockSchema.optional().nullable(),
    pickup_route_pricing: pickupRoutePricingSchema.optional().nullable(),
    /**
     * L&T como serviço principal: modo operacional (1 ou 2 paradas).
     * Ignorado quando há with_pickup_route_* (anexo a banho/clínica).
     */
    standalone_pickup_mode: zod_1.z.enum(['round_trip', 'pickup_only', 'delivery_only']).optional(),
    /** Segunda perna (retorno) quando standalone_pickup_mode = round_trip. */
    standalone_pickup_return: pickupBlockSchema.optional().nullable(),
    extra_blocks: zod_1.z.array(extraBlockSchema).optional(),
    recurrence: recurrenceSchema.optional().nullable(),
    /** Preferência de caso ao abrir atendimento (fluxo agenda consulta de rotina). */
    intake_hub_case_id: uuidStr.optional().nullable(),
    intake_create_new_case: zod_1.z.boolean().optional(),
    intake_new_case_title: optionalTrim(500).optional().nullable(),
    /** Permite sobrepor outro slot (somente kinds walk-in). */
    allow_schedule_overlap: zod_1.z.boolean().optional(),
    /** Agrupa vários agendamentos da mesma visita multi-pet. */
    visit_group_id: uuidStr.optional().nullable(),
    ...hubCareLocation_1.careLocationBodyFields,
})
    .strict();
const batchPetEntrySchema = zod_1.z
    .object({
    pet_id: uuidStr,
    pricing_porte_tier: optionalPricingPorte.optional(),
    pricing_coat_type: optionalPricingCoat.optional(),
    services: zod_1.z.array(serviceLineSchema).optional(),
    starts_at: zod_1.z.string().datetime({ offset: true }).optional(),
    ends_at: zod_1.z.string().datetime({ offset: true }).optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    resource_label: optionalTrim(120).optional(),
    extra_blocks: zod_1.z.array(extraBlockSchema).optional(),
})
    .strict();
const createAppointmentBatchSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    visit_group_id: uuidStr.optional().nullable(),
    shared: createAppointmentSchema,
    pets: zod_1.z.array(batchPetEntrySchema).min(2).max(20),
})
    .strict();
const patchAppointmentSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    hub_service_type_id: uuidStr.optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    pet_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    starts_at: zod_1.z.string().datetime({ offset: true }).optional(),
    ends_at: zod_1.z.string().datetime({ offset: true }).optional(),
    status: appointmentStatusSchema.optional(),
    resource_label: optionalTrim(120).optional().nullable(),
    notes: optionalTrim(8000).optional().nullable(),
    financial_notes: optionalTrim(8000).optional().nullable(),
    appointment_kind: appointmentKindSchema.optional(),
    deleted: zod_1.z.boolean().optional(),
    title: optionalTrim(200).optional().nullable(),
    description: optionalTrim(8000).optional().nullable(),
    services: zod_1.z.array(serviceLineSchema).optional(),
    pricing_porte_tier: optionalPricingPorte.optional(),
    pricing_coat_type: optionalPricingCoat.optional(),
    intake_hub_case_id: uuidStr.optional().nullable(),
    intake_create_new_case: zod_1.z.boolean().optional(),
    intake_new_case_title: optionalTrim(200).optional().nullable(),
    extra_blocks: zod_1.z.array(patchExtraBlockSchema).optional(),
    ...hubCareLocation_1.careLocationBodyFields,
})
    .strict();
const EDITABLE_APPOINTMENT_STATUSES = new Set(['pending_confirm', 'confirmed']);
function isAppointmentStructurallyEditable(row) {
    const status = String(row.status ?? '');
    if (!EDITABLE_APPOINTMENT_STATUSES.has(status))
        return false;
    const startsAt = row.starts_at;
    if (!startsAt)
        return false;
    return new Date().getTime() < new Date(startsAt).getTime();
}
function isStructuralAppointmentPatch(body) {
    if (body.deleted === true)
        return false;
    return (body.unit_id !== undefined ||
        body.care_location_kind !== undefined ||
        body.hub_partner_clinic_id !== undefined ||
        body.hub_service_type_id !== undefined ||
        body.hub_staff_member_id !== undefined ||
        body.pet_id !== undefined ||
        body.guardian_id !== undefined ||
        body.starts_at !== undefined ||
        body.ends_at !== undefined ||
        body.resource_label !== undefined ||
        body.notes !== undefined ||
        body.financial_notes !== undefined ||
        body.appointment_kind !== undefined ||
        body.title !== undefined ||
        body.description !== undefined ||
        body.pricing_porte_tier !== undefined ||
        body.pricing_coat_type !== undefined ||
        body.intake_hub_case_id !== undefined ||
        body.intake_create_new_case !== undefined ||
        body.intake_new_case_title !== undefined ||
        (body.services !== undefined && body.services.length > 0) ||
        body.extra_blocks !== undefined);
}
async function syncExtraBlocksForParent(clinicId, parentId, parentRow, blocks, excludeConflictIds) {
    const { data: existingChildren, error: childErr } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('parent_appointment_id', parentId)
        .is('deleted_at', null);
    if (childErr)
        return { error: childErr.message, status: 500 };
    const existingChildIds = (existingChildren ?? []).map((r) => r.id);
    const keepIds = new Set();
    const apptOverride = parentRow.pricing_porte_tier ?? null;
    const apptCoatOverride = parentRow.pricing_coat_type ?? null;
    const petId = parentRow.pet_id ?? null;
    const guardianId = parentRow.guardian_id ?? null;
    const unitId = parentRow.unit_id ?? null;
    const seriesId = parentRow.series_id ?? null;
    const seriesOccDate = parentRow.series_occurrence_date ?? null;
    const parentStatus = parentRow.status ?? 'confirmed';
    const allStIds = [...new Set(blocks.flatMap((bl) => bl.services.map((s) => s.hub_service_type_id)))];
    let stMap;
    try {
        stMap = await fetchServiceTypesMap(clinicId, allStIds);
    }
    catch (e) {
        return { error: e.message, status: 500 };
    }
    for (const sid of allStIds) {
        if (!stMap.has(sid)) {
            return { error: `Tipo de serviço inválido: ${sid}`, status: 400 };
        }
    }
    const pet = await fetchPetPricingFields(clinicId, petId);
    const puppy = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(clinicId);
    for (const block of blocks) {
        if (new Date(block.ends_at) <= new Date(block.starts_at)) {
            return { error: 'ends_at do bloco adicional deve ser posterior a starts_at', status: 400 };
        }
        if (block.hub_staff_member_id !== undefined && block.hub_staff_member_id !== null) {
            if (!(await assertStaffInClinicOptional(clinicId, block.hub_staff_member_id))) {
                return { error: 'Profissional inválido no bloco adicional', status: 400 };
            }
        }
        const conflictExclude = [...excludeConflictIds, ...existingChildIds, ...[...keepIds]];
        const chk = await assertNoScheduleConflict(clinicId, conflictExclude, block.hub_staff_member_id ?? null, block.resource_label ?? null, unitId, block.starts_at, block.ends_at);
        if (chk.conflict) {
            return { error: `Bloco adicional: ${chk.reason}`, status: 409 };
        }
        const firstSvcType = block.services[0].hub_service_type_id;
        const blockNormLines = block.services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            duration_minutes: s.duration_minutes,
            pricing_porte_tier: s.pricing_porte_tier ?? null,
            pricing_coat_type: s.pricing_coat_type ?? null,
            pricing_variant: s.pricing_variant ?? null,
        }));
        const blockYmd = block.starts_at.slice(0, 10);
        let blockSnaps;
        try {
            blockSnaps = buildServiceLineSnapshots({
                lines: blockNormLines,
                stMap,
                pet,
                appointmentYmd: blockYmd,
                puppyMaxMonths: puppy.pet_puppy_max_months,
                appointmentOverride: apptOverride,
                appointmentCoatOverride: apptCoatOverride,
            });
        }
        catch (e) {
            return { error: e.message, status: 500 };
        }
        const rowPatch = {
            unit_id: unitId,
            hub_service_type_id: firstSvcType,
            hub_staff_member_id: block.hub_staff_member_id ?? null,
            pet_id: petId,
            guardian_id: guardianId,
            starts_at: block.starts_at,
            ends_at: block.ends_at,
            status: block.status ?? parentStatus,
            resource_label: block.resource_label ?? null,
            notes: block.notes ?? null,
            title: block.title ?? null,
            series_id: seriesId,
            series_occurrence_date: seriesOccDate,
            pricing_porte_tier: apptOverride,
            pricing_coat_type: apptCoatOverride,
            parent_appointment_id: parentId,
        };
        let blockId;
        if (block.id) {
            const { data: existingChild, error: exChildErr } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .select('id')
                .eq('id', block.id)
                .eq('clinic_id', clinicId)
                .eq('parent_appointment_id', parentId)
                .is('deleted_at', null)
                .maybeSingle();
            if (exChildErr)
                return { error: exChildErr.message, status: 500 };
            if (!existingChild) {
                return { error: 'Bloco adicional não encontrado para este agendamento', status: 404 };
            }
            blockId = block.id;
            const { error: updErr } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update(rowPatch)
                .eq('id', blockId)
                .eq('clinic_id', clinicId);
            if (updErr)
                return { error: updErr.message, status: 500 };
            await supabase_1.supabaseAdmin.from('hub_appointment_services').delete().eq('appointment_id', blockId);
        }
        else {
            const { data: blockRow, error: blockErr } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .insert({
                clinic_id: clinicId,
                appointment_kind: 'standard',
                ...rowPatch,
            })
                .select('id')
                .single();
            if (blockErr)
                return { error: blockErr.message, status: 500 };
            blockId = blockRow.id;
        }
        keepIds.add(blockId);
        const blockSvcInsert = blockSnaps.map((row) => ({
            appointment_id: blockId,
            hub_service_type_id: row.hub_service_type_id,
            duration_minutes: row.duration_minutes,
            order_index: row.order_index,
            pricing_porte_tier_applied: row.pricing_porte_tier_applied,
            pricing_coat_type_applied: row.pricing_coat_type_applied,
            cost_amount_applied: row.cost_amount_applied,
            sale_amount_applied: row.sale_amount_applied,
            pricing_variant: row.pricing_variant,
        }));
        const { error: bSvcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert(blockSvcInsert);
        if (bSvcErr)
            return { error: bSvcErr.message, status: 500 };
    }
    const now = new Date().toISOString();
    for (const childId of existingChildIds) {
        if (keepIds.has(childId))
            continue;
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ deleted_at: now })
            .eq('id', childId)
            .eq('clinic_id', clinicId);
    }
    return {};
}
// ── Handlers ─────────────────────────────────────────────────────────────────
const listHubAppointments = async (req, res) => {
    try {
        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const { clinic_id, from, to, unit_id, care_location_kind, hub_partner_clinic_id, hub_staff_member_id, hub_service_type_id, service_group, status, resource_label } = parsed.data;
        let typeIdsFilter = null;
        if (service_group) {
            const { data: types, error: te } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id')
                .eq('clinic_id', clinic_id)
                .eq('service_group', service_group)
                .is('deleted_at', null);
            if (te)
                return res.status(500).json({ error: te.message });
            typeIdsFilter = (types ?? []).map((t) => t.id);
            if (typeIdsFilter.length === 0) {
                return res.json({ appointments: [], range: { from, to } });
            }
        }
        let q = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('*')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .lt('starts_at', to)
            .gt('ends_at', from)
            .order('starts_at', { ascending: true });
        if (unit_id) {
            // Inclui atendimentos em clínica parceira (sem unit_id), como na fila clínica.
            q = q.or(`unit_id.eq.${unit_id},care_location_kind.eq.partner_clinic`);
        }
        if (care_location_kind)
            q = q.eq('care_location_kind', care_location_kind);
        if (hub_partner_clinic_id)
            q = q.eq('hub_partner_clinic_id', hub_partner_clinic_id);
        if (hub_staff_member_id === '__na__')
            q = q.is('hub_staff_member_id', null);
        else if (hub_staff_member_id)
            q = q.eq('hub_staff_member_id', hub_staff_member_id);
        if (hub_service_type_id)
            q = q.eq('hub_service_type_id', hub_service_type_id);
        if (typeIdsFilter)
            q = q.in('hub_service_type_id', typeIdsFilter);
        if (status)
            q = q.eq('status', status);
        if (resource_label)
            q = q.eq('resource_label', resource_label);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        const enriched = await enrichAppointments((data ?? []));
        return res.json({ appointments: enriched, range: { from, to } });
    }
    catch (e) {
        console.error('listHubAppointments', e);
        return res.status(500).json({ error: e?.message || 'Erro ao listar agendamentos' });
    }
};
exports.listHubAppointments = listHubAppointments;
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
/** Contagem de agendamentos no intervalo por `hub_service_types.service_group` (slot sobrepõe [from,to]). */
const getHubAppointmentsStatsByServiceGroup = async (req, res) => {
    try {
        const parsed = statsByServiceGroupQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const { clinic_id, unit_id, from, to, hub_staff_member_id, hub_service_type_id } = parsed.data;
        if (from > to)
            return res.status(400).json({ error: 'from não pode ser maior que to' });
        const fromIso = `${from}T00:00:00.000Z`;
        const toIso = `${to}T23:59:59.999Z`;
        let q = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('hub_service_type_id')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .lt('starts_at', toIso)
            .gt('ends_at', fromIso)
            .or(`unit_id.eq.${unit_id},unit_id.is.null`);
        if (hub_service_type_id)
            q = q.eq('hub_service_type_id', hub_service_type_id);
        if (hub_staff_member_id === '__na__')
            q = q.is('hub_staff_member_id', null);
        else if (hub_staff_member_id)
            q = q.eq('hub_staff_member_id', hub_staff_member_id);
        const { data: rows, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        const typeIds = [...new Set((rows ?? []).map((r) => r.hub_service_type_id).filter(Boolean))];
        if (typeIds.length === 0) {
            return res.json({ period: { from, to }, items: [] });
        }
        const { data: types, error: te } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, service_group')
            .in('id', typeIds);
        if (te)
            return res.status(500).json({ error: te.message });
        const groupByType = new Map();
        for (const t of types ?? []) {
            const raw = String(t.service_group ?? '').trim();
            const gid = raw || 'outros';
            groupByType.set(t.id, gid);
        }
        const counts = new Map();
        for (const r of rows ?? []) {
            const tid = r.hub_service_type_id;
            if (!tid)
                continue;
            const g = groupByType.get(tid) ?? 'outros';
            counts.set(g, (counts.get(g) ?? 0) + 1);
        }
        const items = [...counts.entries()]
            .map(([service_group, count]) => ({
            service_group,
            label: SERVICE_GROUP_LABELS[service_group] ?? service_group.replace(/_/g, ' '),
            count,
        }))
            .sort((a, b) => b.count - a.count);
        return res.json({ period: { from, to }, items });
    }
    catch (e) {
        console.error('getHubAppointmentsStatsByServiceGroup', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubAppointmentsStatsByServiceGroup = getHubAppointmentsStatsByServiceGroup;
const listHubSeriesEndingSoon = async (req, res) => {
    try {
        const parsed = seriesEndingSoonQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const { clinic_id, max_remaining, within_days } = parsed.data;
        const now = new Date();
        const { data: rows, error } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, series_id, starts_at, pet_id, guardian_id, title, status')
            .eq('clinic_id', clinic_id)
            .not('series_id', 'is', null)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .gte('starts_at', now.toISOString())
            .order('starts_at', { ascending: true })
            .limit(5000);
        if (error)
            return res.status(500).json({ error: error.message });
        const future = (rows ?? [])
            .filter((r) => typeof r.series_id === 'string')
            .map((r) => ({
            id: r.id,
            series_id: r.series_id,
            starts_at: r.starts_at,
            pet_id: r.pet_id ?? null,
            guardian_id: r.guardian_id ?? null,
            title: r.title ?? null,
        }));
        const ending = (0, hubSeriesEndingSoonService_1.filterEndingSoonSeries)((0, hubSeriesEndingSoonService_1.groupFutureAppointmentsBySeries)(future), now, max_remaining, within_days);
        if (ending.length === 0)
            return res.json({ series: [] });
        const seriesIds = ending.map((s) => s.series_id);
        const { data: seriesRows, error: se } = await supabase_1.supabaseAdmin
            .from('hub_appointment_series')
            .select('id, kind, interval_value, days_of_week, day_of_month, until_date, occurrences')
            .eq('clinic_id', clinic_id)
            .in('id', seriesIds);
        if (se)
            return res.status(500).json({ error: se.message });
        const seriesById = new Map((seriesRows ?? []).map((r) => [r.id, r]));
        return res.json({
            series: ending.map((s) => {
                const meta = seriesById.get(s.series_id);
                return {
                    series_id: s.series_id,
                    remaining_count: s.remaining_count,
                    last_starts_at: s.last_starts_at,
                    kind: meta?.kind ?? 'weekly',
                    interval_value: Number(meta?.interval_value ?? 1) || 1,
                    days_of_week: meta?.days_of_week ?? null,
                    day_of_month: meta?.day_of_month ?? null,
                    until_date: meta?.until_date ?? null,
                    occurrences: meta?.occurrences ?? null,
                    sample_appointment_id: s.sample_appointment_id,
                    pet_id: s.pet_id,
                    guardian_id: s.guardian_id,
                    title: s.title,
                };
            }),
        });
    }
    catch (e) {
        console.error('listHubSeriesEndingSoon', e);
        return res.status(500).json({ error: e?.message || 'Erro ao listar séries a terminar' });
    }
};
exports.listHubSeriesEndingSoon = listHubSeriesEndingSoon;
const createHubAppointment = async (req, res) => {
    try {
        const parsed = createAppointmentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const b = parsed.data;
        if (new Date(b.ends_at) <= new Date(b.starts_at)) {
            return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
        }
        // Kind preliminar (walk-in etc.); pode virar pickup_route após carregar o serviço principal.
        let resolvedAppointmentKind = b.appointment_kind ?? 'standard';
        if (b.allow_schedule_overlap === true &&
            !isWalkInAppointmentKind(resolvedAppointmentKind) &&
            !b.visit_group_id) {
            return res.status(400).json({ error: 'allow_schedule_overlap só é permitido para encaixes (walk-in) ou visitas multi-pet.' });
        }
        const skipScheduleConflictCheck = isWalkInAppointmentKind(resolvedAppointmentKind) || b.allow_schedule_overlap === true;
        // validations
        if (!(await assertServiceTypeInClinic(b.clinic_id, b.hub_service_type_id))) {
            return res.status(400).json({ error: 'Tipo de serviço inválido ou não pertence à clínica' });
        }
        if (!(await assertStaffInClinicOptional(b.clinic_id, b.hub_staff_member_id ?? null))) {
            return res.status(400).json({ error: 'Profissional inválido ou não pertence à clínica' });
        }
        if (!(await assertPetInClinic(b.clinic_id, b.pet_id ?? null))) {
            return res.status(400).json({ error: 'Pet inválido ou não pertence à clínica' });
        }
        if (!(await assertGuardianInClinic(b.clinic_id, b.guardian_id ?? null))) {
            return res.status(400).json({ error: 'Tutor inválido ou não pertence à clínica' });
        }
        if (b.intake_hub_case_id && b.intake_create_new_case === true) {
            return res.status(400).json({ error: 'Não combine intake_hub_case_id com intake_create_new_case.' });
        }
        if (b.intake_hub_case_id) {
            const petId = b.pet_id ?? null;
            if (!petId) {
                return res.status(400).json({ error: 'Para vincular um caso clínico, informe o pet no agendamento.' });
            }
            const { data: cRow } = await supabase_1.supabaseAdmin
                .from('hub_clinical_cases')
                .select('id')
                .eq('id', b.intake_hub_case_id)
                .eq('clinic_id', b.clinic_id)
                .eq('pet_id', petId)
                .is('deleted_at', null)
                .maybeSingle();
            if (!cRow) {
                return res.status(400).json({ error: 'Caso clínico inválido ou não pertence a este pet.' });
            }
        }
        if (!(await assertUnitInClinic(b.clinic_id, b.unit_id ?? null))) {
            return res.status(400).json({ error: 'Unidade inválida ou não pertence à clínica' });
        }
        const careKind = b.care_location_kind ?? 'own_unit';
        // Unidade própria: usa a informada ou a padrão da clínica. Parceira: unit_id opcional (origem administrativa).
        const resolvedUnitId = careKind === 'partner_clinic'
            ? (b.unit_id ?? null)
            : (b.unit_id ?? (await resolveClinicDefaultUnitId(b.clinic_id)));
        const careResolved = await (0, hubCareLocation_1.resolveCareLocation)({
            clinicId: b.clinic_id,
            care_location_kind: careKind,
            hub_partner_clinic_id: b.hub_partner_clinic_id ?? null,
            unit_id: resolvedUnitId,
            allowNullUnit: careKind === 'partner_clinic',
        });
        if (!careResolved.ok) {
            return res.status(400).json({ error: careResolved.error });
        }
        // Validate service types for extra services
        const allServiceTypeIds = b.services ? b.services.map((s) => s.hub_service_type_id) : [];
        for (const stId of allServiceTypeIds) {
            if (stId !== b.hub_service_type_id && !(await assertServiceTypeInClinic(b.clinic_id, stId))) {
                return res.status(400).json({ error: `Tipo de serviço inválido: ${stId}` });
            }
        }
        const hasPickupRoutes = Boolean(b.with_pickup_route_before ?? b.with_pickup_route_after);
        if (b.pickup_route_pricing && !hasPickupRoutes) {
            return res.status(400).json({ error: 'pickup_route_pricing só é permitido com rotas de transporte.' });
        }
        if (hasPickupRoutes && !b.pickup_route_pricing) {
            return res.status(400).json({ error: 'Leva e Traz: indique o tipo de serviço de transporte.' });
        }
        const normLines = normalizeCreateServiceLines(b);
        const extraIds = [];
        for (const block of b.extra_blocks ?? []) {
            for (const s of block.services)
                extraIds.push(s.hub_service_type_id);
        }
        const ltSvcId = b.pickup_route_pricing?.hub_service_type_id;
        const allStIds = [...new Set([...normLines.map((l) => l.hub_service_type_id), ...extraIds, ...(ltSvcId ? [ltSvcId] : [])])];
        let stMap;
        try {
            stMap = await fetchServiceTypesMap(b.clinic_id, allStIds);
        }
        catch (e) {
            return res.status(500).json({ error: e.message });
        }
        for (const id of allStIds) {
            if (!stMap.has(id)) {
                return res.status(400).json({ error: `Tipo de serviço inválido: ${id}` });
            }
        }
        const primarySt = stMap.get(b.hub_service_type_id);
        resolvedAppointmentKind = resolveAppointmentKindForCreate(b.appointment_kind, primarySt);
        if (hasPickupRoutes && isLevaTrazServiceGroup(primarySt)) {
            return res.status(400).json({
                error: 'O atendimento principal já é Leva e Traz. Use o checkbox «Incluir Leva e Traz» apenas junto de banho, clínica ou outros serviços — não combine com um serviço L&T como principal.',
            });
        }
        if (hasPickupRoutes && b.pickup_route_pricing) {
            const ltSt = stMap.get(b.pickup_route_pricing.hub_service_type_id);
            const ge = validateLevaTrazServiceType(ltSt);
            if (ge)
                return res.status(400).json({ error: ge });
            // Preço único (sem matriz), faixas de km, ou personalizado (ex.: regiões).
            const parsedM = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(ltSt.pricing_matrix);
            if (parsedM && typeof parsedM === 'object' && 'error' in parsedM && parsedM.error) {
                return res.status(400).json({ error: 'Matriz de preços do serviço de Leva e Traz inválida.' });
            }
            if (parsedM && typeof parsedM === 'object' && 'kind' in parsedM) {
                const kind = parsedM.kind;
                if (kind === 'km_banda') {
                    const m = parsedM;
                    const kmIdx = b.pickup_route_pricing.pricing_variant.km_tier_index;
                    if (typeof kmIdx !== 'number' || kmIdx < 0 || kmIdx >= m.tiers.length) {
                        return res.status(400).json({ error: 'Faixa de km inválida para o serviço de Leva e Traz.' });
                    }
                }
                else if (kind === 'personalizado') {
                    const m = parsedM;
                    const customIdx = b.pickup_route_pricing.pricing_variant.custom_tier_index;
                    if (typeof customIdx !== 'number' || customIdx < 0 || customIdx >= m.tiers.length) {
                        return res.status(400).json({ error: 'Opção de preço inválida para o serviço de Leva e Traz.' });
                    }
                }
                else {
                    return res.status(400).json({
                        error: 'O serviço de Leva e Traz deve usar preço único, faixas de km ou preços personalizados.',
                    });
                }
            }
        }
        const pet = await fetchPetPricingFields(b.clinic_id, b.pet_id ?? null);
        const puppy = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(b.clinic_id);
        const apptOverride = b.pricing_porte_tier ?? null;
        const apptCoatOverride = b.pricing_coat_type ?? null;
        const allLinesForVal = [
            ...normLines,
            ...(b.extra_blocks ?? []).flatMap((bl) => bl.services.map((s) => ({
                hub_service_type_id: s.hub_service_type_id,
                pricing_porte_tier: s.pricing_porte_tier ?? null,
                pricing_coat_type: s.pricing_coat_type ?? null,
            }))),
        ];
        const valErr = validatePricingPorteInputs({
            appointmentOverride: apptOverride,
            appointmentCoatOverride: apptCoatOverride,
            pet,
            lines: allLinesForVal,
            stMap,
        });
        if (valErr.error) {
            return res.status(400).json({ error: valErr.error });
        }
        // Preços especiais ativos + persistência opcional a partir da agenda
        const catalogSaleByServiceId = new Map();
        for (const [sid, st] of stMap) {
            catalogSaleByServiceId.set(sid, (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(st.sale_amount) || 0));
        }
        const specialByServiceId = await (0, hubSpecialPrices_1.resolveSpecialPricesForServices)({
            clinicId: b.clinic_id,
            petId: b.pet_id ?? null,
            guardianId: b.guardian_id ?? null,
            hubServiceTypeIds: normLines.map((l) => l.hub_service_type_id),
            onDateYmd: b.starts_at.slice(0, 10),
            catalogSaleByServiceId,
        });
        const userId = req.user?.id;
        if (userId && b.pet_id) {
            for (const line of normLines) {
                if (line.persist_special_price &&
                    line.sale_amount_override != null &&
                    Number.isFinite(line.sale_amount_override)) {
                    const up = await (0, hubSpecialPricesController_1.upsertSpecialPriceFromAppointment)({
                        clinicId: b.clinic_id,
                        userId,
                        scope: line.persist_special_scope === 'guardian' ? 'guardian' : 'pet',
                        petId: b.pet_id,
                        guardianId: b.guardian_id ?? null,
                        hubServiceTypeId: line.hub_service_type_id,
                        saleAmount: line.sale_amount_override,
                    });
                    if ('error' in up) {
                        return res.status(400).json({ error: up.error });
                    }
                    // Se aprovado automaticamente, passa a valer no snapshot desta ocorrência
                    if (up.status === 'active') {
                        specialByServiceId.set(line.hub_service_type_id, {
                            special_price_id: up.special_price_id,
                            scope: line.persist_special_scope === 'guardian' ? 'guardian' : 'pet',
                            sale_amount: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(line.sale_amount_override),
                            cost_amount: null,
                            catalog_sale: catalogSaleByServiceId.get(line.hub_service_type_id) ?? null,
                            pricing_source: line.persist_special_scope === 'guardian' ? 'special_guardian' : 'special_pet',
                            notes: null,
                        });
                    }
                }
            }
        }
        let pickupPricingBase = null;
        if (hasPickupRoutes && b.pickup_route_pricing) {
            const ltId = b.pickup_route_pricing.hub_service_type_id;
            const ltSt = stMap.get(ltId);
            const ltMatrix = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(ltSt?.pricing_matrix);
            const matrixKind = ltMatrix != null && typeof ltMatrix === 'object' && 'kind' in ltMatrix
                ? ltMatrix.kind
                : null;
            let kmVariant = null;
            if (matrixKind === 'km_banda') {
                kmVariant = { km_tier_index: b.pickup_route_pricing.pricing_variant.km_tier_index ?? 0 };
            }
            else if (matrixKind === 'personalizado') {
                kmVariant = { custom_tier_index: b.pickup_route_pricing.pricing_variant.custom_tier_index ?? 0 };
            }
            const ymdRef = b.starts_at.slice(0, 10);
            try {
                const baseRows = buildServiceLineSnapshots({
                    lines: [{ hub_service_type_id: ltId, duration_minutes: 1, pricing_variant: kmVariant }],
                    stMap,
                    pet,
                    appointmentYmd: ymdRef,
                    puppyMaxMonths: puppy.pet_puppy_max_months,
                    appointmentOverride: apptOverride,
                    appointmentCoatOverride: apptCoatOverride,
                });
                const br = baseRows[0];
                if (!br)
                    throw new Error('Preço Leva e Traz inválido');
                pickupPricingBase = {
                    ltId,
                    kmVariant,
                    catalogSale: br.sale_amount_applied,
                    catalogCost: br.cost_amount_applied,
                    priceScope: (0, hubPickupPricing_1.normalizePickupPriceScope)(ltSt?.pickup_price_scope),
                };
            }
            catch (e) {
                return res.status(400).json({ error: e.message || 'Erro ao precificar Leva e Traz' });
            }
        }
        const standaloneLtPrimary = isLevaTrazServiceGroup(primarySt) && resolvedAppointmentKind === 'pickup_route';
        const standalonePickupMode = standaloneLtPrimary && !hasPickupRoutes
            ? (b.standalone_pickup_mode ?? 'pickup_only')
            : null;
        if (standalonePickupMode === 'round_trip' && !b.standalone_pickup_return) {
            return res.status(400).json({
                error: 'Ida e volta: informe os horários da perna de retorno (standalone_pickup_return).',
            });
        }
        let standalonePricingBase = null;
        if (standalonePickupMode) {
            const ltId = b.hub_service_type_id;
            const ltSt = stMap.get(ltId);
            const ltMatrix = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(ltSt?.pricing_matrix);
            const matrixKind = ltMatrix != null && typeof ltMatrix === 'object' && 'kind' in ltMatrix
                ? ltMatrix.kind
                : null;
            let kmVariant = null;
            const primaryLine = normLines.find((s) => s.hub_service_type_id === ltId) ?? normLines[0];
            const pv = primaryLine?.pricing_variant ?? null;
            if (matrixKind === 'km_banda') {
                kmVariant = { km_tier_index: pv?.km_tier_index ?? 0 };
            }
            else if (matrixKind === 'personalizado') {
                kmVariant = { custom_tier_index: pv?.custom_tier_index ?? 0 };
            }
            const ymdRef = b.starts_at.slice(0, 10);
            try {
                const baseRows = buildServiceLineSnapshots({
                    lines: [{ hub_service_type_id: ltId, duration_minutes: 1, pricing_variant: kmVariant }],
                    stMap,
                    pet,
                    appointmentYmd: ymdRef,
                    puppyMaxMonths: puppy.pet_puppy_max_months,
                    appointmentOverride: apptOverride,
                    appointmentCoatOverride: apptCoatOverride,
                });
                const br = baseRows[0];
                if (!br)
                    throw new Error('Preço Leva e Traz inválido');
                standalonePricingBase = {
                    kmVariant,
                    catalogSale: br.sale_amount_applied,
                    catalogCost: br.cost_amount_applied,
                    priceScope: (0, hubPickupPricing_1.normalizePickupPriceScope)(ltSt?.pickup_price_scope),
                    legCount: standalonePickupMode === 'round_trip' ? 2 : 1,
                };
            }
            catch (e) {
                return res.status(400).json({ error: e.message || 'Erro ao precificar Leva e Traz' });
            }
        }
        // ── Create series if recurrence requested ─────────────────────────────
        let seriesId = null;
        let occurrenceDates = [];
        if (b.recurrence) {
            const rule = b.recurrence;
            const billingFields = (0, hubSeriesBillingService_1.normalizeSeriesBillingForInsert)({
                billing_mode: rule.billing_mode ?? 'per_occurrence',
                invoice_issue_rule: rule.invoice_issue_rule,
                invoice_issue_day: rule.invoice_issue_day,
                invoice_due_rule: rule.invoice_due_rule,
                invoice_due_day: rule.invoice_due_day,
                invoice_due_plus_days: rule.invoice_due_plus_days,
            });
            if (billingFields.billing_mode === 'periodic_invoice') {
                const svcIds = normLines.map((l) => l.hub_service_type_id);
                if (b.guardian_id && svcIds.length) {
                    const balances = await (0, hubPackagesService_1.listActivePackageBalances)({
                        clinicId: b.clinic_id,
                        guardianId: b.guardian_id,
                    });
                    if ((0, hubPackagesService_1.hasPackageBalanceForServices)(balances, b.guardian_id, b.pet_id ?? null, svcIds)) {
                        return res.status(409).json({
                            error: 'Este pet tem saldo de pacote para o serviço. Use a baixa de pacote em vez de fatura em série, ou cobre por ocorrência.',
                        });
                    }
                }
            }
            const { data: seriesRow, error: serErr } = await supabase_1.supabaseAdmin
                .from('hub_appointment_series')
                .insert({
                clinic_id: b.clinic_id,
                kind: rule.kind,
                interval_value: rule.interval_value ?? 1,
                days_of_week: rule.days_of_week ?? null,
                day_of_month: rule.day_of_month ?? null,
                start_date: b.starts_at.slice(0, 10),
                until_date: rule.until_date ?? null,
                occurrences: rule.occurrences ?? null,
                ...billingFields,
            })
                .select('id')
                .single();
            if (serErr) {
                // Migration 100 ainda não aplicada: cria série sem colunas de billing
                if (String(serErr.message || '').includes('billing_mode')) {
                    const { data: fallback, error: fbErr } = await supabase_1.supabaseAdmin
                        .from('hub_appointment_series')
                        .insert({
                        clinic_id: b.clinic_id,
                        kind: rule.kind,
                        interval_value: rule.interval_value ?? 1,
                        days_of_week: rule.days_of_week ?? null,
                        day_of_month: rule.day_of_month ?? null,
                        start_date: b.starts_at.slice(0, 10),
                        until_date: rule.until_date ?? null,
                        occurrences: rule.occurrences ?? null,
                    })
                        .select('id')
                        .single();
                    if (fbErr)
                        return res.status(500).json({ error: fbErr.message });
                    seriesId = fallback.id;
                }
                else {
                    return res.status(500).json({ error: serErr.message });
                }
            }
            else {
                seriesId = seriesRow.id;
            }
            occurrenceDates = generateOccurrenceDates(b.starts_at.slice(0, 10), rule);
        }
        else {
            occurrenceDates = [b.starts_at.slice(0, 10)];
        }
        const conflicts = [];
        const createdIds = [];
        for (const occDate of occurrenceDates) {
            const startsAt = seriesId ? shiftTimestampToDate(b.starts_at, occDate) : b.starts_at;
            const endsAt = seriesId ? shiftTimestampToDate(b.ends_at, occDate) : b.ends_at;
            const conflictWindows = [];
            if (b.with_pickup_route_before) {
                const pb = b.with_pickup_route_before;
                const pStarts = seriesId ? shiftTimestampToDate(pb.starts_at, occDate) : pb.starts_at;
                const pEnds = seriesId ? shiftTimestampToDate(pb.ends_at, occDate) : pb.ends_at;
                conflictWindows.push({
                    staff: pb.hub_staff_member_id ?? null,
                    resource: pb.resource_label ?? null,
                    starts: pStarts,
                    ends: pEnds,
                    label: 'Busca (Leva e Traz)',
                });
            }
            conflictWindows.push({
                staff: b.hub_staff_member_id ?? null,
                resource: b.resource_label ?? null,
                starts: startsAt,
                ends: endsAt,
                label: standalonePickupMode ? 'Leva e Traz (parada)' : 'Atendimento principal',
            });
            if (standalonePickupMode === 'round_trip' && b.standalone_pickup_return) {
                const rb = b.standalone_pickup_return;
                const rStarts = seriesId ? shiftTimestampToDate(rb.starts_at, occDate) : rb.starts_at;
                const rEnds = seriesId ? shiftTimestampToDate(rb.ends_at, occDate) : rb.ends_at;
                conflictWindows.push({
                    staff: rb.hub_staff_member_id ?? null,
                    resource: rb.resource_label ?? null,
                    starts: rStarts,
                    ends: rEnds,
                    label: 'Retorno (Leva e Traz)',
                });
            }
            for (const block of b.extra_blocks ?? []) {
                const bStarts = seriesId ? shiftTimestampToDate(block.starts_at, occDate) : block.starts_at;
                const bEnds = seriesId ? shiftTimestampToDate(block.ends_at, occDate) : block.ends_at;
                conflictWindows.push({
                    staff: block.hub_staff_member_id ?? null,
                    resource: block.resource_label ?? null,
                    starts: bStarts,
                    ends: bEnds,
                    label: 'Bloco extra',
                });
            }
            if (b.with_pickup_route_after) {
                const pa = b.with_pickup_route_after;
                const pStarts = seriesId ? shiftTimestampToDate(pa.starts_at, occDate) : pa.starts_at;
                const pEnds = seriesId ? shiftTimestampToDate(pa.ends_at, occDate) : pa.ends_at;
                conflictWindows.push({
                    staff: pa.hub_staff_member_id ?? null,
                    resource: pa.resource_label ?? null,
                    starts: pStarts,
                    ends: pEnds,
                    label: 'Retorno (Leva e Traz)',
                });
            }
            let skipOcc = false;
            if (!skipScheduleConflictCheck) {
                for (const w of conflictWindows) {
                    const chk = await assertNoScheduleConflict(b.clinic_id, [], w.staff, w.resource, resolvedUnitId, w.starts, w.ends);
                    if (chk.conflict) {
                        conflicts.push({
                            date: occDate,
                            reason: `${w.label}: ${chk.reason}`,
                            conflictingId: chk.conflictingId,
                        });
                        skipOcc = true;
                        break;
                    }
                }
            }
            if (skipOcc)
                continue;
            const insert = {
                clinic_id: b.clinic_id,
                unit_id: careResolved.value.unit_id,
                care_location_kind: careResolved.value.care_location_kind,
                hub_partner_clinic_id: careResolved.value.hub_partner_clinic_id,
                hub_service_type_id: b.hub_service_type_id,
                hub_staff_member_id: b.hub_staff_member_id ?? null,
                pet_id: b.pet_id ?? null,
                guardian_id: b.guardian_id ?? null,
                starts_at: startsAt,
                ends_at: endsAt,
                status: b.status ?? 'confirmed',
                resource_label: b.resource_label ?? null,
                notes: b.notes ?? null,
                appointment_kind: resolvedAppointmentKind,
                title: b.title ?? null,
                description: b.description ?? null,
                financial_notes: b.financial_notes ?? null,
                series_id: seriesId,
                series_occurrence_date: seriesId ? occDate : null,
                pricing_porte_tier: apptOverride,
                pricing_coat_type: apptCoatOverride,
                intake_hub_case_id: b.intake_hub_case_id ?? null,
                intake_create_new_case: b.intake_create_new_case === true ? true : null,
                intake_new_case_title: b.intake_new_case_title ?? null,
                visit_group_id: seriesId && b.visit_group_id
                    ? visitGroupIdForOccurrence(b.visit_group_id, occDate)
                    : b.visit_group_id ?? null,
            };
            const { data: apptRow, error: apptErr } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .insert(insert)
                .select('id')
                .single();
            if (apptErr)
                return res.status(500).json({ error: apptErr.message });
            const apptId = apptRow.id;
            createdIds.push(apptId);
            const ymd = startsAt.slice(0, 10);
            const standaloneLegAmounts = standalonePricingBase
                ? (0, hubPickupPricing_1.resolvePickupLegAmounts)(standalonePricingBase.catalogSale, standalonePricingBase.catalogCost, standalonePricingBase.priceScope, standalonePricingBase.legCount)
                : null;
            let snapRows;
            try {
                const linesForSnap = standaloneLegAmounts && standalonePricingBase
                    ? normLines.map((l, i) => i === 0
                        ? {
                            ...l,
                            pricing_variant: standalonePricingBase.kmVariant ?? l.pricing_variant,
                            sale_amount_override: standaloneLegAmounts.saleLegs[0] ?? 0,
                            cost_amount_override: standaloneLegAmounts.costLegs[0] ?? 0,
                        }
                        : l)
                    : normLines;
                snapRows = buildServiceLineSnapshots({
                    lines: linesForSnap,
                    stMap,
                    pet,
                    appointmentYmd: ymd,
                    puppyMaxMonths: puppy.pet_puppy_max_months,
                    appointmentOverride: apptOverride,
                    appointmentCoatOverride: apptCoatOverride,
                    specialByServiceId,
                });
            }
            catch (e) {
                return res.status(500).json({ error: e.message });
            }
            const svcInsert = appointmentServiceInsertRows(apptId, snapRows);
            const { error: svcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert(svcInsert);
            if (svcErr)
                return res.status(500).json({ error: svcErr.message });
            const ltCfg = b.pickup_route_pricing;
            const hasBefore = Boolean(b.with_pickup_route_before);
            const hasAfter = Boolean(b.with_pickup_route_after);
            const attachedLegCount = hasBefore && hasAfter ? 2 : 1;
            const attachedAmounts = pickupPricingBase
                ? (0, hubPickupPricing_1.resolvePickupLegAmounts)(pickupPricingBase.catalogSale, pickupPricingBase.catalogCost, pickupPricingBase.priceScope, attachedLegCount)
                : null;
            let saleBeforeLeg = 0;
            let saleAfterLeg = 0;
            let costBeforeLeg = 0;
            let costAfterLeg = 0;
            if (attachedAmounts) {
                if (hasBefore && hasAfter) {
                    saleBeforeLeg = attachedAmounts.saleLegs[0] ?? 0;
                    saleAfterLeg = attachedAmounts.saleLegs[1] ?? 0;
                    costBeforeLeg = attachedAmounts.costLegs[0] ?? 0;
                    costAfterLeg = attachedAmounts.costLegs[1] ?? 0;
                }
                else if (hasBefore) {
                    saleBeforeLeg = attachedAmounts.saleLegs[0] ?? 0;
                    costBeforeLeg = attachedAmounts.costLegs[0] ?? 0;
                }
                else if (hasAfter) {
                    saleAfterLeg = attachedAmounts.saleLegs[0] ?? 0;
                    costAfterLeg = attachedAmounts.costLegs[0] ?? 0;
                }
            }
            for (const [_kind, pickupBlock, saleLeg, costLeg] of [
                ['before', b.with_pickup_route_before, saleBeforeLeg, costBeforeLeg],
                ['after', b.with_pickup_route_after, saleAfterLeg, costAfterLeg],
            ]) {
                if (!pickupBlock || !ltCfg || !pickupPricingBase)
                    continue;
                const pStarts = seriesId ? shiftTimestampToDate(pickupBlock.starts_at, occDate) : pickupBlock.starts_at;
                const pEnds = seriesId ? shiftTimestampToDate(pickupBlock.ends_at, occDate) : pickupBlock.ends_at;
                const legDur = pickupLegMinutes(pStarts, pEnds);
                const { data: pRow, error: pInsErr } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .insert({
                    clinic_id: b.clinic_id,
                    unit_id: resolvedUnitId,
                    hub_service_type_id: ltCfg.hub_service_type_id,
                    hub_staff_member_id: pickupBlock.hub_staff_member_id ?? null,
                    pet_id: b.pet_id ?? null,
                    guardian_id: b.guardian_id ?? null,
                    starts_at: pStarts,
                    ends_at: pEnds,
                    status: b.status ?? 'confirmed',
                    resource_label: pickupBlock.resource_label ?? null,
                    appointment_kind: 'pickup_route',
                    parent_appointment_id: apptId,
                    series_id: seriesId,
                    series_occurrence_date: seriesId ? occDate : null,
                    pricing_porte_tier: apptOverride,
                    pricing_coat_type: apptCoatOverride,
                })
                    .select('id')
                    .single();
                if (pInsErr || !pRow)
                    return res.status(500).json({ error: pInsErr?.message || 'Erro ao criar transporte' });
                const pickupApptId = pRow.id;
                let pickupSnaps;
                try {
                    pickupSnaps = buildServiceLineSnapshots({
                        lines: [
                            {
                                hub_service_type_id: ltCfg.hub_service_type_id,
                                duration_minutes: legDur,
                                pricing_variant: pickupPricingBase.kmVariant,
                                sale_amount_override: saleLeg,
                                cost_amount_override: costLeg,
                            },
                        ],
                        stMap,
                        pet,
                        appointmentYmd: ymd,
                        puppyMaxMonths: puppy.pet_puppy_max_months,
                        appointmentOverride: apptOverride,
                        appointmentCoatOverride: apptCoatOverride,
                    });
                }
                catch (e) {
                    return res.status(500).json({ error: e.message });
                }
                const pickupSvcInsert = pickupSnaps.map((row) => ({
                    appointment_id: pickupApptId,
                    hub_service_type_id: row.hub_service_type_id,
                    duration_minutes: row.duration_minutes,
                    order_index: row.order_index,
                    pricing_porte_tier_applied: row.pricing_porte_tier_applied,
                    pricing_coat_type_applied: row.pricing_coat_type_applied,
                    cost_amount_applied: row.cost_amount_applied,
                    sale_amount_applied: row.sale_amount_applied,
                    pricing_variant: row.pricing_variant,
                }));
                const { error: pSvcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert(pickupSvcInsert);
                if (pSvcErr)
                    return res.status(500).json({ error: pSvcErr.message });
            }
            if (standalonePickupMode === 'round_trip' &&
                b.standalone_pickup_return &&
                standalonePricingBase &&
                standaloneLegAmounts) {
                const rb = b.standalone_pickup_return;
                const rStarts = seriesId ? shiftTimestampToDate(rb.starts_at, occDate) : rb.starts_at;
                const rEnds = seriesId ? shiftTimestampToDate(rb.ends_at, occDate) : rb.ends_at;
                const legDur = pickupLegMinutes(rStarts, rEnds);
                const saleLeg = standaloneLegAmounts.saleLegs[1] ?? standaloneLegAmounts.saleLegs[0] ?? 0;
                const costLeg = standaloneLegAmounts.costLegs[1] ?? standaloneLegAmounts.costLegs[0] ?? 0;
                const { data: rRow, error: rInsErr } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .insert({
                    clinic_id: b.clinic_id,
                    unit_id: resolvedUnitId,
                    hub_service_type_id: b.hub_service_type_id,
                    hub_staff_member_id: rb.hub_staff_member_id ?? b.hub_staff_member_id ?? null,
                    pet_id: b.pet_id ?? null,
                    guardian_id: b.guardian_id ?? null,
                    starts_at: rStarts,
                    ends_at: rEnds,
                    status: b.status ?? 'confirmed',
                    resource_label: rb.resource_label ?? b.resource_label ?? null,
                    appointment_kind: 'pickup_route',
                    parent_appointment_id: apptId,
                    series_id: seriesId,
                    series_occurrence_date: seriesId ? occDate : null,
                    pricing_porte_tier: apptOverride,
                    pricing_coat_type: apptCoatOverride,
                    title: b.title ?? null,
                })
                    .select('id')
                    .single();
                if (rInsErr || !rRow) {
                    return res.status(500).json({ error: rInsErr?.message || 'Erro ao criar retorno Leva e Traz' });
                }
                const returnApptId = rRow.id;
                createdIds.push(returnApptId);
                let returnSnaps;
                try {
                    returnSnaps = buildServiceLineSnapshots({
                        lines: [
                            {
                                hub_service_type_id: b.hub_service_type_id,
                                duration_minutes: legDur,
                                pricing_variant: standalonePricingBase.kmVariant,
                                sale_amount_override: saleLeg,
                                cost_amount_override: costLeg,
                            },
                        ],
                        stMap,
                        pet,
                        appointmentYmd: ymd,
                        puppyMaxMonths: puppy.pet_puppy_max_months,
                        appointmentOverride: apptOverride,
                        appointmentCoatOverride: apptCoatOverride,
                    });
                }
                catch (e) {
                    return res.status(500).json({ error: e.message });
                }
                const returnSvcInsert = returnSnaps.map((row) => ({
                    appointment_id: returnApptId,
                    hub_service_type_id: row.hub_service_type_id,
                    duration_minutes: row.duration_minutes,
                    order_index: row.order_index,
                    pricing_porte_tier_applied: row.pricing_porte_tier_applied,
                    pricing_coat_type_applied: row.pricing_coat_type_applied,
                    cost_amount_applied: row.cost_amount_applied,
                    sale_amount_applied: row.sale_amount_applied,
                    pricing_variant: row.pricing_variant,
                }));
                const { error: rSvcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert(returnSvcInsert);
                if (rSvcErr)
                    return res.status(500).json({ error: rSvcErr.message });
            }
            for (const block of b.extra_blocks ?? []) {
                const bStarts = seriesId ? shiftTimestampToDate(block.starts_at, occDate) : block.starts_at;
                const bEnds = seriesId ? shiftTimestampToDate(block.ends_at, occDate) : block.ends_at;
                const firstSvcType = block.services[0].hub_service_type_id;
                const { data: blockRow, error: blockErr } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .insert({
                    clinic_id: b.clinic_id,
                    unit_id: resolvedUnitId,
                    hub_service_type_id: firstSvcType,
                    hub_staff_member_id: block.hub_staff_member_id ?? null,
                    pet_id: b.pet_id ?? null,
                    guardian_id: b.guardian_id ?? null,
                    starts_at: bStarts,
                    ends_at: bEnds,
                    status: block.status ?? b.status ?? 'confirmed',
                    resource_label: block.resource_label ?? null,
                    notes: block.notes ?? null,
                    title: block.title ?? null,
                    appointment_kind: 'standard',
                    series_id: seriesId,
                    series_occurrence_date: seriesId ? occDate : null,
                    pricing_porte_tier: apptOverride,
                    pricing_coat_type: apptCoatOverride,
                    parent_appointment_id: apptId,
                })
                    .select('id')
                    .single();
                if (blockErr)
                    return res.status(500).json({ error: blockErr.message });
                const blockId = blockRow.id;
                const blockNormLines = block.services.map((s) => ({
                    hub_service_type_id: s.hub_service_type_id,
                    duration_minutes: s.duration_minutes,
                    pricing_porte_tier: s.pricing_porte_tier ?? null,
                    pricing_coat_type: s.pricing_coat_type ?? null,
                    pricing_variant: s.pricing_variant ?? null,
                }));
                const blockYmd = bStarts.slice(0, 10);
                let blockSnaps;
                try {
                    blockSnaps = buildServiceLineSnapshots({
                        lines: blockNormLines,
                        stMap,
                        pet,
                        appointmentYmd: blockYmd,
                        puppyMaxMonths: puppy.pet_puppy_max_months,
                        appointmentOverride: apptOverride,
                        appointmentCoatOverride: apptCoatOverride,
                    });
                }
                catch (e) {
                    return res.status(500).json({ error: e.message });
                }
                const blockSvcInsert = blockSnaps.map((row) => ({
                    appointment_id: blockId,
                    hub_service_type_id: row.hub_service_type_id,
                    duration_minutes: row.duration_minutes,
                    order_index: row.order_index,
                    pricing_porte_tier_applied: row.pricing_porte_tier_applied,
                    pricing_coat_type_applied: row.pricing_coat_type_applied,
                    cost_amount_applied: row.cost_amount_applied,
                    sale_amount_applied: row.sale_amount_applied,
                    pricing_variant: row.pricing_variant,
                }));
                const { error: bSvcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert(blockSvcInsert);
                if (bSvcErr)
                    return res.status(500).json({ error: bSvcErr.message });
            }
        }
        if (conflicts.length > 0 && createdIds.length === 0) {
            return res.status(409).json({
                error: 'Todos os horários solicitados entram em conflito.',
                conflicts,
            });
        }
        // Fetch and return the main appointment (first created)
        if (createdIds.length === 0) {
            return res.status(409).json({ error: 'Nenhum agendamento criado (conflitos em todas as datas).', conflicts });
        }
        const { data: mainAppt } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('*')
            .eq('id', createdIds[0])
            .single();
        const [enriched] = await enrichAppointments([mainAppt]);
        return res.status(201).json({
            appointment: enriched,
            created_count: createdIds.length,
            conflict_count: conflicts.length,
            conflicts: conflicts.length > 0 ? conflicts : undefined,
        });
    }
    catch (e) {
        console.error('createHubAppointment', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar agendamento' });
    }
};
exports.createHubAppointment = createHubAppointment;
const patchHubAppointment = async (req, res) => {
    try {
        const id = req.params.id;
        if (!zod_1.z.string().uuid().safeParse(id).success) {
            return res.status(400).json({ error: 'ID inválido' });
        }
        const scope = req.query.scope ?? 'this';
        if (!['this', 'future', 'all'].includes(scope)) {
            return res.status(400).json({ error: 'scope deve ser this, future ou all' });
        }
        const parsed = patchAppointmentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const b = parsed.data;
        if (b.extra_blocks !== undefined && scope !== 'this') {
            return res.status(400).json({
                error: 'Blocos adicionais só podem ser alterados nesta ocorrência (escopo «somente este»).',
            });
        }
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('*')
            .eq('id', id)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr)
            return res.status(500).json({ error: exErr.message });
        if (!existing)
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        if (isStructuralAppointmentPatch(b) && !isAppointmentStructurallyEditable(existing)) {
            return res.status(409).json({
                error: 'Agendamento não pode ser editado após iniciado ou após o horário agendado.',
            });
        }
        // soft-delete scoped
        if (b.deleted === true) {
            const now = new Date().toISOString();
            if (scope === 'this') {
                await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ deleted_at: now })
                    .eq('id', id)
                    .eq('clinic_id', b.clinic_id);
            }
            else if (scope === 'future' && existing.series_id) {
                await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ deleted_at: now })
                    .eq('clinic_id', b.clinic_id)
                    .eq('series_id', existing.series_id)
                    .gte('starts_at', existing.starts_at)
                    .is('deleted_at', null);
            }
            else if (scope === 'all' && existing.series_id) {
                await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ deleted_at: now })
                    .eq('clinic_id', b.clinic_id)
                    .eq('series_id', existing.series_id)
                    .is('deleted_at', null);
            }
            else {
                await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ deleted_at: now })
                    .eq('id', id)
                    .eq('clinic_id', b.clinic_id);
            }
            return res.status(204).send();
        }
        const starts = b.starts_at ?? existing.starts_at;
        const ends = b.ends_at ?? existing.ends_at;
        if (new Date(ends) <= new Date(starts)) {
            return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
        }
        const nextStaff = b.hub_staff_member_id !== undefined ? b.hub_staff_member_id : existing.hub_staff_member_id;
        const nextResource = b.resource_label !== undefined ? b.resource_label : existing.resource_label;
        const nextUnit = b.unit_id !== undefined ? b.unit_id : existing.unit_id;
        if (b.hub_service_type_id && !(await assertServiceTypeInClinic(b.clinic_id, b.hub_service_type_id))) {
            return res.status(400).json({ error: 'Tipo de serviço inválido' });
        }
        if (b.hub_staff_member_id !== undefined && !(await assertStaffInClinicOptional(b.clinic_id, b.hub_staff_member_id))) {
            return res.status(400).json({ error: 'Profissional inválido' });
        }
        if (b.pet_id !== undefined && !(await assertPetInClinic(b.clinic_id, b.pet_id))) {
            return res.status(400).json({ error: 'Pet inválido' });
        }
        if (b.guardian_id !== undefined && !(await assertGuardianInClinic(b.clinic_id, b.guardian_id))) {
            return res.status(400).json({ error: 'Tutor inválido' });
        }
        if (b.unit_id !== undefined && !(await assertUnitInClinic(b.clinic_id, b.unit_id))) {
            return res.status(400).json({ error: 'Unidade inválida' });
        }
        const nextCareKind = b.care_location_kind ??
            existing.care_location_kind ??
            'own_unit';
        const nextPartnerId = b.hub_partner_clinic_id !== undefined
            ? b.hub_partner_clinic_id
            : (existing.hub_partner_clinic_id ?? null);
        const careResolved = await (0, hubCareLocation_1.resolveCareLocation)({
            clinicId: b.clinic_id,
            care_location_kind: nextCareKind,
            hub_partner_clinic_id: nextPartnerId,
            unit_id: nextUnit,
            existing: {
                care_location_kind: existing.care_location_kind ?? 'own_unit',
                hub_partner_clinic_id: existing.hub_partner_clinic_id ?? null,
            },
            allowNullUnit: nextCareKind === 'partner_clinic',
            requireActivePartner: b.hub_partner_clinic_id !== undefined || b.care_location_kind === 'partner_clinic',
        });
        if (!careResolved.ok) {
            return res.status(400).json({ error: careResolved.error });
        }
        const check = await assertNoScheduleConflict(b.clinic_id, [id], nextStaff, nextResource, careResolved.value.unit_id, starts, ends);
        if (check.conflict) {
            return res.status(409).json({ error: check.reason });
        }
        const patch = {};
        if (b.unit_id !== undefined || b.care_location_kind !== undefined || b.hub_partner_clinic_id !== undefined) {
            patch.unit_id = careResolved.value.unit_id;
            patch.care_location_kind = careResolved.value.care_location_kind;
            patch.hub_partner_clinic_id = careResolved.value.hub_partner_clinic_id;
        }
        if (b.hub_service_type_id !== undefined)
            patch.hub_service_type_id = b.hub_service_type_id;
        if (b.hub_staff_member_id !== undefined)
            patch.hub_staff_member_id = b.hub_staff_member_id;
        if (b.pet_id !== undefined)
            patch.pet_id = b.pet_id;
        if (b.guardian_id !== undefined)
            patch.guardian_id = b.guardian_id;
        if (b.starts_at !== undefined)
            patch.starts_at = b.starts_at;
        if (b.ends_at !== undefined)
            patch.ends_at = b.ends_at;
        if (b.status !== undefined)
            patch.status = b.status;
        if (b.resource_label !== undefined)
            patch.resource_label = b.resource_label;
        if (b.notes !== undefined)
            patch.notes = b.notes;
        if (b.financial_notes !== undefined)
            patch.financial_notes = b.financial_notes;
        if (b.appointment_kind !== undefined)
            patch.appointment_kind = b.appointment_kind;
        if (b.title !== undefined)
            patch.title = b.title;
        if (b.description !== undefined)
            patch.description = b.description;
        if (b.pricing_porte_tier !== undefined)
            patch.pricing_porte_tier = b.pricing_porte_tier;
        if (b.pricing_coat_type !== undefined)
            patch.pricing_coat_type = b.pricing_coat_type;
        if (b.intake_hub_case_id !== undefined)
            patch.intake_hub_case_id = b.intake_hub_case_id;
        if (b.intake_create_new_case !== undefined)
            patch.intake_create_new_case = b.intake_create_new_case;
        if (b.intake_new_case_title !== undefined)
            patch.intake_new_case_title = b.intake_new_case_title;
        if (b.services && b.services.length > 0) {
            patch.hub_service_type_id = b.services[0].hub_service_type_id;
        }
        if (Object.keys(patch).length === 0 && !b.services && b.extra_blocks === undefined) {
            return res.status(400).json({ error: 'Nada para atualizar' });
        }
        // determine IDs to update based on scope
        let targetIds = [id];
        const seriesId = existing.series_id;
        if (seriesId && scope !== 'this') {
            let q = supabase_1.supabaseAdmin
                .from('hub_appointments')
                .select('id, starts_at')
                .eq('clinic_id', b.clinic_id)
                .eq('series_id', seriesId)
                .is('deleted_at', null);
            if (scope === 'future') {
                q = q.gte('starts_at', existing.starts_at);
            }
            const { data: seriesRows } = await q;
            targetIds = (seriesRows ?? []).map((r) => r.id);
        }
        let patchServicePayload = null;
        if (b.services && b.services.length > 0) {
            const normPatchLines = b.services.map((s) => ({
                hub_service_type_id: s.hub_service_type_id,
                duration_minutes: s.duration_minutes,
                pricing_porte_tier: s.pricing_porte_tier ?? null,
                pricing_coat_type: s.pricing_coat_type ?? null,
                pricing_variant: s.pricing_variant ?? null,
            }));
            const svcIds = [...new Set(normPatchLines.map((l) => l.hub_service_type_id))];
            let stMap;
            try {
                stMap = await fetchServiceTypesMap(b.clinic_id, svcIds);
            }
            catch (e) {
                return res.status(500).json({ error: e.message });
            }
            for (const sid of svcIds) {
                if (!stMap.has(sid)) {
                    return res.status(400).json({ error: `Tipo de serviço inválido: ${sid}` });
                }
            }
            const mergedPricing = b.pricing_porte_tier !== undefined
                ? b.pricing_porte_tier
                : existing.pricing_porte_tier ?? null;
            const mergedCoatPricing = b.pricing_coat_type !== undefined
                ? b.pricing_coat_type
                : existing.pricing_coat_type ?? null;
            const mergedPetId = b.pet_id !== undefined ? b.pet_id : existing.pet_id ?? null;
            const pet = await fetchPetPricingFields(b.clinic_id, mergedPetId);
            const valErr = validatePricingPorteInputs({
                appointmentOverride: mergedPricing,
                appointmentCoatOverride: mergedCoatPricing,
                pet,
                lines: normPatchLines,
                stMap,
            });
            if (valErr.error) {
                return res.status(400).json({ error: valErr.error });
            }
            patchServicePayload = { normLines: normPatchLines, stMap };
        }
        else if (b.pet_id !== undefined ||
            b.starts_at !== undefined ||
            b.pricing_porte_tier !== undefined ||
            b.pricing_coat_type !== undefined) {
            const { data: existingLines, error: existingLinesErr } = await supabase_1.supabaseAdmin
                .from('hub_appointment_services')
                .select('hub_service_type_id')
                .eq('appointment_id', id);
            if (existingLinesErr)
                return res.status(500).json({ error: existingLinesErr.message });
            const lineIds = [...new Set((existingLines ?? []).map((l) => l.hub_service_type_id))];
            const stMap = await fetchServiceTypesMap(b.clinic_id, lineIds);
            const mergedPricing = b.pricing_porte_tier !== undefined
                ? b.pricing_porte_tier
                : existing.pricing_porte_tier ?? null;
            const mergedCoatPricing = b.pricing_coat_type !== undefined
                ? b.pricing_coat_type
                : existing.pricing_coat_type ?? null;
            const mergedPetId = b.pet_id !== undefined ? b.pet_id : existing.pet_id ?? null;
            const pet = await fetchPetPricingFields(b.clinic_id, mergedPetId);
            const valErr = validatePricingPorteInputs({
                appointmentOverride: mergedPricing,
                appointmentCoatOverride: mergedCoatPricing,
                pet,
                lines: lineIds.map((hub_service_type_id) => ({ hub_service_type_id })),
                stMap,
            });
            if (valErr.error) {
                return res.status(400).json({ error: valErr.error });
            }
        }
        for (const tid of targetIds) {
            if (Object.keys(patch).length > 0) {
                const { error: pErr } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update(patch)
                    .eq('id', tid)
                    .eq('clinic_id', b.clinic_id);
                if (pErr)
                    return res.status(500).json({ error: pErr.message });
            }
            if (patchServicePayload) {
                await supabase_1.supabaseAdmin.from('hub_appointment_services').delete().eq('appointment_id', tid);
                const { data: apRow, error: apErr } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .select('pet_id, starts_at, pricing_porte_tier, pricing_coat_type')
                    .eq('id', tid)
                    .single();
                if (apErr || !apRow)
                    return res.status(500).json({ error: apErr?.message || 'Erro ao recarregar agendamento' });
                const ar = apRow;
                const pet = await fetchPetPricingFields(b.clinic_id, ar.pet_id);
                const puppy = await (0, hubClinicSettingsController_1.getOrCreateHubClinicSettings)(b.clinic_id);
                let snaps;
                try {
                    snaps = buildServiceLineSnapshots({
                        lines: patchServicePayload.normLines,
                        stMap: patchServicePayload.stMap,
                        pet,
                        appointmentYmd: ar.starts_at.slice(0, 10),
                        puppyMaxMonths: puppy.pet_puppy_max_months,
                        appointmentOverride: ar.pricing_porte_tier ?? null,
                        appointmentCoatOverride: ar.pricing_coat_type ?? null,
                    });
                }
                catch (e) {
                    return res.status(500).json({ error: e.message });
                }
                const svcInsert = snaps.map((row) => ({
                    appointment_id: tid,
                    hub_service_type_id: row.hub_service_type_id,
                    duration_minutes: row.duration_minutes,
                    order_index: row.order_index,
                    pricing_porte_tier_applied: row.pricing_porte_tier_applied,
                    pricing_coat_type_applied: row.pricing_coat_type_applied,
                    cost_amount_applied: row.cost_amount_applied,
                    sale_amount_applied: row.sale_amount_applied,
                    pricing_variant: row.pricing_variant,
                }));
                const { error: svcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert(svcInsert);
                if (svcErr)
                    return res.status(500).json({ error: svcErr.message });
            }
            else if (b.pet_id !== undefined ||
                b.starts_at !== undefined ||
                b.pricing_porte_tier !== undefined ||
                b.pricing_coat_type !== undefined) {
                const { data: apRow } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .select('pet_id, starts_at, pricing_porte_tier, pricing_coat_type')
                    .eq('id', tid)
                    .single();
                if (apRow) {
                    const ar = apRow;
                    await refreshSnapshotsForAppointment(b.clinic_id, tid, ar.starts_at, ar.pet_id, ar.pricing_porte_tier ?? null, ar.pricing_coat_type ?? null);
                }
            }
        }
        if (patch.status === 'cancelled') {
            for (const tid of targetIds) {
                void (0, hubComandasController_1.maybeFlagComandaCancellationPending)(b.clinic_id, 'appointment', tid);
            }
        }
        if (b.status === 'done' || b.status === 'paid') {
            for (const tid of targetIds) {
                void (0, hubComandasController_1.syncOpenComandasAfterAppointmentOperationalComplete)(b.clinic_id, tid);
            }
        }
        if (b.extra_blocks !== undefined) {
            const { data: parentAfterPatch } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .select('*')
                .eq('id', id)
                .eq('clinic_id', b.clinic_id)
                .single();
            if (!parentAfterPatch) {
                return res.status(500).json({ error: 'Erro ao recarregar agendamento principal' });
            }
            const syncResult = await syncExtraBlocksForParent(b.clinic_id, id, parentAfterPatch, b.extra_blocks, [id, ...targetIds]);
            if (syncResult.error) {
                return res.status(syncResult.status ?? 500).json({ error: syncResult.error });
            }
        }
        const { data: updated } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('*')
            .eq('id', id)
            .single();
        const [enriched] = await enrichAppointments([updated]);
        return res.json({ appointment: enriched, updated_count: targetIds.length });
    }
    catch (e) {
        console.error('patchHubAppointment', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar agendamento' });
    }
};
exports.patchHubAppointment = patchHubAppointment;
// ── Calendar blocks ───────────────────────────────────────────────────────────
const listBlocksQuery = zod_1.z.object({
    clinic_id: uuidStr,
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const listHubAgendaCalendarBlocks = async (req, res) => {
    try {
        const parsed = listBlocksQuery.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, from, to } = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_agenda_calendar_blocks')
            .select('*')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .gte('block_date', from)
            .lte('block_date', to)
            .order('block_date');
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ blocks: data ?? [] });
    }
    catch (e) {
        console.error('listHubAgendaCalendarBlocks', e);
        return res.status(500).json({ error: e?.message || 'Erro ao listar bloqueios' });
    }
};
exports.listHubAgendaCalendarBlocks = listHubAgendaCalendarBlocks;
const upsertBlockSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    block_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    label: zod_1.z.string().trim().min(1).max(200),
    kind: zod_1.z.enum(['holiday', 'closure', 'reduced_staff', 'other']).optional(),
})
    .strict();
const upsertHubAgendaCalendarBlock = async (req, res) => {
    try {
        const parsed = upsertBlockSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const row = {
            clinic_id: b.clinic_id,
            block_date: b.block_date,
            label: b.label,
            kind: b.kind ?? 'closure',
        };
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_agenda_calendar_blocks')
            .select('id')
            .eq('clinic_id', b.clinic_id)
            .eq('block_date', b.block_date)
            .is('deleted_at', null)
            .maybeSingle();
        if (existing?.id) {
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_agenda_calendar_blocks')
                .update({ label: row.label, kind: row.kind, deleted_at: null })
                .eq('id', existing.id)
                .select('*')
                .single();
            if (error)
                return res.status(500).json({ error: error.message });
            return res.json({ block: data });
        }
        const { data, error } = await supabase_1.supabaseAdmin.from('hub_agenda_calendar_blocks').insert(row).select('*').single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(201).json({ block: data });
    }
    catch (e) {
        console.error('upsertHubAgendaCalendarBlock', e);
        return res.status(500).json({ error: e?.message || 'Erro ao gravar bloqueio' });
    }
};
exports.upsertHubAgendaCalendarBlock = upsertHubAgendaCalendarBlock;
const deleteHubAgendaCalendarBlock = async (req, res) => {
    try {
        const id = req.params.id;
        if (!zod_1.z.string().uuid().safeParse(id).success)
            return res.status(400).json({ error: 'ID inválido' });
        const clinic_id = zod_1.z.string().uuid().safeParse(req.query.clinic_id);
        if (!clinic_id.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_agenda_calendar_blocks')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('clinic_id', clinic_id.data);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(204).send();
    }
    catch (e) {
        console.error('deleteHubAgendaCalendarBlock', e);
        return res.status(500).json({ error: e?.message || 'Erro ao remover bloqueio' });
    }
};
exports.deleteHubAgendaCalendarBlock = deleteHubAgendaCalendarBlock;
async function assertPetBelongsToGuardian(clinicId, petId, guardianId) {
    const { data: pet } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('id')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (!pet)
        return false;
    const { data: link } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('id')
        .eq('pet_id', petId)
        .eq('guardian_id', guardianId)
        .maybeSingle();
    return Boolean(link);
}
/** POST /api/hub/appointments/batch — N agendamentos (1 por pet) com visit_group_id. */
const createHubAppointmentBatch = async (req, res) => {
    try {
        const parsed = createAppointmentBatchSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const { clinic_id, visit_group_id: inputVisitGroupId, shared, pets } = parsed.data;
        if (new Date(shared.ends_at) <= new Date(shared.starts_at)) {
            return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
        }
        if (!shared.guardian_id) {
            return res.status(400).json({ error: 'Informe o tutor (guardian_id).' });
        }
        const guardianId = shared.guardian_id;
        for (const p of pets) {
            if (!(await assertPetBelongsToGuardian(clinic_id, p.pet_id, guardianId))) {
                return res.status(400).json({ error: `Pet ${p.pet_id} não pertence ao tutor informado.` });
            }
        }
        const visitGroupId = inputVisitGroupId ?? (0, crypto_1.randomUUID)();
        const createdIds = [];
        const rollbackCreated = async () => {
            if (createdIds.length === 0)
                return;
            const now = new Date().toISOString();
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ deleted_at: now })
                .in('id', createdIds)
                .eq('clinic_id', clinic_id);
        };
        try {
            for (const petEntry of pets) {
                const petServices = petEntry.services ?? shared.services;
                const body = {
                    ...shared,
                    pet_id: petEntry.pet_id,
                    starts_at: petEntry.starts_at ?? shared.starts_at,
                    ends_at: petEntry.ends_at ?? shared.ends_at,
                    hub_staff_member_id: petEntry.hub_staff_member_id !== undefined
                        ? petEntry.hub_staff_member_id ?? null
                        : shared.hub_staff_member_id ?? null,
                    resource_label: petEntry.resource_label ?? shared.resource_label,
                    pricing_porte_tier: petEntry.pricing_porte_tier ?? shared.pricing_porte_tier ?? null,
                    pricing_coat_type: petEntry.pricing_coat_type ?? shared.pricing_coat_type ?? null,
                    services: petServices,
                    extra_blocks: petEntry.extra_blocks ?? [],
                    allow_schedule_overlap: true,
                    visit_group_id: visitGroupId,
                };
                const fakeReq = { body, user: req.user };
                let statusCode = 201;
                let responseBody = {};
                const fakeRes = {
                    status(code) {
                        statusCode = code;
                        return fakeRes;
                    },
                    json(data) {
                        responseBody = data;
                        return fakeRes;
                    },
                };
                await (0, exports.createHubAppointment)(fakeReq, fakeRes);
                if (statusCode >= 400) {
                    await rollbackCreated();
                    return res.status(statusCode).json(responseBody);
                }
                const appt = responseBody.appointment;
                if (appt?.id)
                    createdIds.push(appt.id);
            }
        }
        catch (e) {
            await rollbackCreated();
            throw e;
        }
        const enriched = await Promise.all(createdIds.map(async (id) => {
            const { data } = await supabase_1.supabaseAdmin.from('hub_appointments').select('*').eq('id', id).single();
            return data;
        }));
        const appointments = await enrichAppointments(enriched.filter(Boolean));
        return res.status(201).json({
            visit_group_id: visitGroupId,
            appointments,
            created_count: appointments.length,
        });
    }
    catch (e) {
        console.error('createHubAppointmentBatch', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar agendamentos em lote' });
    }
};
exports.createHubAppointmentBatch = createHubAppointmentBatch;
