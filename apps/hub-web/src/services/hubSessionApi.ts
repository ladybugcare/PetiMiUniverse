import { apiRequest } from '@petimi/web-core';

export type HubSessionClinicUser = {
  id: string | null;
  clinic_id: string | null;
  user_id: string;
  role: string;
  status: string;
  unit_id: string | null;
  operational_areas?: string[];
  first_login_at?: string | null;
  first_login_completed_at?: string | null;
  onboarding_state?: Record<string, unknown>;
};

export type HubSubscriptionSession = {
  status: string;
  is_beta: boolean;
  base_plan_slug: string | null;
  enabled_modules: string[];
  beta_free_until: string | null;
};

export type HubSessionContext = {
  clinicUser: HubSessionClinicUser | null;
  onboarding: {
    clinicId: string | null;
    clinicStatus?: string | null;
    hasUnits: boolean;
    needsOnboarding: boolean;
    shouldCompleteClinicProfile: boolean;
    shouldCompleteFirstUnit?: boolean;
  };
  subscription?: HubSubscriptionSession | null;
};

export function applyHubSessionContext(ctx: HubSessionContext): string | null {
  if (ctx.clinicUser) {
    localStorage.setItem('clinic_user', JSON.stringify(ctx.clinicUser));
  }
  if (ctx.onboarding) {
    localStorage.setItem('clinicOnboarding', JSON.stringify(ctx.onboarding));
  }
  if (ctx.subscription) {
    localStorage.setItem('hub_subscription', JSON.stringify(ctx.subscription));
  } else {
    localStorage.removeItem('hub_subscription');
  }
  const clinicId = ctx.clinicUser?.clinic_id || ctx.onboarding?.clinicId || null;
  if (clinicId) {
    try {
      window.dispatchEvent(new Event('petimi:clinic-storage-updated'));
    } catch {
      /* ignore */
    }
  }
  return clinicId;
}

export const hubSessionApi = {
  getContext(): Promise<HubSessionContext> {
    return apiRequest('/api/hub/session/context') as Promise<HubSessionContext>;
  },

  getPlans() {
    return apiRequest('/api/hub/subscription/plans') as Promise<{
      mode: 'beta_only' | 'catalog';
      plans: Array<{
        slug: string;
        name: string;
        description: string | null;
        max_units: number | null;
        max_users: number | null;
        monthly_price_cents: number | null;
        sort_order: number;
      }>;
      modules: Array<{
        slug: string;
        name: string;
        description: string | null;
        monthly_price_cents: number | null;
        maps_to_entitlement: string;
        sort_order: number;
      }>;
    }>;
  },
};
