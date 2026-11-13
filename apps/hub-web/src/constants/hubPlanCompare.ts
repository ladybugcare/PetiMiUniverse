export type HubComparePlanSlug = 'vet_solo' | 'solo' | 'growth' | 'network';
export type HubCompareCell = true | false | 'note';

export type HubCompareRow = {
  label: string;
  values: Record<HubComparePlanSlug, HubCompareCell>;
  note?: string;
};

export type HubCompareGroup = {
  title: string;
  rows: HubCompareRow[];
};

export const HUB_COMPARE_PLAN_COLUMNS: Array<{ slug: HubComparePlanSlug; name: string }> = [
  { slug: 'vet_solo', name: 'Vet Solo' },
  { slug: 'solo', name: 'Essencial' },
  { slug: 'growth', name: 'Expansão' },
  { slug: 'network', name: 'Rede' },
];

/** Matriz comercial definitiva — 6 grupos do redesenho. */
export const HUB_COMPARE_GROUPS: HubCompareGroup[] = [
  {
    title: 'Agenda e gestão de clientes',
    rows: [
      { label: 'Dashboard operacional do dia', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Agenda (inclui recorrência)', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Tutores e pets ilimitados', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Orçamentos', values: { vet_solo: true, solo: true, growth: true, network: true } },
    ],
  },
  {
    title: 'Clínica veterinária',
    rows: [
      { label: 'Consultório e prontuário', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Vacinas, procedimentos e documentos', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Internação e cirurgia', values: { vet_solo: true, solo: true, growth: true, network: true } },
    ],
  },
  {
    title: 'Operação pet',
    rows: [
      { label: 'Banho e tosa', values: { vet_solo: false, solo: true, growth: true, network: true } },
      { label: 'Hotel e creche', values: { vet_solo: false, solo: true, growth: true, network: true } },
      { label: 'Leva e traz', values: { vet_solo: false, solo: true, growth: true, network: true } },
      { label: 'Recepção multidepartamental', values: { vet_solo: false, solo: true, growth: true, network: true } },
    ],
  },
  {
    title: 'Gestão financeira e administrativa',
    rows: [
      { label: 'Caixa (baixa manual)', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Financeiro backoffice', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Estoque', values: { vet_solo: true, solo: true, growth: true, network: true } },
      {
        label: 'Comissões (regras e estimativa)',
        values: { vet_solo: 'note', solo: 'note', growth: 'note', network: 'note' },
        note: 'Estimativa de regras; sem ciclo de pagamento de comissão ao profissional.',
      },
    ],
  },
  {
    title: 'Equipe e unidades',
    rows: [
      { label: 'Equipe e convites', values: { vet_solo: true, solo: true, growth: true, network: true } },
      { label: 'Multiunidade', values: { vet_solo: false, solo: false, growth: true, network: true } },
      { label: 'Áreas operacionais por pessoa', values: { vet_solo: true, solo: true, growth: true, network: true } },
    ],
  },
  {
    title: 'Relatórios e gestão',
    rows: [
      { label: 'Relatórios do catálogo atual', values: { vet_solo: true, solo: true, growth: true, network: true } },
      {
        label: 'BI self-serve / consolidado avançado',
        values: { vet_solo: false, solo: false, growth: false, network: 'note' },
        note: 'Rede usa o catálogo de relatórios atual; não há BI self-serve separado.',
      },
    ],
  },
];
