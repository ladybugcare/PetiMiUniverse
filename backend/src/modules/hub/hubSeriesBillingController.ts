import type { Request, Response } from 'express';
import { z } from 'zod';
import { issueSeriesInvoiceForPeriod, runSeriesInvoiceIssuanceJob } from './hubSeriesBillingService';

const uuidStr = z.string().uuid();

/** POST /api/hub/finance/series-invoices/issue — emissão manual de fatura do mês. */
export const postHubSeriesInvoiceIssue = async (req: Request, res: Response) => {
  try {
    const parsed = z
      .object({
        clinic_id: uuidStr,
        series_id: uuidStr,
        ref_ymd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        force: z.boolean().optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const result = await issueSeriesInvoiceForPeriod({
      clinicId: parsed.data.clinic_id,
      seriesId: parsed.data.series_id,
      refYmd: parsed.data.ref_ymd,
      force: parsed.data.force ?? true,
      actorUserId: req.user?.id ?? null,
    });
    return res.status(result.already_issued ? 200 : 201).json(result);
  } catch (e: unknown) {
    const msg = (e as Error)?.message || 'Erro interno';
    if (msg === 'SERIES_NOT_FOUND') return res.status(404).json({ error: 'Série não encontrada' });
    if (msg === 'SERIES_NOT_PERIODIC') {
      return res.status(409).json({ error: 'Esta série não está configurada para fatura periódica' });
    }
    if (msg === 'NO_OCCURRENCES') {
      return res.status(409).json({ error: 'Nenhuma ocorrência válida no mês para faturar' });
    }
    if (msg === 'NO_GUARDIAN' || msg === 'NO_UNIT') {
      return res.status(409).json({ error: 'Série sem tutor ou unidade para emitir a fatura' });
    }
    if (msg === 'ISSUE_DATE_IN_FUTURE') {
      return res.status(409).json({ error: 'Data de emissão ainda não chegou (use force=true para emitir agora)' });
    }
    console.error('postHubSeriesInvoiceIssue', e);
    return res.status(500).json({ error: msg });
  }
};

/** POST /api/hub/finance/series-invoices/run-job — job diário (cron / admin). */
export const postHubSeriesInvoiceRunJob = async (req: Request, res: Response) => {
  try {
    const parsed = z
      .object({
        clinic_id: uuidStr.optional(),
        ref_ymd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict()
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    const result = await runSeriesInvoiceIssuanceJob({
      clinicId: parsed.data.clinic_id,
      refYmd: parsed.data.ref_ymd,
    });
    return res.json(result);
  } catch (e: unknown) {
    console.error('postHubSeriesInvoiceRunJob', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
