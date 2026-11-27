/**
 * Breakdown informativo do turno de caixa (recebido no período da sessão).
 *
 * Independente da gaveta: PIX/cartão não exigem cash_session_id, então o resumo
 * do turno usa a janela [opened_at, closed_at|agora] + unidade da sessão.
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { round2Money } from './hubReceivableFinancialBalance.js';
import { fetchAllSupabaseRows } from './hubReportCommercialNet.js';

export type ShiftPaymentRow = {
  id: string;
  amount: number;
  payment_method: string;
  receivable_id: string | null;
};

export type ShiftLineRow = {
  receivable_id: string;
  line_kind: string | null;
  hub_service_type_id: string | null;
  hub_inventory_item_id: string | null;
  line_total: number;
};

export type ShiftSectorRow = {
  service_group: string;
  total: number;
  share_pct: number;
};

export type CashSessionShiftBreakdown = {
  window: { from: string; to: string };
  received_total: number;
  totals_by_method: Record<string, number>;
  by_sector: ShiftSectorRow[];
};

function round2(n: number): number {
  return round2Money(n);
}

function resolveSector(
  line: ShiftLineRow,
  serviceMeta: Map<string, { service_group: string }>,
): string {
  const kind = String(line.line_kind ?? '');
  if (kind === 'product' || line.hub_inventory_item_id) return 'produtos';
  const serviceId = line.hub_service_type_id;
  if (serviceId) {
    return serviceMeta.get(serviceId)?.service_group ?? 'outros';
  }
  return 'outros';
}

/** Agrega pagamentos do turno por método e por setor (rateio proporcional nas linhas). */
export function aggregateCashSessionShiftBreakdown(opts: {
  payments: ShiftPaymentRow[];
  lines: ShiftLineRow[];
  serviceMeta: Map<string, { service_group: string }>;
}): Omit<CashSessionShiftBreakdown, 'window'> {
  const totals_by_method: Record<string, number> = {};
  let received_total = 0;

  const linesByReceivable = new Map<string, ShiftLineRow[]>();
  for (const line of opts.lines) {
    const rid = String(line.receivable_id ?? '');
    if (!rid) continue;
    const list = linesByReceivable.get(rid) ?? [];
    list.push(line);
    linesByReceivable.set(rid, list);
  }

  const sectorTotals = new Map<string, number>();

  for (const pay of opts.payments) {
    const amount = round2(Number(pay.amount ?? 0));
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.0001) continue;

    const method = String(pay.payment_method || 'other').trim() || 'other';
    totals_by_method[method] = round2((totals_by_method[method] ?? 0) + amount);
    received_total = round2(received_total + amount);

    const rid = pay.receivable_id ? String(pay.receivable_id) : '';
    const lines = rid ? linesByReceivable.get(rid) ?? [] : [];
    const linesSum = round2(lines.reduce((acc, l) => acc + Number(l.line_total ?? 0), 0));

    if (!lines.length || Math.abs(linesSum) < 0.009) {
      sectorTotals.set('outros', round2((sectorTotals.get('outros') ?? 0) + amount));
      continue;
    }

    let allocated = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const isLast = i === lines.length - 1;
      const share = isLast
        ? round2(amount - allocated)
        : round2(amount * (Number(line.line_total ?? 0) / linesSum));
      allocated = round2(allocated + share);
      const sector = resolveSector(line, opts.serviceMeta);
      sectorTotals.set(sector, round2((sectorTotals.get(sector) ?? 0) + share));
    }
  }

  const by_sector: ShiftSectorRow[] = [...sectorTotals.entries()]
    .map(([service_group, total]) => ({
      service_group,
      total,
      share_pct:
        Math.abs(received_total) > 0.009
          ? round2((total / received_total) * 100)
          : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return { received_total, totals_by_method, by_sector };
}

type PaymentDbRow = {
  id: string;
  amount: number | string | null;
  payment_method: string | null;
  receivable_id: string | null;
  payment_date: string | null;
  receivable?: { id?: string; unit_id?: string | null } | { id?: string; unit_id?: string | null }[] | null;
};

function receivableUnitId(row: PaymentDbRow): string | null {
  const rec = row.receivable;
  if (!rec) return null;
  const one = Array.isArray(rec) ? rec[0] : rec;
  const unit = one?.unit_id;
  return unit == null || unit === '' ? null : String(unit);
}

/** Carrega pagamentos da unidade na janela do turno e agrega método + setor. */
export async function loadCashSessionShiftBreakdown(opts: {
  clinicId: string;
  unitId: string;
  openedAt: string;
  closedAt?: string | null;
  nowIso?: string;
}): Promise<CashSessionShiftBreakdown | { error: string }> {
  const fromIso = opts.openedAt;
  const toIso = opts.closedAt || opts.nowIso || new Date().toISOString();

  const payRes = await fetchAllSupabaseRows<PaymentDbRow>({
    table: 'hub_payments',
    select:
      'id, amount, payment_method, receivable_id, payment_date, receivable:hub_receivables(id, unit_id)',
    apply: (q) =>
      q
        .eq('clinic_id', opts.clinicId)
        .eq('status', 'posted')
        .eq('posting_kind', 'operational')
        .gte('payment_date', fromIso)
        .lte('payment_date', toIso),
    orderColumns: [
      { column: 'payment_date', ascending: true },
      { column: 'id', ascending: true },
    ],
  });
  if (payRes.error) return { error: payRes.error };

  const payments: ShiftPaymentRow[] = [];
  for (const row of payRes.rows) {
    if (receivableUnitId(row) !== opts.unitId) continue;
    payments.push({
      id: String(row.id),
      amount: Number(row.amount ?? 0),
      payment_method: String(row.payment_method ?? 'other'),
      receivable_id: row.receivable_id ? String(row.receivable_id) : null,
    });
  }

  const receivableIds = [
    ...new Set(payments.map((p) => p.receivable_id).filter((id): id is string => Boolean(id))),
  ];

  const lines: ShiftLineRow[] = [];
  for (let i = 0; i < receivableIds.length; i += 200) {
    const chunk = receivableIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const lr = await fetchAllSupabaseRows<{
      receivable_id: string;
      line_kind: string | null;
      hub_service_type_id: string | null;
      hub_inventory_item_id: string | null;
      line_total: number | string | null;
    }>({
      table: 'hub_receivable_lines',
      select:
        'receivable_id, line_kind, hub_service_type_id, hub_inventory_item_id, line_total',
      apply: (q) => q.eq('clinic_id', opts.clinicId).in('receivable_id', chunk),
      orderColumns: [{ column: 'id', ascending: true }],
    });
    if (lr.error) return { error: lr.error };
    for (const line of lr.rows) {
      lines.push({
        receivable_id: String(line.receivable_id),
        line_kind: line.line_kind,
        hub_service_type_id: line.hub_service_type_id ? String(line.hub_service_type_id) : null,
        hub_inventory_item_id: line.hub_inventory_item_id
          ? String(line.hub_inventory_item_id)
          : null,
        line_total: Number(line.line_total ?? 0),
      });
    }
  }

  const serviceIds = [
    ...new Set(lines.map((l) => l.hub_service_type_id).filter((id): id is string => Boolean(id))),
  ];
  const serviceMeta = new Map<string, { service_group: string }>();
  for (let i = 0; i < serviceIds.length; i += 200) {
    const chunk = serviceIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data: services, error } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, service_group')
      .in('id', chunk);
    if (error) return { error: error.message };
    for (const svc of services ?? []) {
      serviceMeta.set(String(svc.id), {
        service_group: String(svc.service_group ?? 'outros').trim() || 'outros',
      });
    }
  }

  const agg = aggregateCashSessionShiftBreakdown({ payments, lines, serviceMeta });
  return {
    window: { from: fromIso, to: toIso },
    ...agg,
  };
}
