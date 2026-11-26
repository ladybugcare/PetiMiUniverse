import type {
  HubCashPaymentReceivableContext,
  HubCashSessionSummary,
  HubFinanceDayBoardItem,
  HubPaymentMethod,
} from '../../api/hubFinancialApi';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';
import { COMANDA_ORIGIN_LABELS } from './comandaListPreview';

export type CaixaHistoryIconKind =
  | HubPaymentMethod
  | 'withdrawal'
  | 'deposit'
  | 'comanda'
  | 'billing';

export type CaixaHistoryIconTone = 'green' | 'blue' | 'purple' | 'teal' | 'orange' | 'amber' | 'red';

export type CaixaHistorySaleChannel = 'quick_sale' | 'agenda' | 'other';

export type CaixaHistoryComposition = 'product' | 'service' | 'mixed';

export type CaixaHistoryChipTone = 'quick' | 'agenda' | 'product' | 'service' | 'mixed' | 'other';

export type CaixaHistoryChip = {
  key: string;
  label: string;
  tone: CaixaHistoryChipTone;
};

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
  /** Referências para abrir comanda / cobrança no clique. */
  comanda_id?: string | null;
  receivable_id?: string | null;
  payment_id?: string | null;
  movement_id?: string | null;
  origin_type?: string | null;
  origin_id?: string | null;
  sale_channel?: CaixaHistorySaleChannel | null;
  composition?: CaixaHistoryComposition | null;
  chips?: CaixaHistoryChip[];
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
  payment_link: { title: 'Link externo recebido (baixa manual)', tone: 'orange' },
  customer_credit: { title: 'Crédito do tutor utilizado', tone: 'amber' },
};

const AGENDA_ORIGIN_TYPES = new Set([
  'appointment',
  'grooming_session',
  'encounter',
  'boarding_reservation',
  'quote',
  'hospitalization',
  'package',
]);

export function resolveSaleChannel(originType: string | null | undefined): CaixaHistorySaleChannel | null {
  if (!originType) return null;
  if (originType === 'manual') return 'quick_sale';
  if (AGENDA_ORIGIN_TYPES.has(originType)) return 'agenda';
  return 'other';
}

export function resolveComposition(
  hasProduct: boolean,
  hasService: boolean,
): CaixaHistoryComposition | null {
  if (hasProduct && hasService) return 'mixed';
  if (hasProduct) return 'product';
  if (hasService) return 'service';
  return null;
}

export function buildHistoryChips(opts: {
  saleChannel?: CaixaHistorySaleChannel | null;
  composition?: CaixaHistoryComposition | null;
  originType?: string | null;
}): CaixaHistoryChip[] {
  const chips: CaixaHistoryChip[] = [];
  if (opts.saleChannel === 'quick_sale') {
    chips.push({ key: 'channel', label: 'Venda rápida', tone: 'quick' });
  } else if (opts.saleChannel === 'agenda') {
    const originLabel =
      (opts.originType && COMANDA_ORIGIN_LABELS[opts.originType]) || 'Agenda';
    chips.push({ key: 'channel', label: originLabel, tone: 'agenda' });
  } else if (opts.saleChannel === 'other' && opts.originType) {
    const originLabel = COMANDA_ORIGIN_LABELS[opts.originType] || opts.originType;
    chips.push({ key: 'channel', label: originLabel, tone: 'other' });
  }

  if (opts.composition === 'product') {
    chips.push({ key: 'composition', label: 'Produto', tone: 'product' });
  } else if (opts.composition === 'service') {
    chips.push({ key: 'composition', label: 'Serviço', tone: 'service' });
  } else if (opts.composition === 'mixed') {
    chips.push({ key: 'composition', label: 'Misto', tone: 'mixed' });
  }
  return chips;
}

function dayBoardPartyLabel(item: HubFinanceDayBoardItem): string {
  const who = [item.guardian?.full_name, item.pet?.name].filter(Boolean).join(' • ');
  return who || item.origin_label || 'Atendimento';
}

function dayBoardBillingMeta(item: HubFinanceDayBoardItem): Pick<
  CaixaSessionHistoryItem,
  'title' | 'subtitle' | 'icon_kind' | 'icon_tone'
> {
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
    title: 'Sem comanda',
    subtitle: services || who,
    icon_kind: 'billing',
    icon_tone: 'amber',
  };
}

function dayBoardTimestamp(item: HubFinanceDayBoardItem): string {
  return item.billing.finance_handoff_at ?? item.starts_at ?? new Date().toISOString();
}

function paymentDetailSubtitle(payment: Record<string, unknown>): string {
  const tendered = payment.tendered_amount != null ? Number(payment.tendered_amount) : null;
  const change = payment.change_amount != null ? Number(payment.change_amount) : null;
  if (
    String(payment.payment_method) === 'cash' &&
    tendered != null &&
    Number.isFinite(tendered) &&
    change != null &&
    Number.isFinite(change) &&
    change > 0.009
  ) {
    return `Troco R$ ${change.toFixed(2)} (recebido R$ ${tendered.toFixed(2)})`;
  }
  const notes = String(payment.notes ?? '').trim();
  if (notes) return notes;
  return '';
}

function compositionFromComandaRecord(comanda: Record<string, unknown>): {
  has_product: boolean;
  has_service: boolean;
} {
  const items = Array.isArray(comanda.items) ? comanda.items : [];
  let has_product = false;
  let has_service = false;
  for (const raw of items) {
    const it = raw as { item_kind?: string };
    const kind = String(it?.item_kind ?? '');
    if (kind === 'product') has_product = true;
    else if (kind === 'service' || kind === 'fee') has_service = true;
  }
  return { has_product, has_service };
}

/**
 * Valor cobrável de um item do painel do dia para o KPI "A receber no dia".
 * Com recebível pending/parcial: usa saldo restante (receivable_amount), não o bruto estimado —
 * evita double-count / salto do valor cheio no pagamento parcial.
 */
export function dayBoardItemPendingAmount(item: HubFinanceDayBoardItem): number {
  if (item.billing.finance_handoff_at) return 0;
  if (item.billing.receivable_status === 'paid') return 0;
  if (item.billing.receivable_status === 'cancelled' || item.billing.receivable_status === 'refunded') {
    return 0;
  }
  if (item.coverage_kind === 'series_invoice' || item.series_invoice_comanda_id) return 0;
  if ((item.has_package_balance || item.coverage_kind === 'package') && Number(item.estimated_amount ?? 0) <= 0.009) {
    return 0;
  }
  const status = item.billing.receivable_status;
  if (status === 'pending' || status === 'partially_paid') {
    if (item.billing.receivable_amount != null && Number.isFinite(Number(item.billing.receivable_amount))) {
      return Math.max(0, Number(item.billing.receivable_amount));
    }
  }
  return Math.max(0, Number(item.estimated_amount ?? 0));
}

export function sumDayBoardPendingAmount(items: HubFinanceDayBoardItem[]): number {
  return round2(items.reduce((sum, item) => sum + dayBoardItemPendingAmount(item), 0));
}

/** Saldo cobrável de comanda aberta no KPI (preferir balance_due). */
export function openComandaPendingAmount(comanda: Record<string, unknown>): number {
  const balance = comanda.balance_due;
  if (typeof balance === 'number' && Number.isFinite(balance)) return Math.max(0, balance);
  if (typeof balance === 'string' && balance.trim() !== '' && Number.isFinite(Number(balance))) {
    return Math.max(0, Number(balance));
  }
  return Math.max(0, Number(comanda.total_amount ?? 0));
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
      if (comanda.finance_handoff_at) return sum;
      return sum + openComandaPendingAmount(comanda);
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
  const openComandaById = new Map(
    openComandas
      .filter((c) => c?.id)
      .map((c) => [String(c.id), c] as const),
  );

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
    const receivable = (payment.receivable ?? null) as HubCashPaymentReceivableContext | null;
    const receivableId =
      (receivable?.id ? String(receivable.id) : null) ||
      (payment.receivable_id ? String(payment.receivable_id) : null);
    const comandaId = receivable?.comanda_id ? String(receivable.comanda_id) : null;
    const openComanda = comandaId ? openComandaById.get(comandaId) : undefined;
    const originType =
      (receivable?.comanda_origin_type ? String(receivable.comanda_origin_type) : null) ||
      (openComanda?.origin_type ? String(openComanda.origin_type) : null);

    let hasProduct = Boolean(receivable?.has_product);
    let hasService = Boolean(receivable?.has_service);
    if (!hasProduct && !hasService && openComanda) {
      const fromOpen = compositionFromComandaRecord(openComanda);
      hasProduct = fromOpen.has_product;
      hasService = fromOpen.has_service;
    }

    const saleChannel = resolveSaleChannel(originType);
    const composition = resolveComposition(hasProduct, hasService);
    const chips = buildHistoryChips({ saleChannel, composition, originType });
    const detail = paymentDetailSubtitle(raw);
    const fallbackId = comandaId
      ? `Comanda #${comandaId.slice(0, 8)}`
      : receivableId
        ? `Recebível #${receivableId.slice(0, 8)}`
        : 'Pagamento na sessão';

    return {
      id: `payment:${payment.id}`,
      row_kind: 'payment' as const,
      label: meta.title,
      title: meta.title,
      subtitle: detail || (chips.length ? '' : fallbackId),
      signed_amount: Number(payment.amount ?? 0),
      happened_at: payment.payment_date,
      icon_kind: method,
      icon_tone: meta.tone,
      notes: payment.notes ?? null,
      payment_id: String(payment.id),
      receivable_id: receivableId,
      comanda_id: comandaId,
      origin_type: originType,
      sale_channel: saleChannel,
      composition,
      chips,
    };
  });

  const movementRows: CaixaSessionHistoryItem[] = (cashSummary?.movements ?? []).map((movement) => {
    const isDeposit = movement.movement_type === 'deposit';
    return {
      id: `movement:${movement.id}`,
      row_kind: 'movement' as const,
      label: isDeposit ? 'Suprimento' : 'Sangria',
      title: isDeposit ? 'Suprimento realizado' : 'Sangria realizada',
      subtitle: String(movement.notes ?? '').trim() || (isDeposit ? 'Entrada na gaveta' : 'Retirada da gaveta'),
      signed_amount: isDeposit ? Number(movement.amount ?? 0) : -Number(movement.amount ?? 0),
      happened_at: movement.created_at,
      icon_kind: (isDeposit ? 'deposit' : 'withdrawal') as CaixaHistoryIconKind,
      icon_tone: (isDeposit ? 'purple' : 'red') as CaixaHistoryIconTone,
      notes: movement.notes ?? null,
      movement_id: String(movement.id),
      chips: [],
    };
  });

  const dayBoardComandaIds = new Set(
    dayBoardItems.map((item) => item.billing.comanda_id).filter(Boolean).map(String),
  );

  const billingRows: CaixaSessionHistoryItem[] = dayBoardItems
    .filter((item) => item.billing.receivable_status !== 'paid' && !item.billing.finance_handoff_at)
    .map((item) => {
      const meta = dayBoardBillingMeta(item);
      const saleChannel = resolveSaleChannel(item.origin_type);
      const hasService = (item.services ?? []).length > 0;
      const composition = resolveComposition(false, hasService) ?? (saleChannel === 'agenda' ? 'service' : null);
      const chips = buildHistoryChips({
        saleChannel: saleChannel ?? 'agenda',
        composition,
        originType: item.origin_type,
      });
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
        comanda_id: item.billing.comanda_id ? String(item.billing.comanda_id) : null,
        receivable_id: item.billing.active_receivable_id
          ? String(item.billing.active_receivable_id)
          : null,
        origin_type: item.origin_type,
        origin_id: item.origin_id,
        sale_channel: saleChannel ?? 'agenda',
        composition,
        chips,
      };
    });

  const openComandaRows: CaixaSessionHistoryItem[] = openComandas
    .filter((comanda) => {
      const id = String(comanda.id ?? '');
      if (!id || dayBoardComandaIds.has(id) || paymentComandaIds.has(id)) return false;
      if (comanda.finance_handoff_at) return false;
      return true;
    })
    .map((comanda) => {
      const guardian = comanda.guardian as { full_name?: string } | null;
      const pet = comanda.pet as { name?: string } | null;
      const who = [guardian?.full_name, pet?.name].filter(Boolean).join(' • ') || 'Comanda';
      const shortId = String(comanda.id ?? '').slice(0, 8);
      const comandaId = String(comanda.id);
      const originType = comanda.origin_type ? String(comanda.origin_type) : null;
      const saleChannel = resolveSaleChannel(originType);
      const { has_product, has_service } = compositionFromComandaRecord(comanda);
      const composition = resolveComposition(has_product, has_service);
      const chips = buildHistoryChips({ saleChannel, composition, originType });
      const title =
        saleChannel === 'quick_sale'
          ? 'Venda rápida'
          : saleChannel === 'agenda'
            ? 'Comanda aberta'
            : 'Comanda criada';
      return {
        id: `billing:comanda:${comandaId}`,
        row_kind: 'billing' as const,
        label: `${title} — ${who}`,
        title,
        subtitle: `#${shortId} • ${who}`,
        signed_amount: Number(comanda.total_amount ?? 0),
        happened_at: String(comanda.opened_at ?? new Date().toISOString()),
        is_pending: true,
        icon_kind: 'comanda' as const,
        icon_tone: (saleChannel === 'quick_sale' ? 'teal' : 'orange') as CaixaHistoryIconTone,
        comanda_id: comandaId,
        origin_type: originType,
        sale_channel: saleChannel,
        composition,
        chips,
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
