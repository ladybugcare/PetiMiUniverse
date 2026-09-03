import { supabaseAdmin } from '../../config/supabase.js';
import { computeBalances } from './hubInventoryController.js';

export type EncounterStockOutParams = {
  clinicId: string;
  itemId: string;
  lotId: string;
  qty?: number;
  notes?: string | null;
  referenceType: string;
  referenceId: string;
  createdBy?: string | null;
};

export async function assertClinicInventoryItem(clinicId: string, itemId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_inventory_items')
    .select('id, clinic_id, name, sale_amount, cost_amount, deleted_at, active')
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
): Promise<string | null> {
  const lot = await assertClinicInventoryLot(clinicId, lotId);
  if (!lot) return 'Lote inválido para esta clínica.';
  if (lot.item_id !== itemId) return 'Lote não pertence ao item de estoque selecionado.';
  const { byLot } = await computeBalances(clinicId);
  const available = byLot.get(lotId) ?? 0;
  if (available < qty) {
    return `Quantidade insuficiente no lote (disponível: ${available}).`;
  }
  return null;
}

/** Registra saída de estoque vinculada a atendimento/vacinação. */
export async function createEncounterStockOut(
  params: EncounterStockOutParams,
): Promise<{ id: string } | { error: string }> {
  const qty = params.qty ?? 1;
  const stockErr = await validateLotStockForOut(params.clinicId, params.itemId, params.lotId, qty);
  if (stockErr) return { error: stockErr };

  const { data: mov, error: movErr } = await supabaseAdmin
    .from('hub_stock_movements')
    .insert({
      clinic_id: params.clinicId,
      item_id: params.itemId,
      lot_id: params.lotId,
      movement_type: 'encounter_out',
      qty,
      notes: params.notes ?? null,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      created_by: params.createdBy ?? null,
    })
    .select('id')
    .single();

  if (movErr || !mov) {
    return { error: movErr?.message || 'Erro ao registrar baixa de estoque.' };
  }
  return { id: (mov as { id: string }).id };
}
