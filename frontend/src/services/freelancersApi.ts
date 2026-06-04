import { apiRequest } from './api';

export interface Freelancer {
  id: string;
  name: string;
  email: string;
  document_type?: 'CPF' | 'CNPJ';
  document_number?: string;
  address?: string;
  phone?: string;
  city?: string;
  state?: string;
  bio?: string;
  specialties?: string[];
  service_regions?: string[];
  experience_year?: number;
  experience?: string;
  photo_url?: string;
  status?: 'active' | 'inactive' | 'pending' | string;
  onboarding_completed?: boolean;
  approval_status?: 'pending' | 'pending_approval' | 'approved' | 'rejected' | 'pending_review';
  created_at?: string;
  updated_at?: string;
}

export interface CreateFreelancerData {
  name: string;
  document_type: 'CPF' | 'CNPJ';
  document_number: string;
  address: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  state?: string;
}

export const freelancersApi = {
  getAll: async (): Promise<{ freelancers: Freelancer[] }> => 
    apiRequest('/freelancers'),

  getById: async (id: string): Promise<{ freelancer: Freelancer }> =>
    apiRequest(`/freelancers/${id}`),

  create: async (data: CreateFreelancerData): Promise<{ success: boolean; message: string; freelancer: Freelancer }> =>
    apiRequest('/freelancers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  checkEmail: async (email: string): Promise<{ exists: boolean }> =>
    apiRequest(`/freelancers/check-email/${encodeURIComponent(email)}`),

  checkDocument: async (document_number: string): Promise<{ exists: boolean }> =>
    apiRequest(`/freelancers/check-document/${encodeURIComponent(document_number)}`),

  update: async (id: string, data: Partial<Freelancer>): Promise<{ freelancer: Freelancer }> =>
    apiRequest(`/freelancers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: async (id: string): Promise<{ success: boolean }> =>
    apiRequest(`/freelancers/${id}`, { method: 'DELETE' }),

  uploadPhoto: async (id: string, photo_url: string): Promise<{ freelancer: Freelancer }> =>
    apiRequest(`/freelancers/${id}/photo`, {
      method: 'PATCH',
      body: JSON.stringify({ photo_url }),
    }),
};

