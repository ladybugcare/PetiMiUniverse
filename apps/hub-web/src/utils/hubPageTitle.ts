/** Título da página no header, alinhado às rotas do Hub (rotas mais específicas primeiro). */
const ROUTES: { path: string; title: string }[] = [
  { path: '/hub/pets/novo', title: 'Novo pet' },
  { path: '/hub/estoque/produtos', title: 'Estoque — Produtos' },
  { path: '/hub/estoque/medicamentos', title: 'Estoque — Medicamentos' },
  { path: '/hub/estoque/vacinas', title: 'Estoque — Vacinas' },
  { path: '/hub/estoque/entradas', title: 'Estoque — Entradas' },
  { path: '/hub/estoque/saidas', title: 'Estoque — Saídas' },
  { path: '/hub/estoque/validade', title: 'Estoque — Validade' },
  { path: '/hub/estoque/alertas', title: 'Estoque — Alertas' },
  { path: '/hub/estoque/inventario', title: 'Estoque — Inventário' },
  { path: '/hub/configuracoes-sistema/servicos-funcoes', title: 'Configurações — Serviços e Funções' },
  { path: '/hub/configuracoes-sistema', title: 'Configurações do Sistema' },
  { path: '/hub/clinica/atendimentos', title: 'Clínica — Atendimentos' },
  { path: '/hub/clinica/prontuarios', title: 'Clínica — Prontuários' },
  { path: '/hub/clinica/evolucoes', title: 'Clínica — Evoluções' },
  { path: '/hub/clinica/prescricoes', title: 'Clínica — Prescrições' },
  { path: '/hub/clinica/vacinas', title: 'Clínica — Vacinas' },
  { path: '/hub/clinica/exames', title: 'Clínica — Exames' },
  { path: '/hub/clinica/internacoes', title: 'Clínica — Internações' },
  { path: '/hub/clinica/cirurgias', title: 'Clínica — Cirurgias' },
  { path: '/hub/onboarding/clinica', title: 'Configurar clínica' },
  { path: '/signup', title: 'Criar conta' },
  { path: '/email-confirmed', title: 'Confirmar e-mail' },
  { path: '/hub/clinica', title: 'Clínica' },
  { path: '/hub/leva-e-traz', title: 'Leva e Traz' },
  { path: '/hub/caixa', title: 'Caixa' },
  { path: '/hub/hotel-creche', title: 'Hotel & Creche' },
  { path: '/hub/banho-tosa', title: 'Banho & Tosa' },
  { path: '/hub/orcamentos/contatos', title: 'Orçamento — Contatos' },
  { path: '/hub/orcamentos/novo', title: 'Orçamento — Novo' },
  { path: '/hub/orcamentos', title: 'Orçamento' },
  { path: '/orcamento', title: 'Orçamento (público)' },
  { path: '/hub/dashboard', title: 'Dashboard' },
  { path: '/hub/appointments', title: 'Agenda' },
  { path: '/hub/clientes', title: 'Clientes' },
  { path: '/hub/pets', title: 'Pets' },
  { path: '/hub/financeiro', title: 'Financeiro' },
  { path: '/hub/servicos/adicionais/novo', title: 'Adicionais — Novo' },
  { path: '/hub/servicos/adicionais', title: 'Adicionais' },
  { path: '/hub/servicos/servicos/novo', title: 'Serviços — Novo' },
  { path: '/hub/servicos/servicos', title: 'Serviços' },
  { path: '/hub/estoque', title: 'Estoque' },
  { path: '/hub/equipe', title: 'Equipe' },
  { path: '/hub/relatorios', title: 'Relatórios' },
  { path: '/hub/encounters', title: 'Atendimentos' },
  { path: '/hub/meu-perfil', title: 'Meu Perfil' },
  { path: '/hub/perfil-clinica', title: 'Perfil da Clínica' },
];

const ROUTES_BY_SPECIFICITY = [...ROUTES].sort((a, b) => b.path.length - a.path.length);

export function hubPageTitleFromPath(pathname: string): string {
  if (/^\/hub\/clinica\/atendimentos\/[^/]+$/.test(pathname)) return 'Clínica — Atendimento';
  if (/^\/hub\/clientes\/[^/]+$/.test(pathname)) return 'Cliente';
  if (/^\/hub\/orcamentos\/[^/]+\/pronto-para-envio$/.test(pathname)) return 'Orçamento — Pronto para envio';
  const hit = ROUTES_BY_SPECIFICITY.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  return hit?.title ?? 'PetMi Hub';
}
