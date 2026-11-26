/**
 * Catálogo de relatórios Hub — reexporta o contrato compartilhado e aplica
 * regras de visibilidade na UI (sem super-read de hub.reports.read).
 */
export {
  CLINICAL_AUDIENCE_REPORT_IDS,
  HUB_REPORT_CATEGORIES,
  HUB_REPORTS,
  HUB_REPORT_IDS,
  SCHEDULABLE_REPORT_IDS,
  canAccessReportsArea,
  getHubReportDefinition,
  isClinicalReportsAudience,
  isHubReportId,
  reportDomainAllowed,
  usesClinicalStockScope,
  type HubReportCategoryId,
  type HubReportDefinition,
  type HubReportId,
} from '@petimi/hub-reports-contract';

import {
  CLINICAL_AUDIENCE_REPORT_IDS,
  HUB_REPORTS,
  canAccessReportsArea,
  getHubReportDefinition,
  isClinicalReportsAudience,
  isHubReportId,
  reportDomainAllowed,
  type HubReportCategoryId,
  type HubReportDefinition,
  type HubReportId,
  type ReportPermissionChecker,
} from '@petimi/hub-reports-contract';

export type HubReportLinkDefinition = {
  id: string;
  category: HubReportCategoryId;
  title: string;
  description: string;
  to: string;
  permission: string | string[];
};

export const HUB_REPORT_LINKS: HubReportLinkDefinition[] = [
  {
    id: 'stock-alerts',
    category: 'estoque',
    title: 'Alertas de estoque',
    description: 'Itens abaixo do mínimo e lotes a vencer nos próximos 30 dias.',
    to: '/hub/estoque/alertas',
    permission: 'hub.inventory.read',
  },
  {
    id: 'day-prints',
    category: 'operacional',
    title: 'Impressões do dia',
    description:
      'Agenda, clínica, hotel/creche, leva e traz e internações em papel — plano B com filtros por serviço.',
    to: '/hub/impressoes',
    permission: [
      'hub.appointments.read',
      'pickup.routes.read',
      'hub.clinic.read',
      'boarding.reservations.read',
    ],
  },
];

export const CLINICAL_AUDIENCE_REPORT_LINK_IDS = new Set<string>(['stock-alerts', 'day-prints']);

export function parseHubReportId(raw: string | null): HubReportId | null {
  if (!raw || !isHubReportId(raw)) return null;
  return raw;
}

function permissionMatches(
  hasPermission: ReportPermissionChecker,
  permission: string | string[],
): boolean {
  if (Array.isArray(permission)) return permission.some((p) => hasPermission(p));
  return hasPermission(permission);
}

/**
 * Visibilidade no catálogo.
 * - hub.reports.read NÃO libera cards (só área/menu via canAccessReportsArea).
 * - Card exige permissão de domínio (permissionsAny).
 * - Audiência clínica: allowlist.
 */
export function reportAllowed(
  hasPermission: ReportPermissionChecker,
  permissionOrReport:
    | string
    | string[]
    | Pick<HubReportDefinition, 'id' | 'permissionsAny' | 'scope'>
    | { id?: HubReportId; permission?: string | string[]; permissionsAny?: readonly string[]; scope?: 'self' },
): boolean {
  // Compat: chamadas antigas com string|string[] (links / permissão solta)
  if (typeof permissionOrReport === 'string' || Array.isArray(permissionOrReport)) {
    return permissionMatches(hasPermission, permissionOrReport);
  }

  const reportId = 'id' in permissionOrReport ? permissionOrReport.id : undefined;
  const def = reportId ? getHubReportDefinition(reportId) : null;
  const permissionsAny =
    ('permissionsAny' in permissionOrReport && permissionOrReport.permissionsAny) ||
    def?.permissionsAny ||
    (permissionOrReport.permission
      ? Array.isArray(permissionOrReport.permission)
        ? permissionOrReport.permission
        : [permissionOrReport.permission]
      : null);

  if (!permissionsAny?.length) return false;

  const scope =
    ('scope' in permissionOrReport ? permissionOrReport.scope : undefined) ?? def?.scope;

  const synthetic: Pick<HubReportDefinition, 'id' | 'permissionsAny' | 'scope'> = {
    id: (reportId || def?.id || 'finance-overview') as HubReportId,
    permissionsAny,
    scope,
  };

  return reportDomainAllowed(hasPermission, synthetic);
}

export function reportLinkAllowed(
  hasPermission: ReportPermissionChecker,
  link: Pick<HubReportLinkDefinition, 'id' | 'permission'>,
): boolean {
  if (!permissionMatches(hasPermission, link.permission)) return false;
  if (isClinicalReportsAudience(hasPermission)) {
    return CLINICAL_AUDIENCE_REPORT_LINK_IDS.has(link.id);
  }
  return true;
}

/** Relatórios visíveis no catálogo para o usuário. */
export function visibleHubReports(hasPermission: ReportPermissionChecker): HubReportDefinition[] {
  return HUB_REPORTS.filter((r) => reportAllowed(hasPermission, r));
}
