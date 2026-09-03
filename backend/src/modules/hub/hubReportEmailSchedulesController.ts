import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

const SCHEDULE_SELECT =
  'id, clinic_id, unit_id, report_id, cadence, recipient_email, period_days, active, last_sent_at, last_status, last_error, created_by_user_id, created_at, updated_at';

const REPORT_IDS = [
  'finance-overview',
  'pending-payments',
  'sales-adjustments',
  'top-clients',
  'cash-flow',
  'absent-clients',
  'packages',
  'stock-abc',
] as const;

const createSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    report_id: z.enum(REPORT_IDS),
    recipient_email: z.string().email().max(200),
    period_days: z.coerce.number().int().min(7).max(366).optional(),
    cadence: z.literal('weekly').optional(),
    active: z.boolean().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    clinic_id: uuidStr,
    recipient_email: z.string().email().max(200).optional(),
    period_days: z.coerce.number().int().min(7).max(366).optional(),
    unit_id: uuidStr.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const listHubReportEmailSchedules = async (req: Request, res: Response) => {
  try {
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const { data, error } = await supabaseAdmin
      .from('hub_report_email_schedules')
      .select(SCHEDULE_SELECT)
      .eq('clinic_id', clinic.data)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      if (String(error.message || '').includes('hub_report_email_schedules')) {
        return res.json({ schedules: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.json({ schedules: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubReportEmailSchedules', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const createHubReportEmailSchedule = async (req: Request, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const row = {
      clinic_id: d.clinic_id,
      unit_id: d.unit_id ?? null,
      report_id: d.report_id,
      recipient_email: d.recipient_email.trim().toLowerCase(),
      period_days: d.period_days ?? 30,
      cadence: d.cadence ?? 'weekly',
      active: d.active ?? true,
      created_by_user_id: (req as { user?: { id?: string } }).user?.id ?? null,
    };
    const { data, error } = await supabaseAdmin
      .from('hub_report_email_schedules')
      .insert(row)
      .select(SCHEDULE_SELECT)
      .single();
    if (error) {
      if (String(error.message || '').includes('hub_report_email_schedules')) {
        return res.status(503).json({
          error: 'Tabela hub_report_email_schedules não encontrada. Aplique a migração 096.',
        });
      }
      if (String(error.code) === '23505') {
        return res.status(409).json({ error: 'Já existe agendamento ativo para este relatório e e-mail.' });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ schedule: data });
  } catch (e: unknown) {
    console.error('createHubReportEmailSchedule', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const patchHubReportEmailSchedule = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'id inválido' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, ...rest } = parsed.data;
    const patch: Record<string, unknown> = {};
    if (rest.recipient_email !== undefined) patch.recipient_email = rest.recipient_email.trim().toLowerCase();
    if (rest.period_days !== undefined) patch.period_days = rest.period_days;
    if (rest.unit_id !== undefined) patch.unit_id = rest.unit_id;
    if (rest.active !== undefined) patch.active = rest.active;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabaseAdmin
      .from('hub_report_email_schedules')
      .update(patch)
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .select(SCHEDULE_SELECT)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Agendamento não encontrado' });
    return res.json({ schedule: data });
  } catch (e: unknown) {
    console.error('patchHubReportEmailSchedule', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const deleteHubReportEmailSchedule = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'id inválido' });
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const { error } = await supabaseAdmin
      .from('hub_report_email_schedules')
      .delete()
      .eq('id', id.data)
      .eq('clinic_id', clinic.data);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (e: unknown) {
    console.error('deleteHubReportEmailSchedule', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/**
 * Disparo manual do agendamento.
 * Sem provedor SMTP configurado, registra status `queued` e devolve preview do payload.
 */
export const runHubReportEmailSchedule = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'id inválido' });
    const clinic = uuidStr.safeParse(req.body?.clinic_id ?? req.query.clinic_id);
    if (!clinic.success) return res.status(400).json({ error: 'clinic_id inválido' });

    const { data: schedule, error } = await supabaseAdmin
      .from('hub_report_email_schedules')
      .select(SCHEDULE_SELECT)
      .eq('id', id.data)
      .eq('clinic_id', clinic.data)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!schedule) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (!schedule.active) {
      return res.status(409).json({ error: 'Agendamento inativo' });
    }

    const preview = {
      to: schedule.recipient_email,
      subject: `[PetMi Hub] Relatório semanal — ${schedule.report_id}`,
      report_id: schedule.report_id,
      period_days: schedule.period_days,
      cadence: schedule.cadence,
      note:
        'Fila registrada. Configure o provedor de e-mail do Hub para envio automático; até lá o disparo fica como queued.',
    };

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('hub_report_email_schedules')
      .update({
        last_sent_at: new Date().toISOString(),
        last_status: 'queued',
        last_error: null,
      })
      .eq('id', id.data)
      .eq('clinic_id', clinic.data)
      .select(SCHEDULE_SELECT)
      .single();
    if (uErr) return res.status(500).json({ error: uErr.message });

    return res.json({ schedule: updated, preview, delivery: 'queued' });
  } catch (e: unknown) {
    console.error('runHubReportEmailSchedule', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
