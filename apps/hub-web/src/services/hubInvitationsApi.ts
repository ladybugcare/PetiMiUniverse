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

export type HubInviteAcceptResult = {
  success: boolean;
  message: string;
  clinic_user: Record<string, unknown>;
  role: string;
};

export const hubInvitationsApi = {
  preview(token: string): Promise<HubInvitationPreview> {
    const q = new URLSearchParams({ token });
    return apiRequest(`${basePath}/preview?${q.toString()}`) as Promise<HubInvitationPreview>;
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

  accept(token: string): Promise<HubInviteAcceptResult> {
    return apiRequest(`${basePath}/accept`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }) as Promise<HubInviteAcceptResult>;
  },
};
