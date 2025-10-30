import { apiRequest } from './api';

// Types
export interface PendingUnit {
  id: string;
  name: string;
  nickname?: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
  cnpj?: string;
  technical_manager?: string;
  is_main: boolean;
  status: string;
  created_at: string;
  clinic: {
    id: string;
    name: string;
    email: string;
    cnpj?: string;
    phone?: string;
  };
}

// Services
export const adminApi = {
  // Get pending units for approval
  getPendingUnits: async (): Promise<{ units: PendingUnit[] }> => {
    return apiRequest('/admin/pending-units');
  },

  // Review unit (approve or reject)
  reviewUnit: async (
    id: string,
    approved: boolean,
    rejection_reason?: string
  ): Promise<{ success: boolean; status: string; message: string }> => {
    return apiRequest(`/admin/units/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, rejection_reason }),
    });
  },
};

