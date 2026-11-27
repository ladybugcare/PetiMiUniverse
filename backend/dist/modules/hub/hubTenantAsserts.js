"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPetInClinic = assertPetInClinic;
exports.assertPetEligibleForNewOp = assertPetEligibleForNewOp;
exports.assertPetExistsInClinic = assertPetExistsInClinic;
exports.assertGuardianInClinic = assertGuardianInClinic;
exports.assertUnitInClinic = assertUnitInClinic;
exports.assertStaffInClinic = assertStaffInClinic;
exports.assertEncounterInClinic = assertEncounterInClinic;
exports.assertCaseInClinic = assertCaseInClinic;
exports.assertGuardianLinkedToPet = assertGuardianLinkedToPet;
exports.assertHospitalBedInClinic = assertHospitalBedInClinic;
exports.assertComandaInClinic = assertComandaInClinic;
exports.assertReceivableInClinic = assertReceivableInClinic;
/**
 * Asserts de isolamento multi-tenant para o Hub.
 * service_role bypassa RLS — toda FK de create/update deve passar por aqui.
 */
const supabase_1 = require("../../config/supabase");
const petDeathService_1 = require("./petDeathService");
/**
 * Pet existe na clínica e está elegível para **novas** operações de rotina
 * (não arquivado e sem óbito válido).
 */
async function assertPetInClinic(clinicId, petId) {
    return assertPetEligibleForNewOp(clinicId, petId);
}
/** Alias explícito — mesmas regras de assertPetInClinic. */
async function assertPetEligibleForNewOp(clinicId, petId) {
    if (!petId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('id, deleted_at, deceased_at, death_invalidated_at')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error || !data)
        return false;
    return (0, petDeathService_1.isPetEligibleForNewOp)(data);
}
/** Pet existe na clínica (permite falecido/arquivado para leitura e conclusão histórica). */
async function assertPetExistsInClinic(clinicId, petId) {
    if (!petId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('id')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    return !error && !!data;
}
async function assertGuardianInClinic(clinicId, guardianId) {
    if (!guardianId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_guardians')
        .select('id')
        .eq('id', guardianId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return !error && !!data;
}
async function assertUnitInClinic(clinicId, unitId) {
    if (!unitId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('units')
        .select('id, clinic_id')
        .eq('id', unitId)
        .maybeSingle();
    if (error || !data)
        return false;
    return data.clinic_id === clinicId;
}
async function assertStaffInClinic(clinicId, staffId) {
    if (!staffId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('id')
        .eq('id', staffId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return !error && !!data;
}
async function assertEncounterInClinic(clinicId, encounterId, petId) {
    if (!encounterId)
        return true;
    let q = supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('id, pet_id')
        .eq('id', encounterId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
    const { data, error } = await q.maybeSingle();
    if (error || !data)
        return false;
    if (petId && data.pet_id !== petId)
        return false;
    return true;
}
async function assertCaseInClinic(clinicId, caseId, petId) {
    if (!caseId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .select('id, pet_id')
        .eq('id', caseId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data)
        return false;
    if (petId && data.pet_id !== petId)
        return false;
    return true;
}
/** Tutor vinculado ao pet (papel primário ou secundário). */
async function assertGuardianLinkedToPet(petId, guardianId) {
    if (!petId || !guardianId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('id')
        .eq('pet_id', petId)
        .eq('guardian_id', guardianId)
        .limit(1)
        .maybeSingle();
    return !error && !!data;
}
async function assertHospitalBedInClinic(clinicId, bedId) {
    if (!bedId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospital_beds')
        .select('id')
        .eq('id', bedId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return !error && !!data;
}
async function assertComandaInClinic(clinicId, comandaId) {
    if (!comandaId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id')
        .eq('id', comandaId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    return !error && !!data;
}
async function assertReceivableInClinic(clinicId, receivableId) {
    if (!receivableId)
        return true;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id')
        .eq('id', receivableId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    return !error && !!data;
}
