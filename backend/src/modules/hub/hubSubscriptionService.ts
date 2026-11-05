import { supabaseAdmin } from '../../config/supabase.js';

export const BETA_PLAN_SLUG = 'beta';
export const BETA_PLAN_ID = 'a1000000-0000-4000-8000-000000000001';

export const ALL_HUB_MODULES = ['hub_core', 'clinic', 'grooming', 'boarding'] as const;
export type HubModuleSlug = (typeof ALL_HUB_MODULES)[number];

export type HubSubscriptionStatus =
  | 'beta'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'pending_payment';

export type ClinicHubSubscriptionRow = {
  id: string;
  clinic_id: string;
  base_plan_id: string;
  status: HubSubscriptionStatus;
  is_beta: boolean;
  beta_free_until: string | null;
  beta_discount_percent: number | null;
  override_monthly_cents: number | null;
  beta_notes: string | null;
  enabled_modules: string[];
  started_at: string;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  mp_preapproval_id?: string | null;
  pending_plan_id?: string | null;
  current_period_end?: string | null;
  hub_platform_plans?: {
    slug: string;
    name: string;
    max_units: number | null;
    max_users: number | null;
    monthly_price_cents?: number | null;
  } | null;
};

export type HubSubscriptionSessionPayload = {
  status: HubSubscriptionStatus;
  is_beta: boolean;
  base_plan_slug: string | null;
  enabled_modules: string[];
  beta_free_until: string | null;
};

export type HubPlatformPlanPublic = {
  slug: string;
  name: string;
  description: string | null;
  max_units: number | null;
  max_users: number | null;
  monthly_price_cents: number | null;
  sort_order: number;
};

export type HubPlatformModulePublic = {
  slug: string;
  name: string;
  description: string | null;
  monthly_price_cents: number | null;
  maps_to_entitlement: string;
  sort_order: number;
};

const ACTIVE_STATUSES = new Set<HubSubscriptionStatus>(['beta', 'trialing', 'active']);

const PLAN_EMBED =
  'hub_platform_plans!clinic_hub_subscriptions_base_plan_id_fkey';

const LEGACY_SUBSCRIPTION_SELECT =
  `id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, ${PLAN_EMBED}(slug, name, max_units, max_users)`;

const SUBSCRIPTION_SELECT =
  `id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, mp_preapproval_id, pending_plan_id, current_period_end, ${PLAN_EMBED}(slug, name, max_units, max_users, monthly_price_cents)`;

function missingMercadoPagoColumns(error: { message?: string } | null): boolean {
  const msg = error?.message || '';
  return (
    msg.includes('mp_preapproval_id') ||
    msg.includes('pending_plan_id') ||
    msg.includes('current_period_end') ||
    msg.includes('pending_payment')
  );
}

export class HubPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HubPlanError';
  }
}

export function getHubSubscriptionMode(): 'beta_only' | 'catalog' {
  const raw = (process.env.HUB_SUBSCRIPTION_MODE || 'beta_only').trim().toLowerCase();
  return raw === 'catalog' ? 'catalog' : 'beta_only';
}

function normalizeModules(modules: string[] | null | undefined): string[] {
  const set = new Set((modules || []).map((m) => String(m).trim()).filter(Boolean));
  if (!set.has('hub_core')) set.add('hub_core');
  return Array.from(set);
}

function normalizePlanJoin(
  raw: ClinicHubSubscriptionRow['hub_platform_plans'] | ClinicHubSubscriptionRow['hub_platform_plans'][] | null | undefined,
): ClinicHubSubscriptionRow['hub_platform_plans'] {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function mapSubscriptionRow(data: Record<string, unknown>): ClinicHubSubscriptionRow {
  const row = data as ClinicHubSubscriptionRow;
  return {
    ...row,
    enabled_modules: normalizeModules(row.enabled_modules),
    hub_platform_plans: normalizePlanJoin(row.hub_platform_plans as never),
  };
}

export async function getClinicSubscription(
  clinicId: string,
): Promise<ClinicHubSubscriptionRow | null> {
  let { data, error } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error && missingMercadoPagoColumns(error)) {
    const legacy = await supabaseAdmin
      .from('clinic_hub_subscriptions')
      .select(LEGACY_SUBSCRIPTION_SELECT)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error) {
    console.error('[hubSubscription] getClinicSubscription', error);
    throw error;
  }
  if (!data) return null;
  return mapSubscriptionRow(data as Record<string, unknown>);
}

export async function createBetaSubscription(
  clinicId: string,
  options?: { notes?: string | null },
): Promise<ClinicHubSubscriptionRow> {
  const existing = await getClinicSubscription(clinicId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .insert({
      clinic_id: clinicId,
      base_plan_id: BETA_PLAN_ID,
      status: 'beta',
      is_beta: true,
      beta_free_until: null,
      beta_notes: options?.notes ?? 'Programa Beta (pré-MVP)',
      enabled_modules: [...ALL_HUB_MODULES],
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
      if (again) return again;
    }
    console.error('[hubSubscription] createBetaSubscription', error);
    throw error;
  }

  return mapSubscriptionRow(data as Record<string, unknown>);
}

export async function getEnabledModules(clinicId: string): Promise<string[]> {
  const sub = await getClinicSubscription(clinicId);
  if (!sub || !ACTIVE_STATUSES.has(sub.status)) return ['hub_core'];
  return normalizeModules(sub.enabled_modules);
}

export async function organizationHasModule(
  clinicId: string,
  moduleSlug: string,
): Promise<boolean> {
  const modules = await getEnabledModules(clinicId);
  return modules.includes(moduleSlug);
}

export async function isSubscriptionActive(clinicId: string): Promise<boolean> {
  const sub = await getClinicSubscription(clinicId);
  return Boolean(sub && ACTIVE_STATUSES.has(sub.status));
}

export function toSessionSubscriptionPayload(
  sub: ClinicHubSubscriptionRow | null,
): HubSubscriptionSessionPayload | null {
  if (!sub) return null;
  const plan = sub.hub_platform_plans;
  return {
    status: sub.status,
    is_beta: sub.is_beta,
    base_plan_slug: plan?.slug ?? null,
    enabled_modules: normalizeModules(sub.enabled_modules),
    beta_free_until: sub.beta_free_until,
  };
}

export async function listPaidLaunchPlans(): Promise<HubPlatformPlanPublic[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_platform_plans')
    .select('slug, name, description, max_units, max_users, monthly_price_cents, sort_order')
    .eq('active', true)
    .eq('is_public', true)
    .neq('slug', BETA_PLAN_SLUG)
    .not('monthly_price_cents', 'is', null)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[hubSubscription] listPaidLaunchPlans', error);
    throw error;
  }
  return (data || []) as HubPlatformPlanPublic[];
}

export async function listPublicPlansAndModules(): Promise<{
  mode: 'beta_only' | 'catalog';
  plans: HubPlatformPlanPublic[];
  modules: HubPlatformModulePublic[];
  paid_plans: HubPlatformPlanPublic[];
}> {
  const mode = getHubSubscriptionMode();

  let plansQuery = supabaseAdmin
    .from('hub_platform_plans')
    .select('slug, name, description, max_units, max_users, monthly_price_cents, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (mode === 'beta_only') {
    plansQuery = plansQuery.eq('slug', BETA_PLAN_SLUG);
  } else {
    plansQuery = plansQuery.eq('is_public', true).neq('slug', BETA_PLAN_SLUG);
  }

  const [{ data: plans, error: plansError }, { data: modules, error: modulesError }, paidPlans] =
    await Promise.all([
      plansQuery,
      mode === 'beta_only'
        ? Promise.resolve({ data: [] as HubPlatformModulePublic[], error: null })
        : supabaseAdmin
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
    plans: (plans || []) as HubPlatformPlanPublic[],
    modules: (modules || []) as HubPlatformModulePublic[],
    paid_plans: paidPlans,
  };
}

type PaidPlanRow = {
  id: string;
  slug: string;
  name: string;
  monthly_price_cents: number | null;
  active: boolean;
};

async function getPaidPlanBySlug(slug: string): Promise<PaidPlanRow> {
  const { data, error } = await supabaseAdmin
    .from('hub_platform_plans')
    .select('id, slug, name, monthly_price_cents, active')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  const plan = data as PaidPlanRow | null;
  if (!plan || !plan.active || plan.slug === BETA_PLAN_SLUG || plan.monthly_price_cents == null) {
    throw new HubPlanError('Plano indisponível para assinatura.');
  }
  return plan;
}

export function chargeAmountCents(
  planCents: number,
  overrideCents: number | null | undefined,
): number {
  if (overrideCents != null && overrideCents >= 0) return overrideCents;
  return planCents;
}

/** Clínica nova escolhe um plano pago: fica pendente até o Mercado Pago autorizar. */
export async function createPendingPlanSubscription(
  clinicId: string,
  planSlug: string,
): Promise<ClinicHubSubscriptionRow> {
  const existing = await getClinicSubscription(clinicId);
  if (existing) return existing;

  const plan = await getPaidPlanBySlug(planSlug);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .insert({
      clinic_id: clinicId,
      base_plan_id: plan.id,
      status: 'pending_payment',
      is_beta: false,
      beta_notes: `Aguardando Mercado Pago — ${plan.name}`,
      enabled_modules: [...ALL_HUB_MODULES],
      started_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      const again = await getClinicSubscription(clinicId);
      if (again) return again;
    }
    console.error('[hubSubscription] createPendingPlanSubscription', error);
    throw error;
  }
  return mapSubscriptionRow(data as Record<string, unknown>);
}

/**
 * Aponta a assinatura para o plano escolhido e devolve o valor em centavos.
 * Plano beta/ativo só troca de verdade quando o pagamento for autorizado.
 */
export async function stagePlanCheckout(
  clinicId: string,
  planSlug: string,
): Promise<{ planName: string; amountCents: number; payerReady: ClinicHubSubscriptionRow }> {
  const plan = await getPaidPlanBySlug(planSlug);
  let sub = await getClinicSubscription(clinicId);
  if (!sub) {
    sub = await createPendingPlanSubscription(clinicId, planSlug);
  }

  const switchingLive = sub.status === 'beta' || sub.status === 'active' || sub.status === 'trialing';
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updated_at: now,
    mp_preapproval_id: null,
  };
  if (switchingLive) {
    updates.pending_plan_id = plan.id;
  } else {
    updates.base_plan_id = plan.id;
    updates.pending_plan_id = null;
    updates.status = 'pending_payment';
    updates.is_beta = false;
  }

  const { error } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .update(updates)
    .eq('clinic_id', clinicId);
  if (error) {
    console.error('[hubSubscription] stagePlanCheckout', error);
    throw error;
  }

  const amountCents = chargeAmountCents(plan.monthly_price_cents!, sub.override_monthly_cents);
  return { planName: plan.name, amountCents, payerReady: sub };
}

export async function savePreapprovalId(clinicId: string, preapprovalId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .update({ mp_preapproval_id: preapprovalId, updated_at: new Date().toISOString() })
    .eq('clinic_id', clinicId);
  if (error) throw error;
}

function addOneMonth(from: Date): string {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/** Aplica o estado vindo do Mercado Pago (webhook ou consulta na volta do checkout). */
export async function applyMercadoPagoPreapproval(input: {
  preapprovalId: string;
  status: string;
  externalReference: string | null;
  nextPaymentDate: string | null;
}): Promise<void> {
  const { data: byMp, error: mpErr } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .select('id, clinic_id, status, mp_preapproval_id, pending_plan_id, base_plan_id')
    .eq('mp_preapproval_id', input.preapprovalId)
    .maybeSingle();
  if (mpErr) throw mpErr;

  let row = byMp as {
    id: string;
    clinic_id: string;
    status: HubSubscriptionStatus;
    mp_preapproval_id: string | null;
    pending_plan_id: string | null;
    base_plan_id: string;
  } | null;

  if (!row && input.externalReference) {
    const { data: byClinic, error: clinicErr } = await supabaseAdmin
      .from('clinic_hub_subscriptions')
      .select('id, clinic_id, status, mp_preapproval_id, pending_plan_id, base_plan_id')
      .eq('clinic_id', input.externalReference)
      .maybeSingle();
    if (clinicErr) throw clinicErr;
    row = (byClinic as typeof row) ?? null;
  }
  if (!row) return;
  if (row.mp_preapproval_id && row.mp_preapproval_id !== input.preapprovalId) return;

  const now = new Date().toISOString();
  const mpStatus = input.status.toLowerCase();

  if (mpStatus === 'authorized') {
    const { error } = await supabaseAdmin
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
    if (error) throw error;
    return;
  }

  if (mpStatus === 'cancelled' || mpStatus === 'canceled') {
    if (row.status === 'active') {
      const { error } = await supabaseAdmin
        .from('clinic_hub_subscriptions')
        .update({ status: 'canceled', canceled_at: now, updated_at: now })
        .eq('id', row.id);
      if (error) throw error;
    }
    return;
  }

  if (mpStatus === 'paused' && row.status === 'active') {
    const { error } = await supabaseAdmin
      .from('clinic_hub_subscriptions')
      .update({ status: 'past_due', updated_at: now })
      .eq('id', row.id);
    if (error) throw error;
  }
}

export type PatchClinicSubscriptionInput = {
  is_beta?: boolean;
  beta_free_until?: string | null;
  beta_discount_percent?: number | null;
  override_monthly_cents?: number | null;
  beta_notes?: string | null;
  enabled_modules?: string[];
  status?: HubSubscriptionStatus;
};

export async function patchClinicSubscription(
  clinicId: string,
  patch: PatchClinicSubscriptionInput,
): Promise<ClinicHubSubscriptionRow> {
  let sub = await getClinicSubscription(clinicId);
  if (!sub) {
    sub = await createBetaSubscription(clinicId, { notes: 'Criada via admin' });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.is_beta !== undefined) {
    updates.is_beta = patch.is_beta;
    if (patch.is_beta && patch.status === undefined) {
      updates.status = 'beta';
    }
  }
  if (patch.beta_free_until !== undefined) updates.beta_free_until = patch.beta_free_until;
  if (patch.beta_discount_percent !== undefined) {
    updates.beta_discount_percent = patch.beta_discount_percent;
  }
  if (patch.override_monthly_cents !== undefined) {
    updates.override_monthly_cents = patch.override_monthly_cents;
  }
  if (patch.beta_notes !== undefined) updates.beta_notes = patch.beta_notes;
  if (patch.enabled_modules !== undefined) {
    updates.enabled_modules = normalizeModules(patch.enabled_modules);
  }
  if (patch.status !== undefined) updates.status = patch.status;

  const { data, error } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .update(updates)
    .eq('clinic_id', clinicId)
    .select(LEGACY_SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    console.error('[hubSubscription] patchClinicSubscription', error);
    throw error;
  }

  return mapSubscriptionRow(data as Record<string, unknown>);
}
