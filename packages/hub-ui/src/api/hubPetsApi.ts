import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/pets';

export interface HubPetGuardianRef {
  guardian_id: string;
  guardian_name: string | null;
}

export interface HubPet {
  id: string;
  petmi_pet_id: string;
  clinic_id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  primary_guardian: HubPetGuardianRef | null;
  secondary_guardian: HubPetGuardianRef | null;
}

function listUrl(clinicId: string, bustCache: boolean): string {
  const q = new URLSearchParams({ clinic_id: clinicId });
  if (bustCache) q.set('_', String(Date.now()));
  return `${basePath}?${q.toString()}`;
}

export const hubPetsApi = {
  async list(clinicId: string, bustCache = false): Promise<{ pets: HubPet[] }> {
    return apiRequest(listUrl(clinicId, bustCache)) as Promise<{ pets: HubPet[] }>;
  },

  async create(payload: {
    clinic_id: string;
    name: string;
    species: string;
    breed?: string | null;
    sex?: 'M' | 'F' | 'U' | null;
    birth_date?: string;
    notes?: string | null;
    primary_guardian_id: string;
    secondary_guardian_id?: string | null;
  }): Promise<{ pet: HubPet }> {
    return apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ pet: HubPet }>;
  },

  async update(
    id: string,
    payload: {
      clinic_id: string;
      name?: string;
      species?: string;
      breed?: string | null;
      sex?: 'M' | 'F' | 'U' | null;
      birth_date?: string | null;
      notes?: string | null;
      archived?: boolean;
      primary_guardian_id?: string;
      secondary_guardian_id?: string | null;
    }
  ): Promise<{ pet: HubPet }> {
    return apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ pet: HubPet }>;
  },
};
