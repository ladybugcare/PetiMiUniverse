import { apiRequest } from '@petimi/web-core';

export type HubSignupPayload = {
  full_name: string;
  email: string;
  password: string;
  phone?: string | null;
};

export type HubOnboardingClinicPayload = {
  clinic: {
    name: string;
    cnpj: string;
    address: string;
    city: string;
    state: string;
    phone?: string | null;
    description?: string | null;
  };
  unit: {
    name: string;
    nickname: string;
    address: string;
    city: string;
    state: string;
    phone?: string | null;
    is_main: boolean;
    technical_manager: string;
  };
  plan_slug?: string;
  beta_terms_accepted?: boolean;
};

export type HubSubscriptionPayload = {
  status: string;
  is_beta: boolean;
  base_plan_slug: string | null;
  enabled_modules: string[];
  beta_free_until: string | null;
};

export const hubSignupApi = {
  signup(payload: HubSignupPayload) {
    return apiRequest('/api/hub/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{
      success: boolean;
      message: string;
      email_confirmed?: boolean;
    }>;
  },

  completeOnboarding(payload: HubOnboardingClinicPayload) {
    return apiRequest('/api/hub/onboarding/clinic', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{
      clinic: Record<string, unknown>;
      unit: Record<string, unknown>;
      clinicUser: Record<string, unknown>;
      subscription?: HubSubscriptionPayload | null;
      message: string;
    }>;
  },

  checkCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    return apiRequest(`/clinics/check-cnpj/${encodeURIComponent(digits)}`) as Promise<{
      available?: boolean;
      exists?: boolean;
    }>;
  },
};
