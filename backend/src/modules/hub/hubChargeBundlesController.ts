import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { streamChargeBundlePdf } from './hubChargeBundlePdf';
import {
  buildChargeBundleDetail,
  generateChargeBundlePublicToken,
  receivableBalanceAmount,
} from './hubChargeBundlesService';

const uuidStr = z.string().uuid();

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const createBundleSchema = z
  .object({
    clinic_id: uuidStr,
    guardian_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    receivable_ids: z.array(uuidStr).min(1).max(30),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
  })
  .strict();

const listBundlesQuerySchema = z.object({
  clinic_id: uuidStr,
  guardian_id: uuidStr.optional(),
  status: z.enum(['open', 'partially_paid', 'paid', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const markSentSchema = z
  .object({
    clinic_id: uuidStr,
  })
  .strict();

async function loadBundlePdfPayload(bundleId: string, clinicId: string) {
  const detail = await buildChargeBundleDetail(bundleId, clinicId);
  if (!detail) throw new Error('NOT_FOUND');

  const { data: clinicRow } = await supabaseAdmin
    .from('clinics')
    .select('name, photo_url')
    .eq('id', clinicId)
    .maybeSingle();

  return {
    id: detail.id as string,
    due_date: (detail.due_date as string | null) ?? null,
    total_amount: Number(detail.total_amount ?? 0),
    balance_due: Number(detail.balance_due ?? 0),
    guardian: detail.guardian as { full_name: string; phone?: string | null; email?: string | null } | null,
    clinic: clinicRow
      ? { name: (clinicRow as { name: string | null }).name, photo_url: (clinicRow as { photo_url: string | null }).photo_url }
      : null,
    items: ((detail.items ?? []) as Array<Record<string, unknown>>).map((it) => ({
      title: String(it.title ?? 'Cobrança'),
      pet_names: (it.pet_names as string[] | undefined) ?? [],
      due_date: (it.due_date as string | null) ?? null,
      balance_amount: Number(it.balance_amount ?? 0),
    })),
    notes: (detail.notes as string | null) ?? null,
  };
}

/** POST /finance/charge-bundles */
export const postHubChargeBundle = async (req: Request, res: Response) => {
  try {
    const parsed = createBundleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, guardian_id, unit_id, receivable_ids, due_date, notes } = parsed.data;
    const userId = req.user?.id ?? null;

    const uniqueIds = [...new Set(receivable_ids)];
    const { data: receivables, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, guardian_id, status, final_amount')
      .eq('clinic_id', clinic_id)
      .in('id', uniqueIds)
      .is('deleted_at', null);
    if (rErr) return res.status(500).json({ error: rErr.message });
    if ((receivables ?? []).length !== uniqueIds.length) {
      return res.status(404).json({ error: 'Um ou mais recebíveis não foram encontrados' });
    }

    for (const rec of receivables ?? []) {
      if (String(rec.guardian_id) !== guardian_id) {
        return res.status(409).json({ error: 'Todos os recebíveis devem ser do mesmo tutor.' });
      }
      const st = String(rec.status ?? '');
      if (!['pending', 'partially_paid'].includes(st)) {
        return res.status(409).json({ error: 'Só é possível agrupar recebíveis pendentes ou parcialmente pagos.' });
      }
    }

    let total = 0;
    for (const rid of uniqueIds) {
      total = round2(total + (await receivableBalanceAmount(rid, clinic_id)));
    }
    if (total <= 0) {
      return res.status(409).json({ error: 'Não há saldo em aberto nos recebíveis selecionados.' });
    }

    const publicToken = await generateChargeBundlePublicToken();
    const { data: bundle, error: insErr } = await supabaseAdmin
      .from('hub_charge_bundles')
      .insert({
        clinic_id,
        guardian_id,
        unit_id: unit_id ?? null,
        due_date: due_date ?? null,
        public_token: publicToken,
        notes: notes ?? null,
        status: 'open',
        total_amount: total,
        created_by_user_id: userId,
      })
      .select('id')
      .single();
    if (insErr || !bundle) {
      console.error('postHubChargeBundle insert', insErr);
      return res.status(500).json({ error: insErr?.message || 'Erro ao criar lote' });
    }

    const bundleId = bundle.id as string;
    const itemRows = uniqueIds.map((receivable_id, idx) => ({
      bundle_id: bundleId,
      receivable_id,
      sort_order: idx,
    }));
    const { error: itemsErr } = await supabaseAdmin.from('hub_charge_bundle_items').insert(itemRows);
    if (itemsErr) {
      await supabaseAdmin.from('hub_charge_bundles').delete().eq('id', bundleId);
      return res.status(500).json({ error: itemsErr.message });
    }

    const detail = await buildChargeBundleDetail(bundleId, clinic_id);
    return res.status(201).json({ bundle: detail });
  } catch (e: unknown) {
    console.error('postHubChargeBundle', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** GET /finance/charge-bundles */
export const listHubChargeBundles = async (req: Request, res: Response) => {
  try {
    const parsed = listBundlesQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, guardian_id, status, limit = 50 } = parsed.data;

    let q = supabaseAdmin
      .from('hub_charge_bundles')
      .select('id, clinic_id, guardian_id, unit_id, due_date, status, total_amount, created_at, sent_at, cancelled_at')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (guardian_id) q = q.eq('guardian_id', guardian_id);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const bundles = await Promise.all(
      (data ?? []).map(async (row) => {
        const detail = await buildChargeBundleDetail(row.id as string, clinic_id);
        return detail ?? row;
      }),
    );

    return res.json({ bundles });
  } catch (e: unknown) {
    console.error('listHubChargeBundles', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** GET /finance/charge-bundles/:id */
export const getHubChargeBundle = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic.success) {
      return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    }
    const detail = await buildChargeBundleDetail(id.data, clinic.data);
    if (!detail) return res.status(404).json({ error: 'Lote não encontrado' });
    return res.json({ bundle: detail });
  } catch (e: unknown) {
    console.error('getHubChargeBundle', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** PATCH /finance/charge-bundles/:id/mark-sent */
export const patchHubChargeBundleMarkSent = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = markSentSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hub_charge_bundles')
      .update({ sent_at: now })
      .eq('id', id.data)
      .eq('clinic_id', parsed.data.clinic_id)
      .is('deleted_at', null)
      .select('id, sent_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Lote não encontrado' });
    return res.json({ bundle: data });
  } catch (e: unknown) {
    console.error('patchHubChargeBundleMarkSent', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** GET /finance/charge-bundles/:id/pdf */
export const getHubChargeBundlePdf = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic.success) {
      return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    }
    const payload = await loadBundlePdfPayload(id.data, clinic.data);
    await streamChargeBundlePdf(res, payload);
  } catch (e: unknown) {
    if ((e as Error)?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Lote não encontrado' });
    console.error('getHubChargeBundlePdf', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** GET /public/charge-bundles/:token */
export const getPublicChargeBundle = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token inválido' });

    const { data: bundle, error } = await supabaseAdmin
      .from('hub_charge_bundles')
      .select('id, clinic_id, guardian_id, due_date, status, total_amount, notes, public_token, cancelled_at, deleted_at')
      .eq('public_token', token)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!bundle || bundle.deleted_at || bundle.cancelled_at) {
      return res.status(404).json({ error: 'Cobrança não encontrada' });
    }

    const detail = await buildChargeBundleDetail(bundle.id as string, bundle.clinic_id as string);
    if (!detail) return res.status(404).json({ error: 'Cobrança não encontrada' });

    const { data: clinicRow } = await supabaseAdmin
      .from('clinics')
      .select('name, photo_url')
      .eq('id', bundle.clinic_id as string)
      .maybeSingle();

    const { guardian, items, balance_due, paid_amount, due_date, total_amount, notes } = detail as Record<
      string,
      unknown
    >;

    return res.json({
      bundle: {
        id: detail.id,
        due_date,
        total_amount,
        balance_due,
        paid_amount,
        notes,
        clinic: clinicRow
          ? {
              name: (clinicRow as { name: string | null }).name,
              photo_url: (clinicRow as { photo_url: string | null }).photo_url ?? null,
            }
          : null,
        guardian,
        items,
      },
    });
  } catch (e: unknown) {
    console.error('getPublicChargeBundle', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** GET /public/charge-bundles/:token/pdf */
export const getPublicChargeBundlePdf = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token inválido' });

    const { data: bundle } = await supabaseAdmin
      .from('hub_charge_bundles')
      .select('id, clinic_id, cancelled_at, deleted_at')
      .eq('public_token', token)
      .maybeSingle();
    if (!bundle || bundle.deleted_at || bundle.cancelled_at) {
      return res.status(404).json({ error: 'Cobrança não encontrada' });
    }

    const payload = await loadBundlePdfPayload(bundle.id as string, bundle.clinic_id as string);
    await streamChargeBundlePdf(res, payload);
  } catch (e: unknown) {
    if ((e as Error)?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Cobrança não encontrada' });
    console.error('getPublicChargeBundlePdf', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
