import type { HubFinanceDayBoardItem, HubFinanceReceivable, HubChargeBundleItem } from '../../api/hubFinancialApi';
import {
  formatComandaListPets,
  formatComandaListTitle,
  formatReceivableListTitle,
  isReceivablePayable,
  type ComandaListPreview,
} from './comandaListPreview';
import { resolveDueDateTone, type DueDateTone } from './dueDateTone';

export type BatchChargeItemKind = 'comanda' | 'receivable';

export type BatchChargeItem = {
  kind: BatchChargeItemKind;
  /** ID estável da linha (comanda id ou receivable id). */
  id: string;
  comandaId: string | null;
  receivableId: string | null;
  title: string;
  amount: number;
  dueDate: string | null;
  tone: DueDateTone;
  petLabel: string;
  guardianId: string | null;
  /** Rótulo de origem (ex. day-board origin_label). */
  originLabel?: string | null;
  /**
   * Chave informativa de visita (visit_group / parent / âncora).
   * Só para UI — não implica seleção automática.
   */
  visitKey?: string | null;
};

/** Campos de vínculo usados para resolver visita na agenda. */
export type VisitLinkFields = {
  origin_type: string;
  origin_id: string;
  visit_group_id?: string | null;
  parent_appointment_id?: string | null;
  appointment_kind?: string | null;
};

/**
 * Resolve chave de visita a partir dos vínculos da agenda.
 * Não assume visit_group_id em todos os itens (L&T e filhos usam parent).
 * Pernas/filhos herdam o visit_group do appointment âncora quando o peer o traz.
 */
export function resolveVisitKey(item: VisitLinkFields, peers: VisitLinkFields[]): string | null {
  const visitGroupByAppt = new Map<string, string>();
  for (const p of peers) {
    const vg = p.visit_group_id?.trim();
    if (vg && p.origin_id) visitGroupByAppt.set(p.origin_id, vg);
  }

  const ownVg = item.visit_group_id?.trim();
  if (ownVg) return `vg:${ownVg}`;

  const parentId = item.parent_appointment_id?.trim();
  if (parentId) {
    const parentVg = visitGroupByAppt.get(parentId);
    if (parentVg) return `vg:${parentVg}`;
    return `ap:${parentId}`;
  }

  if (item.origin_type === 'appointment' && item.origin_id) {
    const referencedAsParent = peers.some(
      (p) =>
        p.origin_id !== item.origin_id &&
        Boolean(p.parent_appointment_id) &&
        p.parent_appointment_id === item.origin_id,
    );
    if (referencedAsParent) {
      const selfVg = visitGroupByAppt.get(item.origin_id);
      if (selfVg) return `vg:${selfVg}`;
      return `ap:${item.origin_id}`;
    }
  }

  return null;
}

/** Aplica visitKey em itens do lote a partir dos vínculos dos day-board items de origem. */
export function applyVisitKeysToBatchItems(
  batchItems: BatchChargeItem[],
  sourceItems: HubFinanceDayBoardItem[],
): BatchChargeItem[] {
  const peers: VisitLinkFields[] = sourceItems.map((s) => ({
    origin_type: s.origin_type,
    origin_id: s.origin_id,
    visit_group_id: s.visit_group_id ?? null,
    parent_appointment_id: s.parent_appointment_id ?? null,
    appointment_kind: s.appointment_kind ?? null,
  }));

  const withKeys = batchItems.map((item) => {
    const source = sourceItems.find((s) => {
      if (item.comandaId && s.billing.comanda_id === item.comandaId) return true;
      if (item.receivableId && s.billing.active_receivable_id === item.receivableId) return true;
      return false;
    });
    if (!source) return { ...item, visitKey: item.visitKey ?? null };
    const visitKey = resolveVisitKey(
      {
        origin_type: source.origin_type,
        origin_id: source.origin_id,
        visit_group_id: source.visit_group_id ?? null,
        parent_appointment_id: source.parent_appointment_id ?? null,
        appointment_kind: source.appointment_kind ?? null,
      },
      peers,
    );
    return {
      ...item,
      originLabel: item.originLabel ?? source.origin_label ?? null,
      visitKey,
    };
  });

  // Chaves que aparecem em ≥2 itens do lote → mantém; senão limpa (rótulo só em grupo).
  const counts = new Map<string, number>();
  for (const it of withKeys) {
    if (!it.visitKey) continue;
    counts.set(it.visitKey, (counts.get(it.visitKey) ?? 0) + 1);
  }
  const normalized = withKeys.map((it) => ({
    ...it,
    visitKey: it.visitKey && (counts.get(it.visitKey) ?? 0) >= 2 ? it.visitKey : null,
  }));
  // Agrupa visualmente itens da mesma visita no drawer.
  return normalized.sort((a, b) => {
    const va = a.visitKey ?? '';
    const vb = b.visitKey ?? '';
    if (va !== vb) {
      if (!va) return 1;
      if (!vb) return -1;
      return va.localeCompare(vb);
    }
    return sortBatchItems(a, b);
  });
}

function receivableOutstanding(rv: HubFinanceReceivable): number {
  const balance = (rv as HubFinanceReceivable & { balance_amount?: number }).balance_amount;
  if (typeof balance === 'number' && Number.isFinite(balance)) return Math.max(0, balance);
  return Math.max(0, Number(rv.final_amount ?? 0));
}

/** Saldo cobrável de comanda aberta: preferir balance_due (enrich); senão total. */
export function openComandaOutstanding(comanda: Record<string, unknown>): number {
  const balance = comanda.balance_due;
  if (typeof balance === 'number' && Number.isFinite(balance)) return Math.max(0, balance);
  if (typeof balance === 'string' && balance.trim() !== '' && Number.isFinite(Number(balance))) {
    return Math.max(0, Number(balance));
  }
  return Math.max(0, Number(comanda.total_amount ?? 0));
}

function toneRank(tone: DueDateTone): number {
  if (tone === 'overdue') return 0;
  if (tone === 'soon') return 1;
  if (tone === 'ok') return 2;
  return 3;
}

function sortBatchItems(a: BatchChargeItem, b: BatchChargeItem): number {
  const tr = toneRank(a.tone) - toneRank(b.tone);
  if (tr !== 0) return tr;
  const ad = a.dueDate ?? '9999-99-99';
  const bd = b.dueDate ?? '9999-99-99';
  if (ad !== bd) return ad.localeCompare(bd);
  return b.amount - a.amount;
}

/**
 * Lista unificada do que pode entrar num lote de cobrança:
 * - recebíveis pending / partially_paid
 * - comandas abertas sem recebível pagável ligado
 */
export function buildBatchChargeItems(
  receivables: HubFinanceReceivable[],
  comandas: Array<Record<string, unknown>>,
  opts?: { asOf?: Date },
): BatchChargeItem[] {
  const asOf = opts?.asOf ?? new Date();
  const comandasById = new Map(comandas.map((c) => [String(c.id), c]));
  const out: BatchChargeItem[] = [];

  const payable = receivables.filter((rv) => isReceivablePayable(rv.status));
  const payableComandaIds = new Set(
    payable.map((rv) => rv.comanda_id).filter((id): id is string => Boolean(id)),
  );

  for (const rv of payable) {
    const linked = rv.comanda_id ? (comandasById.get(rv.comanda_id) as ComandaListPreview | undefined) : null;
    const info = resolveDueDateTone(rv.due_date, { status: rv.status, asOf });
    const petFromLines = (rv.lines ?? [])
      .map((ln) => ln.pet?.name?.trim())
      .filter(Boolean) as string[];
    const petLabel =
      petFromLines.length > 0
        ? [...new Set(petFromLines)].join(', ')
        : linked
          ? formatComandaListPets(linked)
          : 'Tutor';
    out.push({
      kind: 'receivable',
      id: rv.id,
      comandaId: rv.comanda_id ?? null,
      receivableId: rv.id,
      title: formatReceivableListTitle(rv, linked ?? null),
      amount: receivableOutstanding(rv),
      dueDate: rv.due_date ?? null,
      tone: info.tone,
      petLabel,
      guardianId: rv.guardian_id ?? null,
    });
  }

  for (const c of comandas) {
    if (String(c.status ?? '') !== 'aberta') continue;
    const id = String(c.id ?? '');
    if (!id || payableComandaIds.has(id)) continue;
    // Comanda já liquidada (recebível pago) pode permanecer aberta até a operação
    // concluir — não pode voltar ao lote pelo total cheio.
    const amount = openComandaOutstanding(c);
    if (amount <= 0.009) continue;
    const preview = c as ComandaListPreview;
    out.push({
      kind: 'comanda',
      id,
      comandaId: id,
      receivableId: null,
      title: formatComandaListTitle(preview),
      amount,
      dueDate: null,
      tone: 'none',
      petLabel: formatComandaListPets(preview),
      guardianId: (c.guardian_id as string | null | undefined) ?? null,
    });
  }

  return out.sort(sortBatchItems);
}

export function sumBatchChargeAmount(items: BatchChargeItem[]): number {
  const total = items.reduce((s, it) => s + it.amount, 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function assertSameGuardian(items: BatchChargeItem[]): string | null {
  const ids = [...new Set(items.map((i) => i.guardianId).filter(Boolean))] as string[];
  if (ids.length === 0) return null;
  if (ids.length > 1) {
    throw new Error('Selecione cobranças do mesmo tutor para cobrar em conjunto.');
  }
  return ids[0];
}

/** Linha do day board elegível para lote: cobrança pendente/parcial (com ou sem comanda) ou comanda aberta. */
export function isDayBoardBatchSelectable(item: HubFinanceDayBoardItem): boolean {
  const { billing } = item;
  if (
    billing.active_receivable_id &&
    (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
  ) {
    return true;
  }
  if (!billing.comanda_id) return false;
  if (billing.comanda_status === 'aberta' && !billing.has_receivable) return true;
  return false;
}

export function dayBoardItemToBatchChargeItem(item: HubFinanceDayBoardItem): BatchChargeItem | null {
  if (!isDayBoardBatchSelectable(item)) return null;
  const { billing } = item;
  const title =
    item.services?.length > 0
      ? item.services.map((s) => s.name).join(', ')
      : item.origin_label || 'Sem itens';
  // Recebível direto (ex. grooming sem comanda) pode ter estimated_amount 0 no day board;
  // o saldo cobrável vem em billing.receivable_amount.
  const amount = Math.max(0, Number(billing.receivable_amount ?? item.estimated_amount ?? 0));
  const dueDate = billing.due_date ?? null;
  const tone = resolveDueDateTone(dueDate, { status: billing.receivable_status }).tone;
  const isReceivable =
    Boolean(billing.active_receivable_id) &&
    (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid');

  return {
    kind: isReceivable ? 'receivable' : 'comanda',
    id: isReceivable && billing.active_receivable_id ? billing.active_receivable_id : String(billing.comanda_id),
    comandaId: billing.comanda_id ?? null,
    receivableId: isReceivable ? billing.active_receivable_id ?? null : null,
    title,
    amount,
    dueDate,
    tone,
    petLabel: item.pet?.name ?? 'Tutor',
    guardianId: item.guardian_id ?? item.guardian?.id ?? null,
    originLabel: item.origin_label ?? null,
    visitKey: null,
  };
}

/** Converte itens ainda pagáveis de um lote enviado em linhas do drawer de cobrança. */
export function batchChargeItemsFromBundleItems(items: HubChargeBundleItem[]): BatchChargeItem[] {
  return items
    .filter((it) => it.balance_amount > 0.009 && ['pending', 'partially_paid'].includes(it.status))
    .map((it) => ({
      kind: 'receivable' as const,
      id: it.receivable_id,
      comandaId: null,
      receivableId: it.receivable_id,
      title: it.title,
      amount: it.balance_amount,
      dueDate: it.due_date,
      tone: resolveDueDateTone(it.due_date, { status: it.status }).tone,
      petLabel: it.pet_names.length ? it.pet_names.join(', ') : 'Tutor',
      guardianId: null,
    }))
    .sort(sortBatchItems);
}
