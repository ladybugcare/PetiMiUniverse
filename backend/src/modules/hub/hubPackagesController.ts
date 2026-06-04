import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

const packageBodySchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(200),
    hub_service_type_id: uuidStr.optional().nullable(),
    sessions_total: z.number().int().min(1).max(9999),
    price: z.number().min(0),
    validity_days: z.number().int().min(1).max(3650).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const listHubPackages = async (req: Request, res: Response) => {
  try {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
    const { data, error } = await supabaseAdmin
      .from('hub_packages')
      .select('*')
      .eq('clinic_id', clinicParsed.data)
      .eq('active', true)
      .order('name', { ascending: true });
    if (error) {
      if (String(error.message || '').includes('hub_packages')) {
        return res.json({ packages: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.json({ packages: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubPackages', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const postHubPackage = async (req: Request, res: Response) => {
  try {
    const parsed = packageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('hub_packages')
      .insert({
        clinic_id: b.clinic_id,
        name: b.name,
        hub_service_type_id: b.hub_service_type_id ?? null,
        sessions_total: b.sessions_total,
        price: b.price,
        validity_days: b.validity_days ?? null,
        notes: b.notes ?? null,
        active: true,
      })
      .select('*')
      .single();
    if (error) {
      if (String(error.message || '').includes('hub_packages')) {
        return res.status(503).json({ error: 'Tabela hub_packages não encontrada. Aplique create_hub_packages_and_subscriptions.sql.' });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ package: data });
  } catch (e: unknown) {
    console.error('postHubPackage', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
