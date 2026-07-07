import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  computePackageCatalogSubtotal,
  computePackagePriceFromCatalog,
  loadPackageWithItems,
  listActivePackageBalances,
  type HubPackageItemInput,
} from './hubPackagesService';

const uuidStr = z.string().uuid();

const linePricingVariantSchema = z
  .object({
    km_tier_index: z.number().int().min(0).optional(),
    custom_tier_index: z.number().int().min(0).optional(),
    period: z.enum(['full_day', 'half_day']).optional(),
    consult_type: z.enum(['padrao', 'retorno']).optional(),
  })
  .strict()
  .optional()
  .nullable();

const packageItemSchema = z
  .object({
    hub_service_type_id: uuidStr,
    quantity: z.number().int().min(1).max(9999),
    sort_order: z.number().int().min(0).max(999).optional(),
    pricing_variant: linePricingVariantSchema,
  })
  .strict();

const packageBodySchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(200),
    items: z.array(packageItemSchema).min(1).max(50),
    pricing_mode: z.enum(['manual', 'catalog_sum']).optional().default('catalog_sum'),
    price: z.number().min(0).optional(),
    discount_amount: z.number().min(0).optional().default(0),
    discount_percent: z.number().min(0).max(100).optional().nullable(),
    validity_days: z.number().int().min(1).max(3650).optional().nullable(),
    description: z.string().trim().max(3000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const patchPackageSchema = packageBodySchema
  .omit({ clinic_id: true })
  .partial()
  .extend({
    active: z.boolean().optional(),
  })
  .strict();

const suggestPriceSchema = z
  .object({
    clinic_id: uuidStr,
    items: z.array(packageItemSchema).min(1).max(50),
    discount_amount: z.number().min(0).optional().default(0),
    discount_percent: z.number().min(0).max(100).optional().nullable(),
  })
  .strict();

async function enrichPackageResponse(clinicId: string, packageId: string) {
  const loaded = await loadPackageWithItems(clinicId, packageId);
  if (!loaded) return null;
  return {
    ...loaded.package,
    items: loaded.items.map((it) => {
      const st = it.hub_service_types;
      const name = Array.isArray(st) ? st[0]?.name : st?.name;
      const isAddon = Array.isArray(st) ? Boolean(st[0]?.is_addon) : Boolean(st?.is_addon);
      return {
        id: it.id,
        hub_service_type_id: it.hub_service_type_id,
        quantity: it.quantity,
        sort_order: it.sort_order,
        service_name: name ?? null,
        is_addon: isAddon,
        pricing_variant: (it.pricing_variant as Record<string, unknown> | null) ?? null,
      };
    }),
  };
}

async function insertPackageItems(clinicId: string, packageId: string, items: HubPackageItemInput[]) {
  const rows = items.map((it, idx) => ({
    clinic_id: clinicId,
    package_id: packageId,
    hub_service_type_id: it.hub_service_type_id,
    quantity: it.quantity,
    sort_order: it.sort_order ?? idx,
    pricing_variant: it.pricing_variant ?? null,
  }));
  const { error } = await supabaseAdmin.from('hub_package_items').insert(rows);
  if (error) throw new Error(error.message);
}

export const listHubPackages = async (req: Request, res: Response) => {
  try {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
    const includeInactive = req.query.include_inactive === 'true';
    let q = supabaseAdmin.from('hub_packages').select('*').eq('clinic_id', clinicParsed.data).order('name', { ascending: true });
    if (!includeInactive) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) {
      if (String(error.message || '').includes('hub_packages')) return res.json({ packages: [] });
      return res.status(500).json({ error: error.message });
    }
    const packages = [];
    for (const row of data ?? []) {
      const enriched = await enrichPackageResponse(clinicParsed.data, row.id as string);
      if (enriched) packages.push(enriched);
    }
    return res.json({ packages });
  } catch (e: unknown) {
    console.error('listHubPackages', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubPackage = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!idParsed.success || !clinicParsed.success) {
      return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    }
    const pkg = await enrichPackageResponse(clinicParsed.data, idParsed.data);
    if (!pkg) return res.status(404).json({ error: 'Pacote não encontrado' });
    return res.json({ package: pkg });
  } catch (e: unknown) {
    console.error('getHubPackage', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const postHubPackageSuggestPrice = async (req: Request, res: Response) => {
  try {
    const parsed = suggestPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const { catalog_subtotal, lines } = await computePackageCatalogSubtotal(b.clinic_id, b.items);
    const suggested_price = computePackagePriceFromCatalog(catalog_subtotal, b.discount_amount ?? 0, b.discount_percent ?? null);
    return res.json({ catalog_subtotal, suggested_price, lines });
  } catch (e: unknown) {
    console.error('postHubPackageSuggestPrice', e);
    return res.status(400).json({ error: (e as Error)?.message || 'Erro ao calcular preço' });
  }
};

export const postHubPackage = async (req: Request, res: Response) => {
  try {
    const parsed = packageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const { catalog_subtotal } = await computePackageCatalogSubtotal(b.clinic_id, b.items);
    const packageKind = b.items.length === 1 ? 'single' : 'combo';
    const pricingMode = b.pricing_mode ?? 'catalog_sum';
    const discountAmount = b.discount_amount ?? 0;
    const discountPercent = b.discount_percent ?? null;
    const price =
      pricingMode === 'manual' && b.price != null
        ? b.price
        : computePackagePriceFromCatalog(catalog_subtotal, discountAmount, discountPercent);
    const sessionsTotal = b.items.reduce((s, it) => s + it.quantity, 0);
    const primaryServiceId = b.items.length === 1 ? b.items[0].hub_service_type_id : null;

    const { data, error } = await supabaseAdmin
      .from('hub_packages')
      .insert({
        clinic_id: b.clinic_id,
        name: b.name,
        hub_service_type_id: primaryServiceId,
        sessions_total: sessionsTotal,
        price,
        validity_days: b.validity_days ?? null,
        description: b.description ?? null,
        notes: b.notes ?? null,
        active: true,
        package_kind: packageKind,
        pricing_mode: pricingMode,
        catalog_subtotal,
        discount_amount: discountAmount,
        discount_percent: discountPercent,
      })
      .select('id')
      .single();
    if (error) {
      if (String(error.message || '').includes('hub_packages')) {
        return res.status(503).json({ error: 'Tabela hub_packages não encontrada. Aplique as migrations de pacotes.' });
      }
      return res.status(500).json({ error: error.message });
    }
    await insertPackageItems(b.clinic_id, data.id as string, b.items);
    const pkg = await enrichPackageResponse(b.clinic_id, data.id as string);
    return res.status(201).json({ package: pkg });
  } catch (e: unknown) {
    console.error('postHubPackage', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const patchHubPackage = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const clinicParsed = uuidStr.safeParse(req.body.clinic_id);
    if (!idParsed.success || !clinicParsed.success) {
      return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    }
    const parsed = patchPackageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const existing = await loadPackageWithItems(clinicParsed.data, idParsed.data);
    if (!existing) return res.status(404).json({ error: 'Pacote não encontrado' });

    const items = b.items ?? existing.items.map((it) => ({
      hub_service_type_id: it.hub_service_type_id,
      quantity: it.quantity,
      sort_order: it.sort_order,
      pricing_variant: (it.pricing_variant as HubPackageItemInput['pricing_variant']) ?? null,
    }));
    const { catalog_subtotal } = await computePackageCatalogSubtotal(clinicParsed.data, items);
    const pricingMode = b.pricing_mode ?? existing.package.pricing_mode ?? 'catalog_sum';
    const discountAmount = b.discount_amount ?? Number(existing.package.discount_amount ?? 0);
    const discountPercent = b.discount_percent !== undefined ? b.discount_percent : existing.package.discount_percent;
    const price =
      pricingMode === 'manual' && b.price != null
        ? b.price
        : b.price != null && pricingMode === 'manual'
          ? b.price
          : computePackagePriceFromCatalog(catalog_subtotal, discountAmount, discountPercent);
    const packageKind = items.length === 1 ? 'single' : 'combo';
    const sessionsTotal = items.reduce((s, it) => s + it.quantity, 0);
    const primaryServiceId = items.length === 1 ? items[0].hub_service_type_id : null;

    const patch: Record<string, unknown> = {
      catalog_subtotal,
      package_kind: packageKind,
      sessions_total: sessionsTotal,
      hub_service_type_id: primaryServiceId,
      price,
    };
    if (b.name != null) patch.name = b.name;
    if (b.pricing_mode != null) patch.pricing_mode = b.pricing_mode;
    if (b.discount_amount != null) patch.discount_amount = b.discount_amount;
    if (b.discount_percent !== undefined) patch.discount_percent = b.discount_percent;
    if (b.validity_days !== undefined) patch.validity_days = b.validity_days;
    if (b.description !== undefined) patch.description = b.description;
    if (b.notes !== undefined) patch.notes = b.notes;
    if (b.active != null) patch.active = b.active;

    const { error } = await supabaseAdmin
      .from('hub_packages')
      .update(patch)
      .eq('id', idParsed.data)
      .eq('clinic_id', clinicParsed.data);
    if (error) return res.status(500).json({ error: error.message });

    if (b.items) {
      await supabaseAdmin.from('hub_package_items').delete().eq('package_id', idParsed.data).eq('clinic_id', clinicParsed.data);
      await insertPackageItems(clinicParsed.data, idParsed.data, b.items);
    }

    const pkg = await enrichPackageResponse(clinicParsed.data, idParsed.data);
    return res.json({ package: pkg });
  } catch (e: unknown) {
    console.error('patchHubPackage', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubGuardianPackageBalances = async (req: Request, res: Response) => {
  try {
    const guardianParsed = uuidStr.safeParse(req.params.guardianId);
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!guardianParsed.success || !clinicParsed.success) {
      return res.status(400).json({ error: 'guardianId e clinic_id obrigatórios' });
    }
    const balances = await listActivePackageBalances({
      clinicId: clinicParsed.data,
      guardianId: guardianParsed.data,
    });
    return res.json({ balances });
  } catch (e: unknown) {
    console.error('getHubGuardianPackageBalances', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubPetPackageBalances = async (req: Request, res: Response) => {
  try {
    const petParsed = uuidStr.safeParse(req.params.petId);
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!petParsed.success || !clinicParsed.success) {
      return res.status(400).json({ error: 'petId e clinic_id obrigatórios' });
    }
    const balances = await listActivePackageBalances({
      clinicId: clinicParsed.data,
      petId: petParsed.data,
    });
    return res.json({ balances });
  } catch (e: unknown) {
    console.error('getHubPetPackageBalances', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
