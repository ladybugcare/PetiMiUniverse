/** Crumbs do header (pai opcional + página atual). Rotas mais específicas primeiro. */
export type HubPageCrumb = {
  label: string;
  /** Link do crumb pai; o último normalmente não tem. */
  to?: string;
};

type RouteTitle = {
  path: string;
  crumbs: HubPageCrumb[];
};

const ROUTES: RouteTitle[] = [
  { path: '/hub/pets/novo', crumbs: [{ label: 'Pets', to: '/hub/pets' }, { label: 'Novo pet' }] },
  { path: '/hub/estoque/itens', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Itens' }] },
  { path: '/hub/estoque/produtos', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Itens' }] },
  { path: '/hub/estoque/medicamentos', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Itens' }] },
  { path: '/hub/estoque/vacinas', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Itens' }] },
  { path: '/hub/estoque/movimentos', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Movimentos' }] },
  { path: '/hub/estoque/entradas', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Movimentos' }] },
  { path: '/hub/estoque/saidas', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Movimentos' }] },
  { path: '/hub/estoque/validade', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Alertas' }] },
  { path: '/hub/estoque/alertas', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Alertas' }] },
  { path: '/hub/estoque/inventario', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Inventário' }] },
  { path: '/hub/estoque/fornecedores', crumbs: [{ label: 'Estoque', to: '/hub/estoque' }, { label: 'Fornecedores' }] },
  {
    path: '/hub/configuracoes-sistema/checklists',
    crumbs: [{ label: 'Configurações', to: '/hub/configuracoes-sistema' }, { label: 'Checklists operacionais' }],
  },
  {
    path: '/hub/configuracoes-sistema/formas-pagamento',
    crumbs: [{ label: 'Configurações', to: '/hub/configuracoes-sistema' }, { label: 'Formas de pagamento' }],
  },
  {
    path: '/hub/configuracoes-sistema/templates-mensagem',
    crumbs: [{ label: 'Configurações', to: '/hub/configuracoes-sistema' }, { label: 'Templates de mensagem' }],
  },
  {
    path: '/hub/configuracoes-sistema/servicos-funcoes',
    crumbs: [{ label: 'Configurações', to: '/hub/configuracoes-sistema' }, { label: 'Serviços e funções' }],
  },
  { path: '/hub/configuracoes-sistema', crumbs: [{ label: 'Configurações do Sistema' }] },
  { path: '/hub/clinica/atendimentos', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Consultório' }] },
  { path: '/hub/clinica/consultorio', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Consultório' }] },
  { path: '/hub/clinica/prontuarios', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Prontuários' }] },
  { path: '/hub/clinica/evolucoes', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Evoluções' }] },
  { path: '/hub/clinica/prescricoes', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Prescrições' }] },
  {
    path: '/hub/clinica/receitas/nova',
    crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Nova receita' }],
  },
  { path: '/hub/clinica/vacinas', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Vacinas' }] },
  { path: '/hub/clinica/exames', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Exames' }] },
  { path: '/hub/clinica/internacoes', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Internações' }] },
  { path: '/hub/clinica/cirurgias', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Cirurgias' }] },
  { path: '/hub/onboarding/clinica', crumbs: [{ label: 'Configurar clínica' }] },
  { path: '/signup', crumbs: [{ label: 'Criar conta' }] },
  { path: '/email-confirmed', crumbs: [{ label: 'Confirmar e-mail' }] },
  { path: '/hub/clinica', crumbs: [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Consultório' }] },
  {
    path: '/hub/leva-e-traz/monitoramento',
    crumbs: [{ label: 'Leva e Traz', to: '/hub/leva-e-traz' }, { label: 'Monitoramento' }],
  },
  {
    path: '/hub/leva-e-traz/minha-rota',
    crumbs: [{ label: 'Leva e Traz', to: '/hub/leva-e-traz' }, { label: 'Minha rota' }],
  },
  { path: '/hub/leva-e-traz', crumbs: [{ label: 'Leva e Traz' }] },
  { path: '/hub/caixa', crumbs: [{ label: 'Caixa' }] },
  {
    path: '/hub/hotel-creche/minha-fila',
    crumbs: [{ label: 'Hotel & Creche', to: '/hub/hotel-creche' }, { label: 'Minha fila' }],
  },
  {
    path: '/hub/hotel-creche',
    crumbs: [{ label: 'Hotel & Creche', to: '/hub/hotel-creche' }, { label: 'Fila do dia' }],
  },
  {
    path: '/hub/banho-tosa/minha-fila',
    crumbs: [{ label: 'Banho & Tosa', to: '/hub/banho-tosa' }, { label: 'Minha fila' }],
  },
  {
    path: '/hub/banho-tosa',
    crumbs: [{ label: 'Banho & Tosa', to: '/hub/banho-tosa' }, { label: 'Fila do dia' }],
  },
  { path: '/hub/orcamentos/contatos', crumbs: [{ label: 'Orçamento', to: '/hub/orcamentos' }, { label: 'Contatos' }] },
  { path: '/hub/orcamentos/novo', crumbs: [{ label: 'Orçamento', to: '/hub/orcamentos' }, { label: 'Novo' }] },
  { path: '/hub/orcamentos', crumbs: [{ label: 'Orçamento' }] },
  { path: '/orcamento', crumbs: [{ label: 'Orçamento (público)' }] },
  { path: '/hub/dashboard', crumbs: [{ label: 'Dashboard' }] },
  { path: '/hub/appointments', crumbs: [{ label: 'Agenda' }] },
  { path: '/hub/clientes', crumbs: [{ label: 'Clientes' }] },
  { path: '/hub/pets', crumbs: [{ label: 'Pets' }] },
  { path: '/hub/financeiro', crumbs: [{ label: 'Financeiro' }] },
  {
    path: '/hub/servicos/adicionais/novo',
    crumbs: [{ label: 'Serviços', to: '/hub/servicos' }, { label: 'Adicionais' }, { label: 'Novo' }],
  },
  {
    path: '/hub/servicos/adicionais',
    crumbs: [{ label: 'Serviços', to: '/hub/servicos' }, { label: 'Adicionais' }],
  },
  {
    path: '/hub/servicos/servicos/novo',
    crumbs: [{ label: 'Serviços', to: '/hub/servicos' }, { label: 'Novo serviço' }],
  },
  { path: '/hub/servicos/servicos', crumbs: [{ label: 'Serviços' }] },
  { path: '/hub/estoque', crumbs: [{ label: 'Estoque' }] },
  { path: '/hub/equipe', crumbs: [{ label: 'Equipe' }] },
  { path: '/hub/relatorios', crumbs: [{ label: 'Relatórios' }] },
  { path: '/hub/encounters', crumbs: [{ label: 'Atendimentos' }] },
  { path: '/hub/notificacoes', crumbs: [{ label: 'Notificações' }] },
  { path: '/hub/meu-perfil', crumbs: [{ label: 'Meu Perfil' }] },
  { path: '/hub/perfil-clinica', crumbs: [{ label: 'Perfil da Clínica' }] },
];

const ROUTES_BY_SPECIFICITY = [...ROUTES].sort((a, b) => b.path.length - a.path.length);

function matchDynamicCrumbs(pathname: string): HubPageCrumb[] | null {
  if (/^\/hub\/pets\/[^/]+\/editar$/.test(pathname)) {
    return [{ label: 'Pets', to: '/hub/pets' }, { label: 'Editar pet' }];
  }
  if (/^\/hub\/clinica\/atendimentos\/[^/]+$/.test(pathname)) {
    return [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Atendimento' }];
  }
  if (/^\/hub\/clinica\/internacoes\/[^/]+$/.test(pathname)) {
    return [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Internação' }];
  }
  if (/^\/hub\/clinica\/cirurgias\/[^/]+$/.test(pathname)) {
    return [{ label: 'Clínica', to: '/hub/clinica' }, { label: 'Cirurgia' }];
  }
  if (/^\/hub\/clientes\/[^/]+$/.test(pathname)) {
    return [{ label: 'Clientes', to: '/hub/clientes' }, { label: 'Detalhe' }];
  }
  if (/^\/hub\/orcamentos\/[^/]+\/pronto-para-envio$/.test(pathname)) {
    return [{ label: 'Orçamento', to: '/hub/orcamentos' }, { label: 'Pronto para envio' }];
  }
  if (/^\/hub\/financeiro\/cobranca-lote\/[^/]+\/pronto-para-envio$/.test(pathname)) {
    return [{ label: 'Financeiro', to: '/hub/financeiro' }, { label: 'Pronto para envio' }];
  }
  if (/^\/hub\/caixa\/comanda\/[^/]+\/pronto-para-envio$/.test(pathname)) {
    return [{ label: 'Caixa', to: '/hub/caixa' }, { label: 'Pronto para envio' }];
  }
  if (/^\/hub\/caixa\/comanda\/[^/]+$/.test(pathname)) {
    return [{ label: 'Caixa', to: '/hub/caixa' }, { label: 'Comanda' }];
  }
  if (/^\/cobranca\//.test(pathname)) return [{ label: 'Cobrança (público)' }];
  if (/^\/comanda\//.test(pathname)) return [{ label: 'Comanda (público)' }];
  if (/^\/receita\//.test(pathname)) return [{ label: 'Receita (público)' }];
  if (pathname === '/validar-receita') return [{ label: 'Validar receita' }];
  return null;
}

export function hubPageCrumbsFromPath(pathname: string): HubPageCrumb[] {
  const dynamic = matchDynamicCrumbs(pathname);
  if (dynamic) return dynamic;

  const hit = ROUTES_BY_SPECIFICITY.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  return hit?.crumbs ?? [{ label: 'PetMi Hub' }];
}

/** Título plano (document.title / fallbacks). */
export function hubPageTitleFromPath(pathname: string): string {
  const crumbs = hubPageCrumbsFromPath(pathname);
  return crumbs.map((c) => c.label).join(' · ');
}
