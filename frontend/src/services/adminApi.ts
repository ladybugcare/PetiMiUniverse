// frontend/src/services/adminApi.ts
import { apiRequest } from './api';

// Tipos
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
  user_type: 'clinic' | 'vet' | 'freelancer' | 'supplier' | 'tutor' | 'admin';
  password?: string;
  generate_password?: boolean;
  status: 'active' | 'inactive';
  // Campos específicos
  cnpj?: string;
  clinic_role?: 'admin' | 'manager' | 'staff';
  crmv?: string;
  document_type?: 'CPF' | 'CNPJ';
  document_number?: string;
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

// Serviços administrativos
export const adminApi = {
  // Listar unidades pendentes
  getPendingUnits: async (): Promise<{ units: PendingUnit[] }> =>
    apiRequest('/admin/pending-units'),

  // Revisar unidade
  reviewUnit: async (
    id: string,
    approved: boolean,
    rejection_reason?: string
  ): Promise<{ success: boolean; status: string; message: string }> =>
    apiRequest(`/admin/units/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, rejection_reason }),
    }),

  // Criar novo usuário (admin/clinic/vet)
  createUser: async (data: CreateUserData): Promise<CreateUserResponse> => {
    const { user_type } = data;
    return apiRequest(`/admin/users/create/${user_type}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Buscar administradores
  getAdmins: async (): Promise<{ admins: Admin[] }> =>
    apiRequest('/admin/users/admins'),

  // ===========================================================
  // 🩺 APROVAÇÃO DE VETERINÁRIOS
  // ===========================================================
  
  // Listar veterinários pendentes de aprovação
  getPendingVets: async (): Promise<{ success: boolean; vets: any[]; count: number }> =>
    apiRequest('/vets/pending', {
      method: 'GET',
    }),

  // Aprovar veterinário
  approveVet: async (id: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/vets/${id}/approve`, {
      method: 'POST',
    }),

  // Rejeitar veterinário
  rejectVet: async (id: string, reason: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/vets/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason: reason }),
    }),

  // Solicitar ajustes (opcional)
  requestVetChanges: async (id: string, feedback: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/vets/${id}/request-changes`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    }),

  // ===========================================================
  // 💼 APROVAÇÃO DE FREELANCERS
  // ===========================================================
  
  // Listar freelancers pendentes de aprovação
  getPendingFreelancers: async (): Promise<{ success: boolean; freelancers: any[]; count: number }> =>
    apiRequest('/freelancers/pending', {
      method: 'GET',
    }),

  // Aprovar freelancer
  approveFreelancer: async (id: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/freelancers/${id}/approve`, {
      method: 'POST',
    }),

  // Rejeitar freelancer
  rejectFreelancer: async (id: string, reason: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/freelancers/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason: reason }),
    }),
};
