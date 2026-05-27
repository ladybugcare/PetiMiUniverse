import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

const patchSchema = z
  .object({
    clinic_id: uuidStr,
    pet_puppy_max_months: z.number().int().min(1).max(24),
  })
  .strict();

/** Garante linha de settings por clínica (default 8 meses). */
export async function getOrCreateHubClinicSettings(clinicId: string): Promise<{ pet_puppy_max_months: number }> {
  const { data: row, error: selErr } = await supabaseAdmin
    .from('hub_clinic_settings')
    .select('pet_puppy_max_months')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (!selErr && row) {
    return { pet_puppy_max_months: Number((row as { pet_puppy_max_months: number }).pet_puppy_max_months) || 8 };
  }
  const { data: ins, error: insErr } = await supabaseAdmin
    .from('hub_clinic_settings')
    .insert({ clinic_id: clinicId })
    .select('pet_puppy_max_months')
    .single();
  if (insErr || !ins) {
    return { pet_puppy_max_months: 8 };
  }
  return { pet_puppy_max_months: Number((ins as { pet_puppy_max_months: number }).pet_puppy_max_months) || 8 };
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
    const { clinic_id, pet_puppy_max_months } = body.data;
    await getOrCreateHubClinicSettings(clinic_id);
    const { error } = await supabaseAdmin
      .from('hub_clinic_settings')
      .update({ pet_puppy_max_months })
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
