"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listHubInventoryLots = exports.listHubLowStock = exports.listHubExpiringLots = exports.createHubStockMovement = exports.listHubStockMovements = exports.patchHubInventoryItem = exports.createHubInventoryItem = exports.listHubInventoryItems = exports.patchHubManufacturer = exports.createHubManufacturer = exports.listHubManufacturers = exports.patchHubSupplier = exports.createHubSupplier = exports.listHubSuppliers = void 0;
exports.movementSign = movementSign;
exports.computeBalances = computeBalances;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const inventoryEan_1 = require("./inventoryEan");
const uuidStr = zod_1.z.string().uuid();
const moneyProductSchema = zod_1.z.coerce
    .number()
    .finite()
    .min(0.01, { message: 'Valor mínimo R$ 0,01' })
    .max(99_999_999.99);
const moneyNonNegSchema = zod_1.z.coerce.number().finite().min(0).max(99_999_999.99);
const pctSchema = zod_1.z.coerce.number().finite().min(0).max(100);
const itemKindSchema = zod_1.z.enum(['product', 'medication', 'vaccine']);
const expiryPolicySchema = zod_1.z.enum(['none', 'd30', 'd60', 'd90']);
const movementInTypes = ['initial_in', 'purchase_in', 'adjustment_in'];
const movementOutTypes = ['adjustment_out', 'sale_out', 'encounter_out'];
function movementSign(t) {
    if (movementInTypes.includes(t))
        return 1;
    if (movementOutTypes.includes(t))
        return -1;
    return 0;
}
async function fetchMovementRows(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_stock_movements')
        .select('item_id, lot_id, movement_type, qty')
        .eq('clinic_id', clinicId);
    if (error)
        throw error;
    return data ?? [];
}
async function computeBalances(clinicId) {
    const rows = await fetchMovementRows(clinicId);
    const byItem = new Map();
    const byLot = new Map();
    for (const r of rows) {
        const sign = movementSign(r.movement_type);
        const q = sign * Number(r.qty);
        const itemId = r.item_id;
        byItem.set(itemId, (byItem.get(itemId) ?? 0) + q);
        if (r.lot_id) {
            const lid = r.lot_id;
            byLot.set(lid, (byLot.get(lid) ?? 0) + q);
        }
    }
    return { byItem, byLot };
}
async function assertClinicItem(clinicId, itemId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_inventory_items')
        .select('id, clinic_id, deleted_at')
        .eq('id', itemId)
        .maybeSingle();
    if (error || !data || data.clinic_id !== clinicId || data.deleted_at) {
        return null;
    }
    return data;
}
async function assertClinicLot(clinicId, lotId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_inventory_lots')
        .select('id, clinic_id, item_id')
        .eq('id', lotId)
        .maybeSingle();
    if (error || !data || data.clinic_id !== clinicId)
        return null;
    return data;
}
// --- Suppliers ---
const listHubSuppliers = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_suppliers')
            .select('id, clinic_id, name, tax_id, phone, email, notes, active, created_at, updated_at, deleted_at')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('name', { ascending: true });
        if (error) {
            console.error('[hub_inventory] list suppliers', error);
            return res.status(500).json({ error: 'Erro ao listar fornecedores' });
        }
        return res.json({ suppliers: data ?? [] });
    }
    catch (e) {
        console.error('[hub_inventory] list suppliers', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubSuppliers = listHubSuppliers;
const createSupplierSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(300),
    tax_id: zod_1.z.string().max(64).optional().nullable(),
    phone: zod_1.z.string().max(64).optional().nullable(),
    email: zod_1.z.string().email().max(200).optional().nullable().or(zod_1.z.literal('')),
    notes: zod_1.z.string().max(4000).optional().nullable(),
})
    .strict();
const createHubSupplier = async (req, res) => {
    try {
        const body = createSupplierSchema.safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        const row = {
            ...body.data,
            email: body.data.email === '' ? null : body.data.email,
            active: true,
            deleted_at: null,
        };
        const { data, error } = await supabase_1.supabaseAdmin.from('hub_suppliers').insert([row]).select('*').single();
        if (error) {
            console.error('[hub_inventory] create supplier', error);
            return res.status(500).json({ error: 'Erro ao criar fornecedor' });
        }
        return res.status(201).json({ supplier: data });
    }
    catch (e) {
        console.error('[hub_inventory] create supplier', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubSupplier = createHubSupplier;
const patchSupplierSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(300).optional(),
    tax_id: zod_1.z.string().max(64).optional().nullable(),
    phone: zod_1.z.string().max(64).optional().nullable(),
    email: zod_1.z.string().email().max(200).optional().nullable().or(zod_1.z.literal('')),
    notes: zod_1.z.string().max(4000).optional().nullable(),
    active: zod_1.z.boolean().optional(),
    archived: zod_1.z.boolean().optional(),
})
    .strict();
const patchHubSupplier = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = patchSupplierSchema.safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        const { clinic_id, archived, ...rest } = body.data;
        const patch = {};
        if (rest.name !== undefined)
            patch.name = rest.name;
        if (rest.tax_id !== undefined)
            patch.tax_id = rest.tax_id;
        if (rest.phone !== undefined)
            patch.phone = rest.phone;
        if (rest.email !== undefined)
            patch.email = rest.email === '' ? null : rest.email;
        if (rest.notes !== undefined)
            patch.notes = rest.notes;
        if (rest.active !== undefined)
            patch.active = rest.active;
        if (archived === true)
            patch.deleted_at = new Date().toISOString();
        if (archived === false)
            patch.deleted_at = null;
        if (Object.keys(patch).length === 0)
            return res.status(400).json({ error: 'Nada para atualizar' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_suppliers')
            .update(patch)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .select('*')
            .single();
        if (error || !data)
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        return res.json({ supplier: data });
    }
    catch (e) {
        console.error('[hub_inventory] patch supplier', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.patchHubSupplier = patchHubSupplier;
// --- Manufacturers ---
const listHubManufacturers = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_manufacturers')
            .select('id, clinic_id, name, created_at, updated_at, deleted_at')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('name', { ascending: true });
        if (error) {
            console.error('[hub_inventory] list manufacturers', error);
            return res.status(500).json({ error: 'Erro ao listar fabricantes' });
        }
        return res.json({ manufacturers: data ?? [] });
    }
    catch (e) {
        console.error('[hub_inventory] list manufacturers', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubManufacturers = listHubManufacturers;
const createManufacturerSchema = zod_1.z.object({ clinic_id: uuidStr, name: zod_1.z.string().trim().min(1).max(300) }).strict();
const createHubManufacturer = async (req, res) => {
    try {
        const body = createManufacturerSchema.safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        const row = { ...body.data, deleted_at: null };
        const { data, error } = await supabase_1.supabaseAdmin.from('hub_manufacturers').insert([row]).select('*').single();
        if (error) {
            console.error('[hub_inventory] create manufacturer', error);
            return res.status(500).json({ error: 'Erro ao criar fabricante' });
        }
        return res.status(201).json({ manufacturer: data });
    }
    catch (e) {
        console.error('[hub_inventory] create manufacturer', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubManufacturer = createHubManufacturer;
const patchManufacturerSchema = zod_1.z
    .object({ clinic_id: uuidStr, name: zod_1.z.string().trim().min(1).max(300).optional(), archived: zod_1.z.boolean().optional() })
    .strict();
const patchHubManufacturer = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = patchManufacturerSchema.safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        const { clinic_id, name, archived } = body.data;
        const patch = {};
        if (name !== undefined)
            patch.name = name;
        if (archived === true)
            patch.deleted_at = new Date().toISOString();
        if (archived === false)
            patch.deleted_at = null;
        if (Object.keys(patch).length === 0)
            return res.status(400).json({ error: 'Nada para atualizar' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_manufacturers')
            .update(patch)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .select('*')
            .single();
        if (error || !data)
            return res.status(404).json({ error: 'Fabricante não encontrado' });
        return res.json({ manufacturer: data });
    }
    catch (e) {
        console.error('[hub_inventory] patch manufacturer', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.patchHubManufacturer = patchHubManufacturer;
// --- Items ---
const ITEM_SELECT = 'id, clinic_id, item_kind, ean, name, unit_label, manufacturer_id, allow_fractional, store_sku, sale_purpose, product_group, default_supplier_id, description, cost_amount, sale_amount, supplier_discount_pct, max_sale_discount_pct, allow_price_override_on_sale, generates_staff_commission, min_stock_qty, expiry_alert_policy, active, created_at, updated_at, deleted_at';
const initialLotSchema = zod_1.z
    .object({
    received_at: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expiry_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    qty: zod_1.z.coerce.number().finite().positive(),
    lot_code: zod_1.z.string().max(120).optional().nullable(),
})
    .strict();
const createItemSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    item_kind: itemKindSchema,
    ean: zod_1.z.string().max(32).optional().nullable(),
    name: zod_1.z.string().trim().min(1).max(300),
    unit_label: zod_1.z.string().max(64).optional().nullable(),
    manufacturer_id: uuidStr.optional().nullable(),
    allow_fractional: zod_1.z.boolean().optional(),
    store_sku: zod_1.z.string().max(120).optional().nullable(),
    sale_purpose: zod_1.z.string().max(120).optional().nullable(),
    product_group: zod_1.z.string().max(120).optional().nullable(),
    default_supplier_id: uuidStr.optional().nullable(),
    description: zod_1.z.string().max(4000).optional().nullable(),
    cost_amount: moneyProductSchema,
    sale_amount: moneyProductSchema,
    supplier_discount_pct: pctSchema.optional(),
    max_sale_discount_pct: pctSchema.optional(),
    allow_price_override_on_sale: zod_1.z.boolean().optional(),
    generates_staff_commission: zod_1.z.boolean().optional(),
    min_stock_qty: zod_1.z.coerce.number().finite().min(0).optional(),
    expiry_alert_policy: expiryPolicySchema.optional(),
    initial_lot: initialLotSchema.optional().nullable(),
})
    .strict();
const listHubInventoryItems = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = parsed.data;
        const kind = req.query.item_kind;
        const search = req.query.search?.trim().toLowerCase();
        let q = supabase_1.supabaseAdmin
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
            ? list.filter((it) => it.name.toLowerCase().includes(search) ||
                (it.ean && String(it.ean).includes(search)) ||
                (it.store_sku && String(it.store_sku).toLowerCase().includes(search)))
            : list;
        const { byItem } = await computeBalances(clinic_id);
        const enriched = filtered.map((it) => ({
            ...it,
            qty_on_hand: Math.round(((byItem.get(it.id) ?? 0) + Number.EPSILON) * 10000) / 10000,
        }));
        return res.json({ items: enriched });
    }
    catch (e) {
        console.error('[hub_inventory] list items', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubInventoryItems = listHubInventoryItems;
const createHubInventoryItem = async (req, res) => {
    try {
        const body = createItemSchema.safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        const d = body.data;
        let ean = null;
        try {
            ean = (0, inventoryEan_1.parseOptionalEan)(d.ean ?? null);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
        const row = {
            clinic_id: d.clinic_id,
            item_kind: d.item_kind,
            ean,
            name: d.name,
            unit_label: d.unit_label ?? null,
            manufacturer_id: d.manufacturer_id ?? null,
            allow_fractional: d.allow_fractional ?? false,
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
            active: true,
            deleted_at: null,
        };
        const { data: item, error: insErr } = await supabase_1.supabaseAdmin.from('hub_inventory_items').insert([row]).select(ITEM_SELECT).single();
        if (insErr) {
            if (insErr.code === '23505')
                return res.status(409).json({ error: 'EAN ou SKU da loja já existe nesta clínica' });
            console.error('[hub_inventory] create item', insErr);
            return res.status(500).json({ error: 'Erro ao criar item' });
        }
        const userId = req.user?.id ?? null;
        if (d.initial_lot && d.initial_lot.qty > 0) {
            const { data: lot, error: lotErr } = await supabase_1.supabaseAdmin
                .from('hub_inventory_lots')
                .insert([
                {
                    clinic_id: d.clinic_id,
                    item_id: item.id,
                    lot_code: d.initial_lot.lot_code ?? null,
                    expiry_date: d.initial_lot.expiry_date ?? null,
                    received_at: d.initial_lot.received_at,
                },
            ])
                .select('id')
                .single();
            if (lotErr || !lot) {
                await supabase_1.supabaseAdmin.from('hub_inventory_items').delete().eq('id', item.id);
                console.error('[hub_inventory] create lot', lotErr);
                return res.status(500).json({ error: 'Erro ao criar lote inicial' });
            }
            const { error: movErr } = await supabase_1.supabaseAdmin.from('hub_stock_movements').insert([
                {
                    clinic_id: d.clinic_id,
                    item_id: item.id,
                    lot_id: lot.id,
                    movement_type: 'initial_in',
                    qty: d.initial_lot.qty,
                    unit_cost: d.cost_amount,
                    notes: 'Lote inicial',
                    created_by: userId,
                },
            ]);
            if (movErr) {
                await supabase_1.supabaseAdmin.from('hub_inventory_lots').delete().eq('id', lot.id);
                await supabase_1.supabaseAdmin.from('hub_inventory_items').delete().eq('id', item.id);
                console.error('[hub_inventory] create initial movement', movErr);
                return res.status(500).json({ error: 'Erro ao registrar movimento inicial' });
            }
        }
        const { byItem } = await computeBalances(d.clinic_id);
        return res.status(201).json({
            item: { ...item, qty_on_hand: byItem.get(item.id) ?? 0 },
        });
    }
    catch (e) {
        console.error('[hub_inventory] create item', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubInventoryItem = createHubInventoryItem;
const patchItemSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    item_kind: itemKindSchema.optional(),
    ean: zod_1.z.string().max(32).optional().nullable(),
    name: zod_1.z.string().trim().min(1).max(300).optional(),
    unit_label: zod_1.z.string().max(64).optional().nullable(),
    manufacturer_id: uuidStr.optional().nullable(),
    allow_fractional: zod_1.z.boolean().optional(),
    store_sku: zod_1.z.string().max(120).optional().nullable(),
    sale_purpose: zod_1.z.string().max(120).optional().nullable(),
    product_group: zod_1.z.string().max(120).optional().nullable(),
    default_supplier_id: uuidStr.optional().nullable(),
    description: zod_1.z.string().max(4000).optional().nullable(),
    cost_amount: moneyProductSchema.optional(),
    sale_amount: moneyProductSchema.optional(),
    supplier_discount_pct: pctSchema.optional(),
    max_sale_discount_pct: pctSchema.optional(),
    allow_price_override_on_sale: zod_1.z.boolean().optional(),
    generates_staff_commission: zod_1.z.boolean().optional(),
    min_stock_qty: zod_1.z.coerce.number().finite().min(0).optional(),
    expiry_alert_policy: expiryPolicySchema.optional(),
    active: zod_1.z.boolean().optional(),
    archived: zod_1.z.boolean().optional(),
})
    .strict();
const patchHubInventoryItem = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = patchItemSchema.safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        const d = body.data;
        const existing = await assertClinicItem(d.clinic_id, idParsed.data);
        if (!existing)
            return res.status(404).json({ error: 'Item não encontrado' });
        const patch = {};
        if (d.item_kind !== undefined)
            patch.item_kind = d.item_kind;
        if (d.ean !== undefined) {
            try {
                patch.ean = (0, inventoryEan_1.parseOptionalEan)(d.ean);
            }
            catch (err) {
                return res.status(400).json({ error: err.message });
            }
        }
        if (d.name !== undefined)
            patch.name = d.name;
        if (d.unit_label !== undefined)
            patch.unit_label = d.unit_label;
        if (d.manufacturer_id !== undefined)
            patch.manufacturer_id = d.manufacturer_id;
        if (d.allow_fractional !== undefined)
            patch.allow_fractional = d.allow_fractional;
        if (d.store_sku !== undefined)
            patch.store_sku = d.store_sku?.trim() || null;
        if (d.sale_purpose !== undefined)
            patch.sale_purpose = d.sale_purpose;
        if (d.product_group !== undefined)
            patch.product_group = d.product_group;
        if (d.default_supplier_id !== undefined)
            patch.default_supplier_id = d.default_supplier_id;
        if (d.description !== undefined)
            patch.description = d.description;
        if (d.cost_amount !== undefined)
            patch.cost_amount = d.cost_amount;
        if (d.sale_amount !== undefined)
            patch.sale_amount = d.sale_amount;
        if (d.supplier_discount_pct !== undefined)
            patch.supplier_discount_pct = d.supplier_discount_pct;
        if (d.max_sale_discount_pct !== undefined)
            patch.max_sale_discount_pct = d.max_sale_discount_pct;
        if (d.allow_price_override_on_sale !== undefined)
            patch.allow_price_override_on_sale = d.allow_price_override_on_sale;
        if (d.generates_staff_commission !== undefined)
            patch.generates_staff_commission = d.generates_staff_commission;
        if (d.min_stock_qty !== undefined)
            patch.min_stock_qty = d.min_stock_qty;
        if (d.expiry_alert_policy !== undefined)
            patch.expiry_alert_policy = d.expiry_alert_policy;
        if (d.active !== undefined)
            patch.active = d.active;
        if (d.archived === true)
            patch.deleted_at = new Date().toISOString();
        if (d.archived === false)
            patch.deleted_at = null;
        if (Object.keys(patch).length === 0)
            return res.status(400).json({ error: 'Nada para atualizar' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_inventory_items')
            .update(patch)
            .eq('id', idParsed.data)
            .eq('clinic_id', d.clinic_id)
            .select(ITEM_SELECT)
            .single();
        if (error) {
            if (error.code === '23505')
                return res.status(409).json({ error: 'EAN ou SKU da loja já existe nesta clínica' });
            console.error('[hub_inventory] patch item', error);
            return res.status(500).json({ error: 'Erro ao atualizar item' });
        }
        const { byItem } = await computeBalances(d.clinic_id);
        return res.json({ item: { ...data, qty_on_hand: byItem.get(data.id) ?? 0 } });
    }
    catch (e) {
        console.error('[hub_inventory] patch item', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.patchHubInventoryItem = patchHubInventoryItem;
// --- Movements ---
const createMovementSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    item_id: uuidStr,
    lot_id: uuidStr.optional().nullable(),
    movement_type: zod_1.z.enum(['purchase_in', 'adjustment_in', 'adjustment_out', 'sale_out', 'encounter_out']),
    qty: zod_1.z.coerce.number().finite().positive(),
    unit_cost: moneyNonNegSchema.optional().nullable(),
    notes: zod_1.z.string().max(2000).optional().nullable(),
    reference_type: zod_1.z.string().max(64).optional().nullable(),
    reference_id: uuidStr.optional().nullable(),
    new_lot: zod_1.z
        .object({
        lot_code: zod_1.z.string().max(120).optional().nullable(),
        expiry_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        received_at: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
        .strict()
        .optional(),
})
    .strict();
const listHubStockMovements = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = parsed.data;
        const direction = req.query.direction || 'all';
        const itemId = req.query.item_id;
        let q = supabase_1.supabaseAdmin
            .from('hub_stock_movements')
            .select('id, clinic_id, item_id, lot_id, movement_type, qty, unit_cost, reference_type, reference_id, notes, created_by, created_at')
            .eq('clinic_id', clinic_id)
            .order('created_at', { ascending: false })
            .limit(500);
        if (itemId && uuidStr.safeParse(itemId).success) {
            q = q.eq('item_id', itemId);
        }
        const { data, error } = await q;
        if (error) {
            console.error('[hub_inventory] list movements', error);
            return res.status(500).json({ error: 'Erro ao listar movimentos' });
        }
        let rows = data ?? [];
        if (direction === 'in') {
            rows = rows.filter((r) => movementSign(r.movement_type) > 0);
        }
        else if (direction === 'out') {
            rows = rows.filter((r) => movementSign(r.movement_type) < 0);
        }
        return res.json({ movements: rows });
    }
    catch (e) {
        console.error('[hub_inventory] list movements', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubStockMovements = listHubStockMovements;
const createHubStockMovement = async (req, res) => {
    try {
        const body = createMovementSchema.safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        const d = body.data;
        const item = await assertClinicItem(d.clinic_id, d.item_id);
        if (!item)
            return res.status(404).json({ error: 'Item não encontrado' });
        const sign = movementSign(d.movement_type);
        if (sign === 0)
            return res.status(400).json({ error: 'Tipo de movimento inválido' });
        const { byLot } = await computeBalances(d.clinic_id);
        let lotId = d.lot_id ?? null;
        if (sign < 0) {
            if (!lotId)
                return res.status(400).json({ error: 'lot_id é obrigatório para saídas' });
            const lot = await assertClinicLot(d.clinic_id, lotId);
            if (!lot || lot.item_id !== d.item_id)
                return res.status(400).json({ error: 'Lote inválido para este item' });
            const available = byLot.get(lotId) ?? 0;
            if (available < d.qty) {
                return res.status(400).json({ error: `Quantidade insuficiente no lote (disponível: ${available})` });
            }
        }
        if (sign > 0 && d.movement_type === 'purchase_in' && !lotId && d.new_lot) {
            const { data: lot, error: lotErr } = await supabase_1.supabaseAdmin
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
            lotId = lot.id;
        }
        if (sign > 0 && !lotId) {
            return res.status(400).json({ error: 'lot_id ou new_lot é obrigatório para entradas' });
        }
        if (sign > 0 && lotId) {
            const lot = await assertClinicLot(d.clinic_id, lotId);
            if (!lot || lot.item_id !== d.item_id)
                return res.status(400).json({ error: 'Lote inválido para este item' });
        }
        const userId = req.user?.id ?? null;
        const { data: mov, error: movErr } = await supabase_1.supabaseAdmin
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
        return res.status(201).json({ movement: mov });
    }
    catch (e) {
        console.error('[hub_inventory] create movement', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubStockMovement = createHubStockMovement;
// --- Reports ---
const listHubExpiringLots = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = parsed.data;
        const within = Math.min(365, Math.max(1, parseInt(String(req.query.within_days || '30'), 10) || 30));
        const today = new Date();
        const end = new Date(today);
        end.setDate(end.getDate() + within);
        const isoToday = today.toISOString().slice(0, 10);
        const isoEnd = end.toISOString().slice(0, 10);
        const { data: lots, error } = await supabase_1.supabaseAdmin
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
        const itemIds = [...new Set((lots ?? []).map((l) => l.item_id))];
        let itemMap = new Map();
        if (itemIds.length) {
            const { data: items } = await supabase_1.supabaseAdmin.from('hub_inventory_items').select('id, name, item_kind').in('id', itemIds);
            for (const it of items ?? []) {
                itemMap.set(it.id, { name: it.name, item_kind: it.item_kind });
            }
        }
        const enriched = (lots ?? [])
            .map((l) => {
            const qty = byLot.get(l.id) ?? 0;
            return {
                ...l,
                qty_on_hand: qty,
                item: itemMap.get(l.item_id) ?? { name: '?', item_kind: 'product' },
            };
        })
            .filter((l) => l.qty_on_hand > 0);
        return res.json({ lots: enriched });
    }
    catch (e) {
        console.error('[hub_inventory] expiring lots', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubExpiringLots = listHubExpiringLots;
const listHubLowStock = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = parsed.data;
        const { data: items, error } = await supabase_1.supabaseAdmin
            .from('hub_inventory_items')
            .select('id, name, item_kind, min_stock_qty')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .eq('active', true);
        if (error) {
            console.error('[hub_inventory] low stock', error);
            return res.status(500).json({ error: 'Erro ao listar stock baixo' });
        }
        const { byItem } = await computeBalances(clinic_id);
        const low = (items ?? []).filter((it) => {
            const qty = byItem.get(it.id) ?? 0;
            const min = Number(it.min_stock_qty ?? 0);
            return min > 0 && qty < min;
        }).map((it) => ({
            ...it,
            qty_on_hand: byItem.get(it.id) ?? 0,
        }));
        return res.json({ items: low });
    }
    catch (e) {
        console.error('[hub_inventory] low stock', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubLowStock = listHubLowStock;
/** Lista lotes com quantidade > 0 (vista inventário). */
const listHubInventoryLots = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = parsed.data;
        const { data: lots, error } = await supabase_1.supabaseAdmin
            .from('hub_inventory_lots')
            .select('id, item_id, lot_code, expiry_date, received_at')
            .eq('clinic_id', clinic_id)
            .order('expiry_date', { ascending: true, nullsFirst: false });
        if (error) {
            console.error('[hub_inventory] list lots', error);
            return res.status(500).json({ error: 'Erro ao listar lotes' });
        }
        const { byLot } = await computeBalances(clinic_id);
        const itemIds = [...new Set((lots ?? []).map((l) => l.item_id))];
        let itemMap = new Map();
        if (itemIds.length) {
            const { data: items } = await supabase_1.supabaseAdmin.from('hub_inventory_items').select('id, name, item_kind').in('id', itemIds).is('deleted_at', null);
            for (const it of items ?? []) {
                itemMap.set(it.id, { name: it.name, item_kind: it.item_kind });
            }
        }
        const enriched = (lots ?? [])
            .map((l) => ({
            ...l,
            qty_on_hand: byLot.get(l.id) ?? 0,
            item: itemMap.get(l.item_id) ?? null,
        }))
            .filter((l) => l.qty_on_hand > 0 && l.item);
        return res.json({ lots: enriched });
    }
    catch (e) {
        console.error('[hub_inventory] list lots', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubInventoryLots = listHubInventoryLots;
