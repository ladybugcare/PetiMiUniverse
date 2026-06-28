"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUB_DAY_BOARD_PET_SELECT = void 0;
exports.fetchHubPetsMapByIds = fetchHubPetsMapByIds;
exports.resolvePrimaryPetIdsByGuardians = resolvePrimaryPetIdsByGuardians;
exports.coalesceAppointmentPetId = coalesceAppointmentPetId;
const supabase_1 = require("../../config/supabase");
/** Colunas estáveis para painéis operacionais (sem avatar_url — migration opcional). */
exports.HUB_DAY_BOARD_PET_SELECT = 'id, name, species, breed, size_tier, birth_date, coat_type, notes';
async function fetchHubPetsMapByIds(petIds) {
    const uniq = [...new Set([...petIds].filter((id) => Boolean(id)))];
    if (uniq.length === 0)
        return new Map();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select(exports.HUB_DAY_BOARD_PET_SELECT)
        .in('id', uniq)
        .is('deleted_at', null);
    if (error) {
        console.error('[hubDayBoardPets] fetchHubPetsMapByIds', error);
        return new Map();
    }
    return new Map((data ?? []).map((p) => [p.id, p]));
}
/**
 * Quando o agendamento tem tutor mas não tem pet_id, tenta o pet principal
 * (ou o único pet vinculado ao tutor).
 */
async function resolvePrimaryPetIdsByGuardians(clinicId, guardianIds) {
    const uniq = [...new Set([...guardianIds].filter((id) => Boolean(id)))];
    const result = new Map();
    if (uniq.length === 0)
        return result;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('guardian_id, pet_id, role, hub_pets!inner(id, clinic_id, deleted_at)')
        .in('guardian_id', uniq);
    if (error || !data) {
        console.error('[hubDayBoardPets] resolvePrimaryPetIdsByGuardians', error);
        return result;
    }
    const byGuardian = new Map();
    const primaryByGuardian = new Map();
    for (const row of data) {
        const rawPet = row.hub_pets;
        const pet = Array.isArray(rawPet) ? rawPet[0] : rawPet;
        if (!pet || pet.clinic_id !== clinicId || pet.deleted_at != null)
            continue;
        const list = byGuardian.get(row.guardian_id) ?? [];
        list.push(row.pet_id);
        byGuardian.set(row.guardian_id, list);
        if (row.role === 'primary')
            primaryByGuardian.set(row.guardian_id, row.pet_id);
    }
    for (const [guardianId, pets] of byGuardian) {
        const resolved = primaryByGuardian.get(guardianId) ?? (pets.length === 1 ? pets[0] : null);
        if (resolved)
            result.set(guardianId, resolved);
    }
    return result;
}
/** Preferência: pet do agendamento, depois da sessão operacional. */
function coalesceAppointmentPetId(appointmentPetId, sessionPetId) {
    return appointmentPetId ?? sessionPetId ?? null;
}
