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
};

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

/** Linha do day board elegível para lote: tem comanda e cobrança pendente/parcial ou comanda aberta. */
export function isDayBoardBatchSelectable(item: HubFinanceDayBoardItem): boolean {
  const { billing } = item;
  if (!billing.comanda_id) return false;
  if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid') return true;
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
  const amount = Math.max(0, Number(item.estimated_amount ?? 0));
  const dueDate = billing.due_date ?? null;
  const tone = resolveDueDateTone(dueDate, { status: billing.receivable_status }).tone;
  const isReceivable =
    billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid';

  return {
    kind: isReceivable ? 'receivable' : 'comanda',
    id: isReceivable && billing.active_receivable_id ? billing.active_receivable_id : String(billing.comanda_id),
    comandaId: billing.comanda_id,
    receivableId: isReceivable ? billing.active_receivable_id ?? null : null,
    title,
    amount,
    dueDate,
    tone,
    petLabel: item.pet?.name ?? 'Tutor',
    guardianId: item.guardian_id ?? item.guardian?.id ?? null,
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
