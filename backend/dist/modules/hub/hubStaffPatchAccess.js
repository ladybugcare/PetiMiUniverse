"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_PATCH_CATALOG_FIELDS = exports.STAFF_PATCH_OPS_FIELDS = void 0;
exports.classifyStaffPatchField = classifyStaffPatchField;
exports.classifyStaffPatchBody = classifyStaffPatchBody;
exports.assertStaffPatchAllowedByAccessMode = assertStaffPatchAllowedByAccessMode;
const errors_js_1 = require("../../utils/errors.js");
const hubEntitlements_js_1 = require("./hubEntitlements.js");
/**
 * Campos operacionais: full + soft_lock; bloqueados em read_history.
 * `email` = contato do profissional (auth/convite usam hub_access_email).
 * `service_type_ids` = serviços que o profissional executa (não concede login Hub).
 */
exports.STAFF_PATCH_OPS_FIELDS = new Set([
    'full_name',
    'display_name',
    'photo_url',
    'signature_image_url',
    'stamp_image_url',
    'phone',
    'whatsapp_phone',
    'email',
    'birth_date',
    'job_title',
    'professional_kind',
    'specialties',
    'crmv',
    'crmv_uf',
    'internal_notes',
    'accepts_appointments',
    'available_days',
    'work_hours',
    'break_minutes',
    'agenda_color',
    'service_type_ids',
]);
/**
 * Catálogo / capacidade / acesso: somente full.
 * `default_unit_id` altera escopo de convite e notificações → tratado como capacidade.
 */
exports.STAFF_PATCH_CATALOG_FIELDS = new Set([
    'has_hub_access',
    'hub_access_email',
    'hub_access_role',
    'operational_areas',
    'active',
    'affiliation',
    'default_unit_id',
]);
/** Metadado obrigatório — não classifica acesso. */
const STAFF_PATCH_META_FIELDS = new Set(['clinic_id']);
function classifyStaffPatchField(field) {
    if (STAFF_PATCH_META_FIELDS.has(field))
        return 'meta';
    if (exports.STAFF_PATCH_OPS_FIELDS.has(field))
        return 'ops';
    if (exports.STAFF_PATCH_CATALOG_FIELDS.has(field))
        return 'catalog';
    return 'unknown';
}
function classifyStaffPatchBody(body) {
    const opsFields = [];
    const catalogFields = [];
    const unknownFields = [];
    for (const key of Object.keys(body)) {
        const kind = classifyStaffPatchField(key);
        if (kind === 'meta')
            continue;
        if (kind === 'ops')
            opsFields.push(key);
        else if (kind === 'catalog')
            catalogFields.push(key);
        else
            unknownFields.push(key);
    }
    return {
        opsFields,
        catalogFields,
        unknownFields,
        requiresFullAccess: catalogFields.length > 0,
    };
}
/**
 * Enforce soft-lock no PATCH de staff.
 * - Campos desconhecidos → VALIDATION_ERROR
 * - Qualquer catálogo → somente full
 * - Só ops → full ou soft_lock
 * - read_history → sempre bloqueia mutação
 */
async function assertStaffPatchAllowedByAccessMode(clinicId, body) {
    const classified = classifyStaffPatchBody(body);
    if (classified.unknownFields.length > 0) {
        throw new errors_js_1.ValidationError(`Campos não permitidos no PATCH de equipe: ${classified.unknownFields.join(', ')}`, { fields: classified.unknownFields });
    }
    const hasMutation = classified.opsFields.length > 0 || classified.catalogFields.length > 0;
    if (!hasMutation) {
        return classified;
    }
    const snap = await (0, hubEntitlements_js_1.loadEntitlements)(clinicId);
    if (classified.requiresFullAccess) {
        (0, hubEntitlements_js_1.assertAccessAllowsMutation)(snap, {});
    }
    else {
        (0, hubEntitlements_js_1.assertAccessAllowsMutation)(snap, { allowSoftLockWrite: true });
    }
    return classified;
}
