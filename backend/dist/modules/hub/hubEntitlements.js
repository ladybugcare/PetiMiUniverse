"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEntitlements = loadEntitlements;
exports.assertModuleEnabled = assertModuleEnabled;
exports.assertPlanAreaEnabled = assertPlanAreaEnabled;
exports.assertAccessAllowsMutation = assertAccessAllowsMutation;
exports.assertCanCreateUnit = assertCanCreateUnit;
exports.assertCanInviteUser = assertCanInviteUser;
exports.assertHubEntitlement = assertHubEntitlement;
exports.requireHubEntitlement = requireHubEntitlement;
const errors_js_1 = require("../../utils/errors.js");
const hubSubscriptionService_js_1 = require("./hubSubscriptionService.js");
function clinicIdFromRequest(req) {
    const raw = req.body?.clinic_id || req.params?.clinic_id || req.query?.clinic_id || req.params?.clinicId;
    if (raw == null || String(raw).trim() === '')
        return null;
    return String(raw);
}
async function loadEntitlements(clinicId) {
    return (0, hubSubscriptionService_js_1.getClinicEntitlementSnapshot)(clinicId);
}
function assertModuleEnabled(snap, moduleSlug) {
    if (snap.is_beta)
        return;
    if (!snap.enabled_modules.includes(moduleSlug)) {
        throw new errors_js_1.PlanEntitlementError('Este módulo não está incluído no seu plano. Faça upgrade para continuar.', 'MODULE_NOT_ENABLED', { module: moduleSlug, plan: snap.base_plan_slug });
    }
}
function assertPlanAreaEnabled(snap, area) {
    if (snap.is_beta)
        return;
    if (snap.disabled_operational_areas.includes(area)) {
        throw new errors_js_1.PlanEntitlementError('Este recurso não está disponível no seu plano. Faça upgrade para continuar.', 'PLAN_AREA_DISABLED', { area, plan: snap.base_plan_slug });
    }
}
function assertAccessAllowsMutation(snap, opts) {
    if (snap.access_mode === 'full')
        return;
    if (snap.access_mode === 'soft_lock' && opts.allowSoftLockWrite)
        return;
    throw new errors_js_1.PlanEntitlementError(snap.access_mode === 'read_history'
        ? 'Sua assinatura está restrita. Reative o plano para alterar dados.'
        : 'Sua assinatura está pendente ou em atraso. Regularize o pagamento para continuar.', snap.access_mode === 'read_history' ? 'PLAN_READ_HISTORY' : 'PLAN_SOFT_LOCK', { access_mode: snap.access_mode, status: snap.status });
}
async function assertCanCreateUnit(clinicId) {
    const snap = await loadEntitlements(clinicId);
    if (snap.is_beta)
        return;
    assertAccessAllowsMutation(snap, {});
    if (snap.max_units == null)
        return;
    const units = await (0, hubSubscriptionService_js_1.countClinicUnits)(clinicId);
    if (units >= snap.max_units) {
        throw new errors_js_1.PlanEntitlementError(`Seu plano permite até ${snap.max_units} unidade(s). Faça upgrade para criar outra.`, 'PLAN_LIMIT_UNITS', { max_units: snap.max_units, usage: units, plan: snap.base_plan_slug });
    }
}
async function assertCanInviteUser(clinicId) {
    const snap = await loadEntitlements(clinicId);
    if (snap.is_beta)
        return;
    assertAccessAllowsMutation(snap, {});
    if (snap.max_users == null)
        return;
    const users = await (0, hubSubscriptionService_js_1.countClinicActiveUsers)(clinicId);
    if (users >= snap.max_users) {
        throw new errors_js_1.PlanEntitlementError(`Seu plano permite até ${snap.max_users} usuário(s). Faça upgrade para convidar mais pessoas.`, 'PLAN_LIMIT_USERS', { max_users: snap.max_users, usage: users, plan: snap.base_plan_slug });
    }
}
async function assertHubEntitlement(clinicId, opts) {
    const snap = await loadEntitlements(clinicId);
    if (opts.mutating) {
        // Soft write só com flag explícita (não inferir por module).
        // soft_lock + allowSoftLockWrite: ops do dia; sem flag: bloqueia (catálogo/capacidade).
        // read_history / canceled: sempre bloqueia mutações.
        assertAccessAllowsMutation(snap, {
            allowSoftLockWrite: Boolean(opts.allowSoftLockWrite) && snap.access_mode === 'soft_lock',
        });
    }
    if (opts.module)
        assertModuleEnabled(snap, opts.module);
    if (opts.planArea)
        assertPlanAreaEnabled(snap, opts.planArea);
    if (opts.capacity === 'unit')
        await assertCanCreateUnit(clinicId);
    if (opts.capacity === 'user')
        await assertCanInviteUser(clinicId);
    return snap;
}
/** Middleware Express: exige clinic_id + módulo/área/capacidade. */
function requireHubEntitlement(opts) {
    return async (req, res, next) => {
        try {
            const clinicId = clinicIdFromRequest(req);
            if (!clinicId) {
                return res.status(400).json({ error: 'clinic_id não fornecido', code: 'VALIDATION_ERROR' });
            }
            await assertHubEntitlement(clinicId, opts);
            next();
        }
        catch (e) {
            if (e instanceof errors_js_1.PlanEntitlementError) {
                return res.status(403).json({
                    error: e.message,
                    code: e.code,
                    details: e.details,
                });
            }
            console.error('[requireHubEntitlement]', e);
            return res.status(500).json({ error: 'Erro ao verificar plano da clínica' });
        }
    };
}
