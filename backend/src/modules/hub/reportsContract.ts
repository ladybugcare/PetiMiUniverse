/**
 * Contrato declarativo de relatórios do Hub.
 * Fonte compartilhada UI ↔ backend (sem engine RBAC nova — só metadados).
 *
 * - permissionsAny: OR de permissões de domínio (acesso a dados).
 * - hub.reports.read NÃO autoriza domínio, PDF nem agendamento.
 * - unitMode / scope / module / clinical*: enforceable no backend.
 * - Campos visuais (title, description, category) não substituem gates de dados.
 */

export type HubReportId =
  | 'finance-overview'
  | 'pending-payments'
  | 'sales-adjustments'
  | 'product-sales'
  | 'movement-by-sector'
  | 'my-commissions'
  | 'commissions'
  | 'unbilled'
  | 'cash-flow'
  | 'top-clients'
  | 'stock-position'
  | 'stock-movements'
  | 'stock-abc'
  | 'stock-turnover'
  | 'absent-clients'
  | 'client-cohorts'
  | 'birthdays'
  | 'packages'
  | 'my-attendances'
  | 'my-no-shows'
  | 'no-shows'
  | 'boarding-occupancy'
  | 'grooming-productivity'
  | 'vaccines-due'
  | 'exams-requested';

export type HubReportCategoryId = 'financeiro' | 'estoque' | 'clientes' | 'operacional';

/** required = exige unit_id; optional_single = unidade do vínculo se omitir; clinic_aggregate_if_allowed = omitir só com unit.view.all; none = sem dimensão de unidade. */
export type HubReportUnitMode =
  | 'required'
  | 'optional_single'
  | 'clinic_aggregate_if_allowed'
  | 'none';

export type HubReportModule = 'clinic' | 'grooming' | 'boarding';

export type HubReportDefinition = {
  id: HubReportId;
  category: HubReportCategoryId;
  title: string;
  description: string;
  /** OR — qualquer uma concede acesso de domínio ao relatório. */
  permissionsAny: readonly string[];
  unitMode: HubReportUnitMode;
  /** Relatório do próprio profissional (staff resolvido no servidor). */
  scope?: 'self';
  module?: HubReportModule;
  /** Entra na allowlist da audiência clínica. */
  clinicalAudience?: boolean;
  /** Força escopo de estoque clínico para audiência clínica. */
  clinicalStockScope?: boolean;
  /** UI: seletor de unidade obrigatório (regra funcional; independente do membership). */
  requiresUnit?: boolean;
  periodFilter?: 'standard' | 'absent' | 'lookahead';
  operations: {
    exportPdf: boolean;
    schedule: boolean;
  };
};

export const HUB_REPORT_CATEGORIES: Record<HubReportCategoryId, string> = {
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  clientes: 'Clientes',
  operacional: 'Operacional',
};

export const HUB_REPORTS: readonly HubReportDefinition[] = [
  {
    id: 'finance-overview',
    category: 'financeiro',
    title: 'Visão financeira',
    description:
      'Recebido bruto, ticket histórico, serviços mais vendidos e a receber (aging) — domínios distintos.',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'pending-payments',
    category: 'financeiro',
    title: 'Pagamentos pendentes',
    description: 'Recebíveis em aberto com cliente, vencimento e valor.',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'sales-adjustments',
    category: 'financeiro',
    title: 'Vendas e acertos',
    description:
      'Cobranças geradas (data da cobrança) e acertos financeiros (reembolsos/descontos) — semânticas separadas.',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'product-sales',
    category: 'financeiro',
    title: 'Vendas por produto',
    description: 'Receita líquida, devoluções, custo histórico e margem por produto (data da cobrança).',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'movement-by-sector',
    category: 'financeiro',
    title: 'Movimentação por setor',
    description:
      'Receita líquida por setor (serviços/produtos), com bucket Não alocado para reembolso financeiro sem linha.',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'my-commissions',
    category: 'financeiro',
    title: 'Minhas comissões',
    description: 'Estimativa das suas comissões no período — só os seus atendimentos.',
    permissionsAny: ['hub.commissions.read_own'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    scope: 'self',
    clinicalAudience: true,
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'commissions',
    category: 'financeiro',
    title: 'Comissões',
    description: 'Comissão estimada por serviço e profissional (não liquidada).',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'unbilled',
    category: 'financeiro',
    title: 'Cobrança não gerada',
    description: 'Serviços concluídos ainda sem recebível (pronto para faturar).',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'cash-flow',
    category: 'financeiro',
    title: 'Fluxo de caixa',
    description: 'Entradas, despesas, depósitos e sangrias dia a dia no período.',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'top-clients',
    category: 'clientes',
    title: 'Top clientes',
    description: 'Ranking de tutores por recebido bruto (pagamentos posted) no período.',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'required',
    requiresUnit: true,
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'client-cohorts',
    category: 'clientes',
    title: 'Novos e recorrentes',
    description: 'Cadastros novos, primeira compra e clientes que voltaram a comprar.',
    permissionsAny: ['hub.guardians.read'],
    unitMode: 'clinic_aggregate_if_allowed',
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'birthdays',
    category: 'clientes',
    title: 'Aniversariantes',
    description: 'Pets e tutores com aniversário nos próximos dias.',
    permissionsAny: ['hub.guardians.read'],
    unitMode: 'clinic_aggregate_if_allowed',
    periodFilter: 'lookahead',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'packages',
    category: 'clientes',
    title: 'Pacotes',
    description: 'Vendidos no período, sessões consumidas, saldos ativos e a vencer.',
    permissionsAny: ['hub.financial.read'],
    unitMode: 'clinic_aggregate_if_allowed',
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'stock-position',
    category: 'estoque',
    title: 'Posição de estoque',
    description: 'Saldo atual por item, valor a custo e a preço de venda, mínimo e situação.',
    permissionsAny: ['hub.inventory.read'],
    unitMode: 'none',
    clinicalAudience: true,
    clinicalStockScope: true,
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'stock-movements',
    category: 'estoque',
    title: 'Entradas e saídas',
    description: 'Movimentações de estoque no período por tipo (compra, venda, ajuste, consumo).',
    permissionsAny: ['hub.inventory.read'],
    unitMode: 'none',
    periodFilter: 'standard',
    clinicalAudience: true,
    clinicalStockScope: true,
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'stock-abc',
    category: 'estoque',
    title: 'Curva ABC',
    description: 'Classificação de itens por valor de consumo (Pareto 80/15/5).',
    permissionsAny: ['hub.inventory.read'],
    unitMode: 'none',
    periodFilter: 'standard',
    clinicalStockScope: true,
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'stock-turnover',
    category: 'estoque',
    title: 'Giro de estoque',
    description: 'Saídas versus estoque médio e cobertura estimada em dias.',
    permissionsAny: ['hub.inventory.read'],
    unitMode: 'none',
    periodFilter: 'standard',
    clinicalStockScope: true,
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'absent-clients',
    category: 'clientes',
    title: 'Clientes ausentes',
    description: 'Tutores ativos sem visita ou cobrança há X dias.',
    permissionsAny: ['hub.guardians.read'],
    unitMode: 'clinic_aggregate_if_allowed',
    periodFilter: 'absent',
    operations: { exportPdf: true, schedule: true },
  },
  {
    id: 'my-attendances',
    category: 'operacional',
    title: 'Meus atendimentos',
    description: 'Sua produtividade no período: agendamentos e atendimentos clínicos.',
    permissionsAny: ['hub.clinic.read', 'hub.appointments.read'],
    unitMode: 'optional_single',
    periodFilter: 'standard',
    scope: 'self',
    clinicalAudience: true,
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'my-no-shows',
    category: 'operacional',
    title: 'Meus no-shows',
    description: 'Agendamentos seus que passaram do horário sem evolução (faltas).',
    permissionsAny: ['hub.appointments.read'],
    unitMode: 'optional_single',
    periodFilter: 'standard',
    scope: 'self',
    clinicalAudience: true,
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'no-shows',
    category: 'operacional',
    title: 'No-shows / faltas',
    description: 'Não comparecimentos no hotel e agendamentos sem evolução após o horário.',
    permissionsAny: ['hub.appointments.read'],
    unitMode: 'clinic_aggregate_if_allowed',
    periodFilter: 'standard',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'boarding-occupancy',
    category: 'operacional',
    title: 'Ocupação hotel/creche',
    description: 'Série diária de ocupação versus capacidade configurada.',
    permissionsAny: ['boarding.reservations.read'],
    unitMode: 'clinic_aggregate_if_allowed',
    periodFilter: 'standard',
    module: 'boarding',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'grooming-productivity',
    category: 'operacional',
    title: 'Produtividade Banho & Tosa',
    description: 'Sessões fechadas por profissional e duração média no período.',
    permissionsAny: ['grooming.queue.read'],
    unitMode: 'clinic_aggregate_if_allowed',
    periodFilter: 'standard',
    module: 'grooming',
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'vaccines-due',
    category: 'operacional',
    title: 'Vacinas a vencer',
    description: 'Próximas doses vencidas ou a vencer por pet — útil no consultório para follow-up da clínica.',
    permissionsAny: ['hub.clinic.read'],
    unitMode: 'none',
    periodFilter: 'lookahead',
    module: 'clinic',
    clinicalAudience: true,
    operations: { exportPdf: true, schedule: false },
  },
  {
    id: 'exams-requested',
    category: 'operacional',
    title: 'Exames solicitados',
    description: 'Pedidos de exame da clínica no período — acompanhe pendências e exporte para o laboratório.',
    permissionsAny: ['hub.clinic.read'],
    unitMode: 'none',
    periodFilter: 'standard',
    module: 'clinic',
    clinicalAudience: true,
    operations: { exportPdf: true, schedule: false },
  },
] as const;

const BY_ID = new Map<string, HubReportDefinition>(HUB_REPORTS.map((r) => [r.id, r]));

export function getHubReportDefinition(reportId: string): HubReportDefinition | null {
  return BY_ID.get(reportId) ?? null;
}

export function isHubReportId(value: string): value is HubReportId {
  return BY_ID.has(value);
}

export const HUB_REPORT_IDS = HUB_REPORTS.map((r) => r.id);

/** Relatórios que a audiência clínica pode ver (mesmo com permissão de domínio mais ampla). */
export const CLINICAL_AUDIENCE_REPORT_IDS = new Set<HubReportId>(
  HUB_REPORTS.filter((r) => r.clinicalAudience).map((r) => r.id),
);

export const SCHEDULABLE_REPORT_IDS: HubReportId[] = HUB_REPORTS.filter((r) => r.operations.schedule).map(
  (r) => r.id,
);

/** Tupla para Zod enum / validação estrita. */
export const SCHEDULABLE_REPORT_ID_TUPLE = SCHEDULABLE_REPORT_IDS as unknown as [
  HubReportId,
  ...HubReportId[],
];

/**
 * Relatórios cujo PDF ainda aceita tabela enviada pelo cliente (após auth completa).
 * Conjunto migrado para server-side NÃO deve estar aqui.
 * Teste de contrato falha se este conjunto crescer sem revisão.
 */
export const CLIENT_CONTROLLED_PDF_REPORT_IDS: readonly HubReportId[] = [
  'finance-overview',
  'pending-payments',
  'sales-adjustments',
  'product-sales',
  'movement-by-sector',
  'commissions',
  'unbilled',
  'cash-flow',
  'top-clients',
  'packages',
  'client-cohorts',
  'birthdays',
  'stock-position',
  'stock-movements',
  'stock-abc',
  'stock-turnover',
  'absent-clients',
  'no-shows',
  'boarding-occupancy',
  'grooming-productivity',
  'vaccines-due',
  'exams-requested',
  'my-attendances',
  'my-no-shows',
  'my-commissions',
] as const;

/** Subconjunto com geração server-side (dados vindos do servidor). Expandir até esvaziar CLIENT_CONTROLLED. */
export const SERVER_SIDE_PDF_REPORT_IDS: readonly HubReportId[] = [] as const;

export type ReportPermissionChecker = (permission: string) => boolean;

/** Audiência clínica: clinic.read sem backoffice de reports/financeiro. */
export function isClinicalReportsAudience(hasPermission: ReportPermissionChecker): boolean {
  return (
    hasPermission('hub.clinic.read') &&
    !hasPermission('hub.reports.read') &&
    !hasPermission('hub.financial.read')
  );
}

export function usesClinicalStockScope(hasPermission: ReportPermissionChecker): boolean {
  return isClinicalReportsAudience(hasPermission) && !hasPermission('hub.inventory.write');
}

function permissionMatches(hasPermission: ReportPermissionChecker, permissionsAny: readonly string[]): boolean {
  return permissionsAny.some((p) => hasPermission(p));
}

/**
 * Visibilidade / autorização de domínio no catálogo.
 * hub.reports.read NÃO libera cards — só permissão de domínio (permissionsAny).
 */
export function reportDomainAllowed(
  hasPermission: ReportPermissionChecker,
  report: Pick<HubReportDefinition, 'id' | 'permissionsAny' | 'scope'>,
): boolean {
  if (!permissionMatches(hasPermission, report.permissionsAny)) return false;
  if (isClinicalReportsAudience(hasPermission)) {
    return CLINICAL_AUDIENCE_REPORT_IDS.has(report.id);
  }
  return true;
}

/** Acesso à área Relatórios (menu/página): hub.reports.read OU qualquer domínio de relatório. */
export function canAccessReportsArea(hasPermission: ReportPermissionChecker): boolean {
  if (hasPermission('hub.reports.read')) return true;
  return HUB_REPORTS.some((r) => reportDomainAllowed(hasPermission, r));
}
