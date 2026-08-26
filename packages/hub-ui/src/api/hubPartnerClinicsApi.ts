import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/partner-clinics';

export type HubPartnerClinic = {
  id: string;
  clinic_id: string;
  name: string;
  city?: string | null;
  address_line?: string | null;
  phone?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateHubPartnerClinicPayload = {
  clinic_id: string;
  name: string;
  city?: string | null;
  address_line?: string | null;
  phone?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export type PatchHubPartnerClinicPayload = Partial<Omit<CreateHubPartnerClinicPayload, 'clinic_id'>> & {
  clinic_id: string;
};

export type CareLocationKind = 'own_unit' | 'partner_clinic';

export type CareLocationPayload = {
  care_location_kind?: CareLocationKind;
  hub_partner_clinic_id?: string | null;
};

export const hubPartnerClinicsApi = {
  list(clinicId: string, opts?: { includeInactive?: boolean }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.includeInactive) q.set('include_inactive', 'true');
    return apiRequest(`${base}?${q}`) as Promise<{ partner_clinics: HubPartnerClinic[] }>;
  },

  create(payload: CreateHubPartnerClinicPayload) {
    return apiRequest(base, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ partner_clinic: HubPartnerClinic }>;
  },

  patch(id: string, payload: PatchHubPartnerClinicPayload) {
    return apiRequest(`${base}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ partner_clinic: HubPartnerClinic }>;
  },

  remove(id: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/${encodeURIComponent(id)}?${q}`, {
      method: 'DELETE',
    }) as Promise<{ deleted: boolean }>;
  },
};
