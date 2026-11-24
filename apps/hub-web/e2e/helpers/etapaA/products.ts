import { QA_CLINIC_ID, PRODUCT_NAMES } from './constants';
import { hubApi } from './apiHub';

export type QaProductSeed = {
  itemId: string;
  lotId: string;
  name: string;
  saleAmount: number;
  qtyOnHand: number;
};

type InventoryItem = {
  id: string;
  name: string;
  sale_amount: number;
  qty_on_hand?: number;
};

async function findProductByName(token: string, name: string): Promise<InventoryItem | null> {
  const res = await hubApi<{ items: InventoryItem[] }>(
    token,
    `/api/hub/inventory/items?clinic_id=${QA_CLINIC_ID}&search=${encodeURIComponent(name)}`,
  );
  return res.items?.find((i) => i.name.trim() === name) ?? null;
}

async function ensureProduct(
  token: string,
  name: string,
  saleAmount: number,
  stockQty: number,
): Promise<QaProductSeed> {
  let item = await findProductByName(token, name);
  if (!item) {
    const created = await hubApi<{ item: InventoryItem }>(token, '/api/hub/inventory/items', {
      method: 'POST',
      body: {
        clinic_id: QA_CLINIC_ID,
        item_kind: 'product',
        name,
        cost_amount: name.includes('Antipulgas') ? 40 : 20,
        sale_amount: saleAmount,
        allow_price_override_on_sale: true,
        initial_lot: {
          received_at: new Date().toISOString().slice(0, 10),
          qty: stockQty,
          lot_code: `QA-ETAPA-A-${Date.now()}`,
        },
      },
    });
    item = created.item;
  }

  const lots = await hubApi<{ lots: Array<{ id: string; item_id: string; qty_on_hand: number }> }>(
    token,
    `/api/hub/inventory/lots?clinic_id=${encodeURIComponent(QA_CLINIC_ID)}`,
  );
  let lot =
    lots.lots?.find((l) => l.item_id === item!.id && (l.qty_on_hand ?? 0) > 0) ??
    lots.lots?.find((l) => l.item_id === item!.id);

  // Reabastece só se não houver lote com saldo — evita PATCH frágil de qty_on_hand.
  if (!lot || (lot.qty_on_hand ?? 0) < 5) {
    try {
      await hubApi(token, `/api/hub/inventory/items/${encodeURIComponent(item!.id)}/lots`, {
        method: 'POST',
        body: {
          clinic_id: QA_CLINIC_ID,
          received_at: new Date().toISOString().slice(0, 10),
          qty: stockQty,
          lot_code: `QA-ETAPA-A-TOPUP-${Date.now()}`,
        },
      });
      const lots2 = await hubApi<{ lots: Array<{ id: string; item_id: string; qty_on_hand: number }> }>(
        token,
        `/api/hub/inventory/lots?clinic_id=${encodeURIComponent(QA_CLINIC_ID)}`,
      );
      lot =
        lots2.lots?.find((l) => l.item_id === item!.id && (l.qty_on_hand ?? 0) > 0) ??
        lots2.lots?.find((l) => l.item_id === item!.id);
    } catch {
      // Mantém lote existente se top-up falhar (estoque já suficiente em runs anteriores).
    }
  }

  if (!lot) throw new Error(`Sem lote ativo para ${name}`);

  return {
    itemId: item.id,
    lotId: lot.id,
    name,
    saleAmount: Number(item.sale_amount ?? saleAmount),
    qtyOnHand: Number(lot.qty_on_hand ?? item.qty_on_hand ?? stockQty),
  };
}

export type QaProductCatalog = {
  antipulgas: QaProductSeed;
  shampoo: QaProductSeed;
};

export async function ensureQaProducts(token: string, stockQty = 40): Promise<QaProductCatalog> {
  const [antipulgas, shampoo] = await Promise.all([
    ensureProduct(token, PRODUCT_NAMES.antipulgas, 100, stockQty),
    ensureProduct(token, PRODUCT_NAMES.shampoo, 50, stockQty),
  ]);
  return { antipulgas, shampoo };
}

export async function readItemQtyOnHand(token: string, itemId: string): Promise<number> {
  const lots = await hubApi<{ lots: Array<{ item_id: string; qty_on_hand: number }> }>(
    token,
    `/api/hub/inventory/lots?clinic_id=${encodeURIComponent(QA_CLINIC_ID)}`,
  );
  const sum = (lots.lots ?? [])
    .filter((l) => l.item_id === itemId)
    .reduce((acc, l) => acc + Number(l.qty_on_hand ?? 0), 0);
  if (sum > 0 || (lots.lots ?? []).some((l) => l.item_id === itemId)) return sum;
  const res = await hubApi<{ items: InventoryItem[] }>(
    token,
    `/api/hub/inventory/items?clinic_id=${QA_CLINIC_ID}`,
  );
  const item = res.items?.find((i) => i.id === itemId);
  return Number(item?.qty_on_hand ?? 0);
}