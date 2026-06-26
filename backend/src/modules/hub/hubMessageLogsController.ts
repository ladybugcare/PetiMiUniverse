import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const createMessageLogSchema = z.object({
  clinic_id: z.string().uuid(),
  unit_id: z.string().uuid().optional().nullable(),
  guardian_id: z.string().uuid().optional().nullable(),
  pet_id: z.string().uuid().optional().nullable(),
  channel: z.enum(['whatsapp_link', 'in_app']),
  template_key: z.string().max(64).optional().nullable(),
  triggered_by_staff_id: z.string().uuid().optional().nullable(),
});

export async function postHubMessageLog(req: Request, res: Response): Promise<void> {
  const parsed = createMessageLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;

  const { error } = await supabaseAdmin.from('hub_message_logs').insert([
    {
      clinic_id: data.clinic_id,
      unit_id: data.unit_id ?? null,
      guardian_id: data.guardian_id ?? null,
      pet_id: data.pet_id ?? null,
      channel: data.channel,
      template_key: data.template_key ?? null,
      triggered_by_staff_id: data.triggered_by_staff_id ?? null,
    },
  ]);

  if (error) {
    res.status(500).json({ error: 'Erro ao registrar tentativa de comunicação' });
    return;
  }

  res.status(201).json({ ok: true });
}
