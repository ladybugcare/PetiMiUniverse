import { supabaseAdmin } from '../../config/supabase';
import { hasEffectivePermission, type Role } from '../../utils/permissions';
import { assertUnitInClinic } from './hubTenantAsserts';
import type { HubReportUnitMode } from './reportsContract';

export type ClinicUserMembership = {
  role: string;
  operational_areas: string[] | null;
  unit_id: string | null;
  status: string;
};

export type ReportUnitScopeOk = {
  ok: true;
  /** null = consolidação da clínica (somente quando autorizado). */
  unitId: string | null;
  canViewAllUnits: boolean;
  membershipUnitId: string | null;
  role: string;
  operationalAreas: string[];
};

export type ReportUnitScopeErr = {
  ok: false;
  status: 400 | 403 | 404;
  error: string;
};

export type ReportUnitScopeResult = ReportUnitScopeOk | ReportUnitScopeErr;

/** Carrega vínculo ativo do usuário na clínica (membership de unidade). */
export async function loadClinicUserMembership(
  userId: string,
  clinicId: string,
): Promise<ClinicUserMembership | null> {
  const { data, error } = await supabaseAdmin
    .from('clinic_users')
    .select('role, operational_areas, unit_id, status')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  return data as ClinicUserMembership;
}

/**
 * Resolve o escopo de unidade autorizado para um relatório.
 * - unit.view.all nunca ultrapassa clinicId autenticado.
 * - Sem unit.view.all, omissão de unit_id não amplia (força unidade do vínculo ou 403).
 * - Consolidação (unitId null) só com unit.view.all e unitMode clinic_aggregate_if_allowed.
 */
export async function resolveReportUnitScope(opts: {
  userId: string;
  clinicId: string;
  requestedUnitId?: string | null;
  unitMode: HubReportUnitMode;
  membership?: ClinicUserMembership | null;
}): Promise<ReportUnitScopeResult> {
  const membership =
    opts.membership !== undefined
      ? opts.membership
      : await loadClinicUserMembership(opts.userId, opts.clinicId);

  if (!membership) {
    return { ok: false, status: 403, error: 'Sem vínculo ativo nesta clínica' };
  }

  const operationalAreas = (membership.operational_areas as string[] | null) ?? [];
  const canViewAllUnits = hasEffectivePermission(
    membership.role as Role,
    'unit.view.all',
    operationalAreas,
  );
  const membershipUnitId = membership.unit_id ? String(membership.unit_id) : null;
  const raw = opts.requestedUnitId != null && String(opts.requestedUnitId).trim()
    ? String(opts.requestedUnitId).trim()
    : null;

  if (opts.unitMode === 'none') {
    if (raw) {
      const inClinic = await assertUnitInClinic(opts.clinicId, raw);
      if (!inClinic) return { ok: false, status: 403, error: 'Unidade fora da clínica autenticada' };
    }
    return {
      ok: true,
      unitId: null,
      canViewAllUnits,
      membershipUnitId,
      role: membership.role,
      operationalAreas,
    };
  }

  if (raw) {
    const inClinic = await assertUnitInClinic(opts.clinicId, raw);
    if (!inClinic) {
      return { ok: false, status: 403, error: 'Unidade fora da clínica autenticada' };
    }
    if (!canViewAllUnits) {
      if (!membershipUnitId) {
        return { ok: false, status: 403, error: 'Usuário sem unidade vinculada' };
      }
      if (raw !== membershipUnitId) {
        return { ok: false, status: 403, error: 'Sem permissão para esta unidade' };
      }
    }
    return {
      ok: true,
      unitId: raw,
      canViewAllUnits,
      membershipUnitId,
      role: membership.role,
      operationalAreas,
    };
  }

  // unit_id omitido
  if (opts.unitMode === 'required') {
    if (!canViewAllUnits) {
      if (!membershipUnitId) {
        return { ok: false, status: 400, error: 'unit_id é obrigatório' };
      }
      return {
        ok: true,
        unitId: membershipUnitId,
        canViewAllUnits,
        membershipUnitId,
        role: membership.role,
        operationalAreas,
      };
    }
    return { ok: false, status: 400, error: 'unit_id é obrigatório' };
  }

  if (opts.unitMode === 'optional_single') {
    if (!canViewAllUnits) {
      if (!membershipUnitId) {
        return { ok: false, status: 403, error: 'Usuário sem unidade vinculada' };
      }
      return {
        ok: true,
        unitId: membershipUnitId,
        canViewAllUnits,
        membershipUnitId,
        role: membership.role,
        operationalAreas,
      };
    }
    // Com view.all e sem unit_id: consolidação do próprio escopo self (todas as unidades do staff) —
    // permitido apenas como unitId null para filtros self.
    return {
      ok: true,
      unitId: null,
      canViewAllUnits,
      membershipUnitId,
      role: membership.role,
      operationalAreas,
    };
  }

  // clinic_aggregate_if_allowed
  if (!canViewAllUnits) {
    if (!membershipUnitId) {
      return { ok: false, status: 403, error: 'Usuário sem unidade vinculada' };
    }
    return {
      ok: true,
      unitId: membershipUnitId,
      canViewAllUnits,
      membershipUnitId,
      role: membership.role,
      operationalAreas,
    };
  }

  return {
    ok: true,
    unitId: null,
    canViewAllUnits,
    membershipUnitId,
    role: membership.role,
    operationalAreas,
  };
}
