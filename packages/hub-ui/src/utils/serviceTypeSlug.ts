/** Espelha a lógica de `slugifyServiceNameToCode` no backend (preview de código no Hub). */
export function slugifyServiceNameToCode(name: string): string {
  const raw = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, '_e_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const trimmed = raw.slice(0, 55);
  return trimmed || 'servico';
}

export const SERVICE_GROUP_OPTIONS = [
  { value: 'banho_tosa', label: 'Banho & Tosa' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'creche', label: 'Creche' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'cirurgia', label: 'Cirurgia' },
  { value: 'leva_traz', label: 'Leva e Traz' },
  { value: 'internacao', label: 'Internação' },
  { value: 'outros', label: 'Outros' },
] as const;

export const KNOWN_SERVICE_GROUP_SLUGS = new Set(SERVICE_GROUP_OPTIONS.map((o) => o.value));

export type HubServiceGroupValue = (typeof SERVICE_GROUP_OPTIONS)[number]['value'];

/** Grupos cuja agenda alimenta o painel Clínica → Atendimentos. */
export const OPERATIONAL_CLINICAL_SERVICE_GROUPS = ['clinica', 'internacao', 'cirurgia'] as const;

/** Grupo cuja agenda alimenta a fila operacional Banho & Tosa. */
export const OPERATIONAL_GROOMING_SERVICE_GROUP = 'banho_tosa' as const;

export type OperationalClinicalServiceGroup = (typeof OPERATIONAL_CLINICAL_SERVICE_GROUPS)[number];

export function isOperationalClinicalGroup(group: string): group is OperationalClinicalServiceGroup {
  return (OPERATIONAL_CLINICAL_SERVICE_GROUPS as readonly string[]).includes(group);
}

function humanizeGroupSlug(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function serviceGroupLabel(value: string): string {
  const o = SERVICE_GROUP_OPTIONS.find((x) => x.value === value);
  if (o) return o.label;
  return humanizeGroupSlug(value) || value;
}

/** Slug de `service_group` já persistido (vazio → `outros`). */
export function normalizeServiceGroupSlug(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  return s || 'outros';
}

/** Normaliza entrada do combobox (valor existente ou texto «criar novo») para slug de `service_group`. */
export function normalizeServiceGroupInput(raw: string): string {
  const t = raw.trim();
  if (!t) return 'outros';
  const slug = slugifyServiceNameToCode(t);
  return slug || 'outros';
}

/** Cor por defeito por grupo (quando o serviço ainda não tem `agenda_color`). */
export const DEFAULT_GROUP_COLOR_HEX: Record<HubServiceGroupValue, string> = {
  banho_tosa: '#f0642f',
  hotel: '#1565c0',
  creche: '#00897b',
  clinica: '#7b1fa2',
  cirurgia: '#c62828',
  leva_traz: '#5d4037',
  internacao: '#546e7a',
  outros: '#78909c',
};

/** Cor de acento UI para tier «filhote» na matriz de porte (não é grupo de serviço). */
export const FILHOTE_TIER_COLOR_HEX = '#ec407a';

/** Cor de acento na UI: `explicitHex` pode ser cor do grupo (`group_color`) ou legado `agenda_color` por serviço. */
export function resolveServiceAccentColor(
  agendaColor: string | null | undefined,
  serviceGroup: string
): string {
  if (agendaColor && /^#[0-9A-Fa-f]{6}$/.test(agendaColor.trim())) {
    return agendaColor.trim();
  }
  const g = serviceGroup as HubServiceGroupValue;
  return DEFAULT_GROUP_COLOR_HEX[g] ?? DEFAULT_GROUP_COLOR_HEX.outros;
}

/** Fundo suave (círculo do ícone) a partir de um hex. */
export function hexToSoftFill(hex: string, alpha = 0.2): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return `rgba(240, 100, 47, ${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
