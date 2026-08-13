import { supabaseAdmin } from '../../config/supabase.js';

export const BETA_PLAN_SLUG = 'beta';
export const BETA_PLAN_ID = 'a1000000-0000-4000-8000-000000000001';

export const ALL_HUB_MODULES = ['hub_core', 'clinic', 'grooming', 'boarding'] as const;
export type HubModuleSlug = (typeof ALL_HUB_MODULES)[number];

export type HubSubscriptionStatus = 'beta' | 'trialing' | 'active' | 'past_due' | 'canceled';

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
  hub_platform_plans?: {
    slug: string;
    name: string;
    max_units: number | null;
    max_users: number | null;
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
  const { data, error } = await supabaseAdmin
    .from('clinic_hub_subscriptions')
    .select(
      'id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, hub_platform_plans(slug, name, max_units, max_users)',
    )
    .eq('clinic_id', clinicId)
    .maybeSingle();

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
    .select(
      'id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, hub_platform_plans(slug, name, max_units, max_users)',
    )
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

export async function listPublicPlansAndModules(): Promise<{
  mode: 'beta_only' | 'catalog';
  plans: HubPlatformPlanPublic[];
  modules: HubPlatformModulePublic[];
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

  const [{ data: plans, error: plansError }, { data: modules, error: modulesError }] =
    await Promise.all([
      plansQuery,
      mode === 'beta_only'
        ? Promise.resolve({ data: [] as HubPlatformModulePublic[], error: null })
        : supabaseAdmin
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
    plans: (plans || []) as HubPlatformPlanPublic[],
    modules: (modules || []) as HubPlatformModulePublic[],
  };
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
    .select(
      'id, clinic_id, base_plan_id, status, is_beta, beta_free_until, beta_discount_percent, override_monthly_cents, beta_notes, enabled_modules, started_at, canceled_at, created_at, updated_at, hub_platform_plans(slug, name, max_units, max_users)',
    )
    .single();

  if (error) {
    console.error('[hubSubscription] patchClinicSubscription', error);
    throw error;
  }

  return mapSubscriptionRow(data as Record<string, unknown>);
}
