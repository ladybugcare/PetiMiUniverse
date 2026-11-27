"use strict";
/**
 * Contrato declarativo de relatórios do Hub.
 * Fonte compartilhada UI ↔ backend (sem engine RBAC nova — só metadados).
 *
 * - permissionsAny: OR de permissões de domínio (acesso a dados).
 * - hub.reports.read NÃO autoriza domínio, PDF nem agendamento.
 * - unitMode / scope / module / clinical*: enforceable no backend.
 * - Campos visuais (title, description, category) não substituem gates de dados.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_SIDE_PDF_REPORT_IDS = exports.CLIENT_CONTROLLED_PDF_REPORT_IDS = exports.SCHEDULABLE_REPORT_ID_TUPLE = exports.SCHEDULABLE_REPORT_IDS = exports.CLINICAL_AUDIENCE_REPORT_IDS = exports.HUB_REPORT_IDS = exports.HUB_REPORTS = exports.HUB_REPORT_CATEGORIES = void 0;
exports.getHubReportDefinition = getHubReportDefinition;
exports.isHubReportId = isHubReportId;
exports.isClinicalReportsAudience = isClinicalReportsAudience;
exports.usesClinicalStockScope = usesClinicalStockScope;
exports.reportDomainAllowed = reportDomainAllowed;
exports.canAccessReportsArea = canAccessReportsArea;
exports.HUB_REPORT_CATEGORIES = {
    financeiro: 'Financeiro',
    estoque: 'Estoque',
    clientes: 'Clientes',
    operacional: 'Operacional',
};
exports.HUB_REPORTS = [
    {
        id: 'finance-overview',
        category: 'financeiro',
        title: 'Visão financeira',
        description: 'Faturamento, ticket médio, serviços mais vendidos e aging de recebíveis.',
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
        description: 'Cobranças geradas (data da cobrança) e acertos financeiros (reembolsos/descontos) — semânticas separadas.',
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
        description: 'Receita líquida por setor (serviços/produtos), com bucket Não alocado para reembolso financeiro sem linha.',
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
        description: 'Ranking de tutores por faturamento (pagamentos) no período.',
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
];
const BY_ID = new Map(exports.HUB_REPORTS.map((r) => [r.id, r]));
function getHubReportDefinition(reportId) {
    return BY_ID.get(reportId) ?? null;
}
function isHubReportId(value) {
    return BY_ID.has(value);
}
exports.HUB_REPORT_IDS = exports.HUB_REPORTS.map((r) => r.id);
/** Relatórios que a audiência clínica pode ver (mesmo com permissão de domínio mais ampla). */
exports.CLINICAL_AUDIENCE_REPORT_IDS = new Set(exports.HUB_REPORTS.filter((r) => r.clinicalAudience).map((r) => r.id));
exports.SCHEDULABLE_REPORT_IDS = exports.HUB_REPORTS.filter((r) => r.operations.schedule).map((r) => r.id);
/** Tupla para Zod enum / validação estrita. */
exports.SCHEDULABLE_REPORT_ID_TUPLE = exports.SCHEDULABLE_REPORT_IDS;
/**
 * Relatórios cujo PDF ainda aceita tabela enviada pelo cliente (após auth completa).
 * Conjunto migrado para server-side NÃO deve estar aqui.
 * Teste de contrato falha se este conjunto crescer sem revisão.
 */
exports.CLIENT_CONTROLLED_PDF_REPORT_IDS = [
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
];
/** Subconjunto com geração server-side (dados vindos do servidor). Expandir até esvaziar CLIENT_CONTROLLED. */
exports.SERVER_SIDE_PDF_REPORT_IDS = [];
/** Audiência clínica: clinic.read sem backoffice de reports/financeiro. */
function isClinicalReportsAudience(hasPermission) {
    return (hasPermission('hub.clinic.read') &&
        !hasPermission('hub.reports.read') &&
        !hasPermission('hub.financial.read'));
}
function usesClinicalStockScope(hasPermission) {
    return isClinicalReportsAudience(hasPermission) && !hasPermission('hub.inventory.write');
}
function permissionMatches(hasPermission, permissionsAny) {
    return permissionsAny.some((p) => hasPermission(p));
}
/**
 * Visibilidade / autorização de domínio no catálogo.
 * hub.reports.read NÃO libera cards — só permissão de domínio (permissionsAny).
 */
function reportDomainAllowed(hasPermission, report) {
    if (!permissionMatches(hasPermission, report.permissionsAny))
        return false;
    if (isClinicalReportsAudience(hasPermission)) {
        return exports.CLINICAL_AUDIENCE_REPORT_IDS.has(report.id);
    }
    return true;
}
/** Acesso à área Relatórios (menu/página): hub.reports.read OU qualquer domínio de relatório. */
function canAccessReportsArea(hasPermission) {
    if (hasPermission('hub.reports.read'))
        return true;
    return exports.HUB_REPORTS.some((r) => reportDomainAllowed(hasPermission, r));
}
