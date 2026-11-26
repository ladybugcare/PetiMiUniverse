/**
 * Etapa B — agregações comerciais líquidas para relatórios.
 *
 * Fontes (não confundir comercial × financeiro):
 * - Venda: hub_receivables.created_at (= data da cobrança) + hub_receivable_lines
 * - Devolução comercial: hub_product_return_events + rateio commercialReturnForLines
 *   (NÃO hub_financial_adjustment_lines — essa guarda rateio financeiro e some quando refund=0)
 * - COGS: somente unit_cost_amount; ausência = custo não registrado (margem incompleta)
 * - Unidade: filtro estrito; null = "Sem unidade atribuída"
 */

import { supabaseAdmin } from '../../config/supabase.js';
import {
  commercialReturnForLines,
  round2Money,
} from './hubReceivableFinancialBalance.js';

export const REPORT_PAGE_SIZE = 1000;

export function round2Report(n: number): number {
  return round2Money(n);
}

export function reportDayStartIso(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

export function reportDayEndIso(ymd: string): string {
  return `${ymd}T23:59:59.999Z`;
}

export type ReportUnitFilter =
  | { mode: 'unit'; unitId: string }
  | { mode: 'unassigned' }
  | { mode: 'clinic' };

export function matchesReportUnit(
  rowUnitId: string | null | undefined,
  filter: ReportUnitFilter,
): boolean {
  if (filter.mode === 'clinic') return true;
  if (filter.mode === 'unassigned') return rowUnitId == null || rowUnitId === '';
  return rowUnitId === filter.unitId;
}

/** Paginação completa PostgREST com ordenação estável. */
export async function fetchAllSupabaseRows<T extends Record<string, unknown>>(opts: {
  table: string;
  select: string;
  apply: (q: any) => any;
  orderColumns?: Array<{ column: string; ascending?: boolean }>;
  pageSize?: number;
}): Promise<{ rows: T[]; error: string | null }> {
  const pageSize = opts.pageSize ?? REPORT_PAGE_SIZE;
  const orderColumns = opts.orderColumns ?? [
    { column: 'created_at', ascending: true },
    { column: 'id', ascending: true },
  ];
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    let q = supabaseAdmin.from(opts.table).select(opts.select);
    q = opts.apply(q);
    for (const o of orderColumns) {
      q = q.order(o.column, { ascending: o.ascending ?? true });
    }
    const { data, error } = await q.range(from, to);
    if (error) return { rows, error: error.message };
    const chunk = (data ?? []) as unknown as T[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { rows, error: null };
}

export type SaleLineRow = {
  id: string;
  receivable_id: string;
  line_kind: string | null;
  hub_inventory_item_id: string | null;
  hub_service_type_id: string | null;
  description: string | null;
  quantity: number | string | null;
  line_total: number | string | null;
  unit_cost_amount: number | string | null;
  /** Snapshot de comissão (null = linha pré-implante / fora do regime). */
  commission_staff_member_id?: string | null;
  commission_staff_source?: string | null;
  commission_attributed_at?: string | null;
  commission_rule_id?: string | null;
  commission_rule_basis?: string | null;
  commission_rule_rate?: number | string | null;
  commission_basis_amount?: number | string | null;
  commission_original_amount?: number | string | null;
  commission_accrued_at?: string | null;
};

const SALE_LINE_SELECT =
  'id, receivable_id, line_kind, hub_inventory_item_id, hub_service_type_id, description, quantity, line_total, unit_cost_amount, commission_staff_member_id, commission_staff_source, commission_attributed_at, commission_rule_id, commission_rule_basis, commission_rule_rate, commission_basis_amount, commission_original_amount, commission_accrued_at';

export type ReceivableHeaderRow = {
  id: string;
  unit_id: string | null;
  created_at: string;
  status: string;
  original_amount: number | string | null;
  net_amount_at_sale: number | string | null;
  final_amount: number | string | null;
  returned_amount: number | string | null;
  deleted_at?: string | null;
};

export type ReturnEventRow = {
  id: string;
  receivable_id: string;
  receivable_line_id: string;
  condition: 'sellable' | 'unsellable' | string;
  qty?: number | string | null;
  created_at: string;
};

export type AdjustmentHeaderRow = {
  id: string;
  receivable_id: string | null;
  adjustment_type: string;
  amount: number | string;
  created_at: string;
  payment_id: string | null;
};

export type ProductAgg = {
  item_id: string | null;
  name: string;
  item_kind: string | null;
  quantity_sold: number;
  quantity_returned: number;
  quantity_net: number;
  revenue_gross: number;
  returns_commercial: number;
  revenue_net: number;
  cogs_recorded: number;
  cogs_recovered: number;
  cogs_net: number;
  cost_unregistered_revenue: number;
  cost_unregistered_qty: number;
  margin_complete: boolean;
  margin: number | null;
  margin_pct: number | null;
};

export type CommercialPeriodTotals = {
  revenue_gross: number;
  returns_commercial: number;
  revenue_net: number;
  cogs_recorded: number;
  cogs_recovered: number;
  cogs_net: number;
  quantity_sold: number;
  quantity_returned: number;
  quantity_net: number;
  cost_unregistered_revenue: number;
  margin_complete: boolean;
  margin: number | null;
  margin_pct: number | null;
  unallocated_financial_refunds: number;
  receivables_sold_count: number;
  returns_count: number;
  legacy_snapshot_incomplete_count: number;
};

/** Líquido na venda: snapshot confiável ou reconstrução; marca legado incompleto. */
export function netAtSaleFromHeader(h: ReceivableHeaderRow): {
  net: number;
  snapshot_reliable: boolean;
  reconstruction_used: boolean;
} {
  if (h.net_amount_at_sale != null && Number.isFinite(Number(h.net_amount_at_sale))) {
    return { net: round2Report(Number(h.net_amount_at_sale)), snapshot_reliable: true, reconstruction_used: false };
  }
  const final = Number(h.final_amount ?? 0);
  const returned = Number(h.returned_amount ?? 0);
  // Reconstrução só quando returned>0 ou final parece líquido residual; sem inventar.
  if (returned > 0.009 || final >= 0) {
    return {
      net: round2Report(final + returned),
      snapshot_reliable: false,
      reconstruction_used: true,
    };
  }
  return { net: 0, snapshot_reliable: false, reconstruction_used: false };
}

/** Valor comercial de uma linha devolvida (mesma fórmula da RPC 164). */
export function commercialAmountForReturnedLine(opts: {
  lineTotal: number;
  originalAmount: number;
  netAmountAtSale: number;
}): number {
  return commercialReturnForLines({
    lineTotals: [opts.lineTotal],
    originalAmount: opts.originalAmount,
    netAmountAtSale: opts.netAmountAtSale,
  });
}

function emptyProductAgg(itemId: string | null, name: string, itemKind: string | null): ProductAgg {
  return {
    item_id: itemId,
    name,
    item_kind: itemKind,
    quantity_sold: 0,
    quantity_returned: 0,
    quantity_net: 0,
    revenue_gross: 0,
    returns_commercial: 0,
    revenue_net: 0,
    cogs_recorded: 0,
    cogs_recovered: 0,
    cogs_net: 0,
    cost_unregistered_revenue: 0,
    cost_unregistered_qty: 0,
    margin_complete: true,
    margin: 0,
    margin_pct: null,
  };
}

function finalizeProductAgg(agg: ProductAgg): ProductAgg {
  agg.quantity_net = round2Report(agg.quantity_sold - agg.quantity_returned);
  agg.revenue_net = round2Report(agg.revenue_gross - agg.returns_commercial);
  agg.cogs_net = round2Report(agg.cogs_recorded - agg.cogs_recovered);
  agg.margin_complete = agg.cost_unregistered_qty < 0.0001 && agg.cost_unregistered_revenue < 0.009;
  if (agg.margin_complete) {
    agg.margin = round2Report(agg.revenue_net - agg.cogs_net);
    agg.margin_pct =
      Math.abs(agg.revenue_net) > 0.009 ? round2Report((agg.margin / agg.revenue_net) * 100) : null;
  } else {
    agg.margin = null;
    agg.margin_pct = null;
  }
  return agg;
}

/**
 * Carrega vendas e devoluções no período de forma independente.
 */
export async function loadCommercialPeriodBundle(opts: {
  clinicId: string;
  unitFilter: ReportUnitFilter;
  fromYmd: string;
  toYmd: string;
}): Promise<
  | {
      ok: true;
      salesHeaders: ReceivableHeaderRow[];
      saleLines: SaleLineRow[];
      returnEvents: ReturnEventRow[];
      returnLinesById: Map<string, SaleLineRow>;
      returnHeadersById: Map<string, ReceivableHeaderRow>;
      unallocatedFinancialRefunds: number;
      unallocatedFinancialRefundRows: AdjustmentHeaderRow[];
      legacy_snapshot_incomplete_count: number;
    }
  | { ok: false; error: string }
> {
  const fromIso = reportDayStartIso(opts.fromYmd);
  const toIso = reportDayEndIso(opts.toYmd);

  const applyUnit = (q: any) => {
    if (opts.unitFilter.mode === 'unit') return q.eq('unit_id', opts.unitFilter.unitId);
    if (opts.unitFilter.mode === 'unassigned') return q.is('unit_id', null);
    return q;
  };

  const salesRes = await fetchAllSupabaseRows<ReceivableHeaderRow>({
    table: 'hub_receivables',
    select:
      'id, unit_id, created_at, status, original_amount, net_amount_at_sale, final_amount, returned_amount',
    apply: (q) =>
      applyUnit(
        q
          .eq('clinic_id', opts.clinicId)
          .is('deleted_at', null)
          .neq('status', 'cancelled')
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
      ),
  });
  if (salesRes.error) return { ok: false, error: salesRes.error };

  let legacyIncomplete = 0;
  for (const h of salesRes.rows) {
    const n = netAtSaleFromHeader(h);
    if (!n.snapshot_reliable) legacyIncomplete += 1;
  }

  const saleIds = salesRes.rows.map((r) => r.id);
  const saleLines: SaleLineRow[] = [];
  for (let i = 0; i < saleIds.length; i += 200) {
    const chunk = saleIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const lr = await fetchAllSupabaseRows<SaleLineRow>({
      table: 'hub_receivable_lines',
      select: SALE_LINE_SELECT,
      apply: (q) => q.eq('clinic_id', opts.clinicId).in('receivable_id', chunk),
      orderColumns: [{ column: 'id', ascending: true }],
    });
    if (lr.error) return { ok: false, error: lr.error };
    saleLines.push(...lr.rows);
  }

  const retRes = await fetchAllSupabaseRows<ReturnEventRow>({
    table: 'hub_product_return_events',
    select: 'id, receivable_id, receivable_line_id, condition, qty, created_at',
    apply: (q) =>
      q.eq('clinic_id', opts.clinicId).gte('created_at', fromIso).lte('created_at', toIso),
  });
  if (retRes.error) return { ok: false, error: retRes.error };

  const returnRecIds = [...new Set(retRes.rows.map((r) => r.receivable_id))];
  const returnHeadersById = new Map<string, ReceivableHeaderRow>();
  for (let i = 0; i < returnRecIds.length; i += 200) {
    const chunk = returnRecIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const hr = await fetchAllSupabaseRows<ReceivableHeaderRow>({
      table: 'hub_receivables',
      select:
        'id, unit_id, created_at, status, original_amount, net_amount_at_sale, final_amount, returned_amount',
      apply: (q) => q.eq('clinic_id', opts.clinicId).in('id', chunk).is('deleted_at', null),
      orderColumns: [{ column: 'id', ascending: true }],
    });
    if (hr.error) return { ok: false, error: hr.error };
    for (const h of hr.rows) {
      returnHeadersById.set(h.id, h);
      const n = netAtSaleFromHeader(h);
      if (!n.snapshot_reliable) legacyIncomplete += 1;
    }
  }

  const returnEvents = retRes.rows.filter((ev) => {
    const h = returnHeadersById.get(ev.receivable_id);
    if (!h) return false;
    return matchesReportUnit(h.unit_id, opts.unitFilter);
  });

  const returnLineIds = [...new Set(returnEvents.map((e) => e.receivable_line_id))];
  const returnLinesById = new Map<string, SaleLineRow>();
  for (let i = 0; i < returnLineIds.length; i += 200) {
    const chunk = returnLineIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const lr = await fetchAllSupabaseRows<SaleLineRow>({
      table: 'hub_receivable_lines',
      select: SALE_LINE_SELECT,
      apply: (q) => q.eq('clinic_id', opts.clinicId).in('id', chunk),
      orderColumns: [{ column: 'id', ascending: true }],
    });
    if (lr.error) return { ok: false, error: lr.error };
    for (const l of lr.rows) returnLinesById.set(l.id, l);
  }

  // Refunds financeiros sem vínculo de linha → Não alocado (financeiro)
  const adjHeadersRes = await fetchAllSupabaseRows<AdjustmentHeaderRow>({
    table: 'hub_financial_adjustments',
    select: 'id, receivable_id, adjustment_type, amount, created_at, payment_id',
    apply: (q) =>
      q
        .eq('clinic_id', opts.clinicId)
        .eq('adjustment_type', 'refund')
        .gte('created_at', fromIso)
        .lte('created_at', toIso),
  });
  if (adjHeadersRes.error) return { ok: false, error: adjHeadersRes.error };

  const refundAdjIds = adjHeadersRes.rows.map((a) => a.id);
  const linkedAdjIds = new Set<string>();
  for (let i = 0; i < refundAdjIds.length; i += 200) {
    const chunk = refundAdjIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const linked = await fetchAllSupabaseRows<{ adjustment_id: string }>({
      table: 'hub_financial_adjustment_lines',
      select: 'adjustment_id',
      apply: (q) => q.eq('clinic_id', opts.clinicId).in('adjustment_id', chunk),
      orderColumns: [{ column: 'id', ascending: true }],
    });
    if (linked.error) return { ok: false, error: linked.error };
    for (const row of linked.rows) linkedAdjIds.add(String(row.adjustment_id));
  }

  const refundRecIds = [
    ...new Set(adjHeadersRes.rows.map((a) => a.receivable_id).filter((id): id is string => Boolean(id))),
  ];
  const refundRecUnit = new Map<string, string | null>();
  for (let i = 0; i < refundRecIds.length; i += 200) {
    const chunk = refundRecIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const hr = await fetchAllSupabaseRows<{ id: string; unit_id: string | null }>({
      table: 'hub_receivables',
      select: 'id, unit_id',
      apply: (q) => q.eq('clinic_id', opts.clinicId).in('id', chunk),
      orderColumns: [{ column: 'id', ascending: true }],
    });
    if (hr.error) return { ok: false, error: hr.error };
    for (const h of hr.rows) refundRecUnit.set(h.id, h.unit_id);
  }

  const unallocatedFinancialRefundRows: AdjustmentHeaderRow[] = [];
  let unallocatedFinancialRefunds = 0;
  for (const adj of adjHeadersRes.rows) {
    if (linkedAdjIds.has(adj.id)) continue;
    const unitId = adj.receivable_id ? refundRecUnit.get(adj.receivable_id) ?? null : null;
    if (!matchesReportUnit(unitId, opts.unitFilter)) continue;
    unallocatedFinancialRefundRows.push(adj);
    unallocatedFinancialRefunds = round2Report(unallocatedFinancialRefunds + Number(adj.amount ?? 0));
  }

  return {
    ok: true,
    salesHeaders: salesRes.rows,
    saleLines,
    returnEvents,
    returnLinesById,
    returnHeadersById,
    unallocatedFinancialRefunds,
    unallocatedFinancialRefundRows,
    legacy_snapshot_incomplete_count: legacyIncomplete,
  };
}

export function aggregateProductSalesNet(opts: {
  saleLines: SaleLineRow[];
  returnEvents: ReturnEventRow[];
  returnLinesById: Map<string, SaleLineRow>;
  returnHeadersById: Map<string, ReceivableHeaderRow>;
  catalogName: Map<string, string>;
  catalogKind: Map<string, string>;
}): {
  items: ProductAgg[];
  totals: CommercialPeriodTotals;
  mix: { services: number; products: number; other: number; total: number };
} {
  const byItem = new Map<string, ProductAgg>();
  let mixServices = 0;
  let mixProducts = 0;
  let mixOther = 0;

  const bumpMix = (kind: string, amount: number, sign: 1 | -1) => {
    const delta = sign * amount;
    if (kind === 'product') mixProducts = round2Report(mixProducts + delta);
    else if (kind === 'appointment_service' || kind === 'grooming_extra' || kind === 'quote_line') {
      mixServices = round2Report(mixServices + delta);
    } else mixOther = round2Report(mixOther + delta);
  };

  const touchProduct = (
    line: SaleLineRow,
    sign: 1 | -1,
    commercialAmount: number,
    qty: number,
    condition?: string,
  ) => {
    const itemId = (line.hub_inventory_item_id as string | null) ?? null;
    const key = itemId ?? `desc:${String(line.description ?? 'Produto')}`;
    const name = itemId
      ? opts.catalogName.get(itemId) || String(line.description || 'Produto')
      : String(line.description || 'Produto');
    const itemKind = itemId ? opts.catalogKind.get(itemId) ?? null : null;
    const cur = byItem.get(key) ?? emptyProductAgg(itemId, name, itemKind);
    const unitCost =
      line.unit_cost_amount != null && Number.isFinite(Number(line.unit_cost_amount))
        ? Number(line.unit_cost_amount)
        : null;

    if (sign === 1) {
      cur.quantity_sold = round2Report(cur.quantity_sold + qty);
      cur.revenue_gross = round2Report(cur.revenue_gross + commercialAmount);
      if (unitCost != null) {
        cur.cogs_recorded = round2Report(cur.cogs_recorded + qty * unitCost);
      } else {
        cur.cost_unregistered_qty = round2Report(cur.cost_unregistered_qty + qty);
        cur.cost_unregistered_revenue = round2Report(cur.cost_unregistered_revenue + commercialAmount);
      }
    } else {
      cur.quantity_returned = round2Report(cur.quantity_returned + qty);
      cur.returns_commercial = round2Report(cur.returns_commercial + commercialAmount);
      if (condition === 'sellable' && unitCost != null) {
        cur.cogs_recovered = round2Report(cur.cogs_recovered + qty * unitCost);
      } else if (unitCost == null) {
        cur.cost_unregistered_qty = round2Report(cur.cost_unregistered_qty + qty);
        cur.cost_unregistered_revenue = round2Report(cur.cost_unregistered_revenue + commercialAmount);
      }
    }
    byItem.set(key, cur);
  };

  for (const line of opts.saleLines) {
    const kind = String(line.line_kind ?? '');
    const amount = Number(line.line_total ?? 0);
    const qty = Number(line.quantity ?? 0);
    bumpMix(kind, amount, 1);
    if (kind === 'product') touchProduct(line, 1, amount, qty);
  }

  for (const ev of opts.returnEvents) {
    const line = opts.returnLinesById.get(ev.receivable_line_id);
    const header = opts.returnHeadersById.get(ev.receivable_id);
    if (!line || !header) continue;
    const kind = String(line.line_kind ?? '');
    const netInfo = netAtSaleFromHeader(header);
    const original = Number(header.original_amount ?? 0);
    const commercial = commercialAmountForReturnedLine({
      lineTotal: Number(line.line_total ?? 0),
      originalAmount: original > 0.009 ? original : netInfo.net,
      netAmountAtSale: netInfo.net,
    });
    const qty =
      ev.qty != null && Number.isFinite(Number(ev.qty))
        ? Number(ev.qty)
        : Number(line.quantity ?? 0);
    bumpMix(kind, commercial, -1);
    if (kind === 'product') touchProduct(line, -1, commercial, qty, String(ev.condition));
  }

  const items = [...byItem.values()]
    .map(finalizeProductAgg)
    .sort((a, b) => b.revenue_net - a.revenue_net);

  const totals: CommercialPeriodTotals = {
    revenue_gross: round2Report(items.reduce((s, i) => s + i.revenue_gross, 0)),
    returns_commercial: round2Report(items.reduce((s, i) => s + i.returns_commercial, 0)),
    revenue_net: round2Report(items.reduce((s, i) => s + i.revenue_net, 0)),
    cogs_recorded: round2Report(items.reduce((s, i) => s + i.cogs_recorded, 0)),
    cogs_recovered: round2Report(items.reduce((s, i) => s + i.cogs_recovered, 0)),
    cogs_net: round2Report(items.reduce((s, i) => s + i.cogs_net, 0)),
    quantity_sold: round2Report(items.reduce((s, i) => s + i.quantity_sold, 0)),
    quantity_returned: round2Report(items.reduce((s, i) => s + i.quantity_returned, 0)),
    quantity_net: round2Report(items.reduce((s, i) => s + i.quantity_net, 0)),
    cost_unregistered_revenue: round2Report(
      items.reduce((s, i) => s + i.cost_unregistered_revenue, 0),
    ),
    margin_complete: items.every((i) => i.margin_complete),
    margin: null,
    margin_pct: null,
    unallocated_financial_refunds: 0,
    receivables_sold_count: 0,
    returns_count: opts.returnEvents.length,
    legacy_snapshot_incomplete_count: 0,
  };
  if (totals.margin_complete) {
    totals.margin = round2Report(totals.revenue_net - totals.cogs_net);
    totals.margin_pct =
      Math.abs(totals.revenue_net) > 0.009
        ? round2Report((totals.margin / totals.revenue_net) * 100)
        : null;
  }

  return {
    items,
    totals,
    mix: {
      services: mixServices,
      products: mixProducts,
      other: mixOther,
      total: round2Report(mixServices + mixProducts + mixOther),
    },
  };
}

/**
 * Ticket comercial histórico: Σ net_at_sale ÷ nº cobranças do período.
 * Devoluções posteriores não alteram. Legado incompleto é sinalizado.
 */
export function computeHistoricalTicketAverage(headers: ReceivableHeaderRow[]): {
  sales_count: number;
  total_at_sale: number;
  ticket_average: number | null;
  reliable_snapshot_count: number;
  legacy_incomplete_count: number;
  competence: string;
  formula: string;
} {
  const eligible = headers.filter((h) => h.status !== 'cancelled');
  let total = 0;
  let reliable = 0;
  let legacy = 0;
  for (const h of eligible) {
    const n = netAtSaleFromHeader(h);
    total = round2Report(total + n.net);
    if (n.snapshot_reliable) reliable += 1;
    else legacy += 1;
  }
  const count = eligible.length;
  return {
    sales_count: count,
    total_at_sale: total,
    ticket_average: count > 0 ? round2Report(total / count) : null,
    reliable_snapshot_count: reliable,
    legacy_incomplete_count: legacy,
    competence: 'receivable.created_at (data da cobrança gerada)',
    formula:
      'Σ net_amount_at_sale ÷ nº de cobranças do período; devoluções posteriores não alteram o ticket do período da venda',
  };
}

export type SectorAgg = {
  service_group: string;
  lines_count: number;
  quantity: number;
  total: number;
};

export type SectorServiceAgg = {
  service_group: string;
  service_id: string | null;
  name: string;
  lines_count: number;
  quantity: number;
  total: number;
};

export function aggregateMovementBySectorNet(opts: {
  saleLines: SaleLineRow[];
  returnEvents: ReturnEventRow[];
  returnLinesById: Map<string, SaleLineRow>;
  returnHeadersById: Map<string, ReceivableHeaderRow>;
  serviceMeta: Map<string, { name: string; service_group: string }>;
}): {
  by_group: Array<SectorAgg & { share_pct: number }>;
  by_service: SectorServiceAgg[];
  summary: {
    receivables_count: number;
    lines_count: number;
    total: number;
    groups_count: number;
    returns_commercial: number;
  };
} {
  const resolveBucket = (line: SaleLineRow): { service_group: string; service_id: string | null; name: string } => {
    const kind = String(line.line_kind ?? '');
    if (kind === 'product') {
      return {
        service_group: 'produtos',
        service_id: null,
        name: String(line.description || 'Produto').trim() || 'Produto',
      };
    }
    const serviceId = (line.hub_service_type_id as string | null) ?? null;
    if (serviceId) {
      const meta = opts.serviceMeta.get(serviceId);
      return {
        service_group: meta?.service_group ?? 'outros',
        service_id: serviceId,
        name: meta?.name ?? (String(line.description || 'Serviço').trim() || 'Serviço'),
      };
    }
    return {
      service_group: 'outros',
      service_id: null,
      name: String(line.description || 'Outros').trim() || 'Outros',
    };
  };

  const byGroup = new Map<string, SectorAgg>();
  const byService = new Map<string, SectorServiceAgg>();
  let returnsCommercial = 0;

  const apply = (line: SaleLineRow, qty: number, total: number, sign: 1 | -1) => {
    const bucket = resolveBucket(line);
    const signedQty = sign * qty;
    const signedTotal = sign * total;
    if (sign === -1) returnsCommercial = round2Report(returnsCommercial + total);

    const g = byGroup.get(bucket.service_group) ?? {
      service_group: bucket.service_group,
      lines_count: 0,
      quantity: 0,
      total: 0,
    };
    g.lines_count += sign === 1 ? 1 : 0;
    g.quantity = round2Report(g.quantity + signedQty);
    g.total = round2Report(g.total + signedTotal);
    byGroup.set(bucket.service_group, g);

    const serviceKey = bucket.service_id
      ? `svc:${bucket.service_id}`
      : `name:${bucket.service_group}:${bucket.name}`;
    const s = byService.get(serviceKey) ?? {
      service_group: bucket.service_group,
      service_id: bucket.service_id,
      name: bucket.name,
      lines_count: 0,
      quantity: 0,
      total: 0,
    };
    s.lines_count += sign === 1 ? 1 : 0;
    s.quantity = round2Report(s.quantity + signedQty);
    s.total = round2Report(s.total + signedTotal);
    byService.set(serviceKey, s);
  };

  for (const line of opts.saleLines) {
    apply(line, Number(line.quantity ?? 0), Number(line.line_total ?? 0), 1);
  }
  for (const ev of opts.returnEvents) {
    const line = opts.returnLinesById.get(ev.receivable_line_id);
    const header = opts.returnHeadersById.get(ev.receivable_id);
    if (!line || !header) continue;
    const netInfo = netAtSaleFromHeader(header);
    const original = Number(header.original_amount ?? 0);
    const commercial = commercialAmountForReturnedLine({
      lineTotal: Number(line.line_total ?? 0),
      originalAmount: original > 0.009 ? original : netInfo.net,
      netAmountAtSale: netInfo.net,
    });
    const qty =
      ev.qty != null && Number.isFinite(Number(ev.qty))
        ? Number(ev.qty)
        : Number(line.quantity ?? 0);
    apply(line, qty, commercial, -1);
  }

  const grandTotal = round2Report([...byGroup.values()].reduce((acc, g) => acc + g.total, 0));
  const by_group = [...byGroup.values()]
    .map((g) => ({
      ...g,
      share_pct: Math.abs(grandTotal) > 0.009 ? round2Report((g.total / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    by_group,
    by_service: [...byService.values()].sort((a, b) => b.total - a.total).slice(0, 300),
    summary: {
      receivables_count: 0,
      lines_count: opts.saleLines.length,
      total: grandTotal,
      groups_count: by_group.length,
      returns_commercial: returnsCommercial,
    },
  };
}
