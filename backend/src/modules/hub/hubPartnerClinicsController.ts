import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { assertPartnerClinicInClinic } from './hubCareLocation';

const uuidStr = z.string().uuid();

const optionalTrim = (max: number) => z.string().trim().max(max).optional().nullable();

const createSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().trim().min(1).max(200),
  phone: optionalTrim(40),
  notes: optionalTrim(2000),
  is_active: z.boolean().optional().default(true),
  postal_code: optionalTrim(16),
  state: optionalTrim(2),
  city: optionalTrim(120),
  district: optionalTrim(120),
  street: optionalTrim(200),
  street_number: optionalTrim(32),
  complement: optionalTrim(120),
  /** Legado — aceito, mas preferir street. */
  address_line: optionalTrim(400),
});

const patchSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().trim().min(1).max(200).optional(),
  phone: optionalTrim(40),
  notes: optionalTrim(2000),
  is_active: z.boolean().optional(),
  postal_code: optionalTrim(16),
  state: optionalTrim(2),
  city: optionalTrim(120),
  district: optionalTrim(120),
  street: optionalTrim(200),
  street_number: optionalTrim(32),
  complement: optionalTrim(120),
  address_line: optionalTrim(400),
});

const PARTNER_SELECT =
  'id, clinic_id, name, phone, notes, is_active, postal_code, state, city, district, street, street_number, complement, address_line, created_at, updated_at';

export const listHubPartnerClinics = async (req: Request, res: Response) => {
  try {
    const clinicId = req.query.clinic_id as string;
    if (!uuidStr.safeParse(clinicId).success) {
      return res.status(400).json({ error: 'clinic_id inválido' });
    }
    const includeInactive = req.query.include_inactive === 'true';

    let q = supabaseAdmin
      .from('hub_partner_clinics')
      .select(PARTNER_SELECT)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (!includeInactive) q = q.eq('is_active', true);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ partner_clinics: data ?? [] });
  } catch (e) {
    console.error('[partner_clinics] list', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const createHubPartnerClinic = async (req: Request, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, ...fields } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('hub_partner_clinics')
      .insert({ clinic_id, ...fields })
      .select(PARTNER_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ partner_clinic: data });
  } catch (e) {
    console.error('[partner_clinics] create', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const patchHubPartnerClinic = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const body = patchSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
    }
    const { clinic_id, ...fields } = body.data;

    const existing = await assertPartnerClinicInClinic(clinic_id, idParsed.data, {
      requireActive: false,
    });
    if (!existing) return res.status(404).json({ error: 'Clínica parceira não encontrada' });

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_partner_clinics')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', idParsed.data)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .select(PARTNER_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ partner_clinic: data });
  } catch (e) {
    console.error('[partner_clinics] patch', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const deleteHubPartnerClinic = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const clinicId = req.query.clinic_id as string;
    if (!idParsed.success || !uuidStr.safeParse(clinicId).success) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    const existing = await assertPartnerClinicInClinic(clinicId, idParsed.data, {
      requireActive: false,
    });
    if (!existing) return res.status(404).json({ error: 'Clínica parceira não encontrada' });

    const { error } = await supabaseAdmin
      .from('hub_partner_clinics')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', idParsed.data)
      .eq('clinic_id', clinicId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ deleted: true });
  } catch (e) {
    console.error('[partner_clinics] delete', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
