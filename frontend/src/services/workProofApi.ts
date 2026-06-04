import { apiRequest } from './api';
import { DemandApplication } from './applicationsApi';

export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface WorkProof {
  id: string;
  application_id: string;
  checkin_time?: string;
  checkout_time?: string;
  location_checkin?: Location;
  location_checkout?: Location;
  report_text?: string;
  attachments?: string[];
  clinic_signature?: {
    signed_by: string;
    signed_at: string;
    signature_data?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface CheckInData {
  location?: Location;
}

export interface CheckOutData {
  location?: Location;
}

export interface SubmitReportData {
  report_text: string;
  attachments?: string[];
}

export const workProofApi = {
  /**
   * Fazer check-in
   */
  checkIn: async (applicationId: string, location?: Location): Promise<{ workProof: WorkProof }> => {
    return apiRequest(`/api/demand-applications/${applicationId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ location }),
    });
  },

  /**
   * Fazer check-out
   */
  checkOut: async (applicationId: string, location?: Location): Promise<{ workProof: WorkProof }> => {
    return apiRequest(`/api/demand-applications/${applicationId}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ location }),
    });
  },

  /**
   * Enviar relatório
   */
  submitReport: async (
    applicationId: string,
    reportText: string,
    attachments?: string[]
  ): Promise<{ workProof: WorkProof }> => {
    return apiRequest(`/api/demand-applications/${applicationId}/report`, {
      method: 'POST',
      body: JSON.stringify({
        report_text: reportText,
        attachments: attachments || [],
      }),
    });
  },

  /**
   * Aprovar relatório (clínica)
   */
  approveReport: async (applicationId: string): Promise<{ application: DemandApplication }> => {
    return apiRequest(`/api/demand-applications/${applicationId}/approve-report`, {
      method: 'POST',
    });
  },

  /**
   * Obter prova de trabalho
   */
  getWorkProof: async (applicationId: string): Promise<{ workProof: WorkProof | null }> => {
    return apiRequest(`/api/demand-applications/${applicationId}/work-proof`);
  },
};

