import type {
  HubCashSessionSummary,
  HubFinanceDayBoardItem,
  HubPaymentMethod,
} from '../../api/hubFinancialApi';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';

export type CaixaHistoryIconKind =
  | HubPaymentMethod
  | 'withdrawal'
  | 'deposit'
  | 'comanda'
  | 'billing';

export type CaixaHistoryIconTone = 'green' | 'blue' | 'purple' | 'teal' | 'orange' | 'amber' | 'red';

export type CaixaSessionHistoryItem = {
  id: string;
  row_kind: 'payment' | 'movement' | 'billing';
  label: string;
  title: string;
  subtitle: string;
  signed_amount: number;
  happened_at: string;
  is_pending?: boolean;
  icon_kind: CaixaHistoryIconKind;
  icon_tone: CaixaHistoryIconTone;
  notes?: string | null;
};

const PAYMENT_META: Record<
  HubPaymentMethod,
  { title: string; tone: CaixaHistoryIconTone }
> = {
  pix: { title: 'PIX recebido', tone: 'green' },
  cash: { title: 'Dinheiro recebido', tone: 'green' },
  credit_card: { title: 'Pagamento cartão crédito', tone: 'blue' },
  debit_card: { title: 'Pagamento cartão débito', tone: 'purple' },
  transfer: { title: 'Transferência recebida', tone: 'teal' },
  payment_link: { title: 'Link de pagamento recebido', tone: 'orange' },
  customer_credit: { title: 'Crédito do tutor utilizado', tone: 'amber' },
};

function dayBoardPartyLabel(item: HubFinanceDayBoardItem): string {
  const who = [item.guardian?.full_name, item.pet?.name].filter(Boolean).join(' • ');
  return who || item.origin_label || 'Atendimento';
}

function dayBoardBillingMeta(item: HubFinanceDayBoardItem): Pick<CaixaSessionHistoryItem, 'title' | 'subtitle' | 'icon_kind' | 'icon_tone'> {
  const who = dayBoardPartyLabel(item);
  const services = (item.services ?? []).map((s) => s.name).filter(Boolean).join(' • ');
  const b = item.billing;
  if (b.finance_handoff_at) {
    return {
      title: 'Enviado ao financeiro',
      subtitle: services || who,
      icon_kind: 'billing',
      icon_tone: 'orange',
    };
  }
  if (b.receivable_status === 'pending' || b.receivable_status === 'partially_paid') {
    return {
      title: 'Cobrança pendente',
      subtitle: who,
      icon_kind: 'billing',
      icon_tone: 'amber',
    };
  }
  if (b.comanda_id && b.comanda_status === 'aberta') {
    return {
      title: 'Comanda aberta',
      subtitle: services || who,
      icon_kind: 'comanda',
      icon_tone: 'orange',
    };
  }
  return {
    title: 'Aguardando cobrança',
    subtitle: who,
    icon_kind: 'billing',
    icon_tone: 'amber',
  };
}

function dayBoardTimestamp(item: HubFinanceDayBoardItem): string {
  return item.billing.finance_handoff_at ?? item.starts_at ?? new Date().toISOString();
}

function paymentSubtitle(
  payment: Record<string, unknown>,
): string {
  const receivable = payment.receivable as Record<string, unknown> | null | undefined;
  const notes = String(payment.notes ?? '').trim();
  if (notes) return notes;
  if (receivable?.id) {
    const shortId = String(receivable.id).slice(0, 8);
    return `Recebível #${shortId}`;
  }
  return 'Pagamento na sessão';
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

export function buildCaixaSessionHistoryItems(
  cashSummary: HubCashSessionSummary | null,
  dayBoardItems: HubFinanceDayBoardItem[],
  openComandas: Array<Record<string, unknown>>,
): CaixaSessionHistoryItem[] {
  const sessionPayments = cashSummary?.all_payments ?? cashSummary?.payments ?? [];
  const paymentComandaIds = new Set(
    sessionPayments
      .map((p) => (p.receivable as { comanda_id?: string | null } | undefined)?.comanda_id)
      .filter(Boolean)
      .map(String),
  );

  const paymentRows: CaixaSessionHistoryItem[] = sessionPayments.map((payment) => {
    const raw = payment as Record<string, unknown>;
    const method = String(payment.payment_method ?? 'cash') as HubPaymentMethod;
    const meta = PAYMENT_META[method] ?? {
      title: `Recebimento (${paymentMethodLabel(method)})`,
      tone: 'green' as const,
    };
    return {
      id: `payment:${payment.id}`,
      row_kind: 'payment',
      label: meta.title,
      title: meta.title,
      subtitle: paymentSubtitle(raw),
      signed_amount: Number(payment.amount ?? 0),
      happened_at: payment.payment_date,
      icon_kind: method,
      icon_tone: meta.tone,
      notes: payment.notes ?? null,
    };
  });

  const movementRows: CaixaSessionHistoryItem[] = (cashSummary?.movements ?? []).map((movement) => {
    const isDeposit = movement.movement_type === 'deposit';
    return {
      id: `movement:${movement.id}`,
      row_kind: 'movement',
      label: isDeposit ? 'Suprimento' : 'Sangria',
      title: isDeposit ? 'Suprimento realizado' : 'Sangria realizada',
      subtitle: String(movement.notes ?? '').trim() || (isDeposit ? 'Entrada na gaveta' : 'Retirada da gaveta'),
      signed_amount: isDeposit ? Number(movement.amount ?? 0) : -Number(movement.amount ?? 0),
      happened_at: movement.created_at,
      icon_kind: isDeposit ? 'deposit' : 'withdrawal',
      icon_tone: isDeposit ? 'purple' : 'red',
      notes: movement.notes ?? null,
    };
  });

  const dayBoardComandaIds = new Set(
    dayBoardItems.map((item) => item.billing.comanda_id).filter(Boolean).map(String),
  );

  const billingRows: CaixaSessionHistoryItem[] = dayBoardItems
    .filter((item) => item.billing.receivable_status !== 'paid')
    .map((item) => {
      const meta = dayBoardBillingMeta(item);
      return {
        id: `billing:dayboard:${item.origin_type}:${item.origin_id}`,
        row_kind: 'billing' as const,
        label: `${meta.title} — ${dayBoardPartyLabel(item)}`,
        title: meta.title,
        subtitle: meta.subtitle,
        signed_amount: Number(item.estimated_amount ?? 0),
        happened_at: dayBoardTimestamp(item),
        is_pending: true,
        icon_kind: meta.icon_kind,
        icon_tone: meta.icon_tone,
      };
    });

  const openComandaRows: CaixaSessionHistoryItem[] = openComandas
    .filter((comanda) => {
      const id = String(comanda.id ?? '');
      return id && !dayBoardComandaIds.has(id) && !paymentComandaIds.has(id);
    })
    .map((comanda) => {
      const guardian = comanda.guardian as { full_name?: string } | null;
      const pet = comanda.pet as { name?: string } | null;
      const who = [guardian?.full_name, pet?.name].filter(Boolean).join(' • ') || 'Comanda';
      const shortId = String(comanda.id ?? '').slice(0, 8);
      return {
        id: `billing:comanda:${String(comanda.id)}`,
        row_kind: 'billing' as const,
        label: `Comanda aberta — ${who}`,
        title: 'Comanda criada',
        subtitle: `#${shortId} • ${who}`,
        signed_amount: Number(comanda.total_amount ?? 0),
        happened_at: String(comanda.opened_at ?? new Date().toISOString()),
        is_pending: true,
        icon_kind: 'comanda',
        icon_tone: 'orange',
      };
    });

  return [...paymentRows, ...movementRows, ...billingRows, ...openComandaRows].sort((a, b) =>
    String(b.happened_at).localeCompare(String(a.happened_at)),
  );
}

/** @deprecated use buildCaixaSessionHistoryItems */
export type CaixaSessionHistoryRow = CaixaSessionHistoryItem;

/** @deprecated use buildCaixaSessionHistoryItems */
export function buildCaixaSessionHistoryRows(
  cashSummary: HubCashSessionSummary | null,
  dayBoardItems: HubFinanceDayBoardItem[],
  openComandas: Array<Record<string, unknown>>,
): CaixaSessionHistoryItem[] {
  return buildCaixaSessionHistoryItems(cashSummary, dayBoardItems, openComandas);
}

export function formatHistoryTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatHistoryAmount(amount: number, isPending?: boolean): string {
  const n = Number(amount || 0);
  if (isPending) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
  if (n < -0.009) {
    return `- ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(n))}`;
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}
