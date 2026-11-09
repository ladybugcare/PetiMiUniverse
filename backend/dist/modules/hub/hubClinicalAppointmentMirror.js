"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertLinkedClinicalAppointment = insertLinkedClinicalAppointment;
exports.rescheduleLinkedAppointment = rescheduleLinkedAppointment;
exports.setLinkedAppointmentStatus = setLinkedAppointmentStatus;
const supabase_1 = require("../../config/supabase");
const hubPricingResolve_1 = require("./hubPricingResolve");
const hubVariablePrice_1 = require("./hubVariablePrice");
/**
 * Espelha fichas clínicas do Consultório em slots da agenda.
 *
 * - Cirurgia: horário futuro (`confirmed`) no `scheduled_at`.
 * - Internação: marco de admissão no dia (`in_progress` / walk-in).
 *
 * Não chama `syncSurgeryForAppointment` — o vínculo nasce da ficha para o slot,
 * evitando ficha duplicada.
 */
const DEFAULT_DURATION_MINUTES = 60;
async function loadServiceType(clinicId, serviceTypeId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, name, service_group, sale_amount, cost_amount, pricing_matrix, default_duration_minutes, active, deleted_at')
        .eq('id', serviceTypeId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    return data ?? null;
}
async function findFirstActiveServiceOfGroup(clinicId, serviceGroup) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, name, service_group, sale_amount, cost_amount, pricing_matrix, default_duration_minutes, active, deleted_at')
        .eq('clinic_id', clinicId)
        .eq('service_group', serviceGroup)
        .eq('active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    return data ?? null;
}
async function resolveMirrorServiceType(opts) {
    if (opts.serviceTypeId) {
        const st = await loadServiceType(opts.clinicId, opts.serviceTypeId);
        if (st && !st.deleted_at && st.active !== false) {
            if (String(st.service_group) === opts.serviceGroup)
                return st;
        }
    }
    return findFirstActiveServiceOfGroup(opts.clinicId, opts.serviceGroup);
}
function durationMinutesOf(st) {
    const raw = st.default_duration_minutes;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0)
        return Math.floor(raw);
    return DEFAULT_DURATION_MINUTES;
}
async function loadPetPricing(clinicId, petId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('size_tier, birth_date, coat_type')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (!data)
        return { size_tier: 'medio', birth_date: null, coat_type: null };
    const d = data;
    return {
        size_tier: d.size_tier?.trim() || 'medio',
        birth_date: d.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(d.birth_date) ? d.birth_date : null,
        coat_type: d.coat_type?.trim() || null,
    };
}
function addMinutesIso(startsAt, minutes) {
    return new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString();
}
function appointmentDurationMs(startsAt, endsAt) {
    const startMs = new Date(startsAt).getTime();
    const endMs = endsAt ? new Date(endsAt).getTime() : NaN;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs)
        return endMs - startMs;
    return DEFAULT_DURATION_MINUTES * 60_000;
}
/**
 * Cria um slot mínimo na agenda + uma linha de serviço.
 * Retorna o id do agendamento, ou `null` se não houver tipo de serviço / falha best-effort.
 * Nunca chama sync de cirurgia.
 */
async function insertLinkedClinicalAppointment(opts) {
    try {
        const st = await resolveMirrorServiceType({
            clinicId: opts.clinicId,
            serviceGroup: opts.serviceGroup,
            serviceTypeId: opts.serviceTypeId,
        });
        if (!st)
            return null;
        const durationMin = durationMinutesOf(st);
        const startsAt = opts.startsAt;
        const endsAt = addMinutesIso(startsAt, durationMin);
        const pet = await loadPetPricing(opts.clinicId, opts.petId);
        const priced = (0, hubPricingResolve_1.resolveServiceLinePricing)({
            serviceType: {
                id: st.id,
                service_group: String(st.service_group ?? ''),
                pricing_matrix: st.pricing_matrix,
                cost_amount: Number(st.cost_amount) || 0,
                sale_amount: Number(st.sale_amount) || 0,
            },
            pet,
            appointmentDateYmd: startsAt.slice(0, 10),
            puppyMaxMonths: 8,
            overrideTier: null,
            overrideCoatType: null,
        });
        const { data: apptRow, error: apptErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .insert({
            clinic_id: opts.clinicId,
            unit_id: opts.unitId ?? null,
            care_location_kind: 'own_unit',
            hub_service_type_id: st.id,
            hub_staff_member_id: opts.staffMemberId ?? null,
            pet_id: opts.petId,
            guardian_id: opts.guardianId ?? null,
            starts_at: startsAt,
            ends_at: endsAt,
            status: opts.status,
            appointment_kind: opts.appointmentKind ?? 'standard',
            title: opts.title?.trim() || st.name,
            notes: opts.notes ?? null,
            intake_hub_case_id: opts.intakeHubCaseId ?? null,
        })
            .select('id')
            .single();
        if (apptErr)
            throw new Error(apptErr.message);
        const appointmentId = apptRow.id;
        const { error: svcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert({
            appointment_id: appointmentId,
            hub_service_type_id: st.id,
            duration_minutes: durationMin,
            order_index: 0,
            pricing_porte_tier_applied: priced.porteTierApplied,
            pricing_coat_type_applied: priced.coatTypeApplied,
            cost_amount_applied: (0, hubVariablePrice_1.roundMoney2)(priced.cost),
            sale_amount_applied: (0, hubVariablePrice_1.roundMoney2)(priced.sale),
            pricing_variant: priced.pricing_variant,
            pricing_source: 'catalog',
            special_price_id: null,
        });
        if (svcErr)
            throw new Error(svcErr.message);
        return appointmentId;
    }
    catch (e) {
        console.error('insertLinkedClinicalAppointment', opts.serviceGroup, opts.petId, e?.message);
        return null;
    }
}
/** Best-effort: reagenda o slot mantendo a duração original. */
async function rescheduleLinkedAppointment(opts) {
    if (!opts.appointmentId)
        return;
    try {
        const { data: appt, error } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, starts_at, ends_at, status, deleted_at')
            .eq('id', opts.appointmentId)
            .eq('clinic_id', opts.clinicId)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        if (!appt || appt.deleted_at)
            return;
        const row = appt;
        if (row.status === 'cancelled' || row.status === 'done')
            return;
        const durationMs = appointmentDurationMs(row.starts_at, row.ends_at);
        const starts_at = opts.startsAt;
        const ends_at = new Date(new Date(starts_at).getTime() + durationMs).toISOString();
        const { error: updErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ starts_at, ends_at })
            .eq('id', opts.appointmentId)
            .eq('clinic_id', opts.clinicId);
        if (updErr)
            throw new Error(updErr.message);
    }
    catch (e) {
        console.error('rescheduleLinkedAppointment', opts.appointmentId, e?.message);
    }
}
/** Best-effort: atualiza status do slot (não sobrescreve cancelado → done, etc.). */
async function setLinkedAppointmentStatus(opts) {
    if (!opts.appointmentId)
        return;
    try {
        let q = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ status: opts.status })
            .eq('id', opts.appointmentId)
            .eq('clinic_id', opts.clinicId)
            .is('deleted_at', null);
        if (opts.status === 'cancelled') {
            q = q.neq('status', 'done').neq('status', 'cancelled');
        }
        else if (opts.status === 'done') {
            q = q.neq('status', 'cancelled');
        }
        const { error } = await q;
        if (error)
            throw new Error(error.message);
    }
    catch (e) {
        console.error('setLinkedAppointmentStatus', opts.appointmentId, e?.message);
    }
}
