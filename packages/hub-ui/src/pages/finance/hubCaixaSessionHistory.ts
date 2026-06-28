import type {
  HubCashSessionSummary,
  HubFinanceDayBoardItem,
} from '../../api/hubFinancialApi';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';

export type CaixaSessionHistoryRow = {
  id: string;
  row_kind: 'payment' | 'movement' | 'billing';
  label: string;
  signed_amount: number;
  happened_at: string;
  is_pending?: boolean;
};

function dayBoardPartyLabel(item: HubFinanceDayBoardItem): string {
  const who = [item.guardian?.full_name, item.pet?.name].filter(Boolean).join(' / ');
  return who || item.origin_label || 'Atendimento';
}

function dayBoardBillingLabel(item: HubFinanceDayBoardItem): string {
  const who = dayBoardPartyLabel(item);
  const b = item.billing;
  if (b.finance_handoff_at) return `Enviado ao financeiro — ${who}`;
  if (b.receivable_status === 'pending' || b.receivable_status === 'partially_paid') return `A receber — ${who}`;
  if (b.comanda_id && b.comanda_status === 'aberta') return `Comanda aberta — ${who}`;
  return `Aguardando cobrança — ${who}`;
}

function dayBoardTimestamp(item: HubFinanceDayBoardItem): string {
  return (
    item.billing.finance_handoff_at
    ?? item.starts_at
    ?? new Date().toISOString()
  );
}

export function sumDayBoardPendingAmount(items: HubFinanceDayBoardItem[]): number {
  return round2(
    items.reduce((sum, item) => {
      if (item.billing.receivable_status === 'paid') return sum;
      return sum + Number(item.estimated_amount ?? 0);
    }, 0),
  );
}

export function sumOpenComandasPendingAmount(
  comandas: Array<Record<string, unknown>>,
  excludeComandaIds: Set<string>,
): number {
  return round2(
    comandas.reduce((sum, comanda) => {
      const id = String(comanda.id ?? '');
      if (!id || excludeComandaIds.has(id)) return sum;
      if (String(comanda.status ?? '') !== 'aberta') return sum;
      return sum + Number(comanda.total_amount ?? 0);
    }, 0),
  );
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function buildCaixaSessionHistoryRows(
  cashSummary: HubCashSessionSummary | null,
  dayBoardItems: HubFinanceDayBoardItem[],
  openComandas: Array<Record<string, unknown>>,
): CaixaSessionHistoryRow[] {
  const sessionPayments = cashSummary?.all_payments ?? cashSummary?.payments ?? [];
  const paymentComandaIds = new Set(
    sessionPayments
      .map((p) => (p.receivable as { comanda_id?: string | null } | undefined)?.comanda_id)
      .filter(Boolean)
      .map(String),
  );

  const paymentRows: CaixaSessionHistoryRow[] = sessionPayments.map((payment) => {
    const method = String(payment.payment_method ?? 'cash');
    const methodLabel = paymentMethodLabel(method);
    return {
      id: `payment:${payment.id}`,
      row_kind: 'payment',
      label: method === 'cash' ? 'Recebimento em dinheiro' : `Recebimento (${methodLabel})`,
      signed_amount: Number(payment.amount ?? 0),
      happened_at: payment.payment_date,
    };
  });

  const movementRows: CaixaSessionHistoryRow[] = (cashSummary?.movements ?? []).map((movement) => ({
    id: `movement:${movement.id}`,
    row_kind: 'movement',
    label: movement.movement_type === 'deposit' ? 'Suprimento' : 'Sangria',
    signed_amount: movement.movement_type === 'deposit'
      ? Number(movement.amount ?? 0)
      : -Number(movement.amount ?? 0),
    happened_at: movement.created_at,
  }));

  const dayBoardComandaIds = new Set(
    dayBoardItems.map((item) => item.billing.comanda_id).filter(Boolean).map(String),
  );

  const billingRows: CaixaSessionHistoryRow[] = dayBoardItems
    .filter((item) => item.billing.receivable_status !== 'paid')
    .map((item) => ({
      id: `billing:dayboard:${item.origin_type}:${item.origin_id}`,
      row_kind: 'billing' as const,
      label: dayBoardBillingLabel(item),
      signed_amount: Number(item.estimated_amount ?? 0),
      happened_at: dayBoardTimestamp(item),
      is_pending: true,
    }));

  const openComandaRows: CaixaSessionHistoryRow[] = openComandas
    .filter((comanda) => {
      const id = String(comanda.id ?? '');
      return id && !dayBoardComandaIds.has(id) && !paymentComandaIds.has(id);
    })
    .map((comanda) => {
      const guardian = comanda.guardian as { full_name?: string } | null;
      const pet = comanda.pet as { name?: string } | null;
      const who = [guardian?.full_name, pet?.name].filter(Boolean).join(' / ') || 'Comanda';
      return {
        id: `billing:comanda:${String(comanda.id)}`,
        row_kind: 'billing' as const,
        label: `Comanda aberta — ${who}`,
        signed_amount: Number(comanda.total_amount ?? 0),
        happened_at: String(comanda.opened_at ?? new Date().toISOString()),
        is_pending: true,
      };
    });

  return [...paymentRows, ...movementRows, ...billingRows, ...openComandaRows].sort((a, b) =>
    String(b.happened_at).localeCompare(String(a.happened_at)),
  );
}
