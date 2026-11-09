"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postPublicBoardingCare = exports.getPublicBoardingCare = exports.postHubBoardingCareTutorLink = exports.putHubBoardingCarePlan = exports.getHubBoardingCarePlan = exports.putHubPetCareProfile = exports.getHubPetCareProfile = void 0;
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../../config/supabase");
const boardingCare_1 = require("./boardingCare");
const boardingCareService_1 = require("./boardingCareService");
const hubBoardingDrawerController_1 = require("./hubBoardingDrawerController");
const hubBoardingSchemas_1 = require("./hubBoardingSchemas");
const TUTOR_LINK_DAYS = 14;
function clinicFromQuery(req) {
    const p = hubBoardingSchemas_1.uuidStr.safeParse(req.query.clinic_id);
    return p.success ? p.data : null;
}
// ─── Ficha de cuidados do pet ─────────────────────────────────────────────
const getHubPetCareProfile = async (req, res) => {
    try {
        const clinicId = clinicFromQuery(req);
        const { petId } = req.params;
        if (!clinicId)
            return res.status(400).json({ error: 'clinic_id inválido' });
        if (!petId || !hubBoardingDrawerController_1.UUID_RE.test(petId))
            return res.status(400).json({ error: 'Pet inválido' });
        const row = await (0, boardingCareService_1.loadCareProfileRow)(clinicId, petId);
        // Próxima/atual estadia do pet, para o card "Hospedagem" na ficha.
        const { data: stays } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, mode, status, expected_check_in, expected_check_out, checked_in_at, checked_out_at')
            .eq('clinic_id', clinicId)
            .eq('pet_id', petId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(5);
        return res.json({ profile: (0, hubBoardingDrawerController_1.careProfilePayload)(row), recent_stays: stays ?? [] });
    }
    catch (e) {
        console.error('getHubPetCareProfile', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar ficha de cuidados' });
    }
};
exports.getHubPetCareProfile = getHubPetCareProfile;
/** Atualiza a ficha e propaga para planos ativos cujos blocos ainda estão herdados ou pendentes. */
async function propagateProfileToActivePlans(clinicId, petId) {
    const profile = await (0, boardingCareService_1.loadCareProfile)(clinicId, petId);
    if (!profile)
        return 0;
    const { data: rsvs } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .in('status', ['reserved', 'checked_in'])
        .is('deleted_at', null);
    let touched = 0;
    for (const r of (rsvs ?? [])) {
        const plan = await (0, boardingCareService_1.ensureCarePlan)(r);
        if (!plan)
            continue;
        const status = (0, boardingCareService_1.planStatusFromRow)(plan);
        const blocks = (0, boardingCare_1.normalizePlanBlocks)(plan);
        const fromProfile = (0, boardingCare_1.buildPlanFromProfile)(profile);
        const patch = {};
        const nextStatus = { ...status };
        for (const key of boardingCare_1.CARE_BLOCK_KEYS) {
            const st = status[key] ?? 'pending';
            if (st !== 'inherited' && st !== 'pending')
                continue;
            const value = fromProfile.blocks[key];
            if (JSON.stringify(value) === JSON.stringify(blocks[key]))
                continue;
            patch[key] = value;
            nextStatus[key] = (0, boardingCare_1.isBlockEmpty)(key, value) ? 'pending' : 'inherited';
        }
        if (!Object.keys(patch).length)
            continue;
        const { data: updated } = await supabase_1.supabaseAdmin
            .from('hub_boarding_care_plans')
            .update({ ...patch, block_status: nextStatus })
            .eq('id', plan.id)
            .select('*')
            .single();
        await (0, boardingCareService_1.syncReservationTasks)(r, { plan: updated ?? plan });
        touched++;
    }
    return touched;
}
const putHubPetCareProfile = async (req, res) => {
    try {
        const { petId } = req.params;
        if (!petId || !hubBoardingDrawerController_1.UUID_RE.test(petId))
            return res.status(400).json({ error: 'Pet inválido' });
        const parsed = hubBoardingSchemas_1.careProfilePutSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, notes, ...blocks } = parsed.data;
        const { data: pet } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id')
            .eq('id', petId)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        if (!pet)
            return res.status(404).json({ error: 'Pet não encontrado' });
        const payload = {
            clinic_id,
            pet_id: petId,
            updated_by_user_id: req.user?.id ?? null,
        };
        for (const key of boardingCare_1.PROFILE_BLOCK_KEYS) {
            if (Object.prototype.hasOwnProperty.call(blocks, key))
                payload[key] = (0, boardingCare_1.normalizeBlock)(key, blocks[key]);
        }
        if (notes !== undefined)
            payload.notes = notes?.trim() || null;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_pet_care_profiles')
            .upsert(payload, { onConflict: 'pet_id' })
            .select('*')
            .single();
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error))
                return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
            return res.status(500).json({ error: error.message });
        }
        let plansUpdated = 0;
        try {
            plansUpdated = await propagateProfileToActivePlans(clinic_id, petId);
        }
        catch (e) {
            console.error('propagateProfileToActivePlans', e);
        }
        return res.json({ profile: (0, hubBoardingDrawerController_1.careProfilePayload)(data), plans_updated: plansUpdated });
    }
    catch (e) {
        console.error('putHubPetCareProfile', e);
        return res.status(500).json({ error: e?.message || 'Erro ao salvar ficha de cuidados' });
    }
};
exports.putHubPetCareProfile = putHubPetCareProfile;
// ─── Plano da estadia ─────────────────────────────────────────────────────
const getHubBoardingCarePlan = async (req, res) => {
    try {
        const clinicId = clinicFromQuery(req);
        const { id } = req.params;
        if (!clinicId)
            return res.status(400).json({ error: 'clinic_id inválido' });
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const reservation = await (0, boardingCareService_1.loadReservation)(clinicId, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const plan = await (0, boardingCareService_1.ensureCarePlan)(reservation);
        if (!plan)
            return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
        const profileRow = await (0, boardingCareService_1.loadCareProfileRow)(clinicId, reservation.pet_id);
        return res.json({
            care_plan: (0, hubBoardingDrawerController_1.carePlanPayload)(plan),
            care_profile: (0, hubBoardingDrawerController_1.careProfilePayload)(profileRow),
            plan_pendencies: (0, boardingCare_1.computePlanPendencies)({ block_status: (0, boardingCareService_1.planStatusFromRow)(plan) }, reservation.mode),
        });
    }
    catch (e) {
        console.error('getHubBoardingCarePlan', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar plano de cuidados' });
    }
};
exports.getHubBoardingCarePlan = getHubBoardingCarePlan;
const putHubBoardingCarePlan = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const parsed = hubBoardingSchemas_1.carePlanPutSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, instructions, confirm_blocks, save_to_profile, tutor_submission_reviewed, ...rawBlocks } = parsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const plan = await (0, boardingCareService_1.ensureCarePlan)(reservation);
        if (!plan)
            return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
        const profile = await (0, boardingCareService_1.loadCareProfile)(clinic_id, reservation.pet_id);
        const patch = {};
        for (const key of boardingCare_1.CARE_BLOCK_KEYS) {
            if (Object.prototype.hasOwnProperty.call(rawBlocks, key))
                patch[key] = rawBlocks[key];
        }
        const edited = (0, boardingCare_1.applyPlanEdit)({
            current: (0, boardingCare_1.normalizePlanBlocks)(plan),
            currentStatus: (0, boardingCareService_1.planStatusFromRow)(plan),
            patch,
            profile,
            confirmBlocks: confirm_blocks ?? [],
        });
        // Gravar na ficha: o bloco passa a ser igual à ficha e, portanto, confirmado.
        if (save_to_profile?.length) {
            const profilePayload = {
                clinic_id,
                pet_id: reservation.pet_id,
                updated_by_user_id: req.user?.id ?? null,
            };
            for (const key of save_to_profile) {
                profilePayload[key] = edited.blocks[key];
                if (!(0, boardingCare_1.isBlockEmpty)(key, edited.blocks[key]))
                    edited.block_status[key] = 'confirmed';
            }
            const { error: profErr } = await supabase_1.supabaseAdmin
                .from('hub_pet_care_profiles')
                .upsert(profilePayload, { onConflict: 'pet_id' });
            if (profErr)
                return res.status(500).json({ error: profErr.message });
        }
        const pendencies = (0, boardingCare_1.computePlanPendencies)({ block_status: edited.block_status }, reservation.mode);
        const update = { ...edited.blocks, block_status: edited.block_status };
        if (instructions !== undefined)
            update.instructions = instructions?.trim() || null;
        if (confirm_blocks?.length || save_to_profile?.length) {
            update.confirmed_by_user_id = req.user?.id ?? null;
            update.confirmed_at = pendencies.length === 0 ? new Date().toISOString() : null;
        }
        if (tutor_submission_reviewed)
            update.tutor_submission_reviewed_at = new Date().toISOString();
        const { data: saved, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_care_plans')
            .update(update)
            .eq('id', plan.id)
            .select('*')
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        const tasksSync = await (0, boardingCareService_1.syncReservationTasks)(reservation, { plan: saved });
        const profileRow = await (0, boardingCareService_1.loadCareProfileRow)(clinic_id, reservation.pet_id);
        return res.json({
            care_plan: (0, hubBoardingDrawerController_1.carePlanPayload)(saved),
            care_profile: (0, hubBoardingDrawerController_1.careProfilePayload)(profileRow),
            plan_pendencies: pendencies,
            tasks_sync: tasksSync,
        });
    }
    catch (e) {
        console.error('putHubBoardingCarePlan', e);
        return res.status(500).json({ error: e?.message || 'Erro ao salvar plano de cuidados' });
    }
};
exports.putHubBoardingCarePlan = putHubBoardingCarePlan;
// ─── Link do tutor ────────────────────────────────────────────────────────
const postHubBoardingCareTutorLink = async (req, res) => {
    try {
        const { id } = req.params;
        const clinicParsed = hubBoardingSchemas_1.uuidStr.safeParse(req.body?.clinic_id);
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        if (!clinicParsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const reservation = await (0, boardingCareService_1.loadReservation)(clinicParsed.data, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (!['reserved', 'checked_in'].includes(reservation.status)) {
            return res.status(422).json({ error: 'O link só pode ser gerado para reservas ativas' });
        }
        const plan = await (0, boardingCareService_1.ensureCarePlan)(reservation);
        if (!plan)
            return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
        const stillValid = plan.tutor_token &&
            plan.tutor_token_expires_at &&
            new Date(plan.tutor_token_expires_at).getTime() > Date.now() + 24 * 3600_000;
        let saved = plan;
        if (!stillValid || req.body?.regenerate === true) {
            const token = crypto_1.default.randomBytes(24).toString('base64url');
            const expires = new Date(Date.now() + TUTOR_LINK_DAYS * 24 * 3600_000).toISOString();
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_boarding_care_plans')
                .update({ tutor_token: token, tutor_token_expires_at: expires })
                .eq('id', plan.id)
                .select('*')
                .single();
            if (error)
                return res.status(500).json({ error: error.message });
            saved = data;
        }
        return res.json({ care_plan: (0, hubBoardingDrawerController_1.carePlanPayload)(saved) });
    }
    catch (e) {
        console.error('postHubBoardingCareTutorLink', e);
        return res.status(500).json({ error: e?.message || 'Erro ao gerar link do tutor' });
    }
};
exports.postHubBoardingCareTutorLink = postHubBoardingCareTutorLink;
// ─── Público: tutor confirma os cuidados ──────────────────────────────────
async function loadPlanByToken(token) {
    if (!token || token.length < 20 || token.length > 80)
        return null;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_care_plans')
        .select('*')
        .eq('tutor_token', token)
        .maybeSingle();
    if (error || !data)
        return null;
    const plan = data;
    const exp = plan.tutor_token_expires_at;
    if (exp && new Date(exp).getTime() < Date.now())
        return { plan, expired: true };
    return { plan, expired: false };
}
const getPublicBoardingCare = async (req, res) => {
    try {
        const found = await loadPlanByToken(String(req.params.token || '').trim());
        if (!found)
            return res.status(404).json({ error: 'Link não encontrado' });
        if (found.expired)
            return res.status(410).json({ error: 'Este link expirou. Peça um novo para a recepção.' });
        const { plan } = found;
        const { data: rsv } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, clinic_id, pet_id, mode, status, expected_check_in, expected_check_out')
            .eq('id', plan.hub_boarding_reservation_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!rsv)
            return res.status(404).json({ error: 'Link não encontrado' });
        const [{ data: pet }, { data: clinic }] = await Promise.all([
            supabase_1.supabaseAdmin.from('hub_pets').select('name, species').eq('id', rsv.pet_id).maybeSingle(),
            supabase_1.supabaseAdmin.from('clinics').select('name, photo_url').eq('id', rsv.clinic_id).maybeSingle(),
        ]);
        const blocks = (0, boardingCare_1.normalizePlanBlocks)(plan);
        return res.json({
            pet: { name: pet?.name ?? 'Pet', species: pet?.species ?? null },
            clinic: { name: clinic?.name ?? '', photo_url: clinic?.photo_url ?? null },
            stay: {
                mode: rsv.mode,
                status: rsv.status,
                expected_check_in: rsv.expected_check_in,
                expected_check_out: rsv.expected_check_out,
            },
            care: {
                feeding: blocks.feeding,
                medications: blocks.medications,
                walks: blocks.walks,
                handling: blocks.handling,
            },
            submission: plan.tutor_submission ?? null,
            submitted_at: plan.tutor_submitted_at ?? null,
            can_submit: rsv.status === 'reserved' ||
                rsv.status === 'checked_in' ||
                rsv.status === 'checkout_preparing' ||
                rsv.status === 'ready_for_handoff',
        });
    }
    catch (e) {
        console.error('getPublicBoardingCare', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getPublicBoardingCare = getPublicBoardingCare;
const postPublicBoardingCare = async (req, res) => {
    try {
        const found = await loadPlanByToken(String(req.params.token || '').trim());
        if (!found)
            return res.status(404).json({ error: 'Link não encontrado' });
        if (found.expired)
            return res.status(410).json({ error: 'Este link expirou. Peça um novo para a recepção.' });
        const parsed = hubBoardingSchemas_1.publicCareSubmitSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: 'Dados inválidos' });
        const { data: rsv } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('status')
            .eq('id', found.plan.hub_boarding_reservation_id)
            .maybeSingle();
        if (!rsv || !['reserved', 'checked_in'].includes(String(rsv.status))) {
            return res.status(422).json({ error: 'Esta hospedagem já foi encerrada.' });
        }
        const d = parsed.data;
        const submission = {
            feeding: (0, boardingCare_1.normalizeFeeding)(d.feeding),
            medications: (0, boardingCare_1.normalizeMedications)(d.medications),
            walks: (0, boardingCare_1.normalizeWalks)(d.walks),
            handling: (0, boardingCare_1.normalizeHandling)(d.handling),
            notes: d.notes?.trim() || null,
            contact_name: d.contact_name?.trim() || null,
        };
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_care_plans')
            .update({
            tutor_submission: submission,
            tutor_submitted_at: new Date().toISOString(),
            tutor_submission_reviewed_at: null,
        })
            .eq('id', found.plan.id);
        if (error)
            return res.status(500).json({ error: 'Não foi possível enviar agora. Tente novamente.' });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('postPublicBoardingCare', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.postPublicBoardingCare = postPublicBoardingCare;
