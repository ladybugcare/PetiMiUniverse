import type { HubFinanceReceivable } from '../../api/hubFinancialApi';
import {
  formatComandaListTitle,
  formatReceivableListTitle,
  isReceivablePayable,
  type ComandaListPreview,
} from './comandaListPreview';
import { resolveDueDateTone, type DueDateTone } from './dueDateTone';

export type ProfileFinanceNextDue = {
  title: string;
  amount: number;
  dueDate: string | null;
  tone: Exclude<DueDateTone, 'none'>;
  toneLabel: string;
};

export type ProfileFinanceSummary = {
  /** Soma do que ainda deve (recebíveis abertos + comandas abertas sem recebível). */
  outstandingTotal: number;
  openComandasCount: number;
  openComandasTotal: number;
  payableReceivablesCount: number;
  overdueCount: number;
  soonCount: number;
  okCount: number;
  noDueCount: number;
  nextDue: ProfileFinanceNextDue | null;
  hasActivity: boolean;
};

function receivableOutstanding(rv: HubFinanceReceivable): number {
  const balance = (rv as HubFinanceReceivable & { balance_amount?: number }).balance_amount;
  if (typeof balance === 'number' && Number.isFinite(balance)) return Math.max(0, balance);
  return Math.max(0, Number(rv.final_amount ?? 0));
}

function toneSortKey(tone: DueDateTone, daysUntil: number | null): number {
  if (tone === 'overdue') return daysUntil ?? -9999; // mais negativo = mais urgente
  if (tone === 'soon') return 1000 + (daysUntil ?? 0);
  if (tone === 'ok') return 2000 + (daysUntil ?? 0);
  return 9000;
}

/**
 * Agrega visão de “o que deve” para o Resumo do perfil.
 * Tutor: passa todos os recebíveis/comandas do cliente (já filtrados).
 * Pet: passa só os do pet.
 */
export function buildProfileFinanceSummary(
  receivables: HubFinanceReceivable[],
  comandas: Array<Record<string, unknown>>,
  opts?: { asOf?: Date },
): ProfileFinanceSummary {
  const asOf = opts?.asOf ?? new Date();
  const comandasById = new Map(comandas.map((c) => [String(c.id), c]));

  const openComandas = comandas.filter((c) => String(c.status ?? '') === 'aberta');
  const openWithoutReceivable = openComandas.filter((c) => {
    const id = String(c.id);
    return !receivables.some((rv) => rv.comanda_id === id && isReceivablePayable(rv.status));
  });
  const openComandasTotal = openWithoutReceivable.reduce(
    (sum, c) => sum + Math.max(0, Number(c.total_amount ?? 0)),
    0,
  );

  const payable = receivables.filter((rv) => isReceivablePayable(rv.status));

  let overdueCount = 0;
  let soonCount = 0;
  let okCount = 0;
  let noDueCount = 0;
  let receivableTotal = 0;
  let nextDue: ProfileFinanceNextDue | null = null;
  let nextKey = Number.POSITIVE_INFINITY;

  for (const rv of payable) {
    const amount = receivableOutstanding(rv);
    receivableTotal += amount;
    const info = resolveDueDateTone(rv.due_date, { status: rv.status, asOf });
    if (info.tone === 'overdue') overdueCount += 1;
    else if (info.tone === 'soon') soonCount += 1;
    else if (info.tone === 'ok') okCount += 1;
    else noDueCount += 1;

    if (info.tone === 'none') continue;
    const key = toneSortKey(info.tone, info.daysUntil);
    if (key >= nextKey) continue;
    nextKey = key;
    const linked = rv.comanda_id ? (comandasById.get(rv.comanda_id) as ComandaListPreview | undefined) : null;
    nextDue = {
      title: formatReceivableListTitle(rv, linked ?? null),
      amount,
      dueDate: rv.due_date ?? null,
      tone: info.tone,
      toneLabel: info.label,
    };
  }

  const outstandingTotal = Math.round((receivableTotal + openComandasTotal + Number.EPSILON) * 100) / 100;
  const hasActivity =
    payable.length > 0 ||
    openComandas.length > 0 ||
    receivables.some((rv) => rv.status === 'paid');

  return {
    outstandingTotal,
    openComandasCount: openComandas.length,
    openComandasTotal: Math.round((openComandasTotal + Number.EPSILON) * 100) / 100,
    payableReceivablesCount: payable.length,
    overdueCount,
    soonCount,
    okCount,
    noDueCount,
    nextDue,
    hasActivity,
  };
}

/** Título curto para comanda aberta no hint do resumo. */
export function formatOpenComandaHintTitle(comanda: Record<string, unknown>): string {
  return formatComandaListTitle(comanda as ComandaListPreview);
}
