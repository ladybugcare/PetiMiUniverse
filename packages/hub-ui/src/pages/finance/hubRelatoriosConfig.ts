export type HubReportId =
  | 'finance-overview'
  | 'pending-payments'
  | 'sales-adjustments'
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
    description: 'Saldo atual por item, mínimo configurado e situação (ok, baixo, zerado).',
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
    description: 'Próximas doses vencidas ou a vencer por pet.',
    permission: 'hub.clinic.read',
    periodFilter: 'lookahead',
  },
  {
    id: 'exams-requested',
    category: 'operacional',
    title: 'Exames solicitados',
    description: 'Pedidos de exame da clínica no período, para acompanhar e exportar.',
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
];

const VALID_REPORT_IDS = new Set<string>(HUB_REPORTS.map((r) => r.id));

export function parseHubReportId(raw: string | null): HubReportId | null {
  if (!raw || !VALID_REPORT_IDS.has(raw)) return null;
  return raw as HubReportId;
}

export function reportAllowed(hasPermission: (p: string) => boolean, permission: string | string[]): boolean {
  if (hasPermission('hub.reports.read')) return true;
  if (Array.isArray(permission)) return permission.some((p) => hasPermission(p));
  return hasPermission(permission);
}
