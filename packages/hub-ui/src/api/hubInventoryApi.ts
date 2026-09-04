import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/inventory';

export type HubItemKind = 'product' | 'medication' | 'vaccine';
export type HubExpiryAlertPolicy = 'none' | 'd30' | 'd60' | 'd90';

export interface HubSupplier {
  id: string;
  clinic_id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface HubManufacturer {
  id: string;
  clinic_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface HubInventoryItem {
  id: string;
  clinic_id: string;
  item_kind: HubItemKind;
  ean: string | null;
  name: string;
  unit_label: string | null;
  manufacturer_id: string | null;
  allow_fractional: boolean;
  store_sku: string | null;
  sale_purpose: string | null;
  product_group: string | null;
  default_supplier_id: string | null;
  description: string | null;
  cost_amount: number;
  sale_amount: number;
  supplier_discount_pct: number;
  max_sale_discount_pct: number;
  allow_price_override_on_sale: boolean;
  generates_staff_commission: boolean;
  min_stock_qty: number;
  expiry_alert_policy: HubExpiryAlertPolicy;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  qty_on_hand?: number;
}

export interface HubStockMovement {
  id: string;
  clinic_id: string;
  item_id: string;
  lot_id: string | null;
  movement_type: string;
  qty: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  lot?: { id: string; lot_code: string | null; expiry_date: string | null } | null;
}

export interface HubInventoryLotRow {
  id: string;
  item_id: string;
  lot_code: string | null;
  expiry_date: string | null;
  received_at: string;
  qty_on_hand: number;
  item: { name: string; item_kind: HubItemKind } | null;
}

export type HubInventoryMovementsReport = {
  period: { from: string; to: string };
  summary: {
    movements_count: number;
    qty_in: number;
    qty_out: number;
    by_type: Record<string, { count: number; qty: number; label: string }>;
  };
  items: Array<{
    id: string;
    item_id: string;
    item_name: string;
    item_kind: string | null;
    unit_label: string | null;
    lot_id: string | null;
    movement_type: string;
    movement_label: string;
    direction: 'in' | 'out' | 'unknown';
    qty: number;
    unit_cost: number | null;
    notes: string | null;
    created_at: string;
  }>;
};

export type HubInventoryAbcReport = {
  period: { from: string; to: string };
  summary: {
    items_count: number;
    total_consumption_value: number;
    class_a: number;
    class_b: number;
    class_c: number;
  };
  items: Array<{
    rank: number;
    item_id: string;
    name: string;
    item_kind: string | null;
    unit_label: string | null;
    qty_out: number;
    consumption_value: number;
    share_pct: number;
    cumulative_pct: number;
    abc_class: 'A' | 'B' | 'C';
  }>;
};

export type HubInventoryTurnoverReport = {
  period: { from: string; to: string };
  period_days: number;
  summary: {
    items_count: number;
    with_outflow: number;
    avg_turnover: number | null;
  };
  items: Array<{
    item_id: string;
    name: string;
    item_kind: string;
    unit_label: string | null;
    qty_on_hand: number;
    qty_in: number;
    qty_out: number;
    avg_stock: number;
    turnover_rate: number | null;
    days_of_cover: number | null;
  }>;
};

export const hubInventoryApi = {
  suppliers: {
    list(clinicId: string) {
      return apiRequest(`${base}/suppliers?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{ suppliers: HubSupplier[] }>;
    },
    create(payload: {
      clinic_id: string;
      name: string;
      tax_id?: string | null;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
    }) {
      return apiRequest(`${base}/suppliers`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ supplier: HubSupplier }>;
    },
    patch(
      id: string,
      payload: {
        clinic_id: string;
        name?: string;
        tax_id?: string | null;
        phone?: string | null;
        email?: string | null;
        notes?: string | null;
        active?: boolean;
        archived?: boolean;
      }
    ) {
      return apiRequest(`${base}/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }) as Promise<{ supplier: HubSupplier }>;
    },
  },
  manufacturers: {
    list(clinicId: string) {
      return apiRequest(`${base}/manufacturers?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{ manufacturers: HubManufacturer[] }>;
    },
    create(payload: { clinic_id: string; name: string }) {
      return apiRequest(`${base}/manufacturers`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ manufacturer: HubManufacturer }>;
    },
    patch(id: string, payload: { clinic_id: string; name?: string; archived?: boolean }) {
      return apiRequest(`${base}/manufacturers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }) as Promise<{ manufacturer: HubManufacturer }>;
    },
  },
  items: {
    list(clinicId: string, bustCache = false, itemKind?: HubItemKind, search?: string) {
      const p = new URLSearchParams({ clinic_id: clinicId });
      if (bustCache) p.set('_', String(Date.now()));
      if (itemKind) p.set('item_kind', itemKind);
      if (search?.trim()) p.set('search', search.trim());
      return apiRequest(`${base}/items?${p}`) as Promise<{ items: HubInventoryItem[] }>;
    },
    create(payload: {
      clinic_id: string;
      item_kind: HubItemKind;
      ean?: string | null;
      name: string;
      unit_label?: string | null;
      manufacturer_id?: string | null;
      allow_fractional?: boolean;
      store_sku?: string | null;
      sale_purpose?: string | null;
      product_group?: string | null;
      default_supplier_id?: string | null;
      description?: string | null;
      cost_amount: number;
      sale_amount: number;
      supplier_discount_pct?: number;
      max_sale_discount_pct?: number;
      allow_price_override_on_sale?: boolean;
      generates_staff_commission?: boolean;
      min_stock_qty?: number;
      expiry_alert_policy?: HubExpiryAlertPolicy;
      initial_lot?: {
        received_at: string;
        expiry_date?: string | null;
        qty: number;
        lot_code?: string | null;
      } | null;
    }) {
      return apiRequest(`${base}/items`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ item: HubInventoryItem }>;
    },
    patch(
      id: string,
      payload: {
        clinic_id: string;
        item_kind?: HubItemKind;
        ean?: string | null;
        name?: string;
        unit_label?: string | null;
        manufacturer_id?: string | null;
        allow_fractional?: boolean;
        store_sku?: string | null;
        sale_purpose?: string | null;
        product_group?: string | null;
        default_supplier_id?: string | null;
        description?: string | null;
        cost_amount?: number;
        sale_amount?: number;
        supplier_discount_pct?: number;
        max_sale_discount_pct?: number;
        allow_price_override_on_sale?: boolean;
        generates_staff_commission?: boolean;
        min_stock_qty?: number;
        expiry_alert_policy?: HubExpiryAlertPolicy;
        active?: boolean;
        archived?: boolean;
      }
    ) {
      return apiRequest(`${base}/items/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }) as Promise<{ item: HubInventoryItem }>;
    },
  },
  movements: {
    list(
      clinicId: string,
      direction: 'all' | 'in' | 'out' = 'all',
      itemId?: string,
      opts?: { from?: string; to?: string; days?: number }
    ) {
      const p = new URLSearchParams({ clinic_id: clinicId, direction });
      if (itemId) p.set('item_id', itemId);
      if (opts?.from) p.set('from', opts.from);
      if (opts?.to) p.set('to', opts.to);
      if (opts?.days != null) p.set('days', String(opts.days));
      return apiRequest(`${base}/movements?${p}`) as Promise<{ movements: HubStockMovement[] }>;
    },
    create(payload: {
      clinic_id: string;
      item_id: string;
      lot_id?: string | null;
      movement_type: 'purchase_in' | 'adjustment_in' | 'adjustment_out' | 'sale_out' | 'encounter_out';
      qty: number;
      unit_cost?: number | null;
      notes?: string | null;
      reference_type?: string | null;
      reference_id?: string | null;
      new_lot?: { lot_code?: string | null; expiry_date?: string | null; received_at: string };
    }) {
      return apiRequest(`${base}/movements`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ movement: HubStockMovement }>;
    },
  },
  lots: {
    list(clinicId: string) {
      return apiRequest(`${base}/lots?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{ lots: HubInventoryLotRow[] }>;
    },
    expiring(clinicId: string, withinDays = 30, opts?: { byPolicy?: boolean }) {
      const p = new URLSearchParams({
        clinic_id: clinicId,
        within_days: String(withinDays),
      });
      if (opts?.byPolicy) p.set('by_policy', '1');
      return apiRequest(`${base}/lots/expiring?${p}`) as Promise<{ lots: HubInventoryLotRow[] }>;
    },
  },
  reports: {
    lowStock(clinicId: string) {
      return apiRequest(`${base}/reports/low-stock?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{ items: HubInventoryItem[] }>;
    },
    movements(clinicId: string, opts?: { days?: number; from?: string; to?: string; direction?: 'all' | 'in' | 'out' }) {
      const p = new URLSearchParams({ clinic_id: clinicId });
      if (opts?.days != null) p.set('days', String(opts.days));
      if (opts?.from) p.set('from', opts.from);
      if (opts?.to) p.set('to', opts.to);
      if (opts?.direction) p.set('direction', opts.direction);
      return apiRequest(`${base}/reports/movements?${p}`) as Promise<HubInventoryMovementsReport>;
    },
    abc(clinicId: string, opts?: { days?: number; from?: string; to?: string }) {
      const p = new URLSearchParams({ clinic_id: clinicId });
      if (opts?.days != null) p.set('days', String(opts.days));
      if (opts?.from) p.set('from', opts.from);
      if (opts?.to) p.set('to', opts.to);
      return apiRequest(`${base}/reports/abc?${p}`) as Promise<HubInventoryAbcReport>;
    },
    turnover(clinicId: string, opts?: { days?: number; from?: string; to?: string }) {
      const p = new URLSearchParams({ clinic_id: clinicId });
      if (opts?.days != null) p.set('days', String(opts.days));
      if (opts?.from) p.set('from', opts.from);
      if (opts?.to) p.set('to', opts.to);
      return apiRequest(`${base}/reports/turnover?${p}`) as Promise<HubInventoryTurnoverReport>;
    },
  },
};
