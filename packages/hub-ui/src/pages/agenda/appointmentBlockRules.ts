/**
 * Regras de bloco da agenda: 1 grupo por bloco, hotel/creche e recorrência.
 * Espelha as validações do backend em hubAppointmentsController.
 */
import {
  isBoardingServiceGroup,
  isHotelServiceGroup,
  normalizeServiceGroupSlug,
} from '../../utils/serviceTypeSlug';

export {
  BOARDING_SERVICE_GROUPS,
  isBoardingServiceGroup,
  isCrecheServiceGroup,
  isHotelServiceGroup,
} from '../../utils/serviceTypeSlug';

export type ServiceGroupRef = {
  id: string;
  service_group?: string | null;
};

export function serviceGroupForTypeId(
  serviceTypeId: string,
  serviceTypes: ServiceGroupRef[],
): string {
  const st = serviceTypes.find((t) => t.id === serviceTypeId);
  return normalizeServiceGroupSlug(st?.service_group);
}

/** Grupos distintos dos serviços principais (ignora ids vazios). */
export function distinctServiceGroups(
  serviceTypeIds: string[],
  serviceTypes: ServiceGroupRef[],
): string[] {
  const set = new Set<string>();
  for (const id of serviceTypeIds) {
    if (!id) continue;
    set.add(serviceGroupForTypeId(id, serviceTypes));
  }
  return [...set];
}

export function blockAnchorGroup(
  serviceTypeIds: string[],
  serviceTypes: ServiceGroupRef[],
): string | null {
  const groups = distinctServiceGroups(serviceTypeIds, serviceTypes);
  return groups[0] ?? null;
}

export function validateHomogeneousServiceGroup(
  serviceTypeIds: string[],
  serviceTypes: ServiceGroupRef[],
): string | null {
  const groups = distinctServiceGroups(serviceTypeIds, serviceTypes);
  if (groups.length <= 1) return null;
  return 'Cada bloco pode ter serviços de apenas um grupo. Remova os de outro grupo ou use «Adicionar outro bloco».';
}

export function canAddServiceToBlock(opts: {
  existingServiceTypeIds: string[];
  newServiceTypeId: string;
  serviceTypes: ServiceGroupRef[];
}): { ok: true } | { ok: false; error: string } {
  const { existingServiceTypeIds, newServiceTypeId, serviceTypes } = opts;
  if (existingServiceTypeIds.includes(newServiceTypeId)) {
    return { ok: false, error: 'Este serviço já está no bloco.' };
  }
  if (existingServiceTypeIds.length === 0) return { ok: true };
  const anchor = blockAnchorGroup(existingServiceTypeIds, serviceTypes);
  const next = serviceGroupForTypeId(newServiceTypeId, serviceTypes);
  if (anchor && next !== anchor) {
    return {
      ok: false,
      error: `Este bloco é do grupo «${anchor}». Para outro grupo, use «Adicionar outro bloco no dia».`,
    };
  }
  return { ok: true };
}

export function boardingStayHintMessage(): string {
  return 'Estadia multi-dia: informe entrada e saída. Para banho ou outro serviço na estadia, use «Adicionar serviço na estadia» e escolha a data do bloco (ex.: dia da saída).';
}

/** Fase 0: hotel/creche não pode misturar com segundo bloco no mesmo create. */
export function validateBoardingBlockIsolation(opts: {
  mainServiceTypeIds: string[];
  extraBlocksServiceTypeIds: string[][];
  serviceTypes: ServiceGroupRef[];
  /** Após Fase 1+: permitir hotel + outro bloco com ritmos distintos. */
  allowBoardingWithSiblingBlocks?: boolean;
}): string | null {
  if (opts.allowBoardingWithSiblingBlocks) return null;
  const mainGroup = blockAnchorGroup(opts.mainServiceTypeIds, opts.serviceTypes);
  const hasExtras = opts.extraBlocksServiceTypeIds.some((ids) => ids.length > 0);
  if (isBoardingServiceGroup(mainGroup) && hasExtras) {
    return 'Hotel e creche não podem compartilhar o agendamento com outro bloco. Agende banho ou consulta em um agendamento separado.';
  }
  for (const ids of opts.extraBlocksServiceTypeIds) {
    const g = blockAnchorGroup(ids, opts.serviceTypes);
    if (isBoardingServiceGroup(g)) {
      return 'Hotel e creche devem ser o bloco principal do agendamento.';
    }
  }
  return null;
}

export function validateHotelNoRecurrence(opts: {
  mainServiceTypeIds: string[];
  serviceTypes: ServiceGroupRef[];
  withRecurrence: boolean;
}): string | null {
  if (!opts.withRecurrence) return null;
  const g = blockAnchorGroup(opts.mainServiceTypeIds, opts.serviceTypes);
  if (isHotelServiceGroup(g)) {
    return 'Hotel não usa «Repetir agendamento». Informe a estadia com data de entrada e saída (Hotel & Creche) ou um único bloco na agenda.';
  }
  return null;
}

export const HOTEL_STAY_RANGE_MESSAGE =
  'A saída da estadia precisa ser depois da entrada. Ajuste data e horário.';

/** Hotel/creche multi-dia: saída deve ser estritamente depois da entrada. */
export function validateHotelStayRange(opts: {
  checkInIso: string;
  checkOutIso: string;
}): string | null {
  const inMs = new Date(opts.checkInIso).getTime();
  const outMs = new Date(opts.checkOutIso).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return null;
  if (outMs <= inMs) return HOTEL_STAY_RANGE_MESSAGE;
  return null;
}

export function filterServiceTypesForBlockGroup<T extends ServiceGroupRef>(
  serviceTypes: T[],
  anchorGroup: string | null,
  opts?: { allowSchedulingOnly?: boolean },
): T[] {
  return serviceTypes.filter((st) => {
    if (opts?.allowSchedulingOnly !== false && (st as { allow_scheduling?: boolean }).allow_scheduling === false) {
      return false;
    }
    if (!anchorGroup) return true;
    return normalizeServiceGroupSlug(st.service_group) === anchorGroup;
  });
}

// ─── Leva e Traz: visita × bloco × repetição ───────────────────────────────

export const PICKUP_MUTEX_MESSAGE =
  'Não dá para incluir Leva e Traz na visita e em outro bloco ao mesmo tempo.';

/** @deprecated Prefer PICKUP_VISIT_RHYTHM_MESSAGE — mantido para mensagens antigas. */
export const PICKUP_VISIT_WITH_RECURRING_EXTRA_MESSAGE =
  'Com Leva e Traz da visita, todos os blocos precisam da mesma repetição (ou nenhum). Desligue o L&T da visita ou alinhe as séries.';

export const PICKUP_VISIT_RHYTHM_MESSAGE =
  'Com Leva e Traz da visita, todos os blocos precisam da mesma repetição (ou nenhum). Alinhe as séries ou use L&T em cada bloco.';

export type RecurrenceRhythmInput = {
  enabled?: boolean;
  kind?: string;
  interval_value?: number;
  days_of_week?: number[];
  /** Formato do bloco (`occurrences`/`until_date`) ou do modal (`occurrences`/`until`). */
  end_mode?: string;
  end_kind?: string;
  occurrences?: number;
  until_date?: string;
} | null | undefined;

/** Assinatura de ritmo para comparar blocos (L&T da visita exige igualdade). */
export function recurrenceRhythmSignature(r: RecurrenceRhythmInput): string {
  if (!r?.enabled) return 'none';
  const dow = [...(r.days_of_week ?? [])].sort((a, b) => a - b).join(',');
  const endKind = r.end_mode ?? r.end_kind ?? 'occurrences';
  const end =
    endKind === 'until_date' || endKind === 'until'
      ? `until:${r.until_date ?? ''}`
      : `occ:${r.occurrences ?? ''}`;
  const interval = r.kind === 'biweekly' ? 2 : Math.max(1, r.interval_value ?? 1);
  const kind = r.kind === 'biweekly' ? 'weekly' : r.kind ?? 'weekly';
  return `${kind}:${interval}:${dow}:${end}`;
}

/** L&T da visita e de qualquer extra são mutuamente exclusivos. */
export function validatePickupMutex(opts: {
  visitPickup: boolean;
  extrasWithPickup: boolean;
}): string | null {
  if (opts.visitPickup && opts.extrasWithPickup) return PICKUP_MUTEX_MESSAGE;
  return null;
}

/**
 * Com L&T da visita, todos os ritmos (pai + extras com serviço) devem ser iguais.
 * `rhythms` = assinaturas via recurrenceRhythmSignature.
 */
export function validateVisitPickupSameRhythm(opts: {
  visitPickup: boolean;
  rhythms: string[];
}): string | null {
  if (!opts.visitPickup) return null;
  const meaningful = opts.rhythms.filter((r) => r != null);
  if (meaningful.length <= 1) return null;
  const unique = new Set(meaningful);
  if (unique.size <= 1) return null;
  return PICKUP_VISIT_RHYTHM_MESSAGE;
}

/**
 * @deprecated Use validateVisitPickupSameRhythm. Mantido: ritmos mistos com visita = erro.
 */
export function validateVisitPickupWithRecurringExtras(opts: {
  visitPickup: boolean;
  anyExtraRecurrence: boolean;
  mainRecurrenceEnabled?: boolean;
}): string | null {
  if (!opts.visitPickup) return null;
  // Extra repete e o pai não (ou o contrário sem assinaturas) → inválido.
  if (opts.anyExtraRecurrence && opts.mainRecurrenceEnabled === false) {
    return PICKUP_VISIT_RHYTHM_MESSAGE;
  }
  if (opts.anyExtraRecurrence && opts.mainRecurrenceEnabled === undefined) {
    // Sem info do pai: conservador — exige alinhar (mensagem de ritmo).
    return PICKUP_VISIT_RHYTHM_MESSAGE;
  }
  return null;
}

/**
 * L&T da visita só com 2+ blocos, sem L&T em nenhum bloco, e ritmos iguais.
 * `rhythms` = assinaturas (pai + extras com serviço); se omitido, não filtra por ritmo.
 */
export function shouldHideVisitPickup(opts: {
  blockCount: number;
  anyBlockPickup: boolean;
  /** @deprecated Prefer anyBlockPickup — ainda aceito como anyExtraPickup. */
  anyExtraPickup?: boolean;
  /** @deprecated Prefer rhythms — ainda aceito para compat. */
  anyExtraRecurrence?: boolean;
  rhythms?: string[];
}): boolean {
  const blockCount = opts.blockCount;
  const anyBlockPickup = opts.anyBlockPickup || opts.anyExtraPickup === true;
  if (blockCount < 2) return true;
  if (anyBlockPickup) return true;
  if (opts.rhythms && opts.rhythms.length >= 2) {
    const unique = new Set(opts.rhythms);
    if (unique.size > 1) return true;
  } else if (opts.anyExtraRecurrence === true && opts.rhythms == null) {
    // Compat: sem lista de ritmos, "algum extra repete" sem saber o pai → esconde visita.
    // Com rhythms explícitos o ramo acima decide.
  }
  return false;
}

/** L&T do bloco (principal ou extra): esconde só quando a visita já cobre o transporte. */
export function shouldHideExtraPickup(opts: {
  visitPickup: boolean;
  /** @deprecated Ignorado — L&T do bloco não depende mais de recorrência. */
  anyExtraRecurrence?: boolean;
  parentIsBoarding?: boolean;
  blockStartsSameDayAsParent?: boolean;
}): boolean {
  void opts.anyExtraRecurrence;
  void opts.parentIsBoarding;
  void opts.blockStartsSameDayAsParent;
  return opts.visitPickup;
}

/** Alias semântico para o bloco principal. */
export function shouldHideMainBlockPickup(opts: { visitPickup: boolean }): boolean {
  return opts.visitPickup;
}

/**
 * Com L&T da visita + estadia (hotel/creche): ritmos divergentes (ex. hotel none + banho quinzenal)
 * não usam visita — mesma mensagem de ritmo.
 */
export function validateVisitPickupAgainstBoardingStay(opts: {
  visitPickup: boolean;
  parentIsBoarding: boolean;
  rhythms: string[];
}): string | null {
  if (!opts.visitPickup || !opts.parentIsBoarding) return null;
  return validateVisitPickupSameRhythm({
    visitPickup: true,
    rhythms: opts.rhythms,
  });
}

export function visitPickupHintWithExtras(): string {
  return 'Um transporte para todos os blocos — busca no primeiro, retorno no último. A repetição, se houver, deve ser a mesma em todos.';
}

export function visitPickupRecurrenceSyncHint(): string {
  return 'Com L&T da visita, a repetição do bloco principal vale para todos os blocos.';
}

export function blockPickupRecurrenceHint(): string {
  return 'O transporte será criado em cada ocorrência.';
}

export function blockPickupCoveredByVisitHint(): string {
  return 'Já coberto pelo Leva e Traz da visita.';
}
