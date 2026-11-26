import { hasEffectivePermission, type Role } from '../../utils/permissions';
import {
  getHubReportDefinition,
  isClinicalReportsAudience,
  usesClinicalStockScope,
  type HubReportDefinition,
  type HubReportId,
  type HubReportUnitMode,
} from './reportsContract';
import {
  loadClinicUserMembership,
  resolveReportUnitScope,
  type ReportUnitScopeOk,
} from './hubReportUnitScope';
import { resolveStaffIdForUser } from './hubStaffResolve';

export type AuthorizeHubReportOk = {
  ok: true;
  report: HubReportDefinition;
  unitScope: ReportUnitScopeOk;
  staffId: string | null;
  forceClinicalStock: boolean;
  isClinicalAudience: boolean;
};

export type AuthorizeHubReportErr = {
  ok: false;
  status: 400 | 403 | 404;
  error: string;
};

export type AuthorizeHubReportResult = AuthorizeHubReportOk | AuthorizeHubReportErr;

export type AuthorizeHubReportOptions = {
  userId: string;
  clinicId: string;
  reportId: string;
  requestedUnitId?: string | null;
  /** Quando true, exige operations.schedule no contrato. */
  requireSchedule?: boolean;
  /** Quando true, exige operations.exportPdf no contrato. */
  requireExportPdf?: boolean;
  /** Sobrescreve unitMode do contrato (ex.: schedule com unit_id fixo). */
  unitModeOverride?: HubReportUnitMode;
};

function hasDomainPermission(
  role: string,
  areas: string[],
  permissionsAny: readonly string[],
): boolean {
  return permissionsAny.some((p) => hasEffectivePermission(role as Role, p, areas));
}

/**
 * Autorização completa de um relatório por report_id.
 * Reutiliza hasEffectivePermission — não cria engine RBAC nova.
 */
export async function authorizeHubReport(
  opts: AuthorizeHubReportOptions,
): Promise<AuthorizeHubReportResult> {
  const report = getHubReportDefinition(opts.reportId);
  if (!report) {
    return { ok: false, status: 400, error: 'report_id inválido ou não reconhecido' };
  }

  if (opts.requireSchedule && !report.operations.schedule) {
    return { ok: false, status: 400, error: 'Relatório não permite agendamento por e-mail' };
  }
  if (opts.requireExportPdf && !report.operations.exportPdf) {
    return { ok: false, status: 400, error: 'Relatório não permite exportação PDF' };
  }

  const membership = await loadClinicUserMembership(opts.userId, opts.clinicId);
  if (!membership) {
    return { ok: false, status: 403, error: 'Sem vínculo ativo nesta clínica' };
  }

  const areas = (membership.operational_areas as string[] | null) ?? [];
  const hasPerm = (p: string) => hasEffectivePermission(membership.role as Role, p, areas);

  if (!hasDomainPermission(membership.role, areas, report.permissionsAny)) {
    return { ok: false, status: 403, error: 'Permissão negada para este relatório' };
  }

  const clinicalAudience = isClinicalReportsAudience(hasPerm);
  if (clinicalAudience && !report.clinicalAudience) {
    return { ok: false, status: 403, error: 'Relatório indisponível para o seu perfil clínico' };
  }

  const unitMode = opts.unitModeOverride ?? report.unitMode;
  const unitScope = await resolveReportUnitScope({
    userId: opts.userId,
    clinicId: opts.clinicId,
    requestedUnitId: opts.requestedUnitId,
    unitMode,
    membership,
  });
  if (!unitScope.ok) {
    return { ok: false, status: unitScope.status, error: unitScope.error };
  }

  let staffId: string | null = null;
  if (report.scope === 'self') {
    staffId = await resolveStaffIdForUser(opts.clinicId, opts.userId);
    if (!staffId) {
      return {
        ok: false,
        status: 403,
        error: 'Seu usuário não está vinculado a um profissional da equipe nesta clínica.',
      };
    }
  }

  const forceClinicalStock =
    !!report.clinicalStockScope && usesClinicalStockScope(hasPerm);

  return {
    ok: true,
    report,
    unitScope,
    staffId,
    forceClinicalStock,
    isClinicalAudience: clinicalAudience,
  };
}

/** Helper para handlers GET que já conhecem o report_id do contrato. */
export async function authorizeHubReportFromRequest(opts: {
  userId: string | undefined;
  clinicId: string;
  reportId: HubReportId;
  requestedUnitId?: string | null;
}): Promise<AuthorizeHubReportResult> {
  if (!opts.userId) {
    return { ok: false, status: 403, error: 'Usuário não autenticado' };
  }
  return authorizeHubReport({
    userId: opts.userId,
    clinicId: opts.clinicId,
    reportId: opts.reportId,
    requestedUnitId: opts.requestedUnitId,
  });
}
