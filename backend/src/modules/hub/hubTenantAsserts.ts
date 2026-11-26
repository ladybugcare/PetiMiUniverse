/**
 * Asserts de isolamento multi-tenant para o Hub.
 * service_role bypassa RLS — toda FK de create/update deve passar por aqui.
 */
import { supabaseAdmin } from '../../config/supabase';
import { isPetEligibleForNewOp } from './petDeathService';

/**
 * Pet existe na clínica e está elegível para **novas** operações de rotina
 * (não arquivado e sem óbito válido).
 */
export async function assertPetInClinic(clinicId: string, petId: string | null | undefined): Promise<boolean> {
  return assertPetEligibleForNewOp(clinicId, petId);
}

/** Alias explícito — mesmas regras de assertPetInClinic. */
export async function assertPetEligibleForNewOp(
  clinicId: string,
  petId: string | null | undefined,
): Promise<boolean> {
  if (!petId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_pets')
    .select('id, deleted_at, deceased_at, death_invalidated_at')
    .eq('id', petId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error || !data) return false;
  return isPetEligibleForNewOp(data as {
    deleted_at?: string | null;
    deceased_at?: string | null;
    death_invalidated_at?: string | null;
  });
}

/** Pet existe na clínica (permite falecido/arquivado para leitura e conclusão histórica). */
export async function assertPetExistsInClinic(
  clinicId: string,
  petId: string | null | undefined,
): Promise<boolean> {
  if (!petId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_pets')
    .select('id')
    .eq('id', petId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return !error && !!data;
}

export async function assertGuardianInClinic(
  clinicId: string,
  guardianId: string | null | undefined,
): Promise<boolean> {
  if (!guardianId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_guardians')
    .select('id')
    .eq('id', guardianId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  return !error && !!data;
}

export async function assertUnitInClinic(clinicId: string, unitId: string | null | undefined): Promise<boolean> {
  if (!unitId) return true;
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('id, clinic_id')
    .eq('id', unitId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { clinic_id: string }).clinic_id === clinicId;
}

export async function assertStaffInClinic(clinicId: string, staffId: string | null | undefined): Promise<boolean> {
  if (!staffId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('id', staffId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  return !error && !!data;
}

export async function assertEncounterInClinic(
  clinicId: string,
  encounterId: string | null | undefined,
  petId?: string | null,
): Promise<boolean> {
  if (!encounterId) return true;
  let q = supabaseAdmin
    .from('hub_encounters')
    .select('id, pet_id')
    .eq('id', encounterId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return false;
  if (petId && (data as { pet_id: string }).pet_id !== petId) return false;
  return true;
}

export async function assertCaseInClinic(
  clinicId: string,
  caseId: string | null | undefined,
  petId?: string | null,
): Promise<boolean> {
  if (!caseId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_clinical_cases')
    .select('id, pet_id')
    .eq('id', caseId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;
  if (petId && (data as { pet_id: string }).pet_id !== petId) return false;
  return true;
}

/** Tutor vinculado ao pet (papel primário ou secundário). */
export async function assertGuardianLinkedToPet(
  petId: string | null | undefined,
  guardianId: string | null | undefined,
): Promise<boolean> {
  if (!petId || !guardianId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_pet_guardians')
    .select('id')
    .eq('pet_id', petId)
    .eq('guardian_id', guardianId)
    .limit(1)
    .maybeSingle();
  return !error && !!data;
}

export async function assertHospitalBedInClinic(
  clinicId: string,
  bedId: string | null | undefined,
): Promise<boolean> {
  if (!bedId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_hospital_beds')
    .select('id')
    .eq('id', bedId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  return !error && !!data;
}

export async function assertComandaInClinic(
  clinicId: string,
  comandaId: string | null | undefined,
): Promise<boolean> {
  if (!comandaId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_comandas')
    .select('id')
    .eq('id', comandaId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return !error && !!data;
}

export async function assertReceivableInClinic(
  clinicId: string,
  receivableId: string | null | undefined,
): Promise<boolean> {
  if (!receivableId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('id')
    .eq('id', receivableId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return !error && !!data;
}
