/**
 * Regras de bloco da agenda (1 grupo por bloco, hotel/creche, recorrência).
 * Usado no create/patch de hub_appointments.
 */

export const BOARDING_SERVICE_GROUPS = ['hotel', 'creche'] as const;

export function normalizeServiceGroupSlug(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().toLowerCase();
  return s || 'outros';
}

export function isBoardingServiceGroup(group: string | null | undefined): boolean {
  const g = normalizeServiceGroupSlug(group);
  return g === 'hotel' || g === 'creche';
}

export function isHotelServiceGroup(group: string | null | undefined): boolean {
  return normalizeServiceGroupSlug(group) === 'hotel';
}

export function isCrecheServiceGroup(group: string | null | undefined): boolean {
  return normalizeServiceGroupSlug(group) === 'creche';
}

export function isLevaTrazServiceGroupSlug(group: string | null | undefined): boolean {
  return normalizeServiceGroupSlug(group) === 'leva_traz';
}

type StRow = { service_group?: string | null };

/** Retorna erro se as linhas principais misturarem service_group. */
export function validateHomogeneousServiceGroups(
  lines: Array<{ hub_service_type_id: string }>,
  stMap: Map<string, StRow>,
): string | null {
  const groups = new Set<string>();
  for (const line of lines) {
    const st = stMap.get(line.hub_service_type_id);
    groups.add(normalizeServiceGroupSlug(st?.service_group));
  }
  if (groups.size <= 1) return null;
  return 'Cada bloco pode ter serviços de apenas um grupo. Separe em outro bloco no dia.';
}

export function primaryServiceGroup(
  hubServiceTypeId: string,
  stMap: Map<string, StRow>,
): string {
  return normalizeServiceGroupSlug(stMap.get(hubServiceTypeId)?.service_group);
}

/**
 * Fase 0 / transição: hotel/creche não mistura com extra_blocks no mesmo create
 * (até blocos de 1ª classe com séries independentes).
 * Passe allowBoardingWithSiblingBlocks=true após Fase 1+.
 */
export function validateBoardingBlockIsolation(opts: {
  primaryGroup: string;
  extraBlockGroups: string[];
  allowBoardingWithSiblingBlocks?: boolean;
}): string | null {
  if (opts.allowBoardingWithSiblingBlocks) return null;
  if (isBoardingServiceGroup(opts.primaryGroup) && opts.extraBlockGroups.length > 0) {
    return 'Hotel e creche não podem compartilhar o agendamento com outro bloco. Use um agendamento separado.';
  }
  for (const g of opts.extraBlockGroups) {
    if (isBoardingServiceGroup(g)) {
      return 'Hotel e creche devem ser o atendimento principal do agendamento.';
    }
  }
  return null;
}

export function validateHotelNoRecurrence(opts: {
  primaryGroup: string;
  hasRecurrence: boolean;
}): string | null {
  if (!opts.hasRecurrence) return null;
  if (isHotelServiceGroup(opts.primaryGroup)) {
    return 'Hotel não aceita recorrência. Use data de entrada e saída (estadia contínua) ou Hotel & Creche.';
  }
  return null;
}

/** Infere kind a partir do grupo quando o cliente manda standard/omitido. */
export function inferAppointmentKindFromServiceGroup(
  explicitKind: string | undefined,
  primaryGroup: string,
): 'hotel_stay' | 'daycare_block' | 'pickup_route' | null {
  if (explicitKind && explicitKind !== 'standard') return null;
  if (isHotelServiceGroup(primaryGroup)) return 'hotel_stay';
  if (isCrecheServiceGroup(primaryGroup)) return 'daycare_block';
  if (isLevaTrazServiceGroupSlug(primaryGroup)) return 'pickup_route';
  return null;
}

// ─── Leva e Traz: visita × bloco ───────────────────────────────────────────

export const PICKUP_MUTEX_MESSAGE =
  'Não dá para incluir Leva e Traz na visita e em outro bloco ao mesmo tempo.';

export const PICKUP_VISIT_RHYTHM_MESSAGE =
  'Com Leva e Traz da visita, todos os blocos precisam da mesma repetição (ou nenhum). Alinhe as séries ou use L&T em cada bloco.';

export type RecurrenceRhythmInput = {
  kind?: string;
  interval_value?: number;
  days_of_week?: number[] | null;
  until_date?: string | null;
  occurrences?: number | null;
} | null | undefined;

export function recurrenceRhythmSignature(r: RecurrenceRhythmInput): string {
  if (!r) return 'none';
  const dow = [...(r.days_of_week ?? [])].sort((a, b) => a - b).join(',');
  const end = r.until_date ? `until:${r.until_date}` : `occ:${r.occurrences ?? ''}`;
  const interval = r.kind === 'biweekly' ? 2 : Math.max(1, r.interval_value ?? 1);
  const kind = r.kind === 'biweekly' ? 'weekly' : r.kind ?? 'weekly';
  return `${kind}:${interval}:${dow}:${end}`;
}

/** L&T no pai e em qualquer extra_block no mesmo create. */
export function validatePickupMutex(opts: {
  visitHasPickup: boolean;
  extrasHavePickup: boolean;
}): string | null {
  if (opts.visitHasPickup && opts.extrasHavePickup) return PICKUP_MUTEX_MESSAGE;
  return null;
}

/** Com L&T da visita, ritmos do pai e dos extras devem coincidir. */
export function validateVisitPickupSameRhythm(opts: {
  visitHasPickup: boolean;
  rhythms: string[];
}): string | null {
  if (!opts.visitHasPickup) return null;
  if (opts.rhythms.length <= 1) return null;
  if (new Set(opts.rhythms).size <= 1) return null;
  return PICKUP_VISIT_RHYTHM_MESSAGE;
}
