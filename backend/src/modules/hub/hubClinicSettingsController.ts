import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

const messageTemplatesSchema = z
  .record(z.string(), z.string().max(500))
  .optional();

const patchSchema = z
  .object({
    clinic_id: uuidStr,
    pet_puppy_max_months: z.number().int().min(1).max(24).optional(),
    message_templates: messageTemplatesSchema,
  })
  .strict();

export type HubClinicSettingsRow = {
  pet_puppy_max_months: number;
  message_templates: Record<string, string>;
};

/** Garante linha de settings por clínica (defaults: 8 meses, templates vazios). */
export async function getOrCreateHubClinicSettings(clinicId: string): Promise<HubClinicSettingsRow> {
  const { data: row, error: selErr } = await supabaseAdmin
    .from('hub_clinic_settings')
    .select('pet_puppy_max_months, message_templates')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (!selErr && row) {
    const r = row as { pet_puppy_max_months: number; message_templates: Record<string, string> | null };
    return {
      pet_puppy_max_months: Number(r.pet_puppy_max_months) || 8,
      message_templates: r.message_templates ?? {},
    };
  }
  const { data: ins, error: insErr } = await supabaseAdmin
    .from('hub_clinic_settings')
    .insert({ clinic_id: clinicId })
    .select('pet_puppy_max_months, message_templates')
    .single();
  if (insErr || !ins) {
    return { pet_puppy_max_months: 8, message_templates: {} };
  }
  const i = ins as { pet_puppy_max_months: number; message_templates: Record<string, string> | null };
  return {
    pet_puppy_max_months: Number(i.pet_puppy_max_months) || 8,
    message_templates: i.message_templates ?? {},
  };
}

export const getHubClinicSettings = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const settings = await getOrCreateHubClinicSettings(parsed.data);
    return res.json({ settings });
  } catch (e) {
    console.error('[hub_clinic_settings] get', e);
    return res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
};

export const patchHubClinicSettings = async (req: Request, res: Response) => {
  try {
    const body = patchSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const { clinic_id, pet_puppy_max_months, message_templates } = body.data;

    if (pet_puppy_max_months === undefined && message_templates === undefined) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    await getOrCreateHubClinicSettings(clinic_id);

    const patch: Record<string, unknown> = {};
    if (pet_puppy_max_months !== undefined) patch.pet_puppy_max_months = pet_puppy_max_months;
    if (message_templates !== undefined) patch.message_templates = message_templates;

    const { error } = await supabaseAdmin
      .from('hub_clinic_settings')
      .update(patch)
      .eq('clinic_id', clinic_id);
    if (error) {
      console.error('[hub_clinic_settings] patch', error);
      return res.status(500).json({ error: error.message });
    }
    const settings = await getOrCreateHubClinicSettings(clinic_id);
    return res.json({ settings });
  } catch (e) {
    console.error('[hub_clinic_settings] patch', e);
    return res.status(500).json({ error: 'Erro ao gravar configurações' });
  }
};
