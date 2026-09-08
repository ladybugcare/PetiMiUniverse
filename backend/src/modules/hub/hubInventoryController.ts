import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { notifyLowStockIfCrossed, notifyExpiryAlertIfNeeded } from './hubInventoryStockAlerts';
import { parseOptionalEan } from './inventoryEan';
import {
  isNearlyEmptyLotBalance,
  roundStockQty,
  stockUnitIsConsumption,
  stockUnitRequiresContent,
} from './hubInventoryContentUtils';

const uuidStr = z.string().uuid();

const moneyProductSchema = z.coerce
  .number()
  .finite()
  .min(0.01, { message: 'Valor mínimo R$ 0,01' })
  .max(99_999_999.99);

const moneyNonNegSchema = z.coerce.number().finite().min(0).max(99_999_999.99);

const pctSchema = z.coerce.number().finite().min(0).max(100);

const itemKindSchema = z.enum(['product', 'medication', 'vaccine']);
const expiryPolicySchema = z.enum(['none', 'd30', 'd60', 'd90']);

const movementInTypes = ['initial_in', 'purchase_in', 'adjustment_in'] as const;
const movementOutTypes = ['adjustment_out', 'sale_out', 'encounter_out'] as const;

export function movementSign(t: string): number {
  if ((movementInTypes as readonly string[]).includes(t)) return 1;
  if ((movementOutTypes as readonly string[]).includes(t)) return -1;
  return 0;
}

async function fetchMovementRows(clinicId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_stock_movements')
    .select('item_id, lot_id, movement_type, qty')
    .eq('clinic_id', clinicId);
  if (error) throw error;
  return data ?? [];
}

export async function computeBalances(clinicId: string) {
  const rows = await fetchMovementRows(clinicId);
  const byItem = new Map<string, number>();
  const byLot = new Map<string, number>();
  for (const r of rows) {
    const sign = movementSign(r.movement_type as string);
    const q = sign * Number(r.qty);
    const itemId = r.item_id as string;
    byItem.set(itemId, (byItem.get(itemId) ?? 0) + q);
    if (r.lot_id) {
      const lid = r.lot_id as string;
      byLot.set(lid, (byLot.get(lid) ?? 0) + q);
    }
  }
  return { byItem, byLot };
}

async function assertClinicItem(clinicId: string, itemId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_inventory_items')
    .select(
      'id, clinic_id, deleted_at, name, min_stock_qty, expiry_alert_policy, unit_label, content_qty, content_unit',
    )
    .eq('id', itemId)
    .maybeSingle();
  if (error || !data || data.clinic_id !== clinicId || data.deleted_at) {
    return null;
  }
  return data;
}


async function assertClinicLot(clinicId: string, lotId: string) {
  const { data, error } = await supabaseAdmin
    .from('hub_inventory_lots')
    .select('id, clinic_id, item_id, lot_code, expiry_date')
    .eq('id', lotId)
    .maybeSingle();
  if (error || !data || data.clinic_id !== clinicId) return null;
  return data;
}

// --- Suppliers ---

export const listHubSuppliers = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('hub_suppliers')
      .select('id, clinic_id, name, party_name, tax_id, phone, email, notes, active, created_at, updated_at, deleted_at')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (error) {
      console.error('[hub_inventory] list suppliers', error);
      return res.status(500).json({ error: 'Erro ao listar fornecedores' });
    }
    return res.json({ suppliers: data ?? [] });
  } catch (e) {
    console.error('[hub_inventory] list suppliers', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

const createSupplierSchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(300),
    party_name: z.string().max(300).optional().nullable(),
    tax_id: z.string().max(64).optional().nullable(),
    phone: z.string().max(64).optional().nullable(),
    email: z.string().email().max(200).optional().nullable().or(z.literal('')),
    notes: z.string().max(4000).optional().nullable(),
  })
  .strict();

export const createHubSupplier = async (req: Request, res: Response) => {
  try {
    const body = createSupplierSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const row = {
      ...body.data,
      party_name: body.data.party_name?.trim() || null,
      email: body.data.email === '' ? null : body.data.email,
      active: true,
      deleted_at: null,
    };
    const { data, error } = await supabaseAdmin.from('hub_suppliers').insert([row]).select('*').single();
    if (error) {
      console.error('[hub_inventory] create supplier', error);
      return res.status(500).json({ error: 'Erro ao criar fornecedor' });
    }
    return res.status(201).json({ supplier: data });
  } catch (e) {
    console.error('[hub_inventory] create supplier', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

const patchSupplierSchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(300).optional(),
    party_name: z.string().max(300).optional().nullable(),
    tax_id: z.string().max(64).optional().nullable(),
    phone: z.string().max(64).optional().nullable(),
    email: z.string().email().max(200).optional().nullable().or(z.literal('')),
    notes: z.string().max(4000).optional().nullable(),
    active: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const patchHubSupplier = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'id inválido' });
    const body = patchSupplierSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const { clinic_id, archived, ...rest } = body.data;
    const patch: Record<string, unknown> = {};
    if (rest.name !== undefined) patch.name = rest.name;
    if (rest.party_name !== undefined) patch.party_name = rest.party_name?.trim() || null;
    if (rest.tax_id !== undefined) patch.tax_id = rest.tax_id;
    if (rest.phone !== undefined) patch.phone = rest.phone;
    if (rest.email !== undefined) patch.email = rest.email === '' ? null : rest.email;
    if (rest.notes !== undefined) patch.notes = rest.notes;
    if (rest.active !== undefined) patch.active = rest.active;
    if (archived === true) patch.deleted_at = new Date().toISOString();
    if (archived === false) patch.deleted_at = null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supabaseAdmin
      .from('hub_suppliers')
      .update(patch)
      .eq('id', idParsed.data)
      .eq('clinic_id', clinic_id)
      .select('*')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    return res.json({ supplier: data });
  } catch (e) {
    console.error('[hub_inventory] patch supplier', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// --- Manufacturers ---

export const listHubManufacturers = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('hub_manufacturers')
      .select('id, clinic_id, name, party_name, tax_id, phone, email, notes, created_at, updated_at, deleted_at')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (error) {
      console.error('[hub_inventory] list manufacturers', error);
      return res.status(500).json({ error: 'Erro ao listar fabricantes' });
    }
    return res.json({ manufacturers: data ?? [] });
  } catch (e) {
    console.error('[hub_inventory] list manufacturers', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

const manufacturerContactSchema = {
  party_name: z.string().max(300).optional().nullable(),
  tax_id: z.string().max(64).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal('')),
  notes: z.string().max(4000).optional().nullable(),
};

const createManufacturerSchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(300),
    ...manufacturerContactSchema,
  })
  .strict();

export const createHubManufacturer = async (req: Request, res: Response) => {
  try {
    const body = createManufacturerSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const row = {
      ...body.data,
      party_name: body.data.party_name?.trim() || null,
      email: body.data.email === '' ? null : body.data.email,
      deleted_at: null,
    };
    const { data, error } = await supabaseAdmin.from('hub_manufacturers').insert([row]).select('*').single();
    if (error) {
      console.error('[hub_inventory] create manufacturer', error);
      return res.status(500).json({ error: 'Erro ao criar fabricante' });
    }
    return res.status(201).json({ manufacturer: data });
  } catch (e) {
    console.error('[hub_inventory] create manufacturer', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

const patchManufacturerSchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(300).optional(),
    archived: z.boolean().optional(),
    ...manufacturerContactSchema,
  })
  .strict();

export const patchHubManufacturer = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'id inválido' });
    const body = patchManufacturerSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const { clinic_id, name, archived, party_name, tax_id, phone, email, notes } = body.data;
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (party_name !== undefined) patch.party_name = party_name?.trim() || null;
    if (tax_id !== undefined) patch.tax_id = tax_id;
    if (phone !== undefined) patch.phone = phone;
    if (email !== undefined) patch.email = email === '' ? null : email;
    if (notes !== undefined) patch.notes = notes;
    if (archived === true) patch.deleted_at = new Date().toISOString();
    if (archived === false) patch.deleted_at = null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supabaseAdmin
      .from('hub_manufacturers')
      .update(patch)
      .eq('id', idParsed.data)
      .eq('clinic_id', clinic_id)
      .select('*')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Fabricante não encontrado' });
    return res.json({ manufacturer: data });
  } catch (e) {
    console.error('[hub_inventory] patch manufacturer', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// --- Items ---

const ITEM_SELECT =
  'id, clinic_id, item_kind, ean, name, unit_label, manufacturer_id, allow_fractional, store_sku, sale_purpose, product_group, default_supplier_id, description, cost_amount, sale_amount, supplier_discount_pct, max_sale_discount_pct, allow_price_override_on_sale, generates_staff_commission, min_stock_qty, expiry_alert_policy, content_qty, content_unit, active, created_at, updated_at, deleted_at';

function normalizeContentFields(opts: {
  unit_label: string | null | undefined;
  content_qty: number | null | undefined;
  content_unit: string | null | undefined;
}): { content_qty: number | null; content_unit: string | null; error?: string } {
  if (stockUnitIsConsumption(opts.unit_label)) {
    return { content_qty: null, content_unit: null };
  }
  const qtyRaw = opts.content_qty;
  const unitRaw = opts.content_unit?.trim() || null;
  const hasQty = qtyRaw != null && Number.isFinite(Number(qtyRaw)) && Number(qtyRaw) > 0;
  const hasUnit = Boolean(unitRaw);
  if (stockUnitRequiresContent(opts.unit_label)) {
    if (!hasQty || !hasUnit) {
      return {
        content_qty: null,
        content_unit: null,
        error: 'Informe o conteúdo por frasco/ampola (quantidade e unidade, ex.: 10 ml).',
      };
    }
  }
  if (hasQty !== hasUnit) {
    return {
      content_qty: null,
      content_unit: null,
      error: 'Preencha quantidade e unidade de conteúdo juntos, ou deixe ambos vazios.',
    };
  }
  if (!hasQty) return { content_qty: null, content_unit: null };
  return { content_qty: Number(qtyRaw), content_unit: unitRaw };
}

const initialLotSchema = z
  .object({
    received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    qty: z.coerce.number().finite().positive(),
    lot_code: z.string().max(120).optional().nullable(),
  })
  .strict();

const createItemSchema = z
  .object({
    clinic_id: uuidStr,
    item_kind: itemKindSchema,
    ean: z.string().max(32).optional().nullable(),
    name: z.string().trim().min(1).max(300),
    unit_label: z.string().max(64).optional().nullable(),
    manufacturer_id: uuidStr.optional().nullable(),
    allow_fractional: z.boolean().optional(),
    store_sku: z.string().max(120).optional().nullable(),
    sale_purpose: z.string().max(120).optional().nullable(),
    product_group: z.string().max(120).optional().nullable(),
    default_supplier_id: uuidStr.optional().nullable(),
    description: z.string().max(4000).optional().nullable(),
    cost_amount: moneyProductSchema,
    sale_amount: moneyProductSchema,
    supplier_discount_pct: pctSchema.optional(),
    max_sale_discount_pct: pctSchema.optional(),
    allow_price_override_on_sale: z.boolean().optional(),
    generates_staff_commission: z.boolean().optional(),
    min_stock_qty: z.coerce.number().finite().min(0).optional(),
    expiry_alert_policy: expiryPolicySchema.optional(),
    content_qty: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : v === null ? null : v),
      z.union([z.coerce.number().finite().positive(), z.null()]).optional(),
    ),
    content_unit: z.string().trim().max(64).optional().nullable(),
    initial_lot: initialLotSchema.optional().nullable(),
  })
  .strict();

export const listHubInventoryItems = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const kind = req.query.item_kind as string | undefined;
    const search = (req.query.search as string | undefined)?.trim().toLowerCase();

    let q = supabaseAdmin
      .from('hub_inventory_items')
      .select(ITEM_SELECT)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (kind && ['product', 'medication', 'vaccine'].includes(kind)) {
      q = q.eq('item_kind', kind);
    }

    const { data: items, error } = await q;
    if (error) {
      console.error('[hub_inventory] list items', error);
      return res.status(500).json({ error: 'Erro ao listar itens' });
    }
    const list = items ?? [];
    const filtered = search
      ? list.filter(
          (it) =>
            (it.name as string).toLowerCase().includes(search) ||
            ((it.ean as string | null) && String(it.ean).includes(search)) ||
            ((it.store_sku as string | null) && String(it.store_sku).toLowerCase().includes(search))
        )
      : list;

    const { byItem } = await computeBalances(clinic_id);
    const enriched = filtered.map((it) => ({
      ...it,
      qty_on_hand: Math.round(((byItem.get(it.id as string) ?? 0) + Number.EPSILON) * 10000) / 10000,
    }));
    return res.json({ items: enriched });
  } catch (e) {
    console.error('[hub_inventory] list items', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const createHubInventoryItem = async (req: Request, res: Response) => {
  try {
    const body = createItemSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const d = body.data;
    let ean: string | null = null;
    try {
      ean = parseOptionalEan(d.ean ?? null);
    } catch (err: unknown) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const content = normalizeContentFields({
      unit_label: d.unit_label ?? null,
      content_qty: d.content_qty,
      content_unit: d.content_unit,
    });
    if (content.error) return res.status(400).json({ error: content.error });

    const row = {
      clinic_id: d.clinic_id,
      item_kind: d.item_kind,
      ean,
      name: d.name,
      unit_label: d.unit_label ?? null,
      manufacturer_id: d.manufacturer_id ?? null,
      allow_fractional: content.content_qty != null ? true : (d.allow_fractional ?? false),
      store_sku: d.store_sku?.trim() || null,
      sale_purpose: d.sale_purpose ?? null,
      product_group: d.product_group ?? null,
      default_supplier_id: d.default_supplier_id ?? null,
      description: d.description ?? null,
      cost_amount: d.cost_amount,
      sale_amount: d.sale_amount,
      supplier_discount_pct: d.supplier_discount_pct ?? 0,
      max_sale_discount_pct: d.max_sale_discount_pct ?? 0,
      allow_price_override_on_sale: d.allow_price_override_on_sale ?? false,
      generates_staff_commission: d.generates_staff_commission ?? false,
      min_stock_qty: d.min_stock_qty ?? 0,
      expiry_alert_policy: d.expiry_alert_policy ?? 'none',
      content_qty: content.content_qty,
      content_unit: content.content_unit,
      active: true,
      deleted_at: null,
    };

    const { data: item, error: insErr } = await supabaseAdmin.from('hub_inventory_items').insert([row]).select(ITEM_SELECT).single();
    if (insErr) {
      if (insErr.code === '23505') return res.status(409).json({ error: 'EAN ou SKU da loja já existe nesta clínica' });
      console.error('[hub_inventory] create item', insErr);
      return res.status(500).json({ error: 'Erro ao criar item' });
    }

    const userId = req.user?.id ?? null;

    if (d.initial_lot && d.initial_lot.qty > 0) {
      const { data: lot, error: lotErr } = await supabaseAdmin
        .from('hub_inventory_lots')
        .insert([
          {
            clinic_id: d.clinic_id,
            item_id: item!.id,
            lot_code: d.initial_lot.lot_code ?? null,
            expiry_date: d.initial_lot.expiry_date ?? null,
            received_at: d.initial_lot.received_at,
          },
        ])
        .select('id')
        .single();
      if (lotErr || !lot) {
        await supabaseAdmin.from('hub_inventory_items').delete().eq('id', item!.id);
        console.error('[hub_inventory] create lot', lotErr);
        return res.status(500).json({ error: 'Erro ao criar lote inicial' });
      }
      const { error: movErr } = await supabaseAdmin.from('hub_stock_movements').insert([
        {
          clinic_id: d.clinic_id,
          item_id: item!.id,
          lot_id: lot.id,
          movement_type: 'initial_in',
          qty: d.initial_lot.qty,
          unit_cost: d.cost_amount,
          notes: 'Lote inicial',
          created_by: userId,
        },
      ]);
      if (movErr) {
        await supabaseAdmin.from('hub_inventory_lots').delete().eq('id', lot.id);
        await supabaseAdmin.from('hub_inventory_items').delete().eq('id', item!.id);
        console.error('[hub_inventory] create initial movement', movErr);
        return res.status(500).json({ error: 'Erro ao registrar movimento inicial' });
      }
    }

    const { byItem } = await computeBalances(d.clinic_id);
    return res.status(201).json({
      item: { ...item, qty_on_hand: byItem.get(item!.id as string) ?? 0 },
    });
  } catch (e) {
    console.error('[hub_inventory] create item', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

const patchItemSchema = z
  .object({
    clinic_id: uuidStr,
    item_kind: itemKindSchema.optional(),
    ean: z.string().max(32).optional().nullable(),
    name: z.string().trim().min(1).max(300).optional(),
    unit_label: z.string().max(64).optional().nullable(),
    manufacturer_id: uuidStr.optional().nullable(),
    allow_fractional: z.boolean().optional(),
    store_sku: z.string().max(120).optional().nullable(),
    sale_purpose: z.string().max(120).optional().nullable(),
    product_group: z.string().max(120).optional().nullable(),
    default_supplier_id: uuidStr.optional().nullable(),
    description: z.string().max(4000).optional().nullable(),
    cost_amount: moneyProductSchema.optional(),
    sale_amount: moneyProductSchema.optional(),
    supplier_discount_pct: pctSchema.optional(),
    max_sale_discount_pct: pctSchema.optional(),
    allow_price_override_on_sale: z.boolean().optional(),
    generates_staff_commission: z.boolean().optional(),
    min_stock_qty: z.coerce.number().finite().min(0).optional(),
    expiry_alert_policy: expiryPolicySchema.optional(),
    content_qty: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : v === null ? null : v),
      z.union([z.coerce.number().finite().positive(), z.null()]).optional(),
    ),
    content_unit: z.string().trim().max(64).optional().nullable(),
    active: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const patchHubInventoryItem = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'id inválido' });
    const body = patchItemSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const d = body.data;
    const existing = await assertClinicItem(d.clinic_id, idParsed.data);
    if (!existing) return res.status(404).json({ error: 'Item não encontrado' });

    const patch: Record<string, unknown> = {};
    if (d.item_kind !== undefined) patch.item_kind = d.item_kind;
    if (d.ean !== undefined) {
      try {
        patch.ean = parseOptionalEan(d.ean);
      } catch (err: unknown) {
        return res.status(400).json({ error: (err as Error).message });
      }
    }
    if (d.name !== undefined) patch.name = d.name;
    if (d.unit_label !== undefined) patch.unit_label = d.unit_label;
    if (d.manufacturer_id !== undefined) patch.manufacturer_id = d.manufacturer_id;
    if (d.allow_fractional !== undefined) patch.allow_fractional = d.allow_fractional;
    if (d.store_sku !== undefined) patch.store_sku = d.store_sku?.trim() || null;
    if (d.sale_purpose !== undefined) patch.sale_purpose = d.sale_purpose;
    if (d.product_group !== undefined) patch.product_group = d.product_group;
    if (d.default_supplier_id !== undefined) patch.default_supplier_id = d.default_supplier_id;
    if (d.description !== undefined) patch.description = d.description;
    if (d.cost_amount !== undefined) patch.cost_amount = d.cost_amount;
    if (d.sale_amount !== undefined) patch.sale_amount = d.sale_amount;
    if (d.supplier_discount_pct !== undefined) patch.supplier_discount_pct = d.supplier_discount_pct;
    if (d.max_sale_discount_pct !== undefined) patch.max_sale_discount_pct = d.max_sale_discount_pct;
    if (d.allow_price_override_on_sale !== undefined) patch.allow_price_override_on_sale = d.allow_price_override_on_sale;
    if (d.generates_staff_commission !== undefined) patch.generates_staff_commission = d.generates_staff_commission;
    if (d.min_stock_qty !== undefined) patch.min_stock_qty = d.min_stock_qty;
    if (d.expiry_alert_policy !== undefined) patch.expiry_alert_policy = d.expiry_alert_policy;
    if (d.active !== undefined) patch.active = d.active;
    if (d.archived === true) patch.deleted_at = new Date().toISOString();
    if (d.archived === false) patch.deleted_at = null;

    if (d.content_qty !== undefined || d.content_unit !== undefined || d.unit_label !== undefined) {
      const nextUnit =
        d.unit_label !== undefined ? d.unit_label : ((existing.unit_label as string | null) ?? null);
      const nextContentQty =
        d.content_qty !== undefined
          ? d.content_qty
          : ((existing.content_qty as number | null | undefined) ?? null);
      const nextContentUnit =
        d.content_unit !== undefined
          ? d.content_unit
          : ((existing.content_unit as string | null | undefined) ?? null);
      const content = normalizeContentFields({
        unit_label: nextUnit,
        content_qty: nextContentQty,
        content_unit: nextContentUnit,
      });
      if (content.error) return res.status(400).json({ error: content.error });
      patch.content_qty = content.content_qty;
      patch.content_unit = content.content_unit;
      if (content.content_qty != null) patch.allow_fractional = true;
    }

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabaseAdmin
      .from('hub_inventory_items')
      .update(patch)
      .eq('id', idParsed.data)
      .eq('clinic_id', d.clinic_id)
      .select(ITEM_SELECT)
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'EAN ou SKU da loja já existe nesta clínica' });
      console.error('[hub_inventory] patch item', error);
      return res.status(500).json({ error: 'Erro ao atualizar item' });
    }
    const { byItem } = await computeBalances(d.clinic_id);
    return res.json({ item: { ...data, qty_on_hand: byItem.get(data!.id as string) ?? 0 } });
  } catch (e) {
    console.error('[hub_inventory] patch item', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// --- Movements ---

const createMovementSchema = z
  .object({
    clinic_id: uuidStr,
    item_id: uuidStr,
    lot_id: uuidStr.optional().nullable(),
    movement_type: z.enum(['purchase_in', 'adjustment_in', 'adjustment_out', 'sale_out', 'encounter_out']),
    qty: z.coerce.number().finite().positive(),
    unit_cost: moneyNonNegSchema.optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    reference_type: z.string().max(64).optional().nullable(),
    reference_id: uuidStr.optional().nullable(),
    new_lot: z
      .object({
        lot_code: z.string().max(120).optional().nullable(),
        expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict()
      .optional(),
  })
  .strict();

export const listHubStockMovements = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const direction = (req.query.direction as string) || 'all';
    const itemId = req.query.item_id as string | undefined;
    const fromRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.from);
    const toRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.to);
    const daysParsed = z.coerce.number().int().min(1).max(366).safeParse(req.query.days);

    let fromIso: string | null = null;
    let toIso: string | null = null;
    if (fromRaw.success && toRaw.success) {
      if (fromRaw.data > toRaw.data) return res.status(400).json({ error: 'from não pode ser maior que to' });
      fromIso = `${fromRaw.data}T00:00:00.000Z`;
      toIso = `${toRaw.data}T23:59:59.999Z`;
    } else if (daysParsed.success) {
      const to = new Date();
      const toYmd = to.toISOString().slice(0, 10);
      const fromDt = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (daysParsed.data - 1)));
      const fromYmd = fromDt.toISOString().slice(0, 10);
      fromIso = `${fromYmd}T00:00:00.000Z`;
      toIso = `${toYmd}T23:59:59.999Z`;
    }

    let q = supabaseAdmin
      .from('hub_stock_movements')
      .select(
        'id, clinic_id, item_id, lot_id, movement_type, qty, unit_cost, reference_type, reference_id, notes, created_by, created_at, lot:hub_inventory_lots(id, lot_code, expiry_date)'
      )
      .eq('clinic_id', clinic_id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (itemId && uuidStr.safeParse(itemId).success) {
      q = q.eq('item_id', itemId);
    }
    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso) q = q.lte('created_at', toIso);

    const { data, error } = await q;
    if (error) {
      console.error('[hub_inventory] list movements', error);
      return res.status(500).json({ error: 'Erro ao listar movimentos' });
    }
    let rows = data ?? [];
    if (direction === 'in') {
      rows = rows.filter((r) => movementSign(r.movement_type as string) > 0);
    } else if (direction === 'out') {
      rows = rows.filter((r) => movementSign(r.movement_type as string) < 0);
    }
    return res.json({ movements: rows });
  } catch (e) {
    console.error('[hub_inventory] list movements', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  initial_in: 'Saldo inicial',
  purchase_in: 'Compra',
  adjustment_in: 'Ajuste (+)',
  adjustment_out: 'Ajuste (−)',
  sale_out: 'Venda',
  encounter_out: 'Consumo clínico',
};

/** Relatório de entradas e saídas no período, com nomes de itens e totais. */
export const getHubInventoryMovementsReport = async (req: Request, res: Response) => {
  try {
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = clinic.data;
    const direction = (req.query.direction as string) || 'all';
    const fromRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.from);
    const toRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.to);
    const daysParsed = z.coerce.number().int().min(1).max(366).safeParse(req.query.days);

    let fromYmd: string;
    let toYmd: string;
    if (fromRaw.success && toRaw.success) {
      if (fromRaw.data > toRaw.data) return res.status(400).json({ error: 'from não pode ser maior que to' });
      fromYmd = fromRaw.data;
      toYmd = toRaw.data;
    } else {
      const n = daysParsed.success ? daysParsed.data : 30;
      const to = new Date();
      toYmd = to.toISOString().slice(0, 10);
      const fromDt = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (n - 1)));
      fromYmd = fromDt.toISOString().slice(0, 10);
    }
    const fromIso = `${fromYmd}T00:00:00.000Z`;
    const toIso = `${toYmd}T23:59:59.999Z`;

    const { data, error } = await supabaseAdmin
      .from('hub_stock_movements')
      .select(
        'id, clinic_id, item_id, lot_id, movement_type, qty, unit_cost, notes, created_at, item:hub_inventory_items(id, name, item_kind, unit_label)'
      )
      .eq('clinic_id', clinic_id)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error('[hub_inventory] movements report', error);
      return res.status(500).json({ error: 'Erro ao carregar relatório de movimentos' });
    }

    let rows = data ?? [];
    if (direction === 'in') {
      rows = rows.filter((r) => movementSign(r.movement_type as string) > 0);
    } else if (direction === 'out') {
      rows = rows.filter((r) => movementSign(r.movement_type as string) < 0);
    }

    const by_type: Record<string, { count: number; qty: number; label: string }> = {};
    let qty_in = 0;
    let qty_out = 0;
    const items = rows.map((r) => {
      const type = String(r.movement_type ?? '');
      const sign = movementSign(type);
      const qty = Number(r.qty ?? 0);
      const cur = by_type[type] ?? { count: 0, qty: 0, label: MOVEMENT_TYPE_LABELS[type] ?? type };
      cur.count += 1;
      cur.qty += qty;
      by_type[type] = cur;
      if (sign > 0) qty_in += qty;
      else if (sign < 0) qty_out += qty;
      const itemEmb = r.item as
        | { id: string; name: string; item_kind: string; unit_label: string | null }
        | { id: string; name: string; item_kind: string; unit_label: string | null }[]
        | null;
      const item = Array.isArray(itemEmb) ? itemEmb[0] ?? null : itemEmb;
      return {
        id: r.id as string,
        item_id: r.item_id as string,
        item_name: item?.name ?? '—',
        item_kind: item?.item_kind ?? null,
        unit_label: item?.unit_label ?? null,
        lot_id: (r.lot_id as string | null) ?? null,
        movement_type: type,
        movement_label: MOVEMENT_TYPE_LABELS[type] ?? type,
        direction: sign > 0 ? 'in' : sign < 0 ? 'out' : 'unknown',
        qty,
        unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
        notes: (r.notes as string | null) ?? null,
        created_at: r.created_at as string,
      };
    });

    return res.json({
      period: { from: fromYmd, to: toYmd },
      summary: {
        movements_count: items.length,
        qty_in,
        qty_out,
        by_type,
      },
      items,
    });
  } catch (e) {
    console.error('[hub_inventory] movements report', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const createHubStockMovement = async (req: Request, res: Response) => {
  try {
    const body = createMovementSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    const d = body.data;
    const item = await assertClinicItem(d.clinic_id, d.item_id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });

    const sign = movementSign(d.movement_type);
    if (sign === 0) return res.status(400).json({ error: 'Tipo de movimento inválido' });

    const { byLot, byItem } = await computeBalances(d.clinic_id);
    const qtyBefore = byItem.get(d.item_id) ?? 0;
    let lotId: string | null = d.lot_id ?? null;

    if (sign < 0) {
      if (!lotId) return res.status(400).json({ error: 'lot_id é obrigatório para saídas' });
      const lot = await assertClinicLot(d.clinic_id, lotId);
      if (!lot || lot.item_id !== d.item_id) return res.status(400).json({ error: 'Lote inválido para este item' });
      const available = byLot.get(lotId) ?? 0;
      if (available < d.qty) {
        return res.status(400).json({ error: `Quantidade insuficiente no lote (disponível: ${available})` });
      }
    }

    if (sign > 0 && !lotId && d.new_lot) {
      const { data: lot, error: lotErr } = await supabaseAdmin
        .from('hub_inventory_lots')
        .insert([
          {
            clinic_id: d.clinic_id,
            item_id: d.item_id,
            lot_code: d.new_lot.lot_code ?? null,
            expiry_date: d.new_lot.expiry_date ?? null,
            received_at: d.new_lot.received_at,
          },
        ])
        .select('id')
        .single();
      if (lotErr || !lot) {
        console.error('[hub_inventory] movement new lot', lotErr);
        return res.status(500).json({ error: 'Erro ao criar lote' });
      }
      lotId = lot.id as string;
    }

    if (sign > 0 && !lotId) {
      return res.status(400).json({ error: 'lot_id ou new_lot é obrigatório para entradas' });
    }

    if (sign > 0 && lotId) {
      const lot = await assertClinicLot(d.clinic_id, lotId);
      if (!lot || lot.item_id !== d.item_id) return res.status(400).json({ error: 'Lote inválido para este item' });
    }

    const userId = req.user?.id ?? null;
    const { data: mov, error: movErr } = await supabaseAdmin
      .from('hub_stock_movements')
      .insert([
        {
          clinic_id: d.clinic_id,
          item_id: d.item_id,
          lot_id: lotId,
          movement_type: d.movement_type,
          qty: d.qty,
          unit_cost: d.unit_cost ?? null,
          notes: d.notes ?? null,
          reference_type: d.reference_type ?? null,
          reference_id: d.reference_id ?? null,
          created_by: userId,
        },
      ])
      .select('*')
      .single();
    if (movErr) {
      console.error('[hub_inventory] create movement', movErr);
      return res.status(500).json({ error: 'Erro ao criar movimento' });
    }

    if (sign < 0) {
      void notifyLowStockIfCrossed({
        clinicId: d.clinic_id,
        itemId: d.item_id,
        itemName: String(item.name ?? 'Item'),
        minQty: Number(item.min_stock_qty ?? 0),
        qtyBefore,
        qtyAfter: qtyBefore - d.qty,
      });
    }

    if (sign > 0 && lotId) {
      const lot = await assertClinicLot(d.clinic_id, lotId);
      void notifyExpiryAlertIfNeeded({
        clinicId: d.clinic_id,
        itemId: d.item_id,
        itemName: String(item.name ?? 'Item'),
        expiryAlertPolicy: String(item.expiry_alert_policy ?? 'none'),
        lotId,
        lotCode: lot?.lot_code ?? null,
        expiryDate: lot?.expiry_date ?? (d.new_lot?.expiry_date ?? null),
      });
    }

    return res.status(201).json({ movement: mov });
  } catch (e) {
    console.error('[hub_inventory] create movement', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// --- Reports ---

export const listHubExpiringLots = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const byPolicy =
      String(req.query.by_policy || '') === '1' ||
      String(req.query.by_policy || '').toLowerCase() === 'true';
    const within = Math.min(365, Math.max(1, parseInt(String(req.query.within_days || '30'), 10) || 30));
    const today = new Date();
    const end = new Date(today);
    // Para by_policy, busca até 90 dias (máximo das policies d30/d60/d90) e filtra por item.
    end.setDate(end.getDate() + (byPolicy ? 90 : within));
    const isoToday = today.toISOString().slice(0, 10);
    const isoEnd = end.toISOString().slice(0, 10);

    const { data: lots, error } = await supabaseAdmin
      .from('hub_inventory_lots')
      .select('id, item_id, lot_code, expiry_date, received_at')
      .eq('clinic_id', clinic_id)
      .not('expiry_date', 'is', null)
      .gte('expiry_date', isoToday)
      .lte('expiry_date', isoEnd)
      .order('expiry_date', { ascending: true });

    if (error) {
      console.error('[hub_inventory] expiring lots', error);
      return res.status(500).json({ error: 'Erro ao listar validades' });
    }

    const { byLot } = await computeBalances(clinic_id);
    const itemIds = [...new Set((lots ?? []).map((l) => l.item_id as string))];
    let itemMap = new Map<string, { name: string; item_kind: string; expiry_alert_policy: string }>();
    if (itemIds.length) {
      const { data: items } = await supabaseAdmin
        .from('hub_inventory_items')
        .select('id, name, item_kind, expiry_alert_policy')
        .in('id', itemIds);
      for (const it of items ?? []) {
        itemMap.set(it.id as string, {
          name: it.name as string,
          item_kind: it.item_kind as string,
          expiry_alert_policy: String(it.expiry_alert_policy ?? 'none'),
        });
      }
    }

    const policyDays = (p: string): number | null => {
      if (p === 'd30') return 30;
      if (p === 'd60') return 60;
      if (p === 'd90') return 90;
      return null;
    };

    const daysUntil = (ymd: string): number => {
      const t0 = Date.parse(`${isoToday}T12:00:00Z`);
      const t1 = Date.parse(`${ymd}T12:00:00Z`);
      return Math.round((t1 - t0) / 86400000);
    };

    const enriched = (lots ?? [])
      .map((l) => {
        const qty = byLot.get(l.id as string) ?? 0;
        const meta = itemMap.get(l.item_id as string) ?? {
          name: '?',
          item_kind: 'product',
          expiry_alert_policy: 'none',
        };
        return {
          ...l,
          qty_on_hand: qty,
          item: { name: meta.name, item_kind: meta.item_kind },
          expiry_alert_policy: meta.expiry_alert_policy,
        };
      })
      .filter((l) => {
        if (l.qty_on_hand <= 0) return false;
        if (!byPolicy) return true;
        const days = policyDays(l.expiry_alert_policy);
        if (days == null) return false;
        if (!l.expiry_date) return false;
        return daysUntil(l.expiry_date as string) <= days;
      });

    return res.json({ lots: enriched });
  } catch (e) {
    console.error('[hub_inventory] expiring lots', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const listHubLowStock = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const { data: items, error } = await supabaseAdmin
      .from('hub_inventory_items')
      .select('id, name, item_kind, min_stock_qty')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .eq('active', true);
    if (error) {
      console.error('[hub_inventory] low stock', error);
      return res.status(500).json({ error: 'Erro ao listar estoque baixo' });
    }
    const { byItem } = await computeBalances(clinic_id);
    const low = (items ?? []).filter((it) => {
      const qty = byItem.get(it.id as string) ?? 0;
      const min = Number(it.min_stock_qty ?? 0);
      return min > 0 && qty < min;
    }).map((it) => ({
      ...it,
      qty_on_hand: byItem.get(it.id as string) ?? 0,
    }));
    return res.json({ items: low });
  } catch (e) {
    console.error('[hub_inventory] low stock', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/** Lotes com resto abaixo de 20% de 1 unidade (embalagem quase vazia). */
export const listHubNearlyEmptyLots = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('hub_inventory_items')
      .select('id, name, item_kind, unit_label, content_qty, content_unit')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .eq('active', true)
      .not('content_qty', 'is', null);
    if (itemsErr) {
      if (String(itemsErr.message || '').includes('content_qty')) {
        return res.json({ lots: [] });
      }
      console.error('[hub_inventory] nearly empty items', itemsErr);
      return res.status(500).json({ error: 'Erro ao listar embalagens quase vazias' });
    }

    const withContent = (items ?? []).filter((it) => Number(it.content_qty) > 0);
    if (withContent.length === 0) return res.json({ lots: [] });

    const itemIds = withContent.map((it) => it.id as string);
    const itemMap = new Map(
      withContent.map((it) => [
        it.id as string,
        {
          name: it.name as string,
          item_kind: it.item_kind as string,
          unit_label: (it.unit_label as string | null) ?? null,
          content_qty: Number(it.content_qty),
          content_unit: (it.content_unit as string | null) ?? null,
        },
      ]),
    );

    const { data: lots, error: lotsErr } = await supabaseAdmin
      .from('hub_inventory_lots')
      .select('id, item_id, lot_code, expiry_date, received_at')
      .eq('clinic_id', clinic_id)
      .in('item_id', itemIds);
    if (lotsErr) {
      console.error('[hub_inventory] nearly empty lots', lotsErr);
      return res.status(500).json({ error: 'Erro ao listar lotes' });
    }

    const { byLot } = await computeBalances(clinic_id);

    const enriched = (lots ?? [])
      .map((l) => {
        const qty = byLot.get(l.id as string) ?? 0;
        const meta = itemMap.get(l.item_id as string);
        if (!meta) return null;
        if (!isNearlyEmptyLotBalance(qty, true)) return null;
        const remainingContent = roundStockQty(qty * meta.content_qty);
        return {
          id: l.id,
          item_id: l.item_id,
          lot_code: l.lot_code,
          expiry_date: l.expiry_date,
          received_at: l.received_at,
          qty_on_hand: roundStockQty(qty),
          remaining_content: remainingContent,
          item: {
            name: meta.name,
            item_kind: meta.item_kind,
            unit_label: meta.unit_label,
            content_qty: meta.content_qty,
            content_unit: meta.content_unit,
          },
        };
      })
      .filter(Boolean);

    return res.json({ lots: enriched });
  } catch (e) {
    console.error('[hub_inventory] nearly empty lots', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/** Lista lotes com quantidade > 0 (vista inventário). */
export const listHubInventoryLots = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = parsed.data;
    const { data: lots, error } = await supabaseAdmin
      .from('hub_inventory_lots')
      .select('id, item_id, lot_code, expiry_date, received_at')
      .eq('clinic_id', clinic_id)
      .order('expiry_date', { ascending: true, nullsFirst: false });
    if (error) {
      console.error('[hub_inventory] list lots', error);
      return res.status(500).json({ error: 'Erro ao listar lotes' });
    }
    const { byLot } = await computeBalances(clinic_id);
    const itemIds = [...new Set((lots ?? []).map((l) => l.item_id as string))];
    let itemMap = new Map<string, { name: string; item_kind: string }>();
    if (itemIds.length) {
      const { data: items } = await supabaseAdmin.from('hub_inventory_items').select('id, name, item_kind').in('id', itemIds).is('deleted_at', null);
      for (const it of items ?? []) {
        itemMap.set(it.id as string, { name: it.name as string, item_kind: it.item_kind as string });
      }
    }
    const enriched = (lots ?? [])
      .map((l) => ({
        ...l,
        qty_on_hand: byLot.get(l.id as string) ?? 0,
        item: itemMap.get(l.item_id as string) ?? null,
      }))
      .filter((l) => l.qty_on_hand > 0 && l.item);
    return res.json({ lots: enriched });
  } catch (e) {
    console.error('[hub_inventory] list lots', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

function parseInventoryReportPeriod(q: {
  days?: unknown;
  from?: unknown;
  to?: unknown;
}): { ok: true; fromYmd: string; toYmd: string } | { ok: false; error: string } {
  const fromRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.from);
  const toRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.to);
  if (fromRaw.success && toRaw.success) {
    if (fromRaw.data > toRaw.data) return { ok: false, error: 'from não pode ser maior que to' };
    return { ok: true, fromYmd: fromRaw.data, toYmd: toRaw.data };
  }
  const days = z.coerce.number().int().min(1).max(366).safeParse(q.days);
  const n = days.success ? days.data : 30;
  const to = new Date();
  const toYmd = to.toISOString().slice(0, 10);
  const fromDt = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (n - 1)));
  const fromYmd = fromDt.toISOString().slice(0, 10);
  return { ok: true, fromYmd, toYmd };
}

function round2inv(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Curva ABC por valor de consumo (saídas × custo) no período. */
export const getHubInventoryAbcReport = async (req: Request, res: Response) => {
  try {
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = clinic.data;
    const period = parseInventoryReportPeriod(req.query);
    if (!period.ok) return res.status(400).json({ error: period.error });
    const { fromYmd, toYmd } = period;
    const fromIso = `${fromYmd}T00:00:00.000Z`;
    const toIso = `${toYmd}T23:59:59.999Z`;

    const { data: movs, error } = await supabaseAdmin
      .from('hub_stock_movements')
      .select('item_id, movement_type, qty, unit_cost')
      .eq('clinic_id', clinic_id)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .limit(20000);
    if (error) return res.status(500).json({ error: error.message });

    const consumption = new Map<string, { qty_out: number; value: number }>();
    for (const m of movs ?? []) {
      const type = String(m.movement_type ?? '');
      if (movementSign(type) >= 0) continue;
      const itemId = m.item_id as string;
      const qty = Number(m.qty ?? 0);
      const unitCost = m.unit_cost != null ? Number(m.unit_cost) : null;
      const cur = consumption.get(itemId) ?? { qty_out: 0, value: 0 };
      cur.qty_out += qty;
      if (unitCost != null) cur.value += qty * unitCost;
      consumption.set(itemId, cur);
    }

    const itemIds = [...consumption.keys()];
    const itemMeta = new Map<
      string,
      { name: string; item_kind: string; cost_amount: number | null; unit_label: string | null }
    >();
    if (itemIds.length > 0) {
      const chunk = 500;
      for (let i = 0; i < itemIds.length; i += chunk) {
        const slice = itemIds.slice(i, i + chunk);
        const { data: items, error: iErr } = await supabaseAdmin
          .from('hub_inventory_items')
          .select('id, name, item_kind, cost_amount, unit_label')
          .in('id', slice)
          .is('deleted_at', null);
        if (iErr) return res.status(500).json({ error: iErr.message });
        for (const it of items ?? []) {
          itemMeta.set(it.id as string, {
            name: String(it.name ?? ''),
            item_kind: String(it.item_kind ?? ''),
            cost_amount: it.cost_amount != null ? Number(it.cost_amount) : null,
            unit_label: (it.unit_label as string | null) ?? null,
          });
        }
      }
    }

    const ranked = itemIds
      .map((id) => {
        const c = consumption.get(id)!;
        const meta = itemMeta.get(id);
        let value = c.value;
        if (value <= 0 && meta?.cost_amount != null) {
          value = c.qty_out * meta.cost_amount;
        }
        return {
          item_id: id,
          name: meta?.name ?? '—',
          item_kind: meta?.item_kind ?? null,
          unit_label: meta?.unit_label ?? null,
          qty_out: round2inv(c.qty_out),
          consumption_value: round2inv(value),
        };
      })
      .filter((r) => r.qty_out > 0)
      .sort((a, b) => b.consumption_value - a.consumption_value || b.qty_out - a.qty_out);

    const totalValue = ranked.reduce((acc, r) => acc + r.consumption_value, 0);
    let cumulative = 0;
    const items = ranked.map((r, idx) => {
      cumulative += r.consumption_value;
      const share_pct = totalValue > 0 ? round2inv((r.consumption_value / totalValue) * 100) : 0;
      const cumulative_pct = totalValue > 0 ? round2inv((cumulative / totalValue) * 100) : 0;
      let abc_class: 'A' | 'B' | 'C' = 'C';
      if (cumulative_pct <= 80) abc_class = 'A';
      else if (cumulative_pct <= 95) abc_class = 'B';
      return {
        rank: idx + 1,
        ...r,
        share_pct,
        cumulative_pct,
        abc_class,
      };
    });

    return res.json({
      period: { from: fromYmd, to: toYmd },
      summary: {
        items_count: items.length,
        total_consumption_value: round2inv(totalValue),
        class_a: items.filter((i) => i.abc_class === 'A').length,
        class_b: items.filter((i) => i.abc_class === 'B').length,
        class_c: items.filter((i) => i.abc_class === 'C').length,
      },
      items: items.slice(0, 500),
    });
  } catch (e) {
    console.error('[hub_inventory] abc report', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/** Giro de estoque: saídas no período vs saldo atual / cobertura em dias. */
export const getHubInventoryTurnoverReport = async (req: Request, res: Response) => {
  try {
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = clinic.data;
    const period = parseInventoryReportPeriod(req.query);
    if (!period.ok) return res.status(400).json({ error: period.error });
    const { fromYmd, toYmd } = period;
    const fromIso = `${fromYmd}T00:00:00.000Z`;
    const toIso = `${toYmd}T23:59:59.999Z`;
    const periodDays = Math.max(
      1,
      Math.floor(
        (Date.parse(`${toYmd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) / 86_400_000
      ) + 1
    );

    const { data: movs, error } = await supabaseAdmin
      .from('hub_stock_movements')
      .select('item_id, movement_type, qty')
      .eq('clinic_id', clinic_id)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .limit(20000);
    if (error) return res.status(500).json({ error: error.message });

    const periodNet = new Map<string, { qty_in: number; qty_out: number }>();
    for (const m of movs ?? []) {
      const type = String(m.movement_type ?? '');
      const sign = movementSign(type);
      const itemId = m.item_id as string;
      const qty = Number(m.qty ?? 0);
      const cur = periodNet.get(itemId) ?? { qty_in: 0, qty_out: 0 };
      if (sign > 0) cur.qty_in += qty;
      else if (sign < 0) cur.qty_out += qty;
      periodNet.set(itemId, cur);
    }

    const { byItem } = await computeBalances(clinic_id);
    const itemIds = [...new Set([...periodNet.keys(), ...byItem.keys()])];

    const itemMeta = new Map<string, { name: string; item_kind: string; unit_label: string | null }>();
    if (itemIds.length > 0) {
      const chunk = 500;
      for (let i = 0; i < itemIds.length; i += chunk) {
        const slice = itemIds.slice(i, i + chunk);
        const { data: items, error: iErr } = await supabaseAdmin
          .from('hub_inventory_items')
          .select('id, name, item_kind, unit_label, active')
          .in('id', slice)
          .is('deleted_at', null);
        if (iErr) return res.status(500).json({ error: iErr.message });
        for (const it of items ?? []) {
          if (it.active === false) continue;
          itemMeta.set(it.id as string, {
            name: String(it.name ?? ''),
            item_kind: String(it.item_kind ?? ''),
            unit_label: (it.unit_label as string | null) ?? null,
          });
        }
      }
    }

    const rows = [...itemMeta.keys()]
      .map((id) => {
        const net = periodNet.get(id) ?? { qty_in: 0, qty_out: 0 };
        const qty_on_hand = round2inv(byItem.get(id) ?? 0);
        const opening = round2inv(qty_on_hand - (net.qty_in - net.qty_out));
        const avg_stock = round2inv((Math.max(opening, 0) + Math.max(qty_on_hand, 0)) / 2);
        const qty_out = round2inv(net.qty_out);
        const turnover =
          avg_stock > 0 ? round2inv(qty_out / avg_stock) : qty_out > 0 ? null : 0;
        const daily_out = qty_out / periodDays;
        const days_of_cover =
          daily_out > 0 ? round2inv(Math.max(qty_on_hand, 0) / daily_out) : qty_on_hand > 0 ? null : 0;
        const meta = itemMeta.get(id)!;
        return {
          item_id: id,
          name: meta.name,
          item_kind: meta.item_kind,
          unit_label: meta.unit_label,
          qty_on_hand,
          qty_in: round2inv(net.qty_in),
          qty_out,
          avg_stock,
          turnover_rate: turnover,
          days_of_cover,
        };
      })
      .filter((r) => r.qty_out > 0 || r.qty_on_hand > 0)
      .sort((a, b) => (b.turnover_rate ?? 0) - (a.turnover_rate ?? 0));

    return res.json({
      period: { from: fromYmd, to: toYmd },
      period_days: periodDays,
      summary: {
        items_count: rows.length,
        with_outflow: rows.filter((r) => r.qty_out > 0).length,
        avg_turnover:
          rows.filter((r) => r.turnover_rate != null).length > 0
            ? round2inv(
                rows
                  .filter((r) => r.turnover_rate != null)
                  .reduce((acc, r) => acc + (r.turnover_rate as number), 0) /
                  rows.filter((r) => r.turnover_rate != null).length
              )
            : null,
      },
      items: rows.slice(0, 500),
    });
  } catch (e) {
    console.error('[hub_inventory] turnover report', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
