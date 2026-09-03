"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.careLocationBodyFields = exports.careLocationKindSchema = void 0;
exports.assertPartnerClinicInClinic = assertPartnerClinicInClinic;
exports.resolveCareLocation = resolveCareLocation;
exports.loadPartnerClinicMap = loadPartnerClinicMap;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
exports.careLocationKindSchema = zod_1.z.enum(['own_unit', 'partner_clinic']);
/** Campos opcionais de local de atendimento em create/patch. */
exports.careLocationBodyFields = {
    care_location_kind: exports.careLocationKindSchema.optional(),
    hub_partner_clinic_id: zod_1.z.string().uuid().optional().nullable(),
};
async function assertPartnerClinicInClinic(clinicId, partnerClinicId, opts) {
    let q = supabase_1.supabaseAdmin
        .from('hub_partner_clinics')
        .select('id, name, is_active')
        .eq('id', partnerClinicId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
    if (opts?.requireActive !== false) {
        q = q.eq('is_active', true);
    }
    const { data } = await q.maybeSingle();
    return data;
}
/**
 * Resolve e valida care_location.
 * - own_unit: partner null; unit_id deve existir (exceto allowNullUnit).
 * - partner_clinic: partner obrigatório no tenant; unit_id pode ser origem administrativa (nullable).
 */
async function resolveCareLocation(params) {
    const kind = params.care_location_kind ??
        params.existing?.care_location_kind ??
        'own_unit';
    const partnerId = params.hub_partner_clinic_id !== undefined
        ? params.hub_partner_clinic_id
        : (params.existing?.hub_partner_clinic_id ?? null);
    const unitId = params.unit_id;
    if (kind === 'own_unit') {
        if (partnerId) {
            return { ok: false, error: 'Unidade própria não deve ter clínica parceira associada.' };
        }
        if (!unitId && !params.allowNullUnit) {
            return { ok: false, error: 'Informe a unidade própria do atendimento.' };
        }
        return {
            ok: true,
            value: {
                care_location_kind: 'own_unit',
                hub_partner_clinic_id: null,
                unit_id: unitId,
            },
        };
    }
    if (!partnerId) {
        return { ok: false, error: 'Selecione a clínica parceira.' };
    }
    const partner = await assertPartnerClinicInClinic(params.clinicId, partnerId, {
        requireActive: params.requireActivePartner !== false,
    });
    if (!partner) {
        return { ok: false, error: 'Clínica parceira inválida ou inativa.' };
    }
    return {
        ok: true,
        value: {
            care_location_kind: 'partner_clinic',
            hub_partner_clinic_id: partnerId,
            unit_id: unitId,
        },
    };
}
async function loadPartnerClinicMap(clinicId, partnerIds) {
    const unique = [...new Set(partnerIds.filter(Boolean))];
    const map = new Map();
    if (unique.length === 0)
        return map;
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_partner_clinics')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .in('id', unique);
    for (const row of data ?? []) {
        const r = row;
        map.set(r.id, r);
    }
    return map;
}
