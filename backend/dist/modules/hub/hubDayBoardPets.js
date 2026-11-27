"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUB_DAY_BOARD_PET_SELECT = void 0;
exports.fetchHubPetsMapByIds = fetchHubPetsMapByIds;
exports.resolvePrimaryPetIdsByGuardians = resolvePrimaryPetIdsByGuardians;
exports.coalesceAppointmentPetId = coalesceAppointmentPetId;
const supabase_1 = require("../../config/supabase");
/** Colunas estáveis para painéis operacionais (sem avatar_url — migration opcional). */
exports.HUB_DAY_BOARD_PET_SELECT = 'id, name, species, breed, size_tier, birth_date, coat_type, notes, behavior_tags';
async function fetchHubPetsMapByIds(petIds) {
    const uniq = [...new Set([...petIds].filter((id) => Boolean(id)))];
    if (uniq.length === 0)
        return new Map();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select(`${exports.HUB_DAY_BOARD_PET_SELECT}, deleted_at, deceased_at, death_invalidated_at`)
        .in('id', uniq)
        .is('deleted_at', null);
    if (error) {
        console.error('[hubDayBoardPets] fetchHubPetsMapByIds', error);
        return new Map();
    }
    const { isPetEligibleForNewOp } = await Promise.resolve().then(() => __importStar(require('./petDeathService')));
    const eligible = (data ?? []).filter((p) => isPetEligibleForNewOp(p));
    return new Map(eligible.map((p) => [p.id, p]));
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
        .select('guardian_id, pet_id, role, hub_pets!inner(id, clinic_id, deleted_at, deceased_at, death_invalidated_at)')
        .in('guardian_id', uniq);
    if (error || !data) {
        console.error('[hubDayBoardPets] resolvePrimaryPetIdsByGuardians', error);
        return result;
    }
    const byGuardian = new Map();
    const primaryByGuardian = new Map();
    const { isPetEligibleForNewOp } = await Promise.resolve().then(() => __importStar(require('./petDeathService')));
    for (const row of data) {
        const rawPet = row.hub_pets;
        const pet = Array.isArray(rawPet) ? rawPet[0] : rawPet;
        if (!pet || pet.clinic_id !== clinicId || !isPetEligibleForNewOp(pet))
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
