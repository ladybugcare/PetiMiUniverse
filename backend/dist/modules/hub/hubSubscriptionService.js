"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_HUB_MODULES = exports.BETA_PLAN_ID = exports.BETA_PLAN_SLUG = void 0;
exports.getHubSubscriptionMode = getHubSubscriptionMode;
exports.getClinicSubscription = getClinicSubscription;
exports.createBetaSubscription = createBetaSubscription;
exports.getEnabledModules = getEnabledModules;
exports.organizationHasModule = organizationHasModule;
exports.isSubscriptionActive = isSubscriptionActive;
exports.toSessionSubscriptionPayload = toSessionSubscriptionPayload;
exports.listPublicPlansAndModules = listPublicPlansAndModules;
exports.patchClinicSubscription = patchClinicSubscription;
const supabase_js_1 = require("../../config/supabase.js");
exports.BETA_PLAN_SLUG = 'beta';
exports.BETA_PLAN_ID = 'a1000000-0000-4000-8000-000000000001';
exports.ALL_HUB_MODULES = ['hub_core', 'clinic', 'grooming', 'boarding'];
const ACTIVE_STATUSES = new Set(['beta', 'trialing', 'active']);
function getHubSubscriptionMode() {
    const raw = (process.env.HUB_SUBSCRIPTION_MODE || 'beta_only').trim().toLowerCase();
    return raw === 'catalog' ? 'catalog' : 'beta_only';
}
function normalizeModules(modules) {
    const set = new Set((modules || []).map((m) => String(m).trim()).filter(Boolean));
    if (!set.has('hub_core'))
        set.add('hub_core');
    return Array.from(set);
}
function normalizePlanJoin(raw) {
    if (!raw)
        return null;
    if (Array.isArray(raw))
        return raw[0] ?? null;
    return raw;
}
function mapSubscriptionRow(data) {
    const row = data;
    return {
        ...row,
        enabled_modules: normalizeModules(row.enabled_modules),
        hub_platform_plans: normalizePlanJoin(row.hub_platform_plans),
    };
}
async function getClinicSubscription(clinicId) {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .select('id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, hub_platform_plans(slug, name, max_units, max_users)')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error) {
        console.error('[hubSubscription] getClinicSubscription', error);
        throw error;
    }
    if (!data)
        return null;
    return mapSubscriptionRow(data);
}
async function createBetaSubscription(clinicId, options) {
    const existing = await getClinicSubscription(clinicId);
    if (existing)
        return existing;
    const now = new Date().toISOString();
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .insert({
        clinic_id: clinicId,
        base_plan_id: exports.BETA_PLAN_ID,
        status: 'beta',
        is_beta: true,
        beta_free_until: null,
        beta_notes: options?.notes ?? 'Programa Beta (pré-MVP)',
        enabled_modules: [...exports.ALL_HUB_MODULES],
        started_at: now,
        created_at: now,
        updated_at: now,
    })
        .select('id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, hub_platform_plans(slug, name, max_units, max_users)')
        .single();
    if (error) {
        // Corrida: outra requisição criou no meio
        if (error.code === '23505') {
            const again = await getClinicSubscription(clinicId);
            if (again)
                return again;
        }
        console.error('[hubSubscription] createBetaSubscription', error);
        throw error;
    }
    return mapSubscriptionRow(data);
}
async function getEnabledModules(clinicId) {
    const sub = await getClinicSubscription(clinicId);
    if (!sub || !ACTIVE_STATUSES.has(sub.status))
        return ['hub_core'];
    return normalizeModules(sub.enabled_modules);
}
async function organizationHasModule(clinicId, moduleSlug) {
    const modules = await getEnabledModules(clinicId);
    return modules.includes(moduleSlug);
}
async function isSubscriptionActive(clinicId) {
    const sub = await getClinicSubscription(clinicId);
    return Boolean(sub && ACTIVE_STATUSES.has(sub.status));
}
function toSessionSubscriptionPayload(sub) {
    if (!sub)
        return null;
    const plan = sub.hub_platform_plans;
    return {
        status: sub.status,
        is_beta: sub.is_beta,
        base_plan_slug: plan?.slug ?? null,
        enabled_modules: normalizeModules(sub.enabled_modules),
        beta_free_until: sub.beta_free_until,
    };
}
async function listPublicPlansAndModules() {
    const mode = getHubSubscriptionMode();
    let plansQuery = supabase_js_1.supabaseAdmin
        .from('hub_platform_plans')
        .select('slug, name, description, max_units, max_users, monthly_price_cents, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });
    if (mode === 'beta_only') {
        plansQuery = plansQuery.eq('slug', exports.BETA_PLAN_SLUG);
    }
    else {
        plansQuery = plansQuery.eq('is_public', true).neq('slug', exports.BETA_PLAN_SLUG);
    }
    const [{ data: plans, error: plansError }, { data: modules, error: modulesError }] = await Promise.all([
        plansQuery,
        mode === 'beta_only'
            ? Promise.resolve({ data: [], error: null })
            : supabase_js_1.supabaseAdmin
                .from('hub_platform_modules')
                .select('slug, name, description, monthly_price_cents, maps_to_entitlement, sort_order')
                .eq('active', true)
                .order('sort_order', { ascending: true }),
    ]);
    if (plansError) {
        console.error('[hubSubscription] listPublicPlans', plansError);
        throw plansError;
    }
    if (modulesError) {
        console.error('[hubSubscription] listPublicModules', modulesError);
        throw modulesError;
    }
    return {
        mode,
        plans: (plans || []),
        modules: (modules || []),
    };
}
async function patchClinicSubscription(clinicId, patch) {
    let sub = await getClinicSubscription(clinicId);
    if (!sub) {
        sub = await createBetaSubscription(clinicId, { notes: 'Criada via admin' });
    }
    const updates = {
        updated_at: new Date().toISOString(),
    };
    if (patch.is_beta !== undefined) {
        updates.is_beta = patch.is_beta;
        if (patch.is_beta && patch.status === undefined) {
            updates.status = 'beta';
        }
    }
    if (patch.beta_free_until !== undefined)
        updates.beta_free_until = patch.beta_free_until;
    if (patch.beta_discount_percent !== undefined) {
        updates.beta_discount_percent = patch.beta_discount_percent;
    }
    if (patch.override_monthly_cents !== undefined) {
        updates.override_monthly_cents = patch.override_monthly_cents;
    }
    if (patch.beta_notes !== undefined)
        updates.beta_notes = patch.beta_notes;
    if (patch.enabled_modules !== undefined) {
        updates.enabled_modules = normalizeModules(patch.enabled_modules);
    }
    if (patch.status !== undefined)
        updates.status = patch.status;
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .update(updates)
        .eq('clinic_id', clinicId)
        .select('id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, hub_platform_plans(slug, name, max_units, max_users)')
        .single();
    if (error) {
        console.error('[hubSubscription] patchClinicSubscription', error);
        throw error;
    }
    return mapSubscriptionRow(data);
}
