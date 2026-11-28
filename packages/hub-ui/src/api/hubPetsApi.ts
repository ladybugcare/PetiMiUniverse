import { apiRequest } from '@petimi/web-core';

import type { CoatTypeValue, PetBodyPorteValue } from '../utils/hubServiceTypesPricingMatrix';
import type { PetDeathSource, PetDeathType, PetSituationFilter } from '../pages/pets/petDeath';

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

export type HubPetDeathCancelledAppointment = {
  id: string;
  starts_at: string;
  status: string;
  service_name: string | null;
};

export type HubPetDeathPendingReviewKind =
  | 'appointment_in_progress'
  | 'boarding_reservation'
  | 'grooming_session'
  | 'surgery_scheduled';

export type HubPetDeathPendingReviewItem = {
  kind: HubPetDeathPendingReviewKind;
  id: string;
  status: string;
  starts_at?: string | null;
  expected_check_in?: string | null;
  expected_check_out?: string | null;
  service_name?: string | null;
  label?: string | null;
  grooming_stage?: string | null;
  hub_appointment_id?: string | null;
};

export type HubPetDeathPending = {
  future_appointments: number;
  active_boarding_reservations: number;
  cancelled_appointments?: number;
  pending_review_count?: number;
  cancelled_appointments_list?: HubPetDeathCancelledAppointment[];
  pending_review?: HubPetDeathPendingReviewItem[];
};

/** Abre o painel de revisão se houve cancelamento automático ou restam pendências. */
export function shouldOpenPetDeathReview(pending?: HubPetDeathPending | null): boolean {
  if (!pending) return false;
  const cancelled =
    pending.cancelled_appointments_list?.length ?? pending.cancelled_appointments ?? 0;
  const review = pending.pending_review?.length ?? pending.pending_review_count ?? 0;
  return cancelled > 0 || review > 0;
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
  /** Microchip físico; distinto de `petmi_pet_id`. Ausente em respostas legadas. */
  external_microchip?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deceased_at?: string | null;
  death_type?: PetDeathType | string | null;
  death_cause?: string | null;
  death_notes?: string | null;
  death_source?: PetDeathSource | string | null;
  death_ref_id?: string | null;
  death_recorded_at?: string | null;
  death_recorded_by?: string | null;
  death_invalidated_at?: string | null;
  death_invalidated_by?: string | null;
  death_invalidation_reason?: string | null;
  primary_guardian: HubPetGuardianRef | null;
  secondary_guardian: HubPetGuardianRef | null;
}

export type HubPetDeathPayload = {
  clinic_id: string;
  deceased_at?: string;
  death_type: PetDeathType;
  death_cause?: string | null;
  death_notes?: string | null;
  death_source?: PetDeathSource;
  death_ref_id?: string | null;
  archive?: boolean;
  hub_case_id?: string | null;
  hub_encounter_id?: string | null;
  created_by_staff_id?: string | null;
};

function listUrl(clinicId: string, bustCache: boolean, situation: PetSituationFilter = 'active'): string {
  const q = new URLSearchParams({ clinic_id: clinicId, situation });
  if (bustCache) q.set('_', String(Date.now()));
  return `${basePath}?${q.toString()}`;
}

export const hubPetsApi = {
  async list(
    clinicId: string,
    bustCache = false,
    situation: PetSituationFilter = 'active',
  ): Promise<{ pets: HubPet[] }> {
    return apiRequest(listUrl(clinicId, bustCache, situation)) as Promise<{ pets: HubPet[] }>;
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
    external_microchip?: string | null;
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
      external_microchip?: string | null;
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

  async registerDeath(
    id: string,
    payload: HubPetDeathPayload,
  ): Promise<{ pet: HubPet; pending?: HubPetDeathPending; archived?: boolean }> {
    return apiRequest(`${basePath}/${id}/death`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ pet: HubPet; pending?: HubPetDeathPending; archived?: boolean }>;
  },

  async correctDeath(
    id: string,
    payload: {
      clinic_id: string;
      reason: string;
      deceased_at?: string;
      death_type?: PetDeathType;
      death_cause?: string | null;
      death_notes?: string | null;
    },
  ): Promise<{ pet: HubPet }> {
    return apiRequest(`${basePath}/${id}/death`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ pet: HubPet }>;
  },

  async invalidateDeath(
    id: string,
    payload: {
      clinic_id: string;
      reason: string;
      amendment_status?: 'discharged' | 'transferred' | null;
    },
  ): Promise<{ pet: HubPet }> {
    return apiRequest(`${basePath}/${id}/death/invalidate`, {
      method: 'POST',
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
