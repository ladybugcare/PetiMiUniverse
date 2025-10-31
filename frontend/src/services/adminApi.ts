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

export interface CreateUserData {
  name: string;
  email: string;
  user_type: 'clinic' | 'vet' | 'supplier' | 'tutor' | 'admin';
  password?: string;
  generate_password?: boolean;
  status: 'active' | 'inactive';
  // Campos específicos por tipo
  cnpj?: string; // para clinic
  clinic_role?: 'standard' | 'premium' | 'partner'; // role da clínica
  crmv?: string; // para vet
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
}

export interface CreateUserResponse {
  success: boolean;
  message: string;
  user: {
    id: string;
    name: string;
    email: string;
    type: string;
    status: string;
    profile: any;
  };
  password_sent: boolean;
  is_password_generated: boolean;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  last_sign_in_at?: string | null;
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

  // Create new user
  createUser: async (data: CreateUserData): Promise<CreateUserResponse> => {
    return apiRequest('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get all admins
  getAdmins: async (): Promise<{ admins: Admin[] }> => {
    return apiRequest('/admin/admins');
  },
};

