import { apiRequest } from './api';
import { ClinicUser, UserInvitation, InviteUserData, Role } from '../types/units';

export const clinicUsersApi = {
  // Invite new user
  invite: async (data: InviteUserData): Promise<{ invitation: UserInvitation }> => {
    return apiRequest('/clinic-users/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Accept invitation
  acceptInvitation: async (token: string): Promise<{ clinic_user: ClinicUser }> => {
    return apiRequest('/clinic-users/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  // Get clinic users
  getClinicUsers: async (
    clinicId: string,
    unitId?: string
  ): Promise<{ clinic_users: ClinicUser[] }> => {
    let url = `/clinic-users?clinic_id=${clinicId}`;
    if (unitId) {
      url += `&unit_id=${unitId}`;
    }
    return apiRequest(url);
  },

  // Get user's clinic info
  getUserClinicInfo: async (clinicId: string): Promise<{ clinic_user: ClinicUser }> => {
    return apiRequest(`/clinic-users/me/${clinicId}`);
  },

  // Update user role
  updateUserRole: async (
    clinicUserId: string,
    role: Role
  ): Promise<{ clinic_user: ClinicUser }> => {
    return apiRequest(`/clinic-users/${clinicUserId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  // Remove user
  removeUser: async (
    clinicUserId: string
  ): Promise<{ message: string; clinic_user: ClinicUser }> => {
    return apiRequest(`/clinic-users/${clinicUserId}`, {
      method: 'DELETE',
    });
  },

  // Get pending invitations
  getPendingInvitations: async (
    clinicId: string
  ): Promise<{ invitations: UserInvitation[] }> => {
    return apiRequest(`/clinic-users/invitations/pending?clinic_id=${clinicId}`);
  },

  // Cancel invitation
  cancelInvitation: async (
    invitationId: string
  ): Promise<{ message: string; invitation: UserInvitation }> => {
    return apiRequest(`/clinic-users/invitations/${invitationId}/cancel`, {
      method: 'PATCH',
    });
  },
};

