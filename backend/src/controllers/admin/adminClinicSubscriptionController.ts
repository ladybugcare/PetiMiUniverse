import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError } from '../../utils/errors.js';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog.js';
import {
  ALL_HUB_MODULES,
  getClinicSubscription,
  patchClinicSubscription,
  createBetaSubscription,
} from '../../modules/hub/hubSubscriptionService.js';

const MODULE_SET = new Set<string>(ALL_HUB_MODULES);

const patchBodySchema = z.object({
  is_beta: z.boolean().optional(),
  beta_free_until: z.union([z.string(), z.null()]).optional(),
  beta_discount_percent: z.number().int().min(0).max(100).nullable().optional(),
  override_monthly_cents: z.number().int().min(0).nullable().optional(),
  beta_notes: z.string().max(2000).nullable().optional(),
  enabled_modules: z.array(z.string()).optional(),
  status: z.enum(['beta', 'trialing', 'active', 'past_due', 'canceled']).optional(),
});

function requirePlatformAdmin(req: Request, res: Response): boolean {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ error: 'Acesso negado' });
    return false;
  }
  return true;
}

function serializeSubscription(sub: Awaited<ReturnType<typeof getClinicSubscription>>) {
  if (!sub) return null;
  return {
    id: sub.id,
    clinic_id: sub.clinic_id,
    status: sub.status,
    is_beta: sub.is_beta,
    beta_free_until: sub.beta_free_until,
    beta_discount_percent: sub.beta_discount_percent,
    override_monthly_cents: sub.override_monthly_cents,
    beta_notes: sub.beta_notes,
    enabled_modules: sub.enabled_modules,
    started_at: sub.started_at,
    canceled_at: sub.canceled_at,
    base_plan: sub.hub_platform_plans
      ? {
          slug: sub.hub_platform_plans.slug,
          name: sub.hub_platform_plans.name,
          max_units: sub.hub_platform_plans.max_units,
          max_users: sub.hub_platform_plans.max_users,
        }
      : null,
  };
}

/** GET /admin/clinics/:clinicId/subscription */
export const getAdminClinicSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;

  const clinicId = String(req.params.clinicId || '').trim();
  if (!clinicId) {
    throw new ValidationError('clinicId é obrigatório');
  }

  let sub = await getClinicSubscription(clinicId);
  if (!sub) {
    sub = await createBetaSubscription(clinicId, { notes: 'Criada sob demanda pelo admin' });
  }

  res.json({
    subscription: serializeSubscription(sub),
    available_modules: [...ALL_HUB_MODULES],
  });
});

/** PATCH /admin/clinics/:clinicId/subscription */
export const patchAdminClinicSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;

  const clinicId = String(req.params.clinicId || '').trim();
  if (!clinicId) {
    throw new ValidationError('clinicId é obrigatório');
  }

  const parsed = patchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const body = parsed.data;
  if (body.enabled_modules) {
    const invalid = body.enabled_modules.filter((m) => !MODULE_SET.has(m));
    if (invalid.length) {
      throw new ValidationError(`Módulos inválidos: ${invalid.join(', ')}`);
    }
  }

  // Aceitar date-only (YYYY-MM-DD) do date picker; string vazia = null
  let betaFreeUntil: string | null | undefined = body.beta_free_until;
  if (betaFreeUntil === '') betaFreeUntil = null;
  if (typeof betaFreeUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(betaFreeUntil)) {
    betaFreeUntil = `${betaFreeUntil}T23:59:59.999Z`;
  }

  const sub = await patchClinicSubscription(clinicId, {
    ...body,
    beta_free_until: betaFreeUntil,
  });

  const metadata = extractRequestMetadata(req);
  await createAuditLog({
    user_id: req.user!.id,
    clinic_id: clinicId,
    action: 'ADMIN_PATCH_HUB_SUBSCRIPTION',
    entity_type: 'clinic_hub_subscriptions',
    entity_id: sub.id,
    new_values: body,
    ...metadata,
  });

  res.json({
    subscription: serializeSubscription(sub),
    available_modules: [...ALL_HUB_MODULES],
  });
});
