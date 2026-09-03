import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/partner-clinics';

export type HubPartnerClinic = {
  id: string;
  clinic_id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  is_active: boolean;
  postal_code?: string | null;
  state?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  /** Legado — preferir street/street_number. */
  address_line?: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateHubPartnerClinicPayload = {
  clinic_id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  is_active?: boolean;
  postal_code?: string | null;
  state?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  address_line?: string | null;
};

export type PatchHubPartnerClinicPayload = Partial<Omit<CreateHubPartnerClinicPayload, 'clinic_id'>> & {
  clinic_id: string;
};

export type CareLocationKind = 'own_unit' | 'partner_clinic';

export type CareLocationPayload = {
  care_location_kind?: CareLocationKind;
  hub_partner_clinic_id?: string | null;
};

/** Formata endereço estruturado (mesmo padrão de tutores). */
export function formatPartnerClinicAddress(p: {
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  address_line?: string | null;
}): string {
  const parts: string[] = [];
  if (p.street) {
    parts.push([p.street, p.street_number].filter(Boolean).join(', '));
  } else if (p.address_line) {
    parts.push(p.address_line);
  }
  if (p.complement) parts.push(p.complement);
  if (p.district) parts.push(p.district);
  const cityState = [p.city, p.state].filter(Boolean).join(' / ');
  if (cityState) parts.push(cityState);
  if (p.postal_code) parts.push(`CEP ${p.postal_code}`);
  return parts.join(' · ');
}

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
