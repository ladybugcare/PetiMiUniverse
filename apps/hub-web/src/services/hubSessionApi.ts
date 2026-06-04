import { apiRequest } from '@petimi/web-core';

export type HubSessionClinicUser = {
  id: string | null;
  clinic_id: string | null;
  user_id: string;
  role: string;
  status: string;
  unit_id: string | null;
  first_login_at?: string | null;
  first_login_completed_at?: string | null;
  onboarding_state?: Record<string, unknown>;
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
};

export function applyHubSessionContext(ctx: HubSessionContext): string | null {
  if (ctx.clinicUser) {
    localStorage.setItem('clinic_user', JSON.stringify(ctx.clinicUser));
  }
  if (ctx.onboarding) {
    localStorage.setItem('clinicOnboarding', JSON.stringify(ctx.onboarding));
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
};
