/** Valor de `job_title` para médico veterinário — único caso em que pedimos CRMV/UF na UI. */
export const VET_JOB_TITLE_VALUE = 'Médico(a) Veterinário(a)';

export type HubJobFunctionOption = {
  value: string;
  label: string;
  description: string;
};

/** Função principal (cargo) — valor persistido em `hub_staff_members.job_title`. */
export const HUB_JOB_FUNCTION_OPTIONS: HubJobFunctionOption[] = [
  {
    value: VET_JOB_TITLE_VALUE,
    label: VET_JOB_TITLE_VALUE,
    description: 'Realiza consultas, exames e tratamentos veterinários.',
  },
  {
    value: 'Banho & Tosa',
    label: 'Banho & Tosa',
    description: 'Responsável pelos serviços de banho, tosa e estética.',
  },
  {
    value: 'Recepção',
    label: 'Recepção',
    description: 'Atendimento ao cliente, agendamentos e cadastros.',
  },
  {
    value: 'Auxiliar Veterinário(a)',
    label: 'Auxiliar Veterinário(a)',
    description: 'Apoio em consultas, exames e procedimentos.',
  },
  {
    value: 'Enfermeiro(a) Veterinário(a)',
    label: 'Enfermeiro(a) Veterinário(a)',
    description: 'Auxilia o veterinário em procedimentos e internação.',
  },
  {
    value: 'Adestrador(a)',
    label: 'Adestrador(a)',
    description: 'Responsável por treinamentos e comportamento.',
  },
  {
    value: 'Recreador(a)',
    label: 'Recreador(a)',
    description: 'Recreação, brincadeiras e socialização dos pets (ex.: creche, área de lazer).',
  },
  {
    value: 'Motorista',
    label: 'Motorista',
    description: 'Transporte de pets no serviço Leva e Traz.',
  },
  {
    value: 'Outros',
    label: 'Outros',
    description: 'Outras funções ou atividades na clínica.',
  },
];

export const HUB_JOB_FUNCTION_VALUES = new Set(HUB_JOB_FUNCTION_OPTIONS.map((o) => o.value));

export type HubProfessionalKind =
  | 'vet'
  | 'groomer'
  | 'bather'
  | 'reception'
  | 'driver'
  | 'caretaker'
  | 'assistant'
  | 'other';

/** Deriva o enum da API a partir da função principal (`job_title`). */
export function professionalKindFromJobTitle(jobTitle: string): HubProfessionalKind {
  const j = jobTitle.trim();
  const map: Record<string, HubProfessionalKind> = {
    [VET_JOB_TITLE_VALUE]: 'vet',
    'Banho & Tosa': 'groomer',
    Recepção: 'reception',
    'Auxiliar Veterinário(a)': 'assistant',
    'Enfermeiro(a) Veterinário(a)': 'assistant',
    'Adestrador(a)': 'caretaker',
    'Recreador(a)': 'caretaker',
    Motorista: 'driver',
    Outros: 'other',
  };
  return map[j] ?? 'other';
}
