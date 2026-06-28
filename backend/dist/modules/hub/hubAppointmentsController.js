"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHubAgendaCalendarBlock = exports.upsertHubAgendaCalendarBlock = exports.listHubAgendaCalendarBlocks = exports.patchHubAppointment = exports.createHubAppointment = exports.getHubAppointmentsStatsByServiceGroup = exports.listHubAppointments = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubServiceGroupsController_1 = require("./hubServiceGroupsController");
const hubClinicSettingsController_1 = require("./hubClinicSettingsController");
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
const hubPricingResolve_1 = require("./hubPricingResolve");
const hubComandasController_1 = require("./hubComandasController");
/** Reparte um total comercial (ex.: ida+volta L&T) em duas linhas contábeis com soma exacta. */
function splitMoneyTotalAcrossTwoLegs(total) {
    const a = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(total / 2);
    const b = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(total - a);
    return [a, b];
}
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
]);
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
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, service_group, pricing_matrix, cost_amount, sale_amount')
        .eq('clinic_id', clinicId)
        .in('id', uniq)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    const m = new Map();
    for (const row of data ?? []) {
        const r = row;
        m.set(String(r.id), {
            id: String(r.id),
            service_group: String(r.service_group ?? ''),
            pricing_matrix: r.pricing_matrix,
            cost_amount: Number(r.cost_amount) || 0,
            sale_amount: Number(r.sale_amount) || 0,
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
    const { lines, stMap, pet, appointmentYmd, puppyMaxMonths, appointmentOverride, appointmentCoatOverride } = params;
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
        const sale = line.sale_amount_override != null && Number.isFinite(line.sale_amount_override)
            ? (0, hubServiceTypesPricingMatrix_1.roundMoney2)(line.sale_amount_override)
            : r.sale;
        const cost = line.cost_amount_override != null && Number.isFinite(line.cost_amount_override)
            ? (0, hubServiceTypesPricingMatrix_1.roundMoney2)(line.cost_amount_override)
            : r.cost;
        return {
            hub_service_type_id: line.hub_service_type_id,
            duration_minutes: line.duration_minutes,
            order_index: idx,
            pricing_porte_tier_applied: r.porteTierApplied,
            pricing_coat_type_applied: r.coatTypeApplied,
            cost_amount_applied: cost,
            sale_amount_applied: sale,
            pricing_variant: r.pricing_variant,
        };
    });
}
async function refreshSnapshotsForAppointment(clinicId, appointmentId, startsAt, petId, pricingPorteTier, pricingCoatType) {
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
async function enrichAppointments(rows) {
    if (rows.length === 0)
        return [];
    const staffIds = [...new Set(rows.map((r) => r.hub_staff_member_id).filter(Boolean))];
    const petIds = [...new Set(rows.map((r) => r.pet_id).filter(Boolean))];
    const guIds = [...new Set(rows.map((r) => r.guardian_id).filter(Boolean))];
    const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))];
    const apptIds = rows.map((r) => r.id);
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
    const [stRes, staffRes, petsRes, guRes, unitsRes, encRes] = await Promise.all([
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
            ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name, size_tier, coat_type, birth_date').in('id', petIds)
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
    const adjustmentFlags = clinicId
        ? await (0, hubComandasController_1.financialAdjustmentFlagsForAppointments)(clinicId, apptIds)
        : new Map();
    return rows.map((r) => {
        const st = stMap.get(r.hub_service_type_id);
        const sm = r.hub_staff_member_id ? staffMap.get(r.hub_staff_member_id) : null;
        const pet = r.pet_id ? petMap.get(r.pet_id) : null;
        const gu = r.guardian_id ? guMap.get(r.guardian_id) : null;
        const un = r.unit_id ? unitMap.get(r.unit_id) : null;
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
        return {
            ...r,
            service_type: st ?? null,
            staff_member: sm ?? null,
            pet: pet ?? null,
            guardian: gu ?? null,
            unit: un ?? null,
            services,
            hub_encounter_id: linked?.id ?? null,
            hub_encounter_status: linked?.status ?? null,
            financial_adjustment_pending: adj?.financial_adjustment_pending ?? false,
            comanda_id: adj?.comanda_id ?? null,
        };
    });
}
// ── Schemas ──────────────────────────────────────────────────────────────────
const listQuerySchema = zod_1.z.object({
    clinic_id: uuidStr,
    from: zod_1.z.string().datetime({ offset: true }),
    to: zod_1.z.string().datetime({ offset: true }),
    unit_id: uuidStr.optional(),
    hub_staff_member_id: zod_1.z.union([uuidStr, zod_1.z.literal('__na__')]).optional(),
    hub_service_type_id: uuidStr.optional(),
    service_group: zod_1.z.string().trim().min(1).max(64).optional(),
    status: appointmentStatusSchema.optional(),
    resource_label: zod_1.z.string().trim().max(120).optional(),
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
const pickupRoutePricingSchema = zod_1.z
    .object({
    hub_service_type_id: uuidStr,
    pricing_variant: zod_1.z
        .object({
        km_tier_index: zod_1.z.number().int().min(0),
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
    extra_blocks: zod_1.z.array(extraBlockSchema).optional(),
    recurrence: recurrenceSchema.optional().nullable(),
    /** Preferência de caso ao abrir atendimento (fluxo agenda consulta de rotina). */
    intake_hub_case_id: uuidStr.optional().nullable(),
    intake_create_new_case: zod_1.z.boolean().optional(),
    intake_new_case_title: optionalTrim(500).optional().nullable(),
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
})
    .strict();
// ── Handlers ─────────────────────────────────────────────────────────────────
const listHubAppointments = async (req, res) => {
    try {
        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.flatten() });
        }
        const { clinic_id, from, to, unit_id, hub_staff_member_id, hub_service_type_id, service_group, status, resource_label } = parsed.data;
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
        if (unit_id)
            q = q.eq('unit_id', unit_id);
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
        // Se a unidade não foi informada, tenta usar a unidade padrão da clínica
        const resolvedUnitId = b.unit_id ?? (await resolveClinicDefaultUnitId(b.clinic_id));
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
            return res.status(400).json({ error: 'Leva e Traz: indique o tipo de serviço e a faixa de quilómetros.' });
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
        if (hasPickupRoutes && b.pickup_route_pricing) {
            const ltSt = stMap.get(b.pickup_route_pricing.hub_service_type_id);
            const ge = validateLevaTrazServiceType(ltSt);
            if (ge)
                return res.status(400).json({ error: ge });
            const parsedM = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(ltSt.pricing_matrix);
            if (!parsedM || typeof parsedM !== 'object' || ('error' in parsedM && parsedM.error)) {
                return res.status(400).json({ error: 'O serviço de Leva e Traz deve ter matriz de preços por faixas de km.' });
            }
            if (!('kind' in parsedM) || parsedM.kind !== 'km_banda') {
                return res.status(400).json({ error: 'O serviço de Leva e Traz deve ter matriz de preços por faixas de km.' });
            }
            const m = parsedM;
            const kmIdx = b.pickup_route_pricing.pricing_variant.km_tier_index;
            if (kmIdx < 0 || kmIdx >= m.tiers.length) {
                return res.status(400).json({ error: 'Faixa de km inválida para o serviço de Leva e Traz.' });
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
        let pickupPricingBase = null;
        if (hasPickupRoutes && b.pickup_route_pricing) {
            const ltId = b.pickup_route_pricing.hub_service_type_id;
            const kmVariant = {
                km_tier_index: b.pickup_route_pricing.pricing_variant.km_tier_index,
            };
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
                    matrixSaleRoundTrip: br.sale_amount_applied,
                    matrixCostRoundTrip: br.cost_amount_applied,
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
            })
                .select('id')
                .single();
            if (serErr)
                return res.status(500).json({ error: serErr.message });
            seriesId = seriesRow.id;
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
                label: 'Atendimento principal',
            });
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
            if (skipOcc)
                continue;
            const insert = {
                clinic_id: b.clinic_id,
                unit_id: resolvedUnitId,
                hub_service_type_id: b.hub_service_type_id,
                hub_staff_member_id: b.hub_staff_member_id ?? null,
                pet_id: b.pet_id ?? null,
                guardian_id: b.guardian_id ?? null,
                starts_at: startsAt,
                ends_at: endsAt,
                status: b.status ?? 'confirmed',
                resource_label: b.resource_label ?? null,
                notes: b.notes ?? null,
                appointment_kind: b.appointment_kind ?? 'standard',
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
            let snapRows;
            try {
                snapRows = buildServiceLineSnapshots({
                    lines: normLines,
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
            const svcInsert = snapRows.map((row) => ({
                appointment_id: apptId,
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
            const ltCfg = b.pickup_route_pricing;
            // L&T: uma cobrança ida+volta (valor da matriz); overrides de total foram removidos do produto.
            const [saleBeforeLeg, saleAfterLeg] = pickupPricingBase
                ? splitMoneyTotalAcrossTwoLegs(pickupPricingBase.matrixSaleRoundTrip)
                : [0, 0];
            const [costBeforeLeg, costAfterLeg] = pickupPricingBase
                ? splitMoneyTotalAcrossTwoLegs(pickupPricingBase.matrixCostRoundTrip)
                : [0, 0];
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
        const check = await assertNoScheduleConflict(b.clinic_id, [id], nextStaff, nextResource, nextUnit, starts, ends);
        if (check.conflict) {
            return res.status(409).json({ error: check.reason });
        }
        const patch = {};
        if (b.unit_id !== undefined)
            patch.unit_id = b.unit_id;
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
        if (Object.keys(patch).length === 0 && !b.services) {
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
