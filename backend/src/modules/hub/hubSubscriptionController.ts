import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ExternalServiceError, ForbiddenError, ValidationError } from '../../utils/errors.js';
import {
  applyMercadoPagoPreapproval,
  getClinicSubscription,
  HubPlanError,
  listPublicPlansAndModules,
  savePreapprovalId,
  stagePlanCheckout,
  toSessionSubscriptionPayload,
} from './hubSubscriptionService.js';
import {
  createMercadoPagoPreapproval,
  fetchMercadoPagoPreapproval,
  isValidMercadoPagoSignature,
  mercadoPagoConfigured,
  preapprovalCheckoutUrl,
} from './hubMercadoPago.js';

function hubWebBase(): string {
  const raw = process.env.HUB_WEB_URL?.trim() || process.env.FRONTEND_URL?.trim();
  if (!raw) throw new ValidationError('HUB_WEB_URL não configurada no servidor');
  return raw.replace(/\/$/, '');
}

async function clinicForUser(userId: string): Promise<{ clinicId: string; role: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('clinic_users')
    .select('clinic_id, role, status, created_at')
    .eq('user_id', userId)
    .not('clinic_id', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data || []) as Array<{ clinic_id: string; role: string; status: string }>;
  const row = rows.find((r) => r.status === 'active') || rows[0];
  if (!row?.clinic_id) return null;
  return { clinicId: row.clinic_id, role: String(row.role || '').toUpperCase() };
}

/** GET /api/hub/subscription/plans — catálogo (beta e/ou planos pagos do lançamento). */
export const getHubSubscriptionPlans = asyncHandler(async (_req: Request, res: Response) => {
  const catalog = await listPublicPlansAndModules();
  res.json({ ...catalog, mercado_pago_configured: mercadoPagoConfigured() });
});

/** GET /api/hub/subscription — assinatura da clínica logada. */
export const getHubSubscriptionMe = asyncHandler(async (req: Request, res: Response) => {
  const clinic = await clinicForUser(req.user!.id);
  if (!clinic) throw new ValidationError('Nenhuma clínica vinculada a esta conta.');
  const sub = await getClinicSubscription(clinic.clinicId);
  const catalog = await listPublicPlansAndModules();
  res.json({
    mercado_pago_configured: mercadoPagoConfigured(),
    can_checkout: clinic.role === 'CADMIN',
    mode: catalog.mode,
    paid_plans: catalog.paid_plans,
    subscription: sub
      ? {
          ...toSessionSubscriptionPayload(sub),
          plan_name: sub.hub_platform_plans?.name ?? null,
          monthly_price_cents: sub.hub_platform_plans?.monthly_price_cents ?? null,
          max_units: sub.hub_platform_plans?.max_units ?? null,
          max_users: sub.hub_platform_plans?.max_users ?? null,
          current_period_end: sub.current_period_end ?? null,
          mp_preapproval_id: sub.mp_preapproval_id ?? null,
        }
      : null,
  });
});

const checkoutBody = z.object({
  plan_slug: z.string().trim().min(2).max(50),
});

/** POST /api/hub/subscription/checkout — cria a assinatura no Mercado Pago e devolve o link. */
export const postHubSubscriptionCheckout = asyncHandler(async (req: Request, res: Response) => {
  const parsed = checkoutBody.safeParse(req.body);
  if (!parsed.success) throw new ValidationError('Informe o plano.');

  const clinic = await clinicForUser(req.user!.id);
  if (!clinic) throw new ValidationError('Nenhuma clínica vinculada a esta conta.');
  if (clinic.role !== 'CADMIN') {
    throw new ForbiddenError('Só o administrador da clínica pode assinar o plano.');
  }

  const email = req.user!.email?.trim();
  if (!email) throw new ValidationError('A conta precisa de um e-mail para o Mercado Pago.');
  if (!mercadoPagoConfigured()) {
    throw new ValidationError(
      'Mercado Pago ainda não está configurado neste ambiente. Defina MERCADOPAGO_ACCESS_TOKEN no servidor.',
    );
  }

  let staged: { planName: string; amountCents: number };
  try {
    staged = await stagePlanCheckout(clinic.clinicId, parsed.data.plan_slug);
  } catch (e) {
    if (e instanceof HubPlanError) throw new ValidationError(e.message);
    throw e;
  }

  const backUrl = `${hubWebBase()}/hub/assinatura?retorno=1`;
  let preapproval;
  try {
    preapproval = await createMercadoPagoPreapproval({
      reason: `PetMi Hub — ${staged.planName}`,
      clinicId: clinic.clinicId,
      payerEmail: email,
      amountReais: staged.amountCents / 100,
      backUrl,
    });
  } catch (e) {
    throw new ExternalServiceError((e as Error).message || 'Falha ao abrir o Mercado Pago', 'mercadopago');
  }

  await savePreapprovalId(clinic.clinicId, preapproval.id);
  const initPoint = preapprovalCheckoutUrl(preapproval);
  if (!initPoint) {
    throw new ExternalServiceError('Mercado Pago não devolveu o link de pagamento.', 'mercadopago');
  }

  res.json({ init_point: initPoint, preapproval_id: preapproval.id });
});

/** POST /api/hub/subscription/sync — consulta o Mercado Pago depois que o cliente volta do checkout. */
export const postHubSubscriptionSync = asyncHandler(async (req: Request, res: Response) => {
  const clinic = await clinicForUser(req.user!.id);
  if (!clinic) throw new ValidationError('Nenhuma clínica vinculada a esta conta.');
  const sub = await getClinicSubscription(clinic.clinicId);
  if (!sub?.mp_preapproval_id) {
    res.json({
      subscription: sub ? toSessionSubscriptionPayload(sub) : null,
      synced: false,
    });
    return;
  }
  if (!mercadoPagoConfigured()) {
    res.json({ subscription: toSessionSubscriptionPayload(sub), synced: false });
    return;
  }

  try {
    const remote = await fetchMercadoPagoPreapproval(sub.mp_preapproval_id);
    await applyMercadoPagoPreapproval({
      preapprovalId: remote.id,
      status: remote.status,
      externalReference: remote.external_reference ?? clinic.clinicId,
      nextPaymentDate: remote.next_payment_date ?? null,
    });
  } catch (e) {
    console.warn('[hubSubscription] sync', (e as Error).message);
  }

  const fresh = await getClinicSubscription(clinic.clinicId);
  res.json({
    subscription: fresh ? toSessionSubscriptionPayload(fresh) : null,
    synced: true,
  });
});

function webhookDataId(req: Request): string | null {
  const query = req.query as Record<string, unknown>;
  const fromQuery = query['data.id'] ?? query.id;
  if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  const body = req.body as { data?: { id?: string }; id?: string } | undefined;
  const fromBody = body?.data?.id || body?.id;
  return fromBody ? String(fromBody) : null;
}

function webhookTopic(req: Request): string {
  const query = req.query as Record<string, unknown>;
  const topic = query.topic ?? query.type;
  const body = req.body as { type?: string; topic?: string } | undefined;
  return String(topic || body?.type || body?.topic || '').toLowerCase();
}

/** POST /api/public/mercadopago/webhook — aviso de assinatura autorizada, pausada ou cancelada. */
export const postMercadoPagoWebhook = asyncHandler(async (req: Request, res: Response) => {
  const dataId = webhookDataId(req);
  const topic = webhookTopic(req);
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (secret) {
    const ok = isValidMercadoPagoSignature({
      signatureHeader: req.header('x-signature') || undefined,
      requestId: req.header('x-request-id') || undefined,
      dataId: dataId || undefined,
      secret,
    });
    if (!ok) {
      res.status(401).json({ error: 'Assinatura do webhook inválida' });
      return;
    }
  }

  const isPreapproval = !topic || topic.includes('preapproval');
  if (!dataId || !isPreapproval || !mercadoPagoConfigured()) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    const remote = await fetchMercadoPagoPreapproval(dataId);
    await applyMercadoPagoPreapproval({
      preapprovalId: remote.id,
      status: remote.status,
      externalReference: remote.external_reference ?? null,
      nextPaymentDate: remote.next_payment_date ?? null,
    });
  } catch (e) {
    console.error('[mercadopago] webhook', (e as Error).message);
    res.status(500).json({ error: 'Falha ao processar aviso' });
    return;
  }

  res.status(200).json({ ok: true });
});
