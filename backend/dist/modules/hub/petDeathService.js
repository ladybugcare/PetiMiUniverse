"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clinicalDeathPayloadSchema = exports.invalidatePetDeathInputSchema = exports.correctPetDeathInputSchema = exports.registerPetDeathInputSchema = exports.deathSourceSchema = exports.deathTypeSchema = exports.DEATH_SOURCES = exports.DEATH_TYPES = void 0;
exports.hasValidPetDeath = hasValidPetDeath;
exports.isPetEligibleForNewOp = isPetEligibleForNewOp;
exports.mapPetDeathRpcError = mapPetDeathRpcError;
exports.registerPetDeath = registerPetDeath;
exports.correctPetDeath = correctPetDeath;
exports.invalidatePetDeath = invalidatePetDeath;
/**
 * Domínio de óbito do pet — registro/correção/invalidação atômicos via RPC.
 * Óbito (clínico) é independente de arquivamento (deleted_at).
 */
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
exports.DEATH_TYPES = ['euthanasia', 'natural', 'accidental', 'other', 'unknown'];
exports.DEATH_SOURCES = ['manual', 'encounter', 'surgery', 'hospitalization'];
exports.deathTypeSchema = zod_1.z.enum(exports.DEATH_TYPES);
exports.deathSourceSchema = zod_1.z.enum(exports.DEATH_SOURCES);
exports.registerPetDeathInputSchema = zod_1.z.object({
    clinic_id: zod_1.z.string().uuid(),
    pet_id: zod_1.z.string().uuid(),
    deceased_at: zod_1.z.string().datetime({ offset: true }),
    death_type: exports.deathTypeSchema,
    death_cause: zod_1.z.string().trim().max(2000).optional().nullable(),
    death_notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    death_source: exports.deathSourceSchema,
    death_ref_id: zod_1.z.string().uuid().optional().nullable(),
    archive: zod_1.z.boolean().optional().default(false),
    hub_case_id: zod_1.z.string().uuid().optional().nullable(),
    hub_encounter_id: zod_1.z.string().uuid().optional().nullable(),
    created_by_staff_id: zod_1.z.string().uuid().optional().nullable(),
    actor_user_id: zod_1.z.string().uuid().optional().nullable(),
});
exports.correctPetDeathInputSchema = zod_1.z.object({
    clinic_id: zod_1.z.string().uuid(),
    pet_id: zod_1.z.string().uuid(),
    reason: zod_1.z.string().trim().min(3).max(2000),
    deceased_at: zod_1.z.string().datetime({ offset: true }).optional(),
    death_type: exports.deathTypeSchema.optional(),
    death_cause: zod_1.z.string().trim().max(2000).optional().nullable(),
    death_notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    hub_case_id: zod_1.z.string().uuid().optional().nullable(),
    hub_encounter_id: zod_1.z.string().uuid().optional().nullable(),
    created_by_staff_id: zod_1.z.string().uuid().optional().nullable(),
    actor_user_id: zod_1.z.string().uuid().optional().nullable(),
});
exports.invalidatePetDeathInputSchema = zod_1.z.object({
    clinic_id: zod_1.z.string().uuid(),
    pet_id: zod_1.z.string().uuid(),
    reason: zod_1.z.string().trim().min(3).max(2000),
    amendment_status: zod_1.z.enum(['discharged', 'transferred']).optional().nullable(),
    hub_case_id: zod_1.z.string().uuid().optional().nullable(),
    hub_encounter_id: zod_1.z.string().uuid().optional().nullable(),
    created_by_staff_id: zod_1.z.string().uuid().optional().nullable(),
    actor_user_id: zod_1.z.string().uuid().optional().nullable(),
});
/** Óbito válido = falecido e não invalidado. */
function hasValidPetDeath(pet) {
    return pet.deceased_at != null && pet.death_invalidated_at == null;
}
/** Elegível para novas operações de rotina. */
function isPetEligibleForNewOp(pet) {
    if (pet.deleted_at != null)
        return false;
    if (hasValidPetDeath(pet))
        return false;
    return true;
}
function mapPetDeathRpcError(message) {
    const msg = String(message || '');
    if (/already_deceased/i.test(msg)) {
        return { error: 'Pet já possui óbito registrado', code: 'already_deceased', status: 409 };
    }
    if (/não encontrado|Pet não encontrado/i.test(msg)) {
        return { error: 'Pet não encontrado', code: 'not_found', status: 404 };
    }
    if (/Data de óbito não pode ser futura/i.test(msg)) {
        return { error: 'Data de óbito não pode ser futura', code: 'future_death_date', status: 400 };
    }
    if (/Registro clínico de origem inválido/i.test(msg)) {
        return { error: 'Registro clínico de origem inválido para este pet', code: 'invalid_death_ref', status: 400 };
    }
    if (/amendment_status obrigatório/i.test(msg)) {
        return {
            error: 'Informe amendment_status (discharged|transferred) para invalidar óbito de internação',
            code: 'amendment_required',
            status: 400,
        };
    }
    if (/Justificativa obrigatória/i.test(msg)) {
        return { error: msg.includes('invalidação') ? 'Justificativa obrigatória para invalidação' : 'Justificativa obrigatória para correção', status: 400 };
    }
    if (/não possui óbito válido/i.test(msg)) {
        return { error: msg, code: 'no_valid_death', status: 409 };
    }
    if (/death_type inválido|death_source inválido|death_ref_id obrigatório/i.test(msg)) {
        return { error: msg, status: 400 };
    }
    return null;
}
async function countPendingOps(clinicId, petId) {
    const nowIso = new Date().toISOString();
    const [appts, boarding] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', clinicId)
            .eq('pet_id', petId)
            .is('deleted_at', null)
            .gt('starts_at', nowIso)
            .not('status', 'in', '("cancelled","done","paid","no_show")'),
        supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', clinicId)
            .eq('pet_id', petId)
            .in('status', ['reserved', 'checked_in', 'confirmed', 'active']),
    ]);
    return {
        future_appointments: appts.count ?? 0,
        active_boarding_reservations: boarding.count ?? 0,
    };
}
function parseRpcPet(data) {
    if (!data || typeof data !== 'object')
        return null;
    const body = data;
    if (!body.ok || !body.pet)
        return null;
    return body.pet;
}
async function registerPetDeath(input) {
    const parsed = exports.registerPetDeathInputSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: 'Dados inválidos para registrar óbito', status: 400 };
    }
    const b = parsed.data;
    if (b.death_source !== 'manual' && !b.death_ref_id) {
        return { ok: false, error: 'death_ref_id obrigatório para origem clínica', status: 400 };
    }
    const deceasedAt = new Date(b.deceased_at);
    if (Number.isNaN(deceasedAt.getTime()) || deceasedAt.getTime() > Date.now() + 60_000) {
        return { ok: false, error: 'Data de óbito não pode ser futura', code: 'future_death_date', status: 400 };
    }
    try {
        const rpcRes = await supabase_1.supabaseAdmin.rpc('hub_register_pet_death', {
            p_clinic_id: b.clinic_id,
            p_pet_id: b.pet_id,
            p_deceased_at: b.deceased_at,
            p_death_type: b.death_type,
            p_death_source: b.death_source,
            p_death_cause: b.death_cause ?? null,
            p_death_notes: b.death_notes ?? null,
            p_death_ref_id: b.death_ref_id ?? null,
            p_archive: b.archive ?? false,
            p_actor_user_id: b.actor_user_id ?? null,
            p_hub_case_id: b.hub_case_id ?? null,
            p_hub_encounter_id: b.hub_encounter_id ?? null,
            p_created_by_staff_id: b.created_by_staff_id ?? null,
        });
        if (rpcRes.error) {
            const mapped = mapPetDeathRpcError(rpcRes.error.message);
            if (mapped)
                return { ok: false, ...mapped };
            return { ok: false, error: rpcRes.error.message || 'Falha ao registrar óbito', status: 500 };
        }
        const pet = parseRpcPet(rpcRes.data);
        if (!pet) {
            const mapped = mapPetDeathRpcError(String(rpcRes.data?.message ?? ''));
            if (mapped)
                return { ok: false, ...mapped };
            return { ok: false, error: 'Resposta inválida ao registrar óbito', status: 500 };
        }
        const pending = await countPendingOps(b.clinic_id, b.pet_id);
        return {
            ok: true,
            pet,
            pending,
            archived: Boolean(rpcRes.data?.archived),
        };
    }
    catch (e) {
        const msg = e?.message || 'Erro ao registrar óbito';
        const mapped = mapPetDeathRpcError(msg);
        if (mapped)
            return { ok: false, ...mapped };
        return { ok: false, error: msg, status: 500 };
    }
}
async function correctPetDeath(input) {
    const parsed = exports.correctPetDeathInputSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: 'Dados inválidos para corrigir óbito', status: 400 };
    }
    const b = parsed.data;
    try {
        const rpcRes = await supabase_1.supabaseAdmin.rpc('hub_correct_pet_death', {
            p_clinic_id: b.clinic_id,
            p_pet_id: b.pet_id,
            p_reason: b.reason,
            p_deceased_at: b.deceased_at ?? null,
            p_death_type: b.death_type ?? null,
            p_death_cause: b.death_cause ?? null,
            p_death_notes: b.death_notes ?? null,
            p_actor_user_id: b.actor_user_id ?? null,
            p_created_by_staff_id: b.created_by_staff_id ?? null,
            p_hub_case_id: b.hub_case_id ?? null,
            p_hub_encounter_id: b.hub_encounter_id ?? null,
        });
        if (rpcRes.error) {
            const mapped = mapPetDeathRpcError(rpcRes.error.message);
            if (mapped)
                return { ok: false, ...mapped };
            return { ok: false, error: rpcRes.error.message || 'Falha ao corrigir óbito', status: 500 };
        }
        const pet = parseRpcPet(rpcRes.data);
        if (!pet) {
            return { ok: false, error: 'Resposta inválida ao corrigir óbito', status: 500 };
        }
        return { ok: true, pet };
    }
    catch (e) {
        const msg = e?.message || 'Erro ao corrigir óbito';
        const mapped = mapPetDeathRpcError(msg);
        if (mapped)
            return { ok: false, ...mapped };
        return { ok: false, error: msg, status: 500 };
    }
}
async function invalidatePetDeath(input) {
    const parsed = exports.invalidatePetDeathInputSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: 'Dados inválidos para invalidar óbito', status: 400 };
    }
    const b = parsed.data;
    try {
        const rpcRes = await supabase_1.supabaseAdmin.rpc('hub_invalidate_pet_death', {
            p_clinic_id: b.clinic_id,
            p_pet_id: b.pet_id,
            p_reason: b.reason,
            p_actor_user_id: b.actor_user_id ?? null,
            p_created_by_staff_id: b.created_by_staff_id ?? null,
            p_amendment_status: b.amendment_status ?? null,
            p_hub_case_id: b.hub_case_id ?? null,
            p_hub_encounter_id: b.hub_encounter_id ?? null,
        });
        if (rpcRes.error) {
            const mapped = mapPetDeathRpcError(rpcRes.error.message);
            if (mapped)
                return { ok: false, ...mapped };
            return { ok: false, error: rpcRes.error.message || 'Falha ao invalidar óbito', status: 500 };
        }
        const pet = parseRpcPet(rpcRes.data);
        if (!pet) {
            return { ok: false, error: 'Resposta inválida ao invalidar óbito', status: 500 };
        }
        return { ok: true, pet };
    }
    catch (e) {
        const msg = e?.message || 'Erro ao invalidar óbito';
        const mapped = mapPetDeathRpcError(msg);
        if (mapped)
            return { ok: false, ...mapped };
        return { ok: false, error: msg, status: 500 };
    }
}
/** Payload opcional de óbito embutido em PATCH clínico. */
exports.clinicalDeathPayloadSchema = zod_1.z
    .object({
    deceased_at: zod_1.z.string().datetime({ offset: true }).optional(),
    death_type: exports.deathTypeSchema,
    death_cause: zod_1.z.string().trim().max(2000).optional().nullable(),
    death_notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    archive: zod_1.z.boolean().optional().default(false),
})
    .optional();
