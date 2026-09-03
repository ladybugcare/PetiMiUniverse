import { apiRequest } from '@petimi/web-core';

import type { CoatTypeValue, PetBodyPorteValue } from '../utils/hubServiceTypesPricingMatrix';

const basePath = '/api/hub/pets';

export type HubPetProfileSource = 'wizard' | 'clinic' | 'grooming' | 'boarding' | 'pets_form';

export type HubPetProfileChange = {
  id: string;
  pet_id: string;
  field: 'neutered' | 'behavior_tags' | 'clinical_flag';
  old_value: unknown;
  new_value: unknown;
  source: HubPetProfileSource;
  actor_user_id: string | null;
  created_at: string;
};

export type HubPetHealthPayload = {
  neutered?: boolean | null;
  profile_source?: HubPetProfileSource;
  behavior_tags_mode?: 'replace' | 'union';
  clinical_flags?: Array<{ flag_key: string; label?: string; notes?: string | null }>;
  clinical_flags_mode?: 'replace' | 'union';
};

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
  behavior_tags: string[] | null;
  neutered?: boolean | null;
  size_tier: PetBodyPorteValue;
  coat_color: string | null;
  coat_type: CoatTypeValue | null;
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
    behavior_tags?: string[] | null;
    size_tier: PetBodyPorteValue;
    coat_color?: string | null;
    coat_type?: CoatTypeValue | null;
    primary_guardian_id: string;
    secondary_guardian_id?: string | null;
  } & HubPetHealthPayload): Promise<{ pet: HubPet }> {
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
      behavior_tags?: string[] | null;
      size_tier?: PetBodyPorteValue;
      coat_color?: string | null;
      coat_type?: CoatTypeValue | null;
      archived?: boolean;
      primary_guardian_id?: string;
      secondary_guardian_id?: string | null;
    } & HubPetHealthPayload
  ): Promise<{ pet: HubPet }> {
    return apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ pet: HubPet }>;
  },

  async listProfileChanges(clinicId: string, petId: string): Promise<{ changes: HubPetProfileChange[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/${petId}/profile-changes?${q.toString()}`) as Promise<{
      changes: HubPetProfileChange[];
    }>;
  },
};
