import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { checkClinicAccess } from '../../middleware/authMiddleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError } from '../../utils/errors.js';

const uuidStr = z.string().uuid();

const CLINIC_EDIT_ROLES = new Set(['CADMIN', 'CMANAGER']);

async function userCanEditClinicProfile(userId: string, clinicId: string): Promise<boolean> {
  if (userId === clinicId) return true;
  const { data } = await supabaseAdmin
    .from('clinic_users')
    .select('role')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .maybeSingle();
  return !!data?.role && CLINIC_EDIT_ROLES.has(String(data.role).toUpperCase());
}

const patchClinicBodySchema = z.object({
  name: z.string().trim().min(2).max(300).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().min(3).max(500).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  state: z.string().trim().min(2).max(2).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

const patchUnitBodySchema = z.object({
  name: z.string().trim().min(2).max(300).optional(),
  nickname: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().min(3).max(500).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  state: z.string().trim().min(2).max(2).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  technical_manager: z.string().trim().min(2).max(200).optional(),
  is_main: z.boolean().optional(),
});

/** PATCH /api/hub/clinic/profile?clinic_id=... */
export const patchHubClinicProfile = asyncHandler(async (req: Request, res: Response) => {
  const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
  if (!clinicParsed.success) {
    throw new ValidationError('clinic_id inválido na query');
  }

  const bodyParsed = patchClinicBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw new ValidationError(bodyParsed.error.issues.map((i) => i.message).join('; '));
  }

  const clinicId = clinicParsed.data;
  const userId = req.user!.id;

  const hasAccess = await checkClinicAccess(userId, clinicId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const canEdit = await userCanEditClinicProfile(userId, clinicId);
  if (!canEdit) {
    return res.status(403).json({ error: 'Sem permissão para editar o perfil da clínica.' });
  }

  const payload = bodyParsed.data;
  if (Object.keys(payload).length === 0) {
    throw new ValidationError('Nenhum campo para atualizar');
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.phone !== undefined) update.phone = payload.phone?.trim() || null;
  if (payload.address !== undefined) update.address = payload.address;
  if (payload.city !== undefined) update.city = payload.city;
  if (payload.state !== undefined) update.state = payload.state.toUpperCase();
  if (payload.description !== undefined) update.description = payload.description?.trim() || null;

  const { data: clinic, error } = await supabaseAdmin
    .from('clinics')
    .update(update)
    .eq('id', clinicId)
    .select()
    .single();

  if (error || !clinic) {
    return res.status(500).json({ error: 'Erro ao atualizar clínica.' });
  }

  res.json({ clinic });
});

/** PATCH /api/hub/units/:unitId?clinic_id=... */
export const patchHubUnitProfile = asyncHandler(async (req: Request, res: Response) => {
  const unitParsed = uuidStr.safeParse(req.params.unitId);
  const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
  if (!unitParsed.success) {
    throw new ValidationError('unitId inválido');
  }
  if (!clinicParsed.success) {
    throw new ValidationError('clinic_id inválido na query');
  }

  const bodyParsed = patchUnitBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw new ValidationError(bodyParsed.error.issues.map((i) => i.message).join('; '));
  }

  const unitId = unitParsed.data;
  const clinicId = clinicParsed.data;
  const userId = req.user!.id;

  const hasAccess = await checkClinicAccess(userId, clinicId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const canEdit = await userCanEditClinicProfile(userId, clinicId);
  if (!canEdit) {
    return res.status(403).json({ error: 'Sem permissão para editar a unidade.' });
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('units')
    .select('id, clinic_id')
    .eq('id', unitId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'Unidade não encontrada.' });
  }
  if (existing.clinic_id !== clinicId) {
    return res.status(403).json({ error: 'Unidade não pertence a esta clínica.' });
  }

  const payload = bodyParsed.data;
  if (Object.keys(payload).length === 0) {
    throw new ValidationError('Nenhum campo para atualizar');
  }

  if (payload.nickname !== undefined) {
    const nickname = payload.nickname.trim();
    const { data: nickConflict } = await supabaseAdmin
      .from('units')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('nickname', nickname)
      .neq('id', unitId)
      .maybeSingle();

    if (nickConflict) {
      return res.status(400).json({ error: 'Já existe uma unidade com este apelido.' });
    }
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.nickname !== undefined) update.nickname = payload.nickname.trim();
  if (payload.address !== undefined) update.address = payload.address;
  if (payload.city !== undefined) update.city = payload.city;
  if (payload.state !== undefined) update.state = payload.state.toUpperCase();
  if (payload.phone !== undefined) update.phone = payload.phone?.trim() || null;
  if (payload.technical_manager !== undefined) update.technical_manager = payload.technical_manager.trim();
  if (payload.is_main !== undefined) update.is_main = payload.is_main;

  if (payload.is_main === true) {
    await supabaseAdmin
      .from('units')
      .update({ is_main: false, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .neq('id', unitId);
  }

  const { data: unit, error } = await supabaseAdmin
    .from('units')
    .update(update)
    .eq('id', unitId)
    .select()
    .single();

  if (error || !unit) {
    return res.status(500).json({ error: 'Erro ao atualizar unidade.' });
  }

  res.json({ unit });
});
