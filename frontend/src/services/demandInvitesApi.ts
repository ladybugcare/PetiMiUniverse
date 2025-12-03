import { apiRequest } from './api';
import { DemandApplication } from './applicationsApi';

export interface InviteVetData {
  vet_id: string;
}

export const demandInvitesApi = {
  /**
   * Convidar um veterinário para uma demanda
   */
  inviteVet: async (demandId: string, vetId: string): Promise<{ application: DemandApplication }> => {
    return apiRequest(`/api/demands/${demandId}/invite-vet`, {
      method: 'POST',
      body: JSON.stringify({ vet_id: vetId }),
    });
  },

  /**
   * Aceitar um convite
   */
  acceptInvite: async (applicationId: string): Promise<{ application: DemandApplication }> => {
    return apiRequest(`/api/demand-applications/${applicationId}/accept-invite`, {
      method: 'POST',
    });
  },

  /**
   * Recusar um convite
   */
  rejectInvite: async (applicationId: string): Promise<{ application: DemandApplication }> => {
    return apiRequest(`/api/demand-applications/${applicationId}/reject-invite`, {
      method: 'POST',
    });
  },

  /**
   * Listar convites pendentes do veterinário logado
   */
  getPendingInvites: async (): Promise<{ applications: DemandApplication[] }> => {
    return apiRequest('/api/demand-applications/invites/pending');
  },
};

