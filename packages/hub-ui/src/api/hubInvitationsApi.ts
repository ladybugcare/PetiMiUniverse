import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/invitations';

export type HubInvitationPreview = {
  invitation: {
    email: string;
    role: string;
    expires_at: string;
    clinic_id: string;
    unit_id: string;
  };
  clinic_name: string | null;
  unit_name: string | null;
  role_label: string;
  account_exists: boolean;
  blocked: boolean;
  invitation_url: string;
};

export type HubInviteSignupResult = {
  success: boolean;
  message: string;
  user_id: string;
  email_confirmed: boolean;
  clinic_user: Record<string, unknown>;
  role: string;
};

export const hubInvitationsApi = {
  preview(token: string): Promise<HubInvitationPreview> {
    const q = new URLSearchParams({ token });
    return apiRequest(`${basePath}/preview?${q.toString()}`) as Promise<HubInvitationPreview>;
  },

  checkEmail(clinicId: string, email: string): Promise<{ available: boolean; reason?: string }> {
    const q = new URLSearchParams({ clinic_id: clinicId, email });
    return apiRequest(`${basePath}/check-email?${q.toString()}`) as Promise<{
      available: boolean;
      reason?: string;
    }>;
  },

  signup(payload: {
    token: string;
    full_name: string;
    password: string;
    phone?: string | null;
  }): Promise<HubInviteSignupResult> {
    return apiRequest(`${basePath}/signup`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<HubInviteSignupResult>;
  },
};
