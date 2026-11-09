"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardingServiceGroupForMode = boardingServiceGroupForMode;
exports.resolveServicePriceForPet = resolveServicePriceForPet;
exports.resolveBoardingRateFromServiceType = resolveBoardingRateFromServiceType;
exports.resolveBoardingRateFromAppointment = resolveBoardingRateFromAppointment;
exports.todayYmdSaoPaulo = todayYmdSaoPaulo;
const supabase_1 = require("../../config/supabase");
const hubPricingResolve_1 = require("./hubPricingResolve");
const toCents = (reais) => Math.max(0, Math.round((Number(reais) || 0) * 100));
function boardingServiceGroupForMode(mode) {
    return mode === 'daycare' ? 'creche' : 'hotel';
}
async function loadPuppyMaxMonths(clinicId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_clinic_settings')
        .select('pet_puppy_max_months')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    return Number(data?.pet_puppy_max_months ?? 8);
}
/** Preço de um serviço para o pet (matriz por porte, pelagem ou período). Retorna reais. */
async function resolveServicePriceForPet(args) {
    const { data: st } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, name, service_group, pricing_matrix, cost_amount, sale_amount')
        .eq('id', args.serviceTypeId)
        .eq('clinic_id', args.clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (!st)
        return null;
    const service = st;
    let pet = {
        size_tier: 'medio',
        birth_date: null,
        coat_type: null,
    };
    if (args.petId) {
        const { data: p } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('size_tier, birth_date, coat_type')
            .eq('id', args.petId)
            .maybeSingle();
        if (p) {
            pet = {
                size_tier: String(p.size_tier ?? 'medio'),
                birth_date: p.birth_date ?? null,
                coat_type: p.coat_type ?? null,
            };
        }
    }
    try {
        const resolved = (0, hubPricingResolve_1.resolveServiceLinePricing)({
            serviceType: {
                id: service.id,
                service_group: service.service_group,
                pricing_matrix: service.pricing_matrix,
                cost_amount: Number(service.cost_amount ?? 0),
                sale_amount: Number(service.sale_amount ?? 0),
            },
            pet,
            appointmentDateYmd: args.refYmd,
            puppyMaxMonths: await loadPuppyMaxMonths(args.clinicId),
            overrideTier: null,
            overrideCoatType: null,
            pricing_variant: args.daycarePeriod ? { period: args.daycarePeriod } : null,
        });
        return { sale: resolved.sale, service };
    }
    catch {
        return { sale: Number(service.sale_amount ?? 0), service };
    }
}
async function firstBoardingServiceTypeId(clinicId, mode) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('service_group', boardingServiceGroupForMode(mode))
        .eq('active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(1);
    return data?.[0]?.id ?? null;
}
/** Diária/período a partir do tipo de serviço informado (ou o primeiro do grupo Hotel/Creche). */
async function resolveBoardingRateFromServiceType(args) {
    const serviceTypeId = args.serviceTypeId ?? (await firstBoardingServiceTypeId(args.clinicId, args.mode));
    if (!serviceTypeId)
        return null;
    const priced = await resolveServicePriceForPet({
        clinicId: args.clinicId,
        petId: args.petId,
        serviceTypeId,
        refYmd: args.refYmd,
        daycarePeriod: args.mode === 'daycare' ? args.daycarePeriod ?? 'full_day' : null,
    });
    if (!priced)
        return null;
    return { daily_rate_cents: toCents(priced.sale), hub_service_type_id: serviceTypeId, rate_source: 'service_type' };
}
/** Diária a partir da linha de hospedagem do agendamento (snapshot já aplicado na agenda). */
async function resolveBoardingRateFromAppointment(args) {
    const { data: lines } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('hub_service_type_id, sale_amount_applied')
        .eq('appointment_id', args.appointmentId);
    const rows = (lines ?? []);
    const ids = [...new Set([...rows.map((r) => r.hub_service_type_id), args.primaryServiceTypeId].filter(Boolean))];
    if (!ids.length)
        return null;
    const { data: types } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, service_group, sale_amount')
        .eq('clinic_id', args.clinicId)
        .in('id', ids);
    const boardingTypes = new Map((types ?? [])
        .filter((t) => t.service_group === 'hotel' || t.service_group === 'creche')
        .map((t) => [t.id, t]));
    const line = rows.find((r) => boardingTypes.has(r.hub_service_type_id));
    if (line) {
        const sale = line.sale_amount_applied ?? boardingTypes.get(line.hub_service_type_id)?.sale_amount ?? 0;
        return {
            daily_rate_cents: toCents(Number(sale)),
            hub_service_type_id: line.hub_service_type_id,
            rate_source: 'appointment',
        };
    }
    if (args.primaryServiceTypeId && boardingTypes.has(args.primaryServiceTypeId)) {
        return {
            daily_rate_cents: toCents(Number(boardingTypes.get(args.primaryServiceTypeId)?.sale_amount ?? 0)),
            hub_service_type_id: args.primaryServiceTypeId,
            rate_source: 'appointment',
        };
    }
    return null;
}
function todayYmdSaoPaulo() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
