import type { HubComandaItem } from '../../api/hubComandaApi';

export type ComandaItemKind = 'service' | 'product';

export type ComandaItemDraft = {
  id: string | null;
  item_kind: ComandaItemKind;
  description: string;
  quantity: string;
  unit_amount: string;
  discount_amount: string;
  line_total: number;
  origin_type: string | null;
  pet_name: string | null;
  hub_service_type_id: string | null;
  hub_inventory_item_id: string | null;
  hub_inventory_lot_id: string | null;
  invoiced: boolean;
  isNew?: boolean;
};

export const NEW_ITEM_KEY_PREFIX = 'new-';

export function parseMoney(s: string): number {
  const n = parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLineTotal(d: ComandaItemDraft): number {
  const qty = parseMoney(d.quantity);
  const unit = parseMoney(d.unit_amount);
  const disc = parseMoney(d.discount_amount);
  return round2(Math.max(0, qty * unit - disc));
}

export function apiItemToDraft(item: HubComandaItem, invoiced: boolean): ComandaItemDraft {
  return {
    id: item.id,
    item_kind: item.item_kind === 'product' ? 'product' : 'service',
    description: item.description,
    quantity: String(item.quantity),
    unit_amount: String(item.unit_amount),
    discount_amount: String(item.discount_amount),
    line_total: item.line_total,
    origin_type: item.origin_type ?? null,
    pet_name: item.pet_name ?? null,
    hub_service_type_id: item.hub_service_type_id ?? null,
    hub_inventory_item_id: item.hub_inventory_item_id ?? null,
    hub_inventory_lot_id: item.hub_inventory_lot_id ?? null,
    invoiced,
  };
}

export function newServiceDraft(): ComandaItemDraft {
  return {
    id: null,
    item_kind: 'service',
    description: '',
    quantity: '1',
    unit_amount: '0',
    discount_amount: '0',
    line_total: 0,
    origin_type: 'manual',
    pet_name: null,
    hub_service_type_id: null,
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    invoiced: false,
    isNew: true,
  };
}

export function newProductDraft(): ComandaItemDraft {
  return {
    id: null,
    item_kind: 'product',
    description: '',
    quantity: '1',
    unit_amount: '0',
    discount_amount: '0',
    line_total: 0,
    origin_type: 'manual',
    pet_name: null,
    hub_service_type_id: null,
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    invoiced: false,
    isNew: true,
  };
}
