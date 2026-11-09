import crypto from 'crypto';
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import {
  CARE_BLOCK_KEYS,
  PROFILE_BLOCK_KEYS,
  applyPlanEdit,
  buildPlanFromProfile,
  computePlanPendencies,
  isBlockEmpty,
  normalizeBlock,
  normalizeFeeding,
  normalizeHandling,
  normalizeMedications,
  normalizePlanBlocks,
  normalizeWalks,
  type BlockStatusMap,
  type CareBlockKey,
} from './boardingCare';
import {
  BOARDING_MIGRATION_HINT,
  ensureCarePlan,
  loadCareProfile,
  loadCareProfileRow,
  loadReservation,
  missingTable,
  planStatusFromRow,
  syncReservationTasks,
  type ReservationRow,
} from './boardingCareService';
import { carePlanPayload, careProfilePayload, UUID_RE } from './hubBoardingDrawerController';
import { careProfilePutSchema, carePlanPutSchema, publicCareSubmitSchema, uuidStr } from './hubBoardingSchemas';

const TUTOR_LINK_DAYS = 14;

function clinicFromQuery(req: Request): string | null {
  const p = uuidStr.safeParse((req.query as { clinic_id?: string }).clinic_id);
  return p.success ? p.data : null;
}

// ─── Ficha de cuidados do pet ─────────────────────────────────────────────

export const getHubPetCareProfile = async (req: Request, res: Response) => {
  try {
    const clinicId = clinicFromQuery(req);
    const { petId } = req.params;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id inválido' });
    if (!petId || !UUID_RE.test(petId)) return res.status(400).json({ error: 'Pet inválido' });

    const row = await loadCareProfileRow(clinicId, petId);

    // Próxima/atual estadia do pet, para o card "Hospedagem" na ficha.
    const { data: stays } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, mode, status, expected_check_in, expected_check_out, checked_in_at, checked_out_at')
      .eq('clinic_id', clinicId)
      .eq('pet_id', petId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);

    return res.json({ profile: careProfilePayload(row), recent_stays: stays ?? [] });
  } catch (e: unknown) {
    console.error('getHubPetCareProfile', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar ficha de cuidados' });
  }
};

/** Atualiza a ficha e propaga para planos ativos cujos blocos ainda estão herdados ou pendentes. */
async function propagateProfileToActivePlans(clinicId: string, petId: string): Promise<number> {
  const profile = await loadCareProfile(clinicId, petId);
  if (!profile) return 0;
  const { data: rsvs } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .in('status', ['reserved', 'checked_in'])
    .is('deleted_at', null);
  let touched = 0;
  for (const r of (rsvs ?? []) as ReservationRow[]) {
    const plan = await ensureCarePlan(r);
    if (!plan) continue;
    const status = planStatusFromRow(plan);
    const blocks = normalizePlanBlocks(plan);
    const fromProfile = buildPlanFromProfile(profile);
    const patch: Record<string, unknown> = {};
    const nextStatus: BlockStatusMap = { ...status };
    for (const key of CARE_BLOCK_KEYS) {
      const st = status[key] ?? 'pending';
      if (st !== 'inherited' && st !== 'pending') continue;
      const value = fromProfile.blocks[key];
      if (JSON.stringify(value) === JSON.stringify(blocks[key])) continue;
      patch[key] = value;
      nextStatus[key] = isBlockEmpty(key, value) ? 'pending' : 'inherited';
    }
    if (!Object.keys(patch).length) continue;
    const { data: updated } = await supabaseAdmin
      .from('hub_boarding_care_plans')
      .update({ ...patch, block_status: nextStatus })
      .eq('id', plan.id as string)
      .select('*')
      .single();
    await syncReservationTasks(r, { plan: (updated as Record<string, unknown>) ?? plan });
    touched++;
  }
  return touched;
}

export const putHubPetCareProfile = async (req: Request, res: Response) => {
  try {
    const { petId } = req.params;
    if (!petId || !UUID_RE.test(petId)) return res.status(400).json({ error: 'Pet inválido' });
    const parsed = careProfilePutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, notes, ...blocks } = parsed.data;

    const { data: pet } = await supabaseAdmin
      .from('hub_pets')
      .select('id')
      .eq('id', petId)
      .eq('clinic_id', clinic_id)
      .maybeSingle();
    if (!pet) return res.status(404).json({ error: 'Pet não encontrado' });

    const payload: Record<string, unknown> = {
      clinic_id,
      pet_id: petId,
      updated_by_user_id: req.user?.id ?? null,
    };
    for (const key of PROFILE_BLOCK_KEYS) {
      if (Object.prototype.hasOwnProperty.call(blocks, key)) payload[key] = normalizeBlock(key, blocks[key]);
    }
    if (notes !== undefined) payload.notes = notes?.trim() || null;

    const { data, error } = await supabaseAdmin
      .from('hub_pet_care_profiles')
      .upsert(payload, { onConflict: 'pet_id' })
      .select('*')
      .single();
    if (error) {
      if (missingTable(error)) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });
      return res.status(500).json({ error: error.message });
    }

    let plansUpdated = 0;
    try {
      plansUpdated = await propagateProfileToActivePlans(clinic_id, petId);
    } catch (e) {
      console.error('propagateProfileToActivePlans', e);
    }
    return res.json({ profile: careProfilePayload(data as Record<string, unknown>), plans_updated: plansUpdated });
  } catch (e: unknown) {
    console.error('putHubPetCareProfile', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao salvar ficha de cuidados' });
  }
};

// ─── Plano da estadia ─────────────────────────────────────────────────────

export const getHubBoardingCarePlan = async (req: Request, res: Response) => {
  try {
    const clinicId = clinicFromQuery(req);
    const { id } = req.params;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id inválido' });
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const reservation = await loadReservation(clinicId, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const plan = await ensureCarePlan(reservation);
    if (!plan) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });
    const profileRow = await loadCareProfileRow(clinicId, reservation.pet_id);
    return res.json({
      care_plan: carePlanPayload(plan),
      care_profile: careProfilePayload(profileRow),
      plan_pendencies: computePlanPendencies({ block_status: planStatusFromRow(plan) }, reservation.mode),
    });
  } catch (e: unknown) {
    console.error('getHubBoardingCarePlan', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar plano de cuidados' });
  }
};

export const putHubBoardingCarePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const parsed = carePlanPutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, instructions, confirm_blocks, save_to_profile, tutor_submission_reviewed, ...rawBlocks } =
      parsed.data;

    const reservation = await loadReservation(clinic_id, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    const plan = await ensureCarePlan(reservation);
    if (!plan) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });
    const profile = await loadCareProfile(clinic_id, reservation.pet_id);

    const patch: Partial<Record<CareBlockKey, unknown>> = {};
    for (const key of CARE_BLOCK_KEYS) {
      if (Object.prototype.hasOwnProperty.call(rawBlocks, key)) patch[key] = (rawBlocks as Record<string, unknown>)[key];
    }
    const edited = applyPlanEdit({
      current: normalizePlanBlocks(plan),
      currentStatus: planStatusFromRow(plan),
      patch,
      profile,
      confirmBlocks: confirm_blocks ?? [],
    });

    // Gravar na ficha: o bloco passa a ser igual à ficha e, portanto, confirmado.
    if (save_to_profile?.length) {
      const profilePayload: Record<string, unknown> = {
        clinic_id,
        pet_id: reservation.pet_id,
        updated_by_user_id: req.user?.id ?? null,
      };
      for (const key of save_to_profile) {
        profilePayload[key] = edited.blocks[key];
        if (!isBlockEmpty(key, edited.blocks[key])) edited.block_status[key] = 'confirmed';
      }
      const { error: profErr } = await supabaseAdmin
        .from('hub_pet_care_profiles')
        .upsert(profilePayload, { onConflict: 'pet_id' });
      if (profErr) return res.status(500).json({ error: profErr.message });
    }

    const pendencies = computePlanPendencies({ block_status: edited.block_status }, reservation.mode);
    const update: Record<string, unknown> = { ...edited.blocks, block_status: edited.block_status };
    if (instructions !== undefined) update.instructions = instructions?.trim() || null;
    if (confirm_blocks?.length || save_to_profile?.length) {
      update.confirmed_by_user_id = req.user?.id ?? null;
      update.confirmed_at = pendencies.length === 0 ? new Date().toISOString() : null;
    }
    if (tutor_submission_reviewed) update.tutor_submission_reviewed_at = new Date().toISOString();

    const { data: saved, error } = await supabaseAdmin
      .from('hub_boarding_care_plans')
      .update(update)
      .eq('id', plan.id as string)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const tasksSync = await syncReservationTasks(reservation, { plan: saved as Record<string, unknown> });
    const profileRow = await loadCareProfileRow(clinic_id, reservation.pet_id);
    return res.json({
      care_plan: carePlanPayload(saved as Record<string, unknown>),
      care_profile: careProfilePayload(profileRow),
      plan_pendencies: pendencies,
      tasks_sync: tasksSync,
    });
  } catch (e: unknown) {
    console.error('putHubBoardingCarePlan', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao salvar plano de cuidados' });
  }
};

// ─── Link do tutor ────────────────────────────────────────────────────────

export const postHubBoardingCareTutorLink = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const clinicParsed = uuidStr.safeParse(req.body?.clinic_id);
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    if (!clinicParsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const reservation = await loadReservation(clinicParsed.data, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (!['reserved', 'checked_in'].includes(reservation.status)) {
      return res.status(422).json({ error: 'O link só pode ser gerado para reservas ativas' });
    }
    const plan = await ensureCarePlan(reservation);
    if (!plan) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });

    const stillValid =
      plan.tutor_token &&
      plan.tutor_token_expires_at &&
      new Date(plan.tutor_token_expires_at as string).getTime() > Date.now() + 24 * 3600_000;
    let saved = plan;
    if (!stillValid || req.body?.regenerate === true) {
      const token = crypto.randomBytes(24).toString('base64url');
      const expires = new Date(Date.now() + TUTOR_LINK_DAYS * 24 * 3600_000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('hub_boarding_care_plans')
        .update({ tutor_token: token, tutor_token_expires_at: expires })
        .eq('id', plan.id as string)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      saved = data as Record<string, unknown>;
    }
    return res.json({ care_plan: carePlanPayload(saved) });
  } catch (e: unknown) {
    console.error('postHubBoardingCareTutorLink', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao gerar link do tutor' });
  }
};

// ─── Público: tutor confirma os cuidados ──────────────────────────────────

async function loadPlanByToken(token: string) {
  if (!token || token.length < 20 || token.length > 80) return null;
  const { data, error } = await supabaseAdmin
    .from('hub_boarding_care_plans')
    .select('*')
    .eq('tutor_token', token)
    .maybeSingle();
  if (error || !data) return null;
  const plan = data as Record<string, unknown>;
  const exp = plan.tutor_token_expires_at as string | null;
  if (exp && new Date(exp).getTime() < Date.now()) return { plan, expired: true as const };
  return { plan, expired: false as const };
}

export const getPublicBoardingCare = async (req: Request, res: Response) => {
  try {
    const found = await loadPlanByToken(String(req.params.token || '').trim());
    if (!found) return res.status(404).json({ error: 'Link não encontrado' });
    if (found.expired) return res.status(410).json({ error: 'Este link expirou. Peça um novo para a recepção.' });
    const { plan } = found;

    const { data: rsv } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, clinic_id, pet_id, mode, status, expected_check_in, expected_check_out')
      .eq('id', plan.hub_boarding_reservation_id as string)
      .is('deleted_at', null)
      .maybeSingle();
    if (!rsv) return res.status(404).json({ error: 'Link não encontrado' });
    const [{ data: pet }, { data: clinic }] = await Promise.all([
      supabaseAdmin.from('hub_pets').select('name, species').eq('id', rsv.pet_id as string).maybeSingle(),
      supabaseAdmin.from('clinics').select('name, photo_url').eq('id', rsv.clinic_id as string).maybeSingle(),
    ]);

    const blocks = normalizePlanBlocks(plan);
    return res.json({
      pet: { name: (pet?.name as string | undefined) ?? 'Pet', species: (pet?.species as string | null) ?? null },
      clinic: { name: (clinic?.name as string | undefined) ?? '', photo_url: (clinic?.photo_url as string | null) ?? null },
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
      submission: (plan.tutor_submission as Record<string, unknown> | null) ?? null,
      submitted_at: (plan.tutor_submitted_at as string | null) ?? null,
      can_submit:
        rsv.status === 'reserved' ||
        rsv.status === 'checked_in' ||
        rsv.status === 'checkout_preparing' ||
        rsv.status === 'ready_for_handoff',
    });
  } catch (e: unknown) {
    console.error('getPublicBoardingCare', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const postPublicBoardingCare = async (req: Request, res: Response) => {
  try {
    const found = await loadPlanByToken(String(req.params.token || '').trim());
    if (!found) return res.status(404).json({ error: 'Link não encontrado' });
    if (found.expired) return res.status(410).json({ error: 'Este link expirou. Peça um novo para a recepção.' });
    const parsed = publicCareSubmitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

    const { data: rsv } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('status')
      .eq('id', found.plan.hub_boarding_reservation_id as string)
      .maybeSingle();
    if (!rsv || !['reserved', 'checked_in'].includes(String(rsv.status))) {
      return res.status(422).json({ error: 'Esta hospedagem já foi encerrada.' });
    }

    const d = parsed.data;
    const submission = {
      feeding: normalizeFeeding(d.feeding),
      medications: normalizeMedications(d.medications),
      walks: normalizeWalks(d.walks),
      handling: normalizeHandling(d.handling),
      notes: d.notes?.trim() || null,
      contact_name: d.contact_name?.trim() || null,
    };
    const { error } = await supabaseAdmin
      .from('hub_boarding_care_plans')
      .update({
        tutor_submission: submission,
        tutor_submitted_at: new Date().toISOString(),
        tutor_submission_reviewed_at: null,
      })
      .eq('id', found.plan.id as string);
    if (error) return res.status(500).json({ error: 'Não foi possível enviar agora. Tente novamente.' });
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('postPublicBoardingCare', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
