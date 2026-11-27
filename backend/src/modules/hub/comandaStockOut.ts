/** Origens de linha de produto cujo estoque já saiu via encounter_out (não repetir sale_out no checkout). */
export function comandaProductOriginAlreadyStockedOut(originType: string | null | undefined): boolean {
  const t = String(originType ?? '');
  return t === 'vaccination' || t === 'medication_product';
}

/**
 * Vacina cobrável na comanda com item de estoque exige lote.
 * Sem lote o checkout não pode faturar (não há encounter_out nem sale_out seguro).
 */
export function vaccinationComandaLineMissingLot(it: {
  item_kind?: string | null;
  origin_type?: string | null;
  hub_inventory_item_id?: string | null;
  hub_inventory_lot_id?: string | null;
}): string | null {
  if (String(it.item_kind ?? '') !== 'product') return null;
  if (String(it.origin_type ?? '') !== 'vaccination') return null;
  const itemId = (it.hub_inventory_item_id as string | null) ?? null;
  const lotId = (it.hub_inventory_lot_id as string | null) ?? null;
  if (itemId && !lotId) {
    return 'Vacina na comanda exige lote. Selecione o lote antes de faturar.';
  }
  return null;
}
