import type { ReceptionBoardItem, ReceptionHandoffKind } from '../../api/hubReceptionApi';
import type {
  HubFinanceDayBoardItem,
  HubFinanceUnbilledItem,
} from '../../api/hubFinancialApi';
import {
  canCaixaCheckoutDayBoardItem,
  canCaixaEditOpenComanda,
  isCaixaCarryoverPendingComanda,
  isCaixaOwnedDayBoardItem,
  isDayBoardPaidAndComplete,
} from '../finance/hubComandaEditUtils';
import { dayBoardItemPendingAmount } from '../finance/hubCaixaSessionHistory';

export type BalcaoSectionId =
  | 'atencao'
  | 'cobrar'
  | 'saidas'
  | 'chegadas'
  | 'acompanhar'
  | 'feitos';

export type BalcaoFilterChip = 'tudo' | 'atencao' | 'cobrar' | 'saidas' | 'chegadas';

export type BalcaoViewMode = 'columns' | 'list';

/** Kinds operacionais do balcão; `a_receber` fica no Financeiro/Caixa. */
export type BalcaoChargeKind = 'sem_comanda' | 'comanda_aberta' | 'a_receber';

export type BalcaoChargeItem = {
  key: string;
  pet_id: string | null;
  pet_name: string;
  guardian_id: string | null;
  guardian_name: string | null;
  label: string;
  amount: number | null;
  kind: Exclude<BalcaoChargeKind, 'a_receber'>;
  comanda_id: string | null;
  origin_type: string | null;
  origin_id: string | null;
  /** Origem real para abrir comanda (hospitalização pode divergir). */
  open_origin_type: string | null;
  open_origin_id: string | null;
};

export type BalcaoChargeTutorGroup = {
  key: string;
  guardian_id: string | null;
  guardian_name: string;
  items: BalcaoChargeItem[];
  total: number;
};

export type BalcaoCustodySections = {
  atencao: ReceptionBoardItem[];
  saidas: ReceptionBoardItem[];
  chegadas: ReceptionBoardItem[];
  acompanhar: ReceptionBoardItem[];
  feitos: ReceptionBoardItem[];
};

/** Colunas do desk: subgrupos informativos embutidos. */
export type BalcaoDeskColumns = {
  atencao: ReceptionBoardItem[];
  chegadasPending: ReceptionBoardItem[];
  chegadasInSector: ReceptionBoardItem[];
  saidasReady: ReceptionBoardItem[];
  saidasPreparing: ReceptionBoardItem[];
  feitos: ReceptionBoardItem[];
};

const ATTENTION_KINDS = new Set<ReceptionHandoffKind>(['lt_falha', 'autorizar_extra', 'encaminhar']);
const EXIT_KINDS = new Set<ReceptionHandoffKind>(['retirada_balcao', 'embarque']);
const MONITOR_KINDS = new Set<ReceptionHandoffKind>(['saida_prevista', 'no_consultorio']);

function sortByOpened(a: ReceptionBoardItem, b: ReceptionBoardItem): number {
  return String(a.opened_at).localeCompare(String(b.opened_at));
}

function sortByStartsOrOpened(a: ReceptionBoardItem, b: ReceptionBoardItem): number {
  return String(a.context?.starts_at || a.opened_at).localeCompare(String(b.context?.starts_at || b.opened_at));
}

/** Seções de custódia do balcão (ordem operacional; Cobrar fica à parte). */
export function buildBalcaoCustodySections(items: ReceptionBoardItem[]): BalcaoCustodySections {
  const open = items.filter((i) => i.status === 'open');
  const atencao = open
    .filter((i) => ATTENTION_KINDS.has(i.kind))
    .sort((a, b) => Number(b.kind === 'lt_falha') - Number(a.kind === 'lt_falha') || sortByOpened(a, b));
  const saidas = open.filter((i) => EXIT_KINDS.has(i.kind)).sort(sortByOpened);
  const chegadas = open.filter((i) => i.kind === 'chegada').sort(sortByStartsOrOpened);
  const acompanhar = open.filter((i) => MONITOR_KINDS.has(i.kind)).sort(sortByStartsOrOpened);
  const feitos = items
    .filter((i) => i.status === 'done' || i.status === 'cancelled')
    .sort((a, b) => String(b.resolved_at || b.opened_at).localeCompare(String(a.resolved_at || a.opened_at)));
  return { atencao, saidas, chegadas, acompanhar, feitos };
}

/** Colunas do desk a partir das seções de custódia. */
export function buildBalcaoDeskColumns(sections: BalcaoCustodySections): BalcaoDeskColumns {
  return {
    atencao: sections.atencao,
    chegadasPending: sections.chegadas,
    chegadasInSector: sections.acompanhar.filter((i) => i.kind === 'no_consultorio'),
    saidasReady: sections.saidas,
    saidasPreparing: sections.acompanhar.filter((i) => i.kind === 'saida_prevista'),
    feitos: sections.feitos,
  };
}

function dayBoardChargeKind(item: HubFinanceDayBoardItem): BalcaoChargeKind | null {
  if (!isCaixaOwnedDayBoardItem(item)) return null;
  if (isDayBoardPaidAndComplete(item)) return null;
  const { billing } = item;
  if (
    billing.has_receivable &&
    (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
  ) {
    return 'a_receber';
  }
  if (billing.comanda_id && billing.comanda_status === 'aberta') {
    if (canCaixaCheckoutDayBoardItem(item)) return 'comanda_aberta';
    return null;
  }
  if (!billing.comanda_id && !billing.receivable_status) {
    return 'sem_comanda';
  }
  return null;
}

function resolveOpenOrigin(item: {
  origin_type: string;
  origin_id: string;
  billing_origin_type?: string | null;
  billing_origin_id?: string | null;
}): { open_origin_type: string | null; open_origin_id: string | null } {
  if (item.origin_type === 'hospitalization') {
    if (item.billing_origin_type && item.billing_origin_id) {
      return { open_origin_type: item.billing_origin_type, open_origin_id: item.billing_origin_id };
    }
    return { open_origin_type: null, open_origin_id: null };
  }
  return { open_origin_type: item.origin_type, open_origin_id: item.origin_id };
}

/**
 * Fila Cobrar operacional do balcão: day-board + comandas carryover + unbilled.
 * Exclui `a_receber` (já encaminhado ao Financeiro/Caixa).
 */
export function buildBalcaoChargeQueue(input: {
  dayBoardItems: HubFinanceDayBoardItem[];
  openComandas: Array<Record<string, unknown>>;
  unbilledItems: HubFinanceUnbilledItem[];
  todayYmd: string;
}): BalcaoChargeItem[] {
  const out: BalcaoChargeItem[] = [];
  const seenOrigin = new Set<string>();
  const seenComanda = new Set<string>();

  const markOrigin = (type: string | null, id: string | null) => {
    if (!type || !id) return;
    seenOrigin.add(`${type}:${id}`);
  };
  const hasOrigin = (type: string | null, id: string | null) =>
    Boolean(type && id && seenOrigin.has(`${type}:${id}`));

  for (const item of input.dayBoardItems) {
    const kind = dayBoardChargeKind(item);
    if (!kind || kind === 'a_receber') continue;
    const key = `${item.origin_type}:${item.origin_id}`;
    if (seenOrigin.has(key)) continue;
    seenOrigin.add(key);
    if (item.billing.comanda_id) seenComanda.add(String(item.billing.comanda_id));
    const open = resolveOpenOrigin(item);
    const amount =
      kind === 'sem_comanda'
        ? Number(item.estimated_amount) || null
        : dayBoardItemPendingAmount(item) || Number(item.estimated_amount) || null;
    out.push({
      key,
      pet_id: item.pet_id ?? item.pet?.id ?? null,
      pet_name: item.pet?.name?.trim() || 'Sem nome',
      guardian_id: item.guardian_id ?? item.guardian?.id ?? null,
      guardian_name: item.guardian?.full_name?.trim() || null,
      label: item.origin_label || 'Atendimento',
      amount,
      kind,
      comanda_id: item.billing.comanda_id,
      origin_type: item.origin_type,
      origin_id: item.origin_id,
      open_origin_type: open.open_origin_type,
      open_origin_id: open.open_origin_id,
    });
  }

  const dayBoardComandaIds = new Set(
    input.dayBoardItems.map((i) => i.billing.comanda_id).filter((id): id is string => Boolean(id)),
  );

  for (const comanda of input.openComandas) {
    if (!isCaixaCarryoverPendingComanda(comanda, input.todayYmd) && !canCaixaEditOpenComanda(comanda)) {
      continue;
    }
    if (!canCaixaEditOpenComanda(comanda)) continue;
    const comandaId = String(comanda.id ?? '');
    if (!comandaId || seenComanda.has(comandaId) || dayBoardComandaIds.has(comandaId)) continue;
    if (!isCaixaCarryoverPendingComanda(comanda, input.todayYmd)) continue;
    seenComanda.add(comandaId);
    const originType = (comanda.origin_type as string | null) ?? null;
    const originId = (comanda.origin_id as string | null) ?? null;
    if (hasOrigin(originType, originId)) continue;
    markOrigin(originType, originId);
    const balance =
      comanda.balance_due != null
        ? Number(comanda.balance_due)
        : Number(comanda.total_amount ?? 0) - Number(comanda.paid_total ?? 0);
    const petObj = comanda.pet as { id?: string; name?: string } | undefined;
    const guardianObj = comanda.guardian as { id?: string; full_name?: string } | undefined;
    out.push({
      key: `comanda:${comandaId}`,
      pet_id: (comanda.pet_id as string | null | undefined) ?? petObj?.id ?? null,
      pet_name: String(petObj?.name ?? comanda.pet_name ?? 'Sem nome'),
      guardian_id: (comanda.guardian_id as string | null | undefined) ?? guardianObj?.id ?? null,
      guardian_name:
        String(guardianObj?.full_name ?? comanda.guardian_name ?? '').trim() || null,
      label: String(comanda.origin_label ?? 'Comanda em aberto'),
      amount: Number.isFinite(balance) ? balance : null,
      kind: 'comanda_aberta',
      comanda_id: comandaId,
      origin_type: originType,
      origin_id: originId,
      open_origin_type: originType,
      open_origin_id: originId,
    });
  }

  for (const item of input.unbilledItems) {
    const key = `${item.source_type}:${item.source_id}`;
    if (seenOrigin.has(key)) continue;
    const billingType = item.billing_origin_type ?? item.source_type;
    const billingId = item.billing_origin_id ?? item.source_id;
    if (hasOrigin(billingType, billingId)) continue;
    seenOrigin.add(key);
    markOrigin(billingType, billingId);
    out.push({
      key,
      pet_id: item.pet?.id ?? null,
      pet_name: item.pet?.name?.trim() || 'Sem nome',
      guardian_id: item.guardian?.id ?? null,
      guardian_name: item.guardian?.full_name?.trim() || null,
      label: item.origin_label || 'Sem cobrança',
      amount: Number(item.estimated_amount) || null,
      kind: 'sem_comanda',
      comanda_id: null,
      origin_type: item.source_type,
      origin_id: item.source_id,
      open_origin_type: billingType,
      open_origin_id: billingId,
    });
  }

  return out;
}

/** Agrupa cobranças por tutor (visual); CTAs permanecem por item. */
export function groupBalcaoChargesByTutor(items: BalcaoChargeItem[]): BalcaoChargeTutorGroup[] {
  const map = new Map<string, BalcaoChargeTutorGroup>();
  for (const item of items) {
    const key = item.guardian_id
      ? `id:${item.guardian_id}`
      : `name:${(item.guardian_name || 'Sem tutor').trim().toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
      if (item.amount != null && Number.isFinite(item.amount)) existing.total += item.amount;
    } else {
      map.set(key, {
        key,
        guardian_id: item.guardian_id,
        guardian_name: item.guardian_name?.trim() || 'Sem tutor',
        items: [item],
        total: item.amount != null && Number.isFinite(item.amount) ? item.amount : 0,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.guardian_name.localeCompare(b.guardian_name, 'pt-BR'));
}

export function filterBalcaoCustodyByChip(
  sections: BalcaoCustodySections,
  chip: BalcaoFilterChip,
): BalcaoCustodySections {
  if (chip === 'tudo') return sections;
  if (chip === 'atencao') {
    return { ...sections, saidas: [], chegadas: [], acompanhar: [], feitos: [] };
  }
  if (chip === 'saidas') {
    return {
      ...sections,
      atencao: [],
      chegadas: [],
      acompanhar: sections.acompanhar.filter((i) => i.kind === 'saida_prevista'),
      feitos: [],
    };
  }
  if (chip === 'chegadas') {
    return {
      ...sections,
      atencao: [],
      saidas: [],
      acompanhar: sections.acompanhar.filter((i) => i.kind === 'no_consultorio'),
      feitos: [],
    };
  }
  // cobrar: esconde custódia (a seção Cobrar é renderizada à parte)
  return { atencao: [], saidas: [], chegadas: [], acompanhar: [], feitos: [] };
}

export function matchesBalcaoSearch(
  petName: string,
  guardianName: string | null | undefined,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    petName.toLowerCase().includes(needle) ||
    (guardianName || '').toLowerCase().includes(needle)
  );
}

export function chargeCtaLabel(kind: BalcaoChargeKind): string {
  if (kind === 'sem_comanda') return 'Abrir cobrança';
  if (kind === 'a_receber') return 'Cobrar saldo';
  return 'Cobrar agora';
}

/** Handoff de saída aberto do mesmo pet (para orquestrar cobrar → liberar). */
export function findOpenExitHandoffForPet(
  items: ReceptionBoardItem[],
  petId: string | null | undefined,
): ReceptionBoardItem | null {
  if (!petId) return null;
  return (
    items.find(
      (i) =>
        i.status === 'open' &&
        EXIT_KINDS.has(i.kind) &&
        i.pet.id === petId,
    ) ?? null
  );
}

export function sectorLabel(item: ReceptionBoardItem): string {
  if (item.source_type === 'boarding_reservation') {
    return item.context?.boarding_mode === 'daycare' ? 'Creche' : 'Hotel';
  }
  if (item.source_type === 'grooming_session') return 'Banho & Tosa';
  if (item.source_type === 'encounter' || item.source_type === 'appointment') {
    const label = item.context?.label?.toLowerCase() || '';
    if (label.includes('consulta') || label.includes('clínica') || label.includes('clinica')) return 'Clínica';
    if (label.includes('cirurgia')) return 'Cirurgia';
    if (label.includes('intern')) return 'Internação';
    if (label.includes('banho') || label.includes('tosa')) return 'Banho & Tosa';
    return item.context?.label?.trim() || 'Agenda';
  }
  if (item.source_type === 'pickup_stop') return 'Leva e Traz';
  if (item.source_type === 'hospitalization') return 'Internação';
  if (item.source_type === 'surgery') return 'Cirurgia';
  return item.context?.label?.trim() || 'Operação';
}

export function modalityLabel(item: ReceptionBoardItem): string | null {
  if (item.kind === 'embarque') return 'Embarque L&T';
  if (item.kind === 'retirada_balcao') return 'Retirada no balcão';
  if (item.kind === 'saida_prevista') {
    return item.context?.boarding_mode === 'daycare' ? 'Creche' : item.context?.boarding_mode ? 'Hotel' : null;
  }
  return null;
}
