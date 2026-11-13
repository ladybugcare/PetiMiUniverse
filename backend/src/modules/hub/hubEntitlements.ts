import type { NextFunction, Request, Response } from 'express';
import { PlanEntitlementError } from '../../utils/errors.js';
import {
  countClinicActiveUsers,
  countClinicUnits,
  getClinicEntitlementSnapshot,
  type HubAccessMode,
  type HubEntitlementSnapshot,
} from './hubSubscriptionService.js';

export type EntitlementCheckOptions = {
  /** Módulo SaaS exigido (clinic, grooming, boarding, hub_core). */
  module?: string;
  /** Área operacional do plano (ex.: leva_traz, recepcao) — não é SKU. */
  planArea?: string;
  /** Exige capacidade para criar unidade. */
  capacity?: 'unit' | 'user';
  /**
   * Se true, mutações em soft_lock/read_history são bloqueadas
   * (exceto quando allowSoftLockWrite).
   */
  mutating?: boolean;
  /** Permite escrita clínica/caixa durante soft_lock (graça past_due). */
  allowSoftLockWrite?: boolean;
};

function clinicIdFromRequest(req: Request): string | null {
  const raw =
    req.body?.clinic_id || req.params?.clinic_id || req.query?.clinic_id || req.params?.clinicId;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw);
}

export async function loadEntitlements(clinicId: string): Promise<HubEntitlementSnapshot> {
  return getClinicEntitlementSnapshot(clinicId);
}

export function assertModuleEnabled(snap: HubEntitlementSnapshot, moduleSlug: string): void {
  if (snap.is_beta) return;
  if (!snap.enabled_modules.includes(moduleSlug)) {
    throw new PlanEntitlementError(
      'Este módulo não está incluído no seu plano. Faça upgrade para continuar.',
      'MODULE_NOT_ENABLED',
      { module: moduleSlug, plan: snap.base_plan_slug },
    );
  }
}

export function assertPlanAreaEnabled(snap: HubEntitlementSnapshot, area: string): void {
  if (snap.is_beta) return;
  if (snap.disabled_operational_areas.includes(area)) {
    throw new PlanEntitlementError(
      'Este recurso não está disponível no seu plano. Faça upgrade para continuar.',
      'PLAN_AREA_DISABLED',
      { area, plan: snap.base_plan_slug },
    );
  }
}

export function assertAccessAllowsMutation(
  snap: HubEntitlementSnapshot,
  opts: { allowSoftLockWrite?: boolean },
): void {
  if (snap.access_mode === 'full') return;
  if (snap.access_mode === 'soft_lock' && opts.allowSoftLockWrite) return;
  throw new PlanEntitlementError(
    snap.access_mode === 'read_history'
      ? 'Sua assinatura está restrita. Reative o plano para alterar dados.'
      : 'Sua assinatura está pendente ou em atraso. Regularize o pagamento para continuar.',
    snap.access_mode === 'read_history' ? 'PLAN_READ_HISTORY' : 'PLAN_SOFT_LOCK',
    { access_mode: snap.access_mode, status: snap.status },
  );
}

export async function assertCanCreateUnit(clinicId: string): Promise<void> {
  const snap = await loadEntitlements(clinicId);
  if (snap.is_beta) return;
  assertAccessAllowsMutation(snap, {});
  if (snap.max_units == null) return;
  const units = await countClinicUnits(clinicId);
  if (units >= snap.max_units) {
    throw new PlanEntitlementError(
      `Seu plano permite até ${snap.max_units} unidade(s). Faça upgrade para criar outra.`,
      'PLAN_LIMIT_UNITS',
      { max_units: snap.max_units, usage: units, plan: snap.base_plan_slug },
    );
  }
}

export async function assertCanInviteUser(clinicId: string): Promise<void> {
  const snap = await loadEntitlements(clinicId);
  if (snap.is_beta) return;
  assertAccessAllowsMutation(snap, {});
  if (snap.max_users == null) return;
  const users = await countClinicActiveUsers(clinicId);
  if (users >= snap.max_users) {
    throw new PlanEntitlementError(
      `Seu plano permite até ${snap.max_users} usuário(s). Faça upgrade para convidar mais pessoas.`,
      'PLAN_LIMIT_USERS',
      { max_users: snap.max_users, usage: users, plan: snap.base_plan_slug },
    );
  }
}

export async function assertHubEntitlement(
  clinicId: string,
  opts: EntitlementCheckOptions,
): Promise<HubEntitlementSnapshot> {
  const snap = await loadEntitlements(clinicId);

  if (opts.mutating) {
    // Soft write só com flag explícita (não inferir por module).
    // soft_lock + allowSoftLockWrite: ops do dia; sem flag: bloqueia (catálogo/capacidade).
    // read_history / canceled: sempre bloqueia mutações.
    assertAccessAllowsMutation(snap, {
      allowSoftLockWrite: Boolean(opts.allowSoftLockWrite) && snap.access_mode === 'soft_lock',
    });
  }

  if (opts.module) assertModuleEnabled(snap, opts.module);
  if (opts.planArea) assertPlanAreaEnabled(snap, opts.planArea);

  if (opts.capacity === 'unit') await assertCanCreateUnit(clinicId);
  if (opts.capacity === 'user') await assertCanInviteUser(clinicId);

  return snap;
}

/** Middleware Express: exige clinic_id + módulo/área/capacidade. */
export function requireHubEntitlement(opts: EntitlementCheckOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = clinicIdFromRequest(req);
      if (!clinicId) {
        return res.status(400).json({ error: 'clinic_id não fornecido', code: 'VALIDATION_ERROR' });
      }
      await assertHubEntitlement(clinicId, opts);
      next();
    } catch (e) {
      if (e instanceof PlanEntitlementError) {
        return res.status(403).json({
          error: e.message,
          code: e.code,
          details: e.details,
        });
      }
      console.error('[requireHubEntitlement]', e);
      return res.status(500).json({ error: 'Erro ao verificar plano da clínica' });
    }
  };
}

export type { HubAccessMode, HubEntitlementSnapshot };
