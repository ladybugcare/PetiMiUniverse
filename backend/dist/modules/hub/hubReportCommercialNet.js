"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_PAGE_SIZE = void 0;
exports.round2Report = round2Report;
exports.reportDayStartIso = reportDayStartIso;
exports.reportDayEndIso = reportDayEndIso;
exports.matchesReportUnit = matchesReportUnit;
exports.fetchAllSupabaseRows = fetchAllSupabaseRows;
exports.netAtSaleFromHeader = netAtSaleFromHeader;
exports.commercialAmountForReturnedLine = commercialAmountForReturnedLine;
exports.loadCommercialPeriodBundle = loadCommercialPeriodBundle;
exports.aggregateProductSalesNet = aggregateProductSalesNet;
exports.computeHistoricalTicketAverage = computeHistoricalTicketAverage;
exports.aggregateMovementBySectorNet = aggregateMovementBySectorNet;
const supabase_js_1 = require("../../config/supabase.js");
const hubReceivableFinancialBalance_js_1 = require("./hubReceivableFinancialBalance.js");
exports.REPORT_PAGE_SIZE = 1000;
function round2Report(n) {
    return (0, hubReceivableFinancialBalance_js_1.round2Money)(n);
}
function reportDayStartIso(ymd) {
    return `${ymd}T00:00:00.000Z`;
}
function reportDayEndIso(ymd) {
    return `${ymd}T23:59:59.999Z`;
}
function matchesReportUnit(rowUnitId, filter) {
    if (filter.mode === 'clinic')
        return true;
    if (filter.mode === 'unassigned')
        return rowUnitId == null || rowUnitId === '';
    return rowUnitId === filter.unitId;
}
/** Paginação completa PostgREST com ordenação estável. */
async function fetchAllSupabaseRows(opts) {
    const pageSize = opts.pageSize ?? exports.REPORT_PAGE_SIZE;
    const orderColumns = opts.orderColumns ?? [
        { column: 'created_at', ascending: true },
        { column: 'id', ascending: true },
    ];
    const rows = [];
    for (let from = 0;; from += pageSize) {
        const to = from + pageSize - 1;
        let q = supabase_js_1.supabaseAdmin.from(opts.table).select(opts.select);
        q = opts.apply(q);
        for (const o of orderColumns) {
            q = q.order(o.column, { ascending: o.ascending ?? true });
        }
        const { data, error } = await q.range(from, to);
        if (error)
            return { rows, error: error.message };
        const chunk = (data ?? []);
        rows.push(...chunk);
        if (chunk.length < pageSize)
            break;
    }
    return { rows, error: null };
}
const SALE_LINE_SELECT = 'id, receivable_id, line_kind, hub_inventory_item_id, hub_service_type_id, description, quantity, line_total, unit_cost_amount, commission_staff_member_id, commission_staff_source, commission_attributed_at, commission_rule_id, commission_rule_basis, commission_rule_rate, commission_basis_amount, commission_original_amount, commission_accrued_at';
/** Líquido na venda: snapshot confiável ou reconstrução; marca legado incompleto. */
function netAtSaleFromHeader(h) {
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
function commercialAmountForReturnedLine(opts) {
    return (0, hubReceivableFinancialBalance_js_1.commercialReturnForLines)({
        lineTotals: [opts.lineTotal],
        originalAmount: opts.originalAmount,
        netAmountAtSale: opts.netAmountAtSale,
    });
}
function emptyProductAgg(itemId, name, itemKind) {
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
function finalizeProductAgg(agg) {
    agg.quantity_net = round2Report(agg.quantity_sold - agg.quantity_returned);
    agg.revenue_net = round2Report(agg.revenue_gross - agg.returns_commercial);
    agg.cogs_net = round2Report(agg.cogs_recorded - agg.cogs_recovered);
    agg.margin_complete = agg.cost_unregistered_qty < 0.0001 && agg.cost_unregistered_revenue < 0.009;
    if (agg.margin_complete) {
        agg.margin = round2Report(agg.revenue_net - agg.cogs_net);
        agg.margin_pct =
            Math.abs(agg.revenue_net) > 0.009 ? round2Report((agg.margin / agg.revenue_net) * 100) : null;
    }
    else {
        agg.margin = null;
        agg.margin_pct = null;
    }
    return agg;
}
/**
 * Carrega vendas e devoluções no período de forma independente.
 */
async function loadCommercialPeriodBundle(opts) {
    const fromIso = reportDayStartIso(opts.fromYmd);
    const toIso = reportDayEndIso(opts.toYmd);
    const applyUnit = (q) => {
        if (opts.unitFilter.mode === 'unit')
            return q.eq('unit_id', opts.unitFilter.unitId);
        if (opts.unitFilter.mode === 'unassigned')
            return q.is('unit_id', null);
        return q;
    };
    const salesRes = await fetchAllSupabaseRows({
        table: 'hub_receivables',
        select: 'id, unit_id, created_at, status, original_amount, net_amount_at_sale, final_amount, returned_amount',
        apply: (q) => applyUnit(q
            .eq('clinic_id', opts.clinicId)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .gte('created_at', fromIso)
            .lte('created_at', toIso)),
    });
    if (salesRes.error)
        return { ok: false, error: salesRes.error };
    let legacyIncomplete = 0;
    for (const h of salesRes.rows) {
        const n = netAtSaleFromHeader(h);
        if (!n.snapshot_reliable)
            legacyIncomplete += 1;
    }
    const saleIds = salesRes.rows.map((r) => r.id);
    const saleLines = [];
    for (let i = 0; i < saleIds.length; i += 200) {
        const chunk = saleIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const lr = await fetchAllSupabaseRows({
            table: 'hub_receivable_lines',
            select: SALE_LINE_SELECT,
            apply: (q) => q.eq('clinic_id', opts.clinicId).in('receivable_id', chunk),
            orderColumns: [{ column: 'id', ascending: true }],
        });
        if (lr.error)
            return { ok: false, error: lr.error };
        saleLines.push(...lr.rows);
    }
    const retRes = await fetchAllSupabaseRows({
        table: 'hub_product_return_events',
        select: 'id, receivable_id, receivable_line_id, condition, qty, created_at',
        apply: (q) => q.eq('clinic_id', opts.clinicId).gte('created_at', fromIso).lte('created_at', toIso),
    });
    if (retRes.error)
        return { ok: false, error: retRes.error };
    const returnRecIds = [...new Set(retRes.rows.map((r) => r.receivable_id))];
    const returnHeadersById = new Map();
    for (let i = 0; i < returnRecIds.length; i += 200) {
        const chunk = returnRecIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const hr = await fetchAllSupabaseRows({
            table: 'hub_receivables',
            select: 'id, unit_id, created_at, status, original_amount, net_amount_at_sale, final_amount, returned_amount',
            apply: (q) => q.eq('clinic_id', opts.clinicId).in('id', chunk).is('deleted_at', null),
            orderColumns: [{ column: 'id', ascending: true }],
        });
        if (hr.error)
            return { ok: false, error: hr.error };
        for (const h of hr.rows) {
            returnHeadersById.set(h.id, h);
            const n = netAtSaleFromHeader(h);
            if (!n.snapshot_reliable)
                legacyIncomplete += 1;
        }
    }
    const returnEvents = retRes.rows.filter((ev) => {
        const h = returnHeadersById.get(ev.receivable_id);
        if (!h)
            return false;
        return matchesReportUnit(h.unit_id, opts.unitFilter);
    });
    const returnLineIds = [...new Set(returnEvents.map((e) => e.receivable_line_id))];
    const returnLinesById = new Map();
    for (let i = 0; i < returnLineIds.length; i += 200) {
        const chunk = returnLineIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const lr = await fetchAllSupabaseRows({
            table: 'hub_receivable_lines',
            select: SALE_LINE_SELECT,
            apply: (q) => q.eq('clinic_id', opts.clinicId).in('id', chunk),
            orderColumns: [{ column: 'id', ascending: true }],
        });
        if (lr.error)
            return { ok: false, error: lr.error };
        for (const l of lr.rows)
            returnLinesById.set(l.id, l);
    }
    // Refunds financeiros sem vínculo de linha → Não alocado (financeiro)
    const adjHeadersRes = await fetchAllSupabaseRows({
        table: 'hub_financial_adjustments',
        select: 'id, receivable_id, adjustment_type, amount, created_at, payment_id',
        apply: (q) => q
            .eq('clinic_id', opts.clinicId)
            .eq('adjustment_type', 'refund')
            .gte('created_at', fromIso)
            .lte('created_at', toIso),
    });
    if (adjHeadersRes.error)
        return { ok: false, error: adjHeadersRes.error };
    const refundAdjIds = adjHeadersRes.rows.map((a) => a.id);
    const linkedAdjIds = new Set();
    for (let i = 0; i < refundAdjIds.length; i += 200) {
        const chunk = refundAdjIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const linked = await fetchAllSupabaseRows({
            table: 'hub_financial_adjustment_lines',
            select: 'adjustment_id',
            apply: (q) => q.eq('clinic_id', opts.clinicId).in('adjustment_id', chunk),
            orderColumns: [{ column: 'id', ascending: true }],
        });
        if (linked.error)
            return { ok: false, error: linked.error };
        for (const row of linked.rows)
            linkedAdjIds.add(String(row.adjustment_id));
    }
    const refundRecIds = [
        ...new Set(adjHeadersRes.rows.map((a) => a.receivable_id).filter((id) => Boolean(id))),
    ];
    const refundRecUnit = new Map();
    for (let i = 0; i < refundRecIds.length; i += 200) {
        const chunk = refundRecIds.slice(i, i + 200);
        if (!chunk.length)
            continue;
        const hr = await fetchAllSupabaseRows({
            table: 'hub_receivables',
            select: 'id, unit_id',
            apply: (q) => q.eq('clinic_id', opts.clinicId).in('id', chunk),
            orderColumns: [{ column: 'id', ascending: true }],
        });
        if (hr.error)
            return { ok: false, error: hr.error };
        for (const h of hr.rows)
            refundRecUnit.set(h.id, h.unit_id);
    }
    const unallocatedFinancialRefundRows = [];
    let unallocatedFinancialRefunds = 0;
    for (const adj of adjHeadersRes.rows) {
        if (linkedAdjIds.has(adj.id))
            continue;
        const unitId = adj.receivable_id ? refundRecUnit.get(adj.receivable_id) ?? null : null;
        if (!matchesReportUnit(unitId, opts.unitFilter))
            continue;
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
function aggregateProductSalesNet(opts) {
    const byItem = new Map();
    let mixServices = 0;
    let mixProducts = 0;
    let mixOther = 0;
    const bumpMix = (kind, amount, sign) => {
        const delta = sign * amount;
        if (kind === 'product')
            mixProducts = round2Report(mixProducts + delta);
        else if (kind === 'appointment_service' || kind === 'grooming_extra' || kind === 'quote_line') {
            mixServices = round2Report(mixServices + delta);
        }
        else
            mixOther = round2Report(mixOther + delta);
    };
    const touchProduct = (line, sign, commercialAmount, qty, condition) => {
        const itemId = line.hub_inventory_item_id ?? null;
        const key = itemId ?? `desc:${String(line.description ?? 'Produto')}`;
        const name = itemId
            ? opts.catalogName.get(itemId) || String(line.description || 'Produto')
            : String(line.description || 'Produto');
        const itemKind = itemId ? opts.catalogKind.get(itemId) ?? null : null;
        const cur = byItem.get(key) ?? emptyProductAgg(itemId, name, itemKind);
        const unitCost = line.unit_cost_amount != null && Number.isFinite(Number(line.unit_cost_amount))
            ? Number(line.unit_cost_amount)
            : null;
        if (sign === 1) {
            cur.quantity_sold = round2Report(cur.quantity_sold + qty);
            cur.revenue_gross = round2Report(cur.revenue_gross + commercialAmount);
            if (unitCost != null) {
                cur.cogs_recorded = round2Report(cur.cogs_recorded + qty * unitCost);
            }
            else {
                cur.cost_unregistered_qty = round2Report(cur.cost_unregistered_qty + qty);
                cur.cost_unregistered_revenue = round2Report(cur.cost_unregistered_revenue + commercialAmount);
            }
        }
        else {
            cur.quantity_returned = round2Report(cur.quantity_returned + qty);
            cur.returns_commercial = round2Report(cur.returns_commercial + commercialAmount);
            if (condition === 'sellable' && unitCost != null) {
                cur.cogs_recovered = round2Report(cur.cogs_recovered + qty * unitCost);
            }
            else if (unitCost == null) {
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
        if (kind === 'product')
            touchProduct(line, 1, amount, qty);
    }
    for (const ev of opts.returnEvents) {
        const line = opts.returnLinesById.get(ev.receivable_line_id);
        const header = opts.returnHeadersById.get(ev.receivable_id);
        if (!line || !header)
            continue;
        const kind = String(line.line_kind ?? '');
        const netInfo = netAtSaleFromHeader(header);
        const original = Number(header.original_amount ?? 0);
        const commercial = commercialAmountForReturnedLine({
            lineTotal: Number(line.line_total ?? 0),
            originalAmount: original > 0.009 ? original : netInfo.net,
            netAmountAtSale: netInfo.net,
        });
        const qty = ev.qty != null && Number.isFinite(Number(ev.qty))
            ? Number(ev.qty)
            : Number(line.quantity ?? 0);
        bumpMix(kind, commercial, -1);
        if (kind === 'product')
            touchProduct(line, -1, commercial, qty, String(ev.condition));
    }
    const items = [...byItem.values()]
        .map(finalizeProductAgg)
        .sort((a, b) => b.revenue_net - a.revenue_net);
    const totals = {
        revenue_gross: round2Report(items.reduce((s, i) => s + i.revenue_gross, 0)),
        returns_commercial: round2Report(items.reduce((s, i) => s + i.returns_commercial, 0)),
        revenue_net: round2Report(items.reduce((s, i) => s + i.revenue_net, 0)),
        cogs_recorded: round2Report(items.reduce((s, i) => s + i.cogs_recorded, 0)),
        cogs_recovered: round2Report(items.reduce((s, i) => s + i.cogs_recovered, 0)),
        cogs_net: round2Report(items.reduce((s, i) => s + i.cogs_net, 0)),
        quantity_sold: round2Report(items.reduce((s, i) => s + i.quantity_sold, 0)),
        quantity_returned: round2Report(items.reduce((s, i) => s + i.quantity_returned, 0)),
        quantity_net: round2Report(items.reduce((s, i) => s + i.quantity_net, 0)),
        cost_unregistered_revenue: round2Report(items.reduce((s, i) => s + i.cost_unregistered_revenue, 0)),
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
function computeHistoricalTicketAverage(headers) {
    const eligible = headers.filter((h) => h.status !== 'cancelled');
    let total = 0;
    let reliable = 0;
    let legacy = 0;
    for (const h of eligible) {
        const n = netAtSaleFromHeader(h);
        total = round2Report(total + n.net);
        if (n.snapshot_reliable)
            reliable += 1;
        else
            legacy += 1;
    }
    const count = eligible.length;
    return {
        sales_count: count,
        total_at_sale: total,
        ticket_average: count > 0 ? round2Report(total / count) : null,
        reliable_snapshot_count: reliable,
        legacy_incomplete_count: legacy,
        competence: 'receivable.created_at (data da cobrança gerada)',
        formula: 'Σ net_amount_at_sale ÷ nº de cobranças do período; devoluções posteriores não alteram o ticket do período da venda',
    };
}
function aggregateMovementBySectorNet(opts) {
    const resolveBucket = (line) => {
        const kind = String(line.line_kind ?? '');
        if (kind === 'product') {
            return {
                service_group: 'produtos',
                service_id: null,
                name: String(line.description || 'Produto').trim() || 'Produto',
            };
        }
        const serviceId = line.hub_service_type_id ?? null;
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
    const byGroup = new Map();
    const byService = new Map();
    let returnsCommercial = 0;
    const apply = (line, qty, total, sign) => {
        const bucket = resolveBucket(line);
        const signedQty = sign * qty;
        const signedTotal = sign * total;
        if (sign === -1)
            returnsCommercial = round2Report(returnsCommercial + total);
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
        if (!line || !header)
            continue;
        const netInfo = netAtSaleFromHeader(header);
        const original = Number(header.original_amount ?? 0);
        const commercial = commercialAmountForReturnedLine({
            lineTotal: Number(line.line_total ?? 0),
            originalAmount: original > 0.009 ? original : netInfo.net,
            netAmountAtSale: netInfo.net,
        });
        const qty = ev.qty != null && Number.isFinite(Number(ev.qty))
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
