import { apiRequest } from './api';
import { supabase } from './supabase';
import { Platform } from 'react-native';

export interface OnboardingStatus {
  needsOnboarding: boolean;
  emailConfirmed: boolean;
  onboardingCompleted: boolean;
  crmv?: string | null;
}

export interface CompleteOnboardingData {
  specialties: string[];
  service_regions: string[];
  experience_year: number;
  bio: string;
  crmv_file_url?: string;
}

export interface UploadCrmvResponse {
  success: boolean;
  url: string;
  path: string;
}

export const vetOnboardingApi = {
  /**
   * Verifica se o veterinário precisa completar o onboarding
   */
  checkOnboardingStatus: async (): Promise<OnboardingStatus> => {
    return apiRequest('/vets/onboarding/check', {
      method: 'GET',
    });
  },

  /**
   * Completa o onboarding do veterinário
   */
  completeOnboarding: async (data: CompleteOnboardingData): Promise<{ success: boolean; message: string; vet: any }> => {
    return apiRequest('/vets/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Faz upload do arquivo CRMV
   */
  uploadCrmvFile: async (file: File): Promise<UploadCrmvResponse> => {
    const formData = new FormData();
    formData.append('crmv_file', file);

    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    let authToken: string | null = null;

    // 🪄 Sempre buscar token fresco do Supabase (renova automaticamente se necessário)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Erro ao obter sessão do Supabase:', sessionError);
      }
      
      // Se a sessão existe mas o token pode estar expirado, tentar renovar
      if (session) {
        authToken = session.access_token;
        
        // Verificar se o token está próximo de expirar (menos de 5 minutos)
        const expiresAt = session.expires_at;
        if (expiresAt) {
          const expiresIn = expiresAt - Math.floor(Date.now() / 1000);
          if (expiresIn < 300) { // Menos de 5 minutos
            console.log('Token próximo de expirar, renovando...');
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshedSession) {
              authToken = refreshedSession.access_token;
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao obter/renovar sessão:', error);
    }

    // Fallback: buscar token do localStorage se Supabase não retornar
    if (!authToken && Platform.OS === 'web') {
      const sessionStr = typeof localStorage !== 'undefined' ? localStorage.getItem('session') : null;
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          authToken = session.access_token || session?.access_token;
        } catch {
          /* ignora */
        }
      }
    }

    if (!authToken) {
      throw new Error('Token de autenticação não encontrado. Por favor, faça login novamente.');
    }

    // Montar headers (não incluir Content-Type para FormData, o browser define automaticamente)
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${authToken}`,
    };

    const response = await fetch(`${API_URL}/vets/onboarding/upload-crmv`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Erro ao fazer upload do arquivo' }));
      throw new Error(error.error || 'Erro ao fazer upload do arquivo');
    }

    return response.json();
  },
};

