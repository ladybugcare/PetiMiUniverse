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

export type HubReportDefinition = {
  id: HubReportId;
  category: HubReportCategoryId;
  title: string;
  description: string;
  permission: string | string[];
  requiresUnit?: boolean;
  /** Mostra seletor de período. */
  periodFilter?: 'standard' | 'absent' | 'lookahead';
  /**
   * Relatórios do próprio profissional: catálogo e API só com a permissão listada
   * (hub.reports.read não libera sozinho).
   */
  scope?: 'self';
};

export type HubReportLinkDefinition = {
  id: string;
  category: HubReportCategoryId;
  title: string;
  description: string;
  to: string;
  permission: string | string[];
};

export const HUB_REPORT_CATEGORIES: Record<HubReportCategoryId, string> = {
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  clientes: 'Clientes',
  operacional: 'Operacional',
};

export const HUB_REPORTS: HubReportDefinition[] = [
  {
    id: 'finance-overview',
    category: 'financeiro',
    title: 'Visão financeira',
    description: 'Faturamento, ticket médio, serviços mais vendidos e aging de recebíveis.',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'pending-payments',
    category: 'financeiro',
    title: 'Pagamentos pendentes',
    description: 'Recebíveis em aberto com cliente, vencimento e valor.',
    permission: 'hub.financial.read',
    requiresUnit: true,
  },
  {
    id: 'sales-adjustments',
    category: 'financeiro',
    title: 'Vendas e acertos',
    description: 'Recebíveis criados no período e acertos (descontos, estornos, baixas).',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'product-sales',
    category: 'financeiro',
    title: 'Vendas por produto',
    description: 'Receita, COGS e margem por produto; mix serviços vs produtos no período.',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'movement-by-sector',
    category: 'financeiro',
    title: 'Movimentação por setor',
    description:
      'Vendas do período agrupadas por grupo de serviço (banho e tosa, clínica, hotel, produtos etc.).',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'my-commissions',
    category: 'financeiro',
    title: 'Minhas comissões',
    description: 'Estimativa das suas comissões no período — só os seus atendimentos.',
    permission: 'hub.commissions.read_own',
    requiresUnit: true,
    periodFilter: 'standard',
    scope: 'self',
  },
  {
    id: 'commissions',
    category: 'financeiro',
    title: 'Comissões',
    description: 'Estimativa de comissões por serviço e profissional no período.',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'unbilled',
    category: 'financeiro',
    title: 'Cobrança não gerada',
    description: 'Serviços concluídos ainda sem recebível (pronto para faturar).',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'cash-flow',
    category: 'financeiro',
    title: 'Fluxo de caixa',
    description: 'Entradas, despesas, depósitos e sangrias dia a dia no período.',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'top-clients',
    category: 'clientes',
    title: 'Top clientes',
    description: 'Ranking de tutores por faturamento (pagamentos) no período.',
    permission: 'hub.financial.read',
    requiresUnit: true,
    periodFilter: 'standard',
  },
  {
    id: 'client-cohorts',
    category: 'clientes',
    title: 'Novos e recorrentes',
    description: 'Cadastros novos, primeira compra e clientes que voltaram a comprar.',
    permission: 'hub.guardians.read',
    periodFilter: 'standard',
  },
  {
    id: 'birthdays',
    category: 'clientes',
    title: 'Aniversariantes',
    description: 'Pets e tutores com aniversário nos próximos dias.',
    permission: 'hub.guardians.read',
    periodFilter: 'lookahead',
  },
  {
    id: 'packages',
    category: 'clientes',
    title: 'Pacotes',
    description: 'Vendidos no período, sessões consumidas, saldos ativos e a vencer.',
    permission: 'hub.financial.read',
    periodFilter: 'standard',
  },
  {
    id: 'stock-position',
    category: 'estoque',
    title: 'Posição de estoque',
    description: 'Saldo atual por item, valor a custo e a preço de venda, mínimo e situação.',
    permission: 'hub.inventory.read',
  },
  {
    id: 'stock-movements',
    category: 'estoque',
    title: 'Entradas e saídas',
    description: 'Movimentações de estoque no período por tipo (compra, venda, ajuste, consumo).',
    permission: 'hub.inventory.read',
    periodFilter: 'standard',
  },
  {
    id: 'stock-abc',
    category: 'estoque',
    title: 'Curva ABC',
    description: 'Classificação de itens por valor de consumo (Pareto 80/15/5).',
    permission: 'hub.inventory.read',
    periodFilter: 'standard',
  },
  {
    id: 'stock-turnover',
    category: 'estoque',
    title: 'Giro de estoque',
    description: 'Saídas versus estoque médio e cobertura estimada em dias.',
    permission: 'hub.inventory.read',
    periodFilter: 'standard',
  },
  {
    id: 'absent-clients',
    category: 'clientes',
    title: 'Clientes ausentes',
    description: 'Tutores ativos sem visita ou cobrança há X dias.',
    permission: 'hub.guardians.read',
    periodFilter: 'absent',
  },
  {
    id: 'my-attendances',
    category: 'operacional',
    title: 'Meus atendimentos',
    description: 'Sua produtividade no período: agendamentos e atendimentos clínicos.',
    permission: ['hub.clinic.read', 'hub.appointments.read'],
    periodFilter: 'standard',
    scope: 'self',
  },
  {
    id: 'my-no-shows',
    category: 'operacional',
    title: 'Meus no-shows',
    description: 'Agendamentos seus que passaram do horário sem evolução (faltas).',
    permission: 'hub.appointments.read',
    periodFilter: 'standard',
    scope: 'self',
  },
  {
    id: 'no-shows',
    category: 'operacional',
    title: 'No-shows / faltas',
    description: 'Não comparecimentos no hotel e agendamentos sem evolução após o horário.',
    permission: 'hub.appointments.read',
    periodFilter: 'standard',
  },
  {
    id: 'boarding-occupancy',
    category: 'operacional',
    title: 'Ocupação hotel/creche',
    description: 'Série diária de ocupação versus capacidade configurada.',
    permission: 'boarding.reservations.read',
    periodFilter: 'standard',
  },
  {
    id: 'grooming-productivity',
    category: 'operacional',
    title: 'Produtividade Banho & Tosa',
    description: 'Sessões fechadas por profissional e duração média no período.',
    permission: 'grooming.queue.read',
    periodFilter: 'standard',
  },
  {
    id: 'vaccines-due',
    category: 'operacional',
    title: 'Vacinas a vencer',
    description:
      'Próximas doses vencidas ou a vencer por pet — útil no consultório para follow-up da clínica.',
    permission: 'hub.clinic.read',
    periodFilter: 'lookahead',
  },
  {
    id: 'exams-requested',
    category: 'operacional',
    title: 'Exames solicitados',
    description:
      'Pedidos de exame da clínica no período — acompanhe pendências e exporte para o laboratório.',
    permission: 'hub.clinic.read',
    periodFilter: 'standard',
  },
];

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

const VALID_REPORT_IDS = new Set<string>(HUB_REPORTS.map((r) => r.id));

/**
 * Catálogo enxuto para quem atua só na clínica (ex.: médico vet sem financeiro/relatórios gerais).
 * Evita CRM, gestão de compra e no-shows da clínica inteira.
 */
export const CLINICAL_AUDIENCE_REPORT_IDS = new Set<HubReportId>([
  'my-attendances',
  'my-no-shows',
  'my-commissions',
  'vaccines-due',
  'exams-requested',
  'stock-position',
  'stock-movements',
]);

export const CLINICAL_AUDIENCE_REPORT_LINK_IDS = new Set<string>(['stock-alerts', 'day-prints']);

export function parseHubReportId(raw: string | null): HubReportId | null {
  if (!raw || !VALID_REPORT_IDS.has(raw)) return null;
  return raw as HubReportId;
}

function permissionMatches(
  hasPermission: (p: string) => boolean,
  permission: string | string[],
): boolean {
  if (Array.isArray(permission)) return permission.some((p) => hasPermission(p));
  return hasPermission(permission);
}

function needsFinancialRead(permission: string | string[]): boolean {
  if (Array.isArray(permission)) return permission.includes('hub.financial.read');
  return permission === 'hub.financial.read';
}

/** Clínica sem backoffice de relatórios/financeiro — perfil típico do veterinário. */
export function isClinicalReportsAudience(hasPermission: (p: string) => boolean): boolean {
  return (
    hasPermission('hub.clinic.read') &&
    !hasPermission('hub.reports.read') &&
    !hasPermission('hub.financial.read')
  );
}

/**
 * Estoque só de uso clínico (exclui venda e consumo interno).
 * Quem tem hub.inventory.write (área estoque) vê o catálogo completo.
 */
export function usesClinicalStockScope(hasPermission: (p: string) => boolean): boolean {
  return isClinicalReportsAudience(hasPermission) && !hasPermission('hub.inventory.write');
}

/**
 * Visibilidade no catálogo.
 * - Relatórios `scope: 'self'`: só a permissão listada (não via hub.reports.read).
 * - Relatórios financeiros: exigem hub.financial.read (hub.reports.read sozinho não basta).
 * - Demais: hub.reports.read libera o card, ou a permissão do domínio.
 * - Audiência clínica: só allowlist (mesmo com permissão de domínio).
 */
export function reportAllowed(
  hasPermission: (p: string) => boolean,
  permissionOrReport:
    | string
    | string[]
    | Pick<HubReportDefinition, 'id' | 'permission' | 'scope'>,
): boolean {
  const isReportDef =
    typeof permissionOrReport === 'object' &&
    permissionOrReport !== null &&
    !Array.isArray(permissionOrReport) &&
    'permission' in permissionOrReport;

  const permission = isReportDef ? permissionOrReport.permission : permissionOrReport;
  const scope = isReportDef ? permissionOrReport.scope : undefined;
  const reportId = isReportDef ? permissionOrReport.id : undefined;

  let allowed = false;
  if (scope === 'self') {
    allowed = permissionMatches(hasPermission, permission);
  } else if (needsFinancialRead(permission)) {
    allowed = hasPermission('hub.financial.read');
  } else if (hasPermission('hub.reports.read')) {
    allowed = true;
  } else {
    allowed = permissionMatches(hasPermission, permission);
  }

  if (!allowed) return false;

  if (isClinicalReportsAudience(hasPermission) && reportId) {
    return CLINICAL_AUDIENCE_REPORT_IDS.has(reportId);
  }

  return true;
}

export function reportLinkAllowed(
  hasPermission: (p: string) => boolean,
  link: Pick<HubReportLinkDefinition, 'id' | 'permission'>,
): boolean {
  if (!reportAllowed(hasPermission, link.permission)) return false;
  if (isClinicalReportsAudience(hasPermission)) {
    return CLINICAL_AUDIENCE_REPORT_LINK_IDS.has(link.id);
  }
  return true;
}
