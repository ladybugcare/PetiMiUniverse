import { supabaseAdmin } from '../../config/supabase.js';
import { computeBalances } from './hubInventoryController.js';
import {
  notifyLowStockIfCrossed,
  notifyNearlyEmptyLotIfCrossed,
} from './hubInventoryStockAlerts.js';
import { stockQtyFromConsumption } from './hubInventoryContentUtils.js';

export { stockQtyFromConsumption };

export type EncounterStockOutParams = {
  clinicId: string;
  itemId: string;
  lotId: string;
  qty?: number;
  /** Custo unitário no movimento; se omitido, usa cost_amount do catálogo. */
  unitCost?: number | null;
  notes?: string | null;
  referenceType: string;
  referenceId: string;
  createdBy?: string | null;
  /** Quando informado, dispara aviso de embalagem quase vazia após a baixa. */
  contentQty?: number | null;
  contentUnit?: string | null;
  itemName?: string | null;
  unitLabel?: string | null;
};

export async function assertClinicInventoryItem(clinicId: string, itemId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_inventory_items')
    .select(
      'id, clinic_id, name, sale_amount, cost_amount, deleted_at, active, unit_label, content_qty, content_unit, allow_fractional',
    )
    .eq('id', itemId)
    .maybeSingle();
  if (error || !data || data.clinic_id !== clinicId || data.deleted_at) return null;
  return data as {
    id: string;
    clinic_id: string;
    name: string;
    sale_amount: number;
    cost_amount: number;
    deleted_at: string | null;
    active: boolean;
    unit_label: string | null;
    content_qty: number | null;
    content_unit: string | null;
    allow_fractional: boolean;
  };
}

export async function assertClinicInventoryLot(clinicId: string, lotId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_inventory_lots')
    .select('id, clinic_id, item_id, lot_code, expiry_date')
    .eq('id', lotId)
    .maybeSingle();
  if (error || !data || data.clinic_id !== clinicId) return null;
  return data as {
    id: string;
    clinic_id: string;
    item_id: string;
    lot_code: string | null;
    expiry_date: string | null;
  };
}

/** Valida saldo disponível no lote antes de uma saída. */
export async function validateLotStockForOut(
  clinicId: string,
  itemId: string,
  lotId: string,
  qty: number,
  precomputedBalances?: Awaited<ReturnType<typeof computeBalances>>,
): Promise<string | null> {
  const lot = await assertClinicInventoryLot(clinicId, lotId);
  if (!lot) return 'Lote inválido para esta clínica.';
  if (lot.item_id !== itemId) return 'Lote não pertence ao item de estoque selecionado.';
  const { byLot } = precomputedBalances ?? (await computeBalances(clinicId));
  const available = byLot.get(lotId) ?? 0;
  if (available < qty) {
    return `Quantidade insuficiente no lote (disponível: ${available}).`;
  }
  return null;
}

type StockOutMovementType = 'encounter_out' | 'sale_out';

async function createStockOutMovement(
  movementType: StockOutMovementType,
  params: EncounterStockOutParams,
): Promise<{ id: string; skipped?: boolean } | { error: string }> {
  const qty = params.qty ?? 1;

  const { data: existing } = await supabaseAdmin
    .from('hub_stock_movements')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('movement_type', movementType)
    .eq('reference_type', params.referenceType)
    .eq('reference_id', params.referenceId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return { id: existing.id as string, skipped: true };
  }

  const balances = await computeBalances(params.clinicId);
  const qtyBefore = balances.byItem.get(params.itemId) ?? 0;
  const lotQtyBefore = balances.byLot.get(params.lotId) ?? 0;

  const stockErr = await validateLotStockForOut(
    params.clinicId,
    params.itemId,
    params.lotId,
    qty,
    balances,
  );
  if (stockErr) return { error: stockErr };

  let unitCost: number | null =
    params.unitCost != null && Number.isFinite(Number(params.unitCost))
      ? Number(params.unitCost)
      : null;
  if (unitCost == null) {
    const item = await assertClinicInventoryItem(params.clinicId, params.itemId);
    if (item?.cost_amount != null && Number.isFinite(Number(item.cost_amount))) {
      unitCost = Number(item.cost_amount);
    }
  }

  const { data: mov, error: movErr } = await supabaseAdmin
    .from('hub_stock_movements')
    .insert({
      clinic_id: params.clinicId,
      item_id: params.itemId,
      lot_id: params.lotId,
      movement_type: movementType,
      qty,
      unit_cost: unitCost,
      notes: params.notes ?? null,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      created_by: params.createdBy ?? null,
    })
    .select('id')
    .single();

  if (movErr || !mov) {
    if (String(movErr?.message ?? '').includes('uniq_hub_stock_movements_clinic_type_ref')) {
      const { data: again } = await supabaseAdmin
        .from('hub_stock_movements')
        .select('id')
        .eq('clinic_id', params.clinicId)
        .eq('movement_type', movementType)
        .eq('reference_type', params.referenceType)
        .eq('reference_id', params.referenceId)
        .maybeSingle();
      if (again?.id) return { id: again.id as string, skipped: true };
    }
    return { error: movErr?.message || 'Erro ao registrar baixa de estoque.' };
  }

  void notifyLowStockIfCrossed({
    clinicId: params.clinicId,
    itemId: params.itemId,
    qtyBefore,
    qtyAfter: qtyBefore - qty,
  });

  if (movementType === 'encounter_out') {
    void notifyNearlyEmptyLotIfCrossed({
      clinicId: params.clinicId,
      itemId: params.itemId,
      lotId: params.lotId,
      lotQtyBefore,
      lotQtyAfter: lotQtyBefore - qty,
      contentQty: params.contentQty,
      contentUnit: params.contentUnit,
      itemName: params.itemName,
      unitLabel: params.unitLabel,
    });
  }

  return { id: (mov as { id: string }).id };
}

/** Registra saída de estoque vinculada a atendimento/vacinação. */
export async function createEncounterStockOut(
  params: EncounterStockOutParams,
): Promise<{ id: string; skipped?: boolean } | { error: string }> {
  return createStockOutMovement('encounter_out', params);
}

export type SaleStockOutParams = EncounterStockOutParams;

/** Registra saída de estoque por venda (comanda / recebível). */
export async function createSaleStockOut(
  params: SaleStockOutParams,
): Promise<{ id: string; skipped?: boolean } | { error: string }> {
  return createStockOutMovement('sale_out', params);
}

export type SaleStockRestoreParams = {
  clinicId: string;
  itemId: string;
  lotId: string;
  qty: number;
  referenceType: string;
  referenceId: string;
  notes?: string | null;
  createdBy?: string | null;
  unitCost?: number | null;
};

/**
 * Reentrada de estoque (adjustment_in) idempotente por referência.
 * Só deve ser chamada após confirmação explícita de devolução física (revenda)
 * ou reversão comprovada de baixa indevida (ex.: remoção de linha de produto).
 */
export async function restoreSaleStockIn(
  params: SaleStockRestoreParams,
): Promise<{ id: string; skipped?: boolean } | { error: string }> {
  const qty = Number(params.qty);
  if (!(qty > 0)) return { error: 'Quantidade inválida para reentrada de estoque.' };

  const { data: existing } = await supabaseAdmin
    .from('hub_stock_movements')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('movement_type', 'adjustment_in')
    .eq('reference_type', params.referenceType)
    .eq('reference_id', params.referenceId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return { id: existing.id as string, skipped: true };
  }

  const { data: mov, error: movErr } = await supabaseAdmin
    .from('hub_stock_movements')
    .insert({
      clinic_id: params.clinicId,
      item_id: params.itemId,
      lot_id: params.lotId,
      movement_type: 'adjustment_in',
      qty,
      unit_cost: params.unitCost ?? null,
      notes: params.notes ?? null,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      created_by: params.createdBy ?? null,
    })
    .select('id')
    .single();

  if (movErr || !mov) {
    if (String(movErr?.message ?? '').includes('uniq_hub_stock_movements_clinic_type_ref')) {
      const { data: again } = await supabaseAdmin
        .from('hub_stock_movements')
        .select('id')
        .eq('clinic_id', params.clinicId)
        .eq('movement_type', 'adjustment_in')
        .eq('reference_type', params.referenceType)
        .eq('reference_id', params.referenceId)
        .maybeSingle();
      if (again?.id) return { id: again.id as string, skipped: true };
    }
    return { error: movErr?.message || 'Erro ao registrar reentrada de estoque.' };
  }
  return { id: (mov as { id: string }).id };
}

/** Referência canônica de reentrada ao disponível (produto apto a revenda). */
export const RECEIVABLE_PRODUCT_RESTOCK_REF = 'hub_receivable_product_restock';

/** Referência legada / constante de domínio para devolução unsellable (auditoria em hub_product_return_events). */
export const RECEIVABLE_PRODUCT_UNSELLABLE_REF = 'hub_receivable_product_return_unsellable';

export type StockReturnCondition = 'sellable' | 'unsellable';

export type StockReturnLineSpec = {
  line_id: string;
  /** Reserva para devolução parcial; nesta fase só qty integral da linha é aceita. */
  qty?: number;
};

function allowProductReturnTsFallback(): boolean {
  if (process.env.HUB_PRODUCT_RETURN_TS_FALLBACK === '1') return true;
  if (process.env.HUB_PRODUCT_RETURN_TS_FALLBACK === '0') return false;
  return process.env.NODE_ENV === 'test';
}

function isProductReturnRpcUnavailable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    !m.trim() ||
    m.includes('rpc_unavailable') ||
    m.includes('does not exist') ||
    m.includes('could not find the function') ||
    m.includes('schema cache') ||
    m.includes('pgrst202') ||
    m.includes('42883') ||
    m.includes('is not a function')
  );
}

/**
 * Confirma devolução física das linhas de produto (RPC atômica).
 * sellable → adjustment_in + evento; unsellable → só evento (não aumenta disponível).
 */
export async function restoreProductStockForReceivableLines(opts: {
  clinicId: string;
  receivableId: string;
  notes: string;
  createdBy?: string | null;
  lines?: Array<Record<string, unknown>>;
  condition?: StockReturnCondition;
  lineSpecs?: StockReturnLineSpec[];
}): Promise<{ restored: number; skipped: number; unsellable: number; errors: string[] }> {
  const condition: StockReturnCondition = opts.condition ?? 'sellable';

  if (opts.lineSpecs?.length) {
    for (const spec of opts.lineSpecs) {
      if (spec.qty == null) continue;
      // qty parcial bloqueada no fallback e na RPC (só integral); validação fina abaixo se lines vierem.
    }
  }

  const lineIds =
    opts.lineSpecs && opts.lineSpecs.length > 0
      ? opts.lineSpecs.map((s) => s.line_id)
      : null;

  let rpcMsg = '';
  try {
    const rpcRes = await supabaseAdmin.rpc('hub_confirm_receivable_product_return', {
      p_clinic_id: opts.clinicId,
      p_receivable_id: opts.receivableId,
      p_condition: condition,
      p_reason: opts.notes,
      p_created_by: opts.createdBy ?? null,
      p_line_ids: lineIds,
    });
    if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object' && (rpcRes.data as { ok?: boolean }).ok) {
      const body = rpcRes.data as {
        restored?: number;
        skipped?: number;
        unsellable?: number;
      };
      return {
        restored: Number(body.restored ?? 0),
        skipped: Number(body.skipped ?? 0),
        unsellable: Number(body.unsellable ?? 0),
        errors: [],
      };
    }
    rpcMsg = String(rpcRes.error?.message ?? '');
    if (rpcMsg && !isProductReturnRpcUnavailable(rpcMsg)) {
      return { restored: 0, skipped: 0, unsellable: 0, errors: [rpcMsg] };
    }
  } catch (e: unknown) {
    rpcMsg = (e as Error)?.message || 'rpc_unavailable';
    if (!isProductReturnRpcUnavailable(rpcMsg) && !allowProductReturnTsFallback()) {
      return { restored: 0, skipped: 0, unsellable: 0, errors: [rpcMsg] };
    }
  }

  if (!allowProductReturnTsFallback()) {
    return {
      restored: 0,
      skipped: 0,
      unsellable: 0,
      errors: [
        rpcMsg ||
          'RPC hub_confirm_receivable_product_return indisponível; devolução física não registrada.',
      ],
    };
  }

  // Fallback só em test / opt-in — mocks sem RPC. Não é a garantia de produção.
  return restoreProductStockForReceivableLinesTsFallback(opts, condition, lineIds);
}

async function restoreProductStockForReceivableLinesTsFallback(
  opts: {
    clinicId: string;
    receivableId: string;
    notes: string;
    createdBy?: string | null;
    lines?: Array<Record<string, unknown>>;
    lineSpecs?: StockReturnLineSpec[];
  },
  condition: StockReturnCondition,
  lineIds: string[] | null,
): Promise<{ restored: number; skipped: number; unsellable: number; errors: string[] }> {
  let lines = opts.lines;
  if (!lines) {
    const { data, error } = await supabaseAdmin
      .from('hub_receivable_lines')
      .select('*')
      .eq('receivable_id', opts.receivableId)
      .eq('clinic_id', opts.clinicId);
    if (error) return { restored: 0, skipped: 0, unsellable: 0, errors: [error.message] };
    lines = (data ?? []) as Array<Record<string, unknown>>;
  }

  const specByLine = new Map<string, StockReturnLineSpec>();
  if (opts.lineSpecs?.length) {
    for (const spec of opts.lineSpecs) specByLine.set(spec.line_id, spec);
  }

  let restored = 0;
  let skipped = 0;
  let unsellable = 0;
  const errors: string[] = [];
  const stagedEvents: Array<Record<string, unknown>> = [];
  const stagedMovements: Array<{
    clinicId: string;
    itemId: string;
    lotId: string;
    qty: number;
    unitCost: number | null;
    lineId: string;
  }> = [];

  for (const line of lines) {
    if (String(line.line_kind ?? '') !== 'product') continue;
    const lineId = line.id as string | null;
    if (!lineId) continue;
    if (lineIds && !lineIds.includes(lineId)) continue;

    const lineQty = Number(line.quantity ?? 0);
    const spec = specByLine.get(lineId);
    if (spec?.qty != null && Number.isFinite(Number(spec.qty))) {
      const requested = Number(spec.qty);
      if (Math.abs(requested - lineQty) > 0.0001) {
        return {
          restored: 0,
          skipped: 0,
          unsellable: 0,
          errors: [
            `Devolução parcial da linha ${lineId} ainda não é suportada (informe a quantidade integral ${lineQty}).`,
          ],
        };
      }
    }

    const qty = lineQty;
    const itemId = line.hub_inventory_item_id as string | null;
    const lotId = line.hub_inventory_lot_id as string | null;
    if (!itemId || !lotId || !(qty > 0)) continue;

    const { data: existingEvent } = await supabaseAdmin
      .from('hub_product_return_events')
      .select('id, condition')
      .eq('clinic_id', opts.clinicId)
      .eq('receivable_line_id', lineId)
      .maybeSingle();

    if (existingEvent) {
      if (String(existingEvent.condition) !== condition) {
        return {
          restored: 0,
          skipped: 0,
          unsellable: 0,
          errors: [`Linha ${lineId} já devolvida como ${existingEvent.condition}`],
        };
      }
      skipped += 1;
      if (condition === 'unsellable') unsellable += 1;
      continue;
    }

    stagedEvents.push({
      clinic_id: opts.clinicId,
      receivable_id: opts.receivableId,
      receivable_line_id: lineId,
      item_id: itemId,
      lot_id: lotId,
      qty,
      condition,
      reason: opts.notes,
      created_by: opts.createdBy ?? null,
    });

    if (condition === 'unsellable') {
      unsellable += 1;
    } else {
      stagedMovements.push({
        clinicId: opts.clinicId,
        itemId,
        lotId,
        qty,
        unitCost:
          line.unit_cost_amount != null && Number.isFinite(Number(line.unit_cost_amount))
            ? Number(line.unit_cost_amount)
            : null,
        lineId,
      });
    }
  }

  // Simula atomicidade no mock: se qualquer movimento falhar após inserts, devolve erro
  // (em produção a RPC faz rollback real).
  for (const ev of stagedEvents) {
    const { error } = await supabaseAdmin.from('hub_product_return_events').insert(ev);
    if (error) {
      if (String(error.message).includes('uniq_hub_product_return_line')) {
        skipped += 1;
        continue;
      }
      return { restored: 0, skipped: 0, unsellable: 0, errors: [error.message] };
    }
  }

  for (const mov of stagedMovements) {
    const result = await restoreSaleStockIn({
      clinicId: mov.clinicId,
      itemId: mov.itemId,
      lotId: mov.lotId,
      qty: mov.qty,
      referenceType: RECEIVABLE_PRODUCT_RESTOCK_REF,
      referenceId: mov.lineId,
      notes: opts.notes,
      createdBy: opts.createdBy ?? null,
      unitCost: mov.unitCost,
    });
    if ('error' in result) {
      return { restored: 0, skipped: 0, unsellable: 0, errors: [result.error] };
    }
    if (result.skipped) skipped += 1;
    else restored += 1;
  }

  return { restored, skipped, unsellable, errors };
}
