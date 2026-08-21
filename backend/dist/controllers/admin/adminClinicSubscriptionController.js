"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchAdminClinicSubscription = exports.getAdminClinicSubscription = void 0;
const zod_1 = require("zod");
const errorHandler_js_1 = require("../../middleware/errorHandler.js");
const errors_js_1 = require("../../utils/errors.js");
const auditLog_js_1 = require("../../utils/auditLog.js");
const hubSubscriptionService_js_1 = require("../../modules/hub/hubSubscriptionService.js");
const MODULE_SET = new Set(hubSubscriptionService_js_1.ALL_HUB_MODULES);
const patchBodySchema = zod_1.z.object({
    is_beta: zod_1.z.boolean().optional(),
    beta_free_until: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).optional(),
    beta_discount_percent: zod_1.z.number().int().min(0).max(100).nullable().optional(),
    override_monthly_cents: zod_1.z.number().int().min(0).nullable().optional(),
    beta_notes: zod_1.z.string().max(2000).nullable().optional(),
    enabled_modules: zod_1.z.array(zod_1.z.string()).optional(),
    status: zod_1.z.enum(['beta', 'trialing', 'active', 'past_due', 'canceled']).optional(),
});
function requirePlatformAdmin(req, res) {
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'admin') {
        res.status(403).json({ error: 'Acesso negado' });
        return false;
    }
    return true;
}
function serializeSubscription(sub) {
    if (!sub)
        return null;
    return {
        id: sub.id,
        clinic_id: sub.clinic_id,
        status: sub.status,
        is_beta: sub.is_beta,
        beta_free_until: sub.beta_free_until,
        beta_discount_percent: sub.beta_discount_percent,
        override_monthly_cents: sub.override_monthly_cents,
        beta_notes: sub.beta_notes,
        enabled_modules: sub.enabled_modules,
        started_at: sub.started_at,
        canceled_at: sub.canceled_at,
        base_plan: sub.hub_platform_plans
            ? {
                slug: sub.hub_platform_plans.slug,
                name: sub.hub_platform_plans.name,
                max_units: sub.hub_platform_plans.max_units,
                max_users: sub.hub_platform_plans.max_users,
            }
            : null,
    };
}
/** GET /admin/clinics/:clinicId/subscription */
exports.getAdminClinicSubscription = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    if (!requirePlatformAdmin(req, res))
        return;
    const clinicId = String(req.params.clinicId || '').trim();
    if (!clinicId) {
        throw new errors_js_1.ValidationError('clinicId é obrigatório');
    }
    let sub = await (0, hubSubscriptionService_js_1.getClinicSubscription)(clinicId);
    if (!sub) {
        sub = await (0, hubSubscriptionService_js_1.createBetaSubscription)(clinicId, { notes: 'Criada sob demanda pelo admin' });
    }
    res.json({
        subscription: serializeSubscription(sub),
        available_modules: [...hubSubscriptionService_js_1.ALL_HUB_MODULES],
    });
});
/** PATCH /admin/clinics/:clinicId/subscription */
exports.patchAdminClinicSubscription = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    if (!requirePlatformAdmin(req, res))
        return;
    const clinicId = String(req.params.clinicId || '').trim();
    if (!clinicId) {
        throw new errors_js_1.ValidationError('clinicId é obrigatório');
    }
    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const body = parsed.data;
    if (body.enabled_modules) {
        const invalid = body.enabled_modules.filter((m) => !MODULE_SET.has(m));
        if (invalid.length) {
            throw new errors_js_1.ValidationError(`Módulos inválidos: ${invalid.join(', ')}`);
        }
    }
    // Aceitar date-only (YYYY-MM-DD) do date picker; string vazia = null
    let betaFreeUntil = body.beta_free_until;
    if (betaFreeUntil === '')
        betaFreeUntil = null;
    if (typeof betaFreeUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(betaFreeUntil)) {
        betaFreeUntil = `${betaFreeUntil}T23:59:59.999Z`;
    }
    const sub = await (0, hubSubscriptionService_js_1.patchClinicSubscription)(clinicId, {
        ...body,
        beta_free_until: betaFreeUntil,
    });
    const metadata = (0, auditLog_js_1.extractRequestMetadata)(req);
    await (0, auditLog_js_1.createAuditLog)({
        user_id: req.user.id,
        clinic_id: clinicId,
        action: 'ADMIN_PATCH_HUB_SUBSCRIPTION',
        entity_type: 'clinic_hub_subscriptions',
        entity_id: sub.id,
        new_values: body,
        ...metadata,
    });
    res.json({
        subscription: serializeSubscription(sub),
        available_modules: [...hubSubscriptionService_js_1.ALL_HUB_MODULES],
    });
});
