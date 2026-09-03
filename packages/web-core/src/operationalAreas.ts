/** Áreas operacionais do Hub — espelho de backend/src/utils/operationalAreas.ts */

export const HUB_OPERATIONAL_AREAS = [
  'recepcao',
  'caixa',
  'financeiro',
  'clinica',
  'banho_tosa',
  'hotel_creche',
  'leva_traz',
  'estoque',
  'servicos',
  'equipe',
] as const;

export type HubOperationalArea = (typeof HUB_OPERATIONAL_AREAS)[number];

const AREA_SET = new Set<string>(HUB_OPERATIONAL_AREAS);

export const HUB_OPERATIONAL_AREA_LABELS: Record<HubOperationalArea, string> = {
  recepcao: 'Recepção',
  caixa: 'Caixa',
  financeiro: 'Financeiro (backoffice)',
  clinica: 'Clínica',
  banho_tosa: 'Banho & Tosa',
  hotel_creche: 'Hotel & Creche',
  leva_traz: 'Leva e Traz',
  estoque: 'Estoque',
  servicos: 'Serviços e catálogo',
  equipe: 'Equipe',
};

export const OPERATIONAL_AREA_PERMISSIONS: Record<HubOperationalArea, readonly string[]> = {
  recepcao: [
    'hub.appointments.read',
    'hub.appointments.write',
    'hub.guardians.read',
    'hub.guardians.write',
    'hub.pets.read',
    'hub.pets.write',
    'hub.prospects.read',
    'hub.quotes.read',
  ],
  caixa: [
    'hub.financial.read',
    'hub.cash.session',
    'hub.cash.receive',
    'hub.receivables.create',
    'hub.reports.read',
  ],
  financeiro: ['hub.financial.read', 'hub.financial.write', 'hub.reports.read'],
  clinica: [
    'hub.clinic.read',
    'hub.clinic.write',
    'hub.appointments.read',
    'hub.inventory.read',
    'hub.staff.read',
    'hub.guardians.read',
    'hub.pets.read',
  ],
  banho_tosa: [
    'hub.guardians.read',
    'hub.pets.read',
    'hub.service_types.read',
    'hub.appointments.read',
    'grooming.queue.read',
    'grooming.queue.manage',
  ],
  hotel_creche: [
    'hub.guardians.read',
    'hub.pets.read',
    'hub.appointments.read',
    'boarding.reservations.read',
    'boarding.reservations.manage',
    'boarding.daily_report.write',
  ],
  /** Motorista-first: ver rota e atualizar paradas (sem montar rotas/frota). */
  leva_traz: ['pickup.routes.read', 'pickup.stops.update'],
  estoque: ['hub.inventory.read', 'hub.inventory.write'],
  servicos: ['hub.service_types.read', 'hub.service_types.write'],
  equipe: ['hub.staff.read', 'hub.staff.write', 'hub.staff.invite', 'user.invite'],
};

export function isHubOperationalArea(value: string): value is HubOperationalArea {
  return AREA_SET.has(value);
}

export function sanitizeOperationalAreas(raw: unknown): HubOperationalArea[] {
  if (!Array.isArray(raw)) return [];
  const out: HubOperationalArea[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = String(item).trim();
    if (!s || seen.has(s) || !isHubOperationalArea(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function defaultOperationalAreasForJobTitle(jobTitle: string): HubOperationalArea[] {
  const j = jobTitle.trim();
  if (j === 'Recepção') return ['recepcao', 'caixa'];
  if (j === 'Banho & Tosa') return ['banho_tosa'];
  if (j === 'Motorista') return ['leva_traz'];
  if (
    j === 'Médico(a) Veterinário(a)' ||
    j === 'Auxiliar Veterinário(a)' ||
    j === 'Enfermeiro(a) Veterinário(a)'
  ) {
    return ['clinica'];
  }
  if (j === 'Recreador(a)' || j === 'Adestrador(a)') return ['hotel_creche'];
  return [];
}

export function permissionsFromOperationalAreas(
  areas: readonly HubOperationalArea[] | readonly string[],
): string[] {
  const out = new Set<string>();
  for (const area of sanitizeOperationalAreas([...areas])) {
    for (const p of OPERATIONAL_AREA_PERMISSIONS[area]) out.add(p);
  }
  return [...out];
}
