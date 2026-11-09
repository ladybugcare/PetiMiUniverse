"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HubPlanError = exports.ALL_HUB_MODULES = exports.BETA_PLAN_ID = exports.BETA_PLAN_SLUG = void 0;
exports.getHubSubscriptionMode = getHubSubscriptionMode;
exports.getClinicSubscription = getClinicSubscription;
exports.createBetaSubscription = createBetaSubscription;
exports.getEnabledModules = getEnabledModules;
exports.organizationHasModule = organizationHasModule;
exports.isSubscriptionActive = isSubscriptionActive;
exports.toSessionSubscriptionPayload = toSessionSubscriptionPayload;
exports.listPaidLaunchPlans = listPaidLaunchPlans;
exports.listPublicPlansAndModules = listPublicPlansAndModules;
exports.chargeAmountCents = chargeAmountCents;
exports.createPendingPlanSubscription = createPendingPlanSubscription;
exports.stagePlanCheckout = stagePlanCheckout;
exports.savePreapprovalId = savePreapprovalId;
exports.applyMercadoPagoPreapproval = applyMercadoPagoPreapproval;
exports.patchClinicSubscription = patchClinicSubscription;
const supabase_js_1 = require("../../config/supabase.js");
exports.BETA_PLAN_SLUG = 'beta';
exports.BETA_PLAN_ID = 'a1000000-0000-4000-8000-000000000001';
exports.ALL_HUB_MODULES = ['hub_core', 'clinic', 'grooming', 'boarding'];
const ACTIVE_STATUSES = new Set(['beta', 'trialing', 'active']);
const PLAN_EMBED = 'hub_platform_plans!clinic_hub_subscriptions_base_plan_id_fkey';
const LEGACY_SUBSCRIPTION_SELECT = `id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, ${PLAN_EMBED}(slug, name, max_units, max_users)`;
const SUBSCRIPTION_SELECT = `id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, mp_preapproval_id, pending_plan_id, current_period_end, ${PLAN_EMBED}(slug, name, max_units, max_users, monthly_price_cents)`;
function missingMercadoPagoColumns(error) {
    const msg = error?.message || '';
    return (msg.includes('mp_preapproval_id') ||
        msg.includes('pending_plan_id') ||
        msg.includes('current_period_end') ||
        msg.includes('pending_payment'));
}
class HubPlanError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HubPlanError';
    }
}
exports.HubPlanError = HubPlanError;
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
    let { data, error } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .select(SUBSCRIPTION_SELECT)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error && missingMercadoPagoColumns(error)) {
        const legacy = await supabase_js_1.supabaseAdmin
            .from('clinic_hub_subscriptions')
            .select(LEGACY_SUBSCRIPTION_SELECT)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        data = legacy.data;
        error = legacy.error;
    }
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
        .select(LEGACY_SUBSCRIPTION_SELECT)
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
async function listPaidLaunchPlans() {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('hub_platform_plans')
        .select('slug, name, description, max_units, max_users, monthly_price_cents, sort_order')
        .eq('active', true)
        .eq('is_public', true)
        .neq('slug', exports.BETA_PLAN_SLUG)
        .not('monthly_price_cents', 'is', null)
        .order('sort_order', { ascending: true });
    if (error) {
        console.error('[hubSubscription] listPaidLaunchPlans', error);
        throw error;
    }
    return (data || []);
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
    const [{ data: plans, error: plansError }, { data: modules, error: modulesError }, paidPlans] = await Promise.all([
        plansQuery,
        mode === 'beta_only'
            ? Promise.resolve({ data: [], error: null })
            : supabase_js_1.supabaseAdmin
                .from('hub_platform_modules')
                .select('slug, name, description, monthly_price_cents, maps_to_entitlement, sort_order')
                .eq('active', true)
                .order('sort_order', { ascending: true }),
        listPaidLaunchPlans(),
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
        paid_plans: paidPlans,
    };
}
async function getPaidPlanBySlug(slug) {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('hub_platform_plans')
        .select('id, slug, name, monthly_price_cents, active')
        .eq('slug', slug)
        .maybeSingle();
    if (error)
        throw error;
    const plan = data;
    if (!plan || !plan.active || plan.slug === exports.BETA_PLAN_SLUG || plan.monthly_price_cents == null) {
        throw new HubPlanError('Plano indisponível para assinatura.');
    }
    return plan;
}
function chargeAmountCents(planCents, overrideCents) {
    if (overrideCents != null && overrideCents >= 0)
        return overrideCents;
    return planCents;
}
/** Clínica nova escolhe um plano pago: fica pendente até o Mercado Pago autorizar. */
async function createPendingPlanSubscription(clinicId, planSlug) {
    const existing = await getClinicSubscription(clinicId);
    if (existing)
        return existing;
    const plan = await getPaidPlanBySlug(planSlug);
    const now = new Date().toISOString();
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .insert({
        clinic_id: clinicId,
        base_plan_id: plan.id,
        status: 'pending_payment',
        is_beta: false,
        beta_notes: `Aguardando Mercado Pago — ${plan.name}`,
        enabled_modules: [...exports.ALL_HUB_MODULES],
        started_at: now,
        created_at: now,
        updated_at: now,
    })
        .select(SUBSCRIPTION_SELECT)
        .single();
    if (error) {
        if (error.code === '23505') {
            const again = await getClinicSubscription(clinicId);
            if (again)
                return again;
        }
        console.error('[hubSubscription] createPendingPlanSubscription', error);
        throw error;
    }
    return mapSubscriptionRow(data);
}
/**
 * Aponta a assinatura para o plano escolhido e devolve o valor em centavos.
 * Plano beta/ativo só troca de verdade quando o pagamento for autorizado.
 */
async function stagePlanCheckout(clinicId, planSlug) {
    const plan = await getPaidPlanBySlug(planSlug);
    let sub = await getClinicSubscription(clinicId);
    if (!sub) {
        sub = await createPendingPlanSubscription(clinicId, planSlug);
    }
    const switchingLive = sub.status === 'beta' || sub.status === 'active' || sub.status === 'trialing';
    const now = new Date().toISOString();
    const updates = {
        updated_at: now,
        mp_preapproval_id: null,
    };
    if (switchingLive) {
        updates.pending_plan_id = plan.id;
    }
    else {
        updates.base_plan_id = plan.id;
        updates.pending_plan_id = null;
        updates.status = 'pending_payment';
        updates.is_beta = false;
    }
    const { error } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .update(updates)
        .eq('clinic_id', clinicId);
    if (error) {
        console.error('[hubSubscription] stagePlanCheckout', error);
        throw error;
    }
    const amountCents = chargeAmountCents(plan.monthly_price_cents, sub.override_monthly_cents);
    return { planName: plan.name, amountCents, payerReady: sub };
}
async function savePreapprovalId(clinicId, preapprovalId) {
    const { error } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .update({ mp_preapproval_id: preapprovalId, updated_at: new Date().toISOString() })
        .eq('clinic_id', clinicId);
    if (error)
        throw error;
}
function addOneMonth(from) {
    const d = new Date(from.getTime());
    d.setMonth(d.getMonth() + 1);
    return d.toISOString();
}
/** Aplica o estado vindo do Mercado Pago (webhook ou consulta na volta do checkout). */
async function applyMercadoPagoPreapproval(input) {
    const { data: byMp, error: mpErr } = await supabase_js_1.supabaseAdmin
        .from('clinic_hub_subscriptions')
        .select('id, clinic_id, status, mp_preapproval_id, pending_plan_id, base_plan_id')
        .eq('mp_preapproval_id', input.preapprovalId)
        .maybeSingle();
    if (mpErr)
        throw mpErr;
    let row = byMp;
    if (!row && input.externalReference) {
        const { data: byClinic, error: clinicErr } = await supabase_js_1.supabaseAdmin
            .from('clinic_hub_subscriptions')
            .select('id, clinic_id, status, mp_preapproval_id, pending_plan_id, base_plan_id')
            .eq('clinic_id', input.externalReference)
            .maybeSingle();
        if (clinicErr)
            throw clinicErr;
        row = byClinic ?? null;
    }
    if (!row)
        return;
    if (row.mp_preapproval_id && row.mp_preapproval_id !== input.preapprovalId)
        return;
    const now = new Date().toISOString();
    const mpStatus = input.status.toLowerCase();
    if (mpStatus === 'authorized') {
        const { error } = await supabase_js_1.supabaseAdmin
            .from('clinic_hub_subscriptions')
            .update({
            status: 'active',
            is_beta: false,
            base_plan_id: row.pending_plan_id || row.base_plan_id,
            pending_plan_id: null,
            mp_preapproval_id: input.preapprovalId,
            current_period_end: input.nextPaymentDate || addOneMonth(new Date()),
            canceled_at: null,
            updated_at: now,
        })
            .eq('id', row.id);
        if (error)
            throw error;
        return;
    }
    if (mpStatus === 'cancelled' || mpStatus === 'canceled') {
        if (row.status === 'active') {
            const { error } = await supabase_js_1.supabaseAdmin
                .from('clinic_hub_subscriptions')
                .update({ status: 'canceled', canceled_at: now, updated_at: now })
                .eq('id', row.id);
            if (error)
                throw error;
        }
        return;
    }
    if (mpStatus === 'paused' && row.status === 'active') {
        const { error } = await supabase_js_1.supabaseAdmin
            .from('clinic_hub_subscriptions')
            .update({ status: 'past_due', updated_at: now })
            .eq('id', row.id);
        if (error)
            throw error;
    }
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
        .select(LEGACY_SUBSCRIPTION_SELECT)
        .single();
    if (error) {
        console.error('[hubSubscription] patchClinicSubscription', error);
        throw error;
    }
    return mapSubscriptionRow(data);
}
