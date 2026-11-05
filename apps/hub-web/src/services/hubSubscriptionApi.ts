import { apiRequest } from '@petimi/web-core';

export type HubPaidPlan = {
  slug: string;
  name: string;
  description: string | null;
  max_units: number | null;
  max_users: number | null;
  monthly_price_cents: number | null;
  sort_order: number;
};

export type HubSubscriptionMe = {
  mercado_pago_configured: boolean;
  can_checkout: boolean;
  mode: 'beta_only' | 'catalog';
  paid_plans: HubPaidPlan[];
  subscription: {
    status: string;
    is_beta: boolean;
    base_plan_slug: string | null;
    enabled_modules: string[];
    beta_free_until: string | null;
    plan_name: string | null;
    monthly_price_cents: number | null;
    max_units: number | null;
    max_users: number | null;
    current_period_end: string | null;
    mp_preapproval_id: string | null;
  } | null;
};

export function formatPlanPrice(cents: number | null | undefined): string {
  if (cents == null) return 'A definir';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const hubSubscriptionApi = {
  me() {
    return apiRequest('/api/hub/subscription') as Promise<HubSubscriptionMe>;
  },

  checkout(planSlug: string) {
    return apiRequest('/api/hub/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan_slug: planSlug }),
    }) as Promise<{ init_point: string; preapproval_id: string }>;
  },

  sync() {
    return apiRequest('/api/hub/subscription/sync', { method: 'POST' }) as Promise<{
      synced: boolean;
      subscription: { status: string; is_beta: boolean; base_plan_slug: string | null } | null;
    }>;
  },
};
