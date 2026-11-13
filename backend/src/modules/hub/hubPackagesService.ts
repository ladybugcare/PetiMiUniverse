import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase';
import {
  parsePricingMatrixJson,
  roundMoney2,
  type HubServicePricingMatrix,
} from './hubServiceTypesPricingMatrix';
import {
  resolveServiceLinePricing,
  type HubQuotePricingVariantInput,
  type ServiceTypePricingRow,
} from './hubPricingResolve';

export type HubPackageItemInput = {
  hub_service_type_id: string;
  quantity: number;
  sort_order?: number;
  pricing_variant?: HubQuotePricingVariantInput | null;
};

export type HubPackageRow = {
  id: string;
  clinic_id: string;
  name: string;
  hub_service_type_id: string | null;
  sessions_total: number;
  price: number;
  validity_days: number | null;
  active: boolean;
  notes: string | null;
  package_kind: string;
  pricing_mode: string;
  catalog_subtotal: number | null;
  discount_amount: number;
  discount_percent: number | null;
};

export type HubPackageItemRow = {
  id: string;
  package_id: string;
  hub_service_type_id: string;
  quantity: number;
  sort_order: number;
  pricing_variant?: HubQuotePricingVariantInput | null;
  hub_service_types?: { id: string; name: string; sale_amount: number; is_addon?: boolean } | { id: string; name: string; sale_amount: number; is_addon?: boolean }[] | null;
};

function matrixNeedsExplicitVariant(matrix: HubServicePricingMatrix | null): boolean {
  if (!matrix) return false;
  return (
    matrix.kind === 'periodo' ||
    matrix.kind === 'consulta' ||
    matrix.kind === 'km_banda' ||
    matrix.kind === 'personalizado'
  );
}

export function pricingVariantsEqual(
  a: HubQuotePricingVariantInput | null | undefined,
  b: HubQuotePricingVariantInput | null | undefined
): boolean {
  const norm = (v: HubQuotePricingVariantInput | null | undefined) => {
    if (!v) return null;
    const out: HubQuotePricingVariantInput = {};
    if (v.period) out.period = v.period;
    if (v.consult_type) out.consult_type = v.consult_type;
    if (typeof v.km_tier_index === 'number') out.km_tier_index = v.km_tier_index;
    if (typeof v.custom_tier_index === 'number') out.custom_tier_index = v.custom_tier_index;
    return Object.keys(out).length ? out : null;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Preço de referência do catálogo para composição do pacote. */
export function catalogReferenceSaleForPackageItem(
  st: ServiceTypePricingRow,
  pricingVariant?: HubQuotePricingVariantInput | null
): number {
  const matrix = parseMatrix(st.pricing_matrix);
  if (matrixNeedsExplicitVariant(matrix)) {
    const resolved = resolveServiceLinePricing({
      serviceType: st,
      pet: { size_tier: 'medio', birth_date: null, coat_type: null },
      appointmentDateYmd: new Date().toISOString().slice(0, 10),
      puppyMaxMonths: 12,
      overrideTier: null,
      overrideCoatType: null,
      pricing_variant: pricingVariant,
    });
    return resolved.sale;
  }
  return referenceSaleAmountForServiceType(st);
}

function parseMatrix(raw: unknown): HubServicePricingMatrix | null {
  const p = parsePricingMatrixJson(raw);
  if (!p || typeof p !== 'object' || 'error' in p) return null;
  return p as HubServicePricingMatrix;
}

/** Menor preço de venda na matriz (tier de referência para catálogo de pacotes). */
export function referenceSaleAmountForServiceType(st: ServiceTypePricingRow): number {
  const matrix = parseMatrix(st.pricing_matrix);
  const refSale = roundMoney2(Number(st.sale_amount) || 0);
  if (!matrix || !matrix.tiers?.length) return refSale;
  let min = Infinity;
  for (const tier of matrix.tiers) {
    const sale = roundMoney2(Number((tier as { sale_amount?: number }).sale_amount) || 0);
    if (sale < min) min = sale;
  }
  return min === Infinity ? refSale : min;
}

export function computePackagePriceFromCatalog(
  catalogSubtotal: number,
  discountAmount: number,
  discountPercent: number | null
): number {
  let price = catalogSubtotal;
  if (discountPercent != null && discountPercent > 0) {
    price = roundMoney2(price * (1 - discountPercent / 100));
  }
  price = roundMoney2(Math.max(0, price - discountAmount));
  return price;
}

export async function computePackageCatalogSubtotal(
  clinicId: string,
  items: HubPackageItemInput[]
): Promise<{ catalog_subtotal: number; lines: Array<{ hub_service_type_id: string; quantity: number; unit_reference_sale: number; line_total: number; service_name: string; is_addon: boolean; pricing_variant: HubQuotePricingVariantInput | null }> }> {
  if (!items.length) return { catalog_subtotal: 0, lines: [] };
  const ids = [...new Set(items.map((i) => i.hub_service_type_id))];
  const { data: types, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id, name, sale_amount, cost_amount, pricing_matrix, is_addon, active, deleted_at, service_group')
    .eq('clinic_id', clinicId)
    .in('id', ids);
  if (error) throw new Error(error.message);
  const byId = new Map((types ?? []).map((t) => [t.id as string, t as Record<string, unknown>]));
  const lines: Array<{ hub_service_type_id: string; quantity: number; unit_reference_sale: number; line_total: number; service_name: string; is_addon: boolean; pricing_variant: HubQuotePricingVariantInput | null }> = [];
  let catalogSubtotal = 0;
  for (const item of items) {
    const st = byId.get(item.hub_service_type_id);
    if (!st || st.deleted_at || !st.active) {
      throw new Error(`Serviço inválido ou inativo: ${item.hub_service_type_id}`);
    }
    const matrix = parseMatrix(st.pricing_matrix);
    const variant = item.pricing_variant ?? null;
    if (matrixNeedsExplicitVariant(matrix) && !variant) {
      throw new Error(`Selecione a opção de preço para «${String(st.name ?? 'serviço')}»`);
    }
    const unitRef = catalogReferenceSaleForPackageItem(st as unknown as ServiceTypePricingRow, variant);
    const lineTotal = roundMoney2(unitRef * item.quantity);
    catalogSubtotal += lineTotal;
    lines.push({
      hub_service_type_id: item.hub_service_type_id,
      quantity: item.quantity,
      unit_reference_sale: unitRef,
      line_total: lineTotal,
      service_name: String(st.name ?? 'Serviço'),
      is_addon: Boolean(st.is_addon),
      pricing_variant: variant,
    });
  }
  return { catalog_subtotal: roundMoney2(catalogSubtotal), lines };
}

export async function loadPackageWithItems(clinicId: string, packageId: string) {
  const { data: pkg, error } = await supabaseAdmin
    .from('hub_packages')
    .select('*')
    .eq('id', packageId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pkg) return null;

  const { data: items, error: iErr } = await supabaseAdmin
    .from('hub_package_items')
    .select('id, package_id, hub_service_type_id, quantity, sort_order, pricing_variant, hub_service_types(id, name, sale_amount, is_addon)')
    .eq('package_id', packageId)
    .eq('clinic_id', clinicId)
    .order('sort_order', { ascending: true });
  if (iErr) throw new Error(iErr.message);

  let resolvedItems = (items ?? []) as HubPackageItemRow[];
  if (resolvedItems.length === 0 && pkg.hub_service_type_id) {
    resolvedItems = [
      {
        id: 'legacy',
        package_id: packageId,
        hub_service_type_id: pkg.hub_service_type_id as string,
        quantity: Number(pkg.sessions_total ?? 1),
        sort_order: 0,
        hub_service_types: null,
      },
    ];
  }
  return { package: pkg as HubPackageRow, items: resolvedItems };
}

export function resolvePackagePurchasePetIds(input: {
  pet_id?: string | null;
  pet_ids?: string[];
}): (string | null)[] {
  const deduped = input.pet_ids?.length
    ? [...new Set(input.pet_ids.filter((id) => typeof id === 'string' && id.length > 0))]
    : [];
  if (deduped.length) return deduped;
  if (input.pet_id) return [input.pet_id];
  return [null];
}

export type PackagePurchaseLineInput = {
  packageId: string;
  petId: string;
};

export function resolvePackagePurchaseLines(input: {
  package_lines?: PackagePurchaseLineInput[];
  package_id?: string;
  pet_id?: string | null;
  pet_ids?: string[];
}): Array<{ packageId: string; petId: string | null }> {
  if (input.package_lines?.length) {
    const seen = new Set<string>();
    const lines: Array<{ packageId: string; petId: string | null }> = [];
    for (const ln of input.package_lines) {
      const key = `${ln.packageId}:${ln.petId}`;
      if (seen.has(key)) throw new Error('DUPLICATE_PACKAGE_PET_LINE');
      seen.add(key);
      lines.push({ packageId: ln.packageId, petId: ln.petId });
    }
    return lines;
  }
  if (!input.package_id) throw new Error('PACKAGE_ID_REQUIRED');
  const petIds = resolvePackagePurchasePetIds({ pet_id: input.pet_id, pet_ids: input.pet_ids });
  return petIds.map((petId) => ({ packageId: input.package_id!, petId }));
}

async function resolveDefaultUnitId(clinicId: string, unitId?: string | null): Promise<string | null> {
  if (unitId) return unitId;
  const { data: main } = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('is_main', true)
    .limit(1)
    .maybeSingle();
  return (main?.id as string) ?? null;
}

export async function buildComandaItemsFromPackagePurchases(input: {
  clinicId: string;
  purchaseGroupId: string;
  guardianId: string;
  unitId?: string | null;
  lines: Array<{ packageId: string; petId: string | null }>;
}) {
  if (!input.lines.length) throw new Error('PACKAGE_LINES_REQUIRED');

  const unitId = await resolveDefaultUnitId(input.clinicId, input.unitId);

  const uniquePackageIds = [...new Set(input.lines.map((ln) => ln.packageId))];
  const packageCache = new Map<string, Awaited<ReturnType<typeof loadPackageWithItems>>>();
  for (const packageId of uniquePackageIds) {
    const loaded = await loadPackageWithItems(input.clinicId, packageId);
    if (!loaded) throw new Error('NOT_FOUND');
    if (!loaded.package.active) throw new Error('PACKAGE_INACTIVE');
    packageCache.set(packageId, loaded);
  }

  const petIdsToFetch = [...new Set(input.lines.map((ln) => ln.petId).filter((id): id is string => Boolean(id)))];
  const petNames = new Map<string, string>();
  if (petIdsToFetch.length) {
    const { data: pets, error: petsErr } = await supabaseAdmin
      .from('hub_pets')
      .select('id, name')
      .eq('clinic_id', input.clinicId)
      .in('id', petIdsToFetch);
    if (petsErr) throw new Error(petsErr.message);
    for (const pet of pets ?? []) {
      petNames.set(pet.id as string, String(pet.name ?? 'Pet'));
    }
    for (const petId of petIdsToFetch) {
      if (!petNames.has(petId)) throw new Error('PET_NOT_FOUND');
    }
  }

  const items: Array<{
    pet_id: string | null;
    item_kind: 'fee';
    hub_service_type_id: null;
    hub_inventory_item_id: null;
    hub_inventory_lot_id: null;
    description: string;
    quantity: number;
    unit_amount: number;
    discount_amount: number;
    line_total: number;
    service_date: null;
    origin_type: 'package_purchase';
    origin_id: string;
    sort_order: number;
    package_balance_id: null;
  }> = [];

  let subtotal = 0;
  input.lines.forEach((ln, index) => {
    const loaded = packageCache.get(ln.packageId)!;
    const pkg = loaded.package;
    const price = roundMoney2(Number(pkg.price) || 0);
    const petLabel = ln.petId ? petNames.get(ln.petId) : null;
    const description = petLabel ? `Pacote — ${pkg.name} (${petLabel})` : `Pacote — ${pkg.name}`;
    items.push({
      pet_id: ln.petId,
      item_kind: 'fee',
      hub_service_type_id: null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description,
      quantity: 1,
      unit_amount: price,
      discount_amount: 0,
      line_total: price,
      service_date: null,
      origin_type: 'package_purchase',
      origin_id: ln.packageId,
      sort_order: index,
      package_balance_id: null,
    });
    subtotal = roundMoney2(subtotal + price);
  });

  const uniquePetIds = [...new Set(input.lines.map((ln) => ln.petId).filter((id): id is string => Boolean(id)))];
  const headerPetId = uniquePetIds.length === 1 ? uniquePetIds[0]! : null;
  const firstPackageId = input.lines[0]!.packageId;
  const firstLoaded = packageCache.get(firstPackageId)!;

  return {
    items,
    subtotal,
    unit_id: unitId,
    guardian_id: input.guardianId,
    pet_id: headerPetId,
    package_id: firstPackageId,
    purchase_group_id: input.purchaseGroupId,
    package_row: firstLoaded.package,
    package_items: firstLoaded.items,
  };
}

export async function buildComandaItemsFromPackagePurchase(input: {
  clinicId: string;
  packageId: string;
  purchaseGroupId: string;
  petId?: string | null;
  petIds?: string[];
  guardianId: string;
  unitId?: string | null;
  packageLines?: PackagePurchaseLineInput[];
}) {
  const lines = resolvePackagePurchaseLines({
    package_lines: input.packageLines,
    package_id: input.packageId,
    pet_id: input.petId,
    pet_ids: input.petIds,
  });
  return buildComandaItemsFromPackagePurchases({
    clinicId: input.clinicId,
    purchaseGroupId: input.purchaseGroupId,
    guardianId: input.guardianId,
    unitId: input.unitId,
    lines,
  });
}

export type HubPackageBalanceStatus = 'pending' | 'active' | 'cancelled' | 'voided';

async function resolvePackageBalanceStatusForReceivable(
  purchasedReceivableId: string | null,
): Promise<HubPackageBalanceStatus> {
  if (!purchasedReceivableId) return 'pending';
  const { data: rec, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('status')
    .eq('id', purchasedReceivableId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const st = String(rec?.status ?? '');
  if (st === 'paid') return 'active';
  if (st === 'cancelled' || st === 'refunded') return 'voided';
  return 'pending';
}

export class PackageBalanceError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = 'PackageBalanceError';
    this.status = status;
  }
}

function round2Pkg(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Há redemption não-reversa em algum saldo comprado por este recebível? */
export async function packageBalancesHaveOpenRedemptions(receivableId: string): Promise<boolean> {
  const { data: balances, error } = await supabaseAdmin
    .from('hub_customer_package_balances')
    .select('id')
    .eq('purchased_receivable_id', receivableId);
  if (error) throw new Error(error.message);
  if (!balances?.length) return false;
  const ids = balances.map((b) => b.id as string);
  const { data: openRedemptions, error: redErr } = await supabaseAdmin
    .from('hub_package_redemptions')
    .select('id')
    .in('balance_id', ids)
    .is('reversed_at', null)
    .limit(1);
  if (redErr) throw new Error(redErr.message);
  return (openRedemptions?.length ?? 0) > 0;
}

/**
 * Alinha status dos saldos ao recebível de compra.
 * Usável (listActive) só com status=active.
 * `cancelled` (cancel comercial) nunca é reativado pelo sync financeiro.
 * `voided` só quando recebível cancelado/refunded **sem** redemption.
 */
export async function syncPackageBalancesForReceivable(receivableId: string): Promise<void> {
  const { data: rec, error: rErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, status, clinic_id')
    .eq('id', receivableId)
    .maybeSingle();
  if (rErr || !rec) return;

  const recStatus = String(rec.status ?? '');
  const { data: balances, error: bErr } = await supabaseAdmin
    .from('hub_customer_package_balances')
    .select('id, status, clinic_id, sessions_remaining')
    .eq('purchased_receivable_id', receivableId);
  if (bErr) throw new Error(bErr.message);
  if (!balances?.length) return;

  for (const bal of balances) {
    const current = String(bal.status ?? 'active') as HubPackageBalanceStatus;
    // Cancel comercial é terminal para o sync financeiro (não reativa).
    if (current === 'cancelled') continue;
    if (current === 'voided' && recStatus !== 'paid') continue;

    const { data: openRedemptions, error: redErr } = await supabaseAdmin
      .from('hub_package_redemptions')
      .select('id')
      .eq('balance_id', bal.id as string)
      .is('reversed_at', null)
      .limit(1);
    if (redErr) throw new Error(redErr.message);
    const hasOpen = (openRedemptions?.length ?? 0) > 0;

    let target: HubPackageBalanceStatus | null = null;
    if (recStatus === 'paid') {
      if (current === 'pending' || current === 'voided') target = 'active';
    } else if (recStatus === 'cancelled' || recStatus === 'refunded') {
      if (!hasOpen) target = 'voided';
      // Com redemption: não força voided nem bloqueia — use cancel comercial.
    } else {
      // pending | partially_paid
      if (current === 'active' && !hasOpen) target = 'pending';
      // Com redemption: mantém active até cancel comercial explícito.
    }

    if (!target || target === current) continue;

    const { error: uErr } = await supabaseAdmin
      .from('hub_customer_package_balances')
      .update({ status: target })
      .eq('id', bal.id as string)
      .eq('clinic_id', bal.clinic_id as string);
    if (uErr) throw new Error(uErr.message);
  }
}

/**
 * Cancelamento comercial: restante inutilizável; redemptions intactas; não toca pagamentos.
 */
export async function cancelPackageBalanceCommercial(opts: {
  balanceId: string;
  clinicId: string;
  userId: string | null;
  reason: string;
}): Promise<Record<string, unknown>> {
  if (opts.reason.trim().length < 3) {
    throw new PackageBalanceError('Motivo do cancelamento obrigatório (mín. 3 caracteres)', 400);
  }
  const { data: bal, error } = await supabaseAdmin
    .from('hub_customer_package_balances')
    .select('*')
    .eq('id', opts.balanceId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!bal) throw new PackageBalanceError('Saldo de pacote não encontrado', 404);
  const status = String(bal.status ?? '');
  if (status === 'cancelled') {
    throw new PackageBalanceError('Pacote já cancelado comercialmente', 409);
  }
  if (status === 'voided') {
    throw new PackageBalanceError('Pacote já anulado (voided)', 409);
  }
  if (status !== 'active' && status !== 'pending') {
    throw new PackageBalanceError(`Status inválido para cancelar: ${status}`, 409);
  }

  const remaining = Math.max(0, Number(bal.sessions_remaining ?? 0));
  const { data: updated, error: uErr } = await supabaseAdmin
    .from('hub_customer_package_balances')
    .update({
      status: 'cancelled',
      sessions_remaining: 0,
      sessions_remaining_at_cancel: remaining,
      cancelled_at: new Date().toISOString(),
      cancelled_by_user_id: opts.userId,
      cancel_reason: opts.reason.trim(),
    })
    .eq('id', opts.balanceId)
    .eq('clinic_id', opts.clinicId)
    .select('*')
    .single();
  if (uErr || !updated) throw new Error(uErr?.message || 'Erro ao cancelar pacote');
  return updated as Record<string, unknown>;
}

export type PackageRefundPreview = {
  balance_id: string;
  status: string;
  sessions_total: number;
  sessions_consumed: number;
  sessions_remaining: number;
  sessions_remaining_at_cancel: number | null;
  paid_total: number;
  suggested_refund: number;
  purchased_receivable_id: string | null;
};

export async function previewPackageBalanceRefund(opts: {
  balanceId: string;
  clinicId: string;
}): Promise<PackageRefundPreview> {
  const { data: bal, error } = await supabaseAdmin
    .from('hub_customer_package_balances')
    .select('*')
    .eq('id', opts.balanceId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!bal) throw new PackageBalanceError('Saldo de pacote não encontrado', 404);

  const sessionsTotal = Math.max(0, Number(bal.sessions_total ?? 0));
  const remainingLive = Math.max(0, Number(bal.sessions_remaining ?? 0));
  const remainingAtCancel =
    bal.sessions_remaining_at_cancel != null ? Number(bal.sessions_remaining_at_cancel) : null;
  const remainingForFormula =
    String(bal.status) === 'cancelled' && remainingAtCancel != null
      ? Math.max(0, remainingAtCancel)
      : remainingLive;
  const consumed = Math.max(0, sessionsTotal - remainingForFormula);

  const receivableId = (bal.purchased_receivable_id as string | null) ?? null;
  let paidTotal = 0;
  if (receivableId) {
    const { data: pays, error: pErr } = await supabaseAdmin
      .from('hub_payments')
      .select('amount')
      .eq('receivable_id', receivableId)
      .eq('status', 'posted');
    if (pErr) throw new Error(pErr.message);
    paidTotal = round2Pkg((pays ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0));

    const { data: refunds, error: rErr } = await supabaseAdmin
      .from('hub_financial_adjustments')
      .select('amount')
      .eq('receivable_id', receivableId)
      .eq('adjustment_type', 'refund');
    if (rErr) throw new Error(rErr.message);
    const alreadyRefunded = round2Pkg((refunds ?? []).reduce((s, a) => s + Number(a.amount ?? 0), 0));
    paidTotal = round2Pkg(Math.max(0, paidTotal - alreadyRefunded));
  }

  const suggested =
    sessionsTotal > 0
      ? round2Pkg(paidTotal * (remainingForFormula / sessionsTotal))
      : 0;

  return {
    balance_id: bal.id as string,
    status: String(bal.status),
    sessions_total: sessionsTotal,
    sessions_consumed: consumed,
    sessions_remaining: remainingLive,
    sessions_remaining_at_cancel: remainingAtCancel,
    paid_total: paidTotal,
    suggested_refund: suggested,
    purchased_receivable_id: receivableId,
  };
}

/**
 * Estorno financeiro autorizado (parcial/total) via adjustment `refund`.
 * Não reverte redemptions. Exige saldo `cancelled` (ou `voided`).
 */
export async function authorizePackageBalanceRefund(opts: {
  balanceId: string;
  clinicId: string;
  userId: string | null;
  refundAmount: number;
  reason: string;
  refundMethod?: string | null;
  refundEffectiveDate?: string | null;
}): Promise<{
  preview: PackageRefundPreview;
  adjustment: Record<string, unknown>;
  receivable_status: string | null;
}> {
  if (opts.reason.trim().length < 3) {
    throw new PackageBalanceError('Motivo do estorno obrigatório (mín. 3 caracteres)', 400);
  }
  const amount = round2Pkg(opts.refundAmount);
  if (!(amount > 0)) {
    throw new PackageBalanceError('refund_amount deve ser positivo', 400);
  }

  const preview = await previewPackageBalanceRefund(opts);
  if (preview.status !== 'cancelled' && preview.status !== 'voided') {
    throw new PackageBalanceError(
      'Cancele o pacote comercialmente antes de autorizar o estorno financeiro.',
      409,
    );
  }
  if (amount > preview.paid_total + 0.02) {
    throw new PackageBalanceError(
      `Valor autorizado (${amount.toFixed(2)}) excede o líquido quitado (${preview.paid_total.toFixed(2)}).`,
      400,
    );
  }
  if (!preview.purchased_receivable_id) {
    throw new PackageBalanceError('Saldo sem recebível de compra — não há o que estornar.', 409);
  }

  const { data: adj, error: adjErr } = await supabaseAdmin
    .from('hub_financial_adjustments')
    .insert({
      clinic_id: opts.clinicId,
      receivable_id: preview.purchased_receivable_id,
      payment_id: null,
      adjustment_type: 'refund',
      amount,
      reason: opts.reason.trim(),
      created_by_user_id: opts.userId,
      refund_method: opts.refundMethod ?? null,
      refund_effective_date: opts.refundEffectiveDate ?? null,
    })
    .select('*')
    .single();
  if (adjErr || !adj) throw new Error(adjErr?.message || 'Erro ao registrar estorno');

  // Recebível permanece paid se o payment original não foi revertido;
  // o adjustment documenta a saída parcial autorizada.
  const { data: rec } = await supabaseAdmin
    .from('hub_receivables')
    .select('status')
    .eq('id', preview.purchased_receivable_id)
    .maybeSingle();

  return {
    preview: await previewPackageBalanceRefund(opts),
    adjustment: adj as Record<string, unknown>,
    receivable_status: rec?.status != null ? String(rec.status) : null,
  };
}

export async function createPackageBalancesOnCheckout(input: {
  clinicId: string;
  comandaId: string;
  purchaseGroupId: string;
  packageId: string;
  guardianId: string;
  petId: string | null;
  purchasedReceivableId: string | null;
}) {
  const loaded = await loadPackageWithItems(input.clinicId, input.packageId);
  if (!loaded) throw new Error('NOT_FOUND');
  const { package: pkg, items } = loaded;
  const now = new Date();
  let expiresAt: string | null = null;
  if (pkg.validity_days != null && pkg.validity_days > 0) {
    const d = new Date(now);
    d.setDate(d.getDate() + pkg.validity_days);
    expiresAt = d.toISOString().slice(0, 10);
  }
  const balanceStatus = await resolvePackageBalanceStatusForReceivable(input.purchasedReceivableId);
  const rows = items.map((it) => ({
    clinic_id: input.clinicId,
    guardian_id: input.guardianId,
    pet_id: input.petId,
    package_id: input.packageId,
    purchase_group_id: input.purchaseGroupId,
    hub_service_type_id: it.hub_service_type_id,
    package_item_id: it.id === 'legacy' ? null : it.id,
    pricing_variant: (it.pricing_variant as HubQuotePricingVariantInput | null) ?? null,
    sessions_total: it.quantity,
    sessions_remaining: it.quantity,
    purchased_receivable_id: input.purchasedReceivableId,
    comanda_id: input.comandaId,
    purchased_at: now.toISOString(),
    expires_at: expiresAt,
    status: balanceStatus,
  }));
  const { data, error } = await supabaseAdmin.from('hub_customer_package_balances').insert(rows).select('id');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listActivePackageBalances(input: {
  clinicId: string;
  guardianId?: string;
  petId?: string;
  hubServiceTypeId?: string;
  /** Inclui cancelled (gestão / estorno). Redeem e checkout continuam só com active. */
  includeCancelled?: boolean;
}) {
  let q = supabaseAdmin
    .from('hub_customer_package_balances')
    .select(
      'id, clinic_id, guardian_id, pet_id, package_id, hub_service_type_id, sessions_remaining, sessions_total, sessions_remaining_at_cancel, expires_at, purchased_at, purchase_group_id, pricing_variant, status, cancelled_at, cancel_reason, hub_packages(id, name), hub_service_types(id, name)'
    )
    .eq('clinic_id', input.clinicId);
  if (input.includeCancelled) {
    q = q.in('status', ['active', 'cancelled']);
  } else {
    q = q.eq('status', 'active').gt('sessions_remaining', 0);
  }
  if (input.guardianId) q = q.eq('guardian_id', input.guardianId);
  if (input.petId) q = q.or(`pet_id.eq.${input.petId},pet_id.is.null`);
  if (input.hubServiceTypeId) q = q.eq('hub_service_type_id', input.hubServiceTypeId);
  const { data, error } = await q.order('expires_at', { ascending: true, nullsFirst: false }).order('purchased_at', { ascending: true });
  if (error) throw new Error(error.message);
  if (input.includeCancelled) {
    return (data ?? []).filter(
      (b) =>
        String(b.status) === 'cancelled' ||
        (String(b.status) === 'active' && Number(b.sessions_remaining ?? 0) > 0),
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return (data ?? []).filter((row) => {
    const exp = row.expires_at as string | null;
    return !exp || exp >= today;
  });
}

/** FIFO: saldo mais antigo com validade mais próxima. */
export async function findEligiblePackageBalance(input: {
  clinicId: string;
  guardianId: string;
  petId: string | null;
  hubServiceTypeId: string;
  pricingVariant?: HubQuotePricingVariantInput | null;
  excludeBalanceIds?: string[];
}) {
  const balances = await listActivePackageBalances({
    clinicId: input.clinicId,
    guardianId: input.guardianId,
    hubServiceTypeId: input.hubServiceTypeId,
  });
  const exclude = new Set(input.excludeBalanceIds ?? []);
  for (const b of balances) {
    if (exclude.has(b.id as string)) continue;
    const balPet = b.pet_id as string | null;
    if (balPet && input.petId && balPet !== input.petId) continue;
    if (balPet && !input.petId) continue;
    const balVariant = (b.pricing_variant as HubQuotePricingVariantInput | null) ?? null;
    if (balVariant && !pricingVariantsEqual(balVariant, input.pricingVariant)) continue;
    return b;
  }
  return null;
}

export async function redeemPackageBalancesOnCheckout(input: {
  clinicId: string;
  comandaId: string;
  staffUserId: string | null;
}) {
  const { data: items, error } = await supabaseAdmin
    .from('hub_comanda_items')
    .select('id, package_balance_id, origin_type, origin_id, hub_service_type_id')
    .eq('comanda_id', input.comandaId)
    .not('package_balance_id', 'is', null);
  if (error) throw new Error(error.message);
  const redeemed: string[] = [];
  for (const it of items ?? []) {
    const balanceId = it.package_balance_id as string;
    const { data: bal, error: bErr } = await supabaseAdmin
      .from('hub_customer_package_balances')
      .select('id, sessions_remaining, clinic_id, status')
      .eq('id', balanceId)
      .eq('clinic_id', input.clinicId)
      .maybeSingle();
    if (bErr || !bal) throw new Error('PACKAGE_BALANCE_NOT_FOUND');
    if (String(bal.status) !== 'active') throw new Error('PACKAGE_BALANCE_NOT_ACTIVE');
    if (Number(bal.sessions_remaining) <= 0) throw new Error('PACKAGE_BALANCE_EMPTY');

    const appointmentServiceId =
      String(it.origin_type) === 'appointment_service' ? (it.origin_id as string) : null;

    const { error: rErr } = await supabaseAdmin.from('hub_package_redemptions').insert({
      clinic_id: input.clinicId,
      balance_id: balanceId,
      comanda_item_id: it.id as string,
      appointment_service_id: appointmentServiceId,
      redeemed_by_staff_id: null,
    });
    if (rErr) throw new Error(rErr.message);

    const { error: uErr } = await supabaseAdmin
      .from('hub_customer_package_balances')
      .update({ sessions_remaining: Number(bal.sessions_remaining) - 1 })
      .eq('id', balanceId)
      .eq('clinic_id', input.clinicId);
    if (uErr) throw new Error(uErr.message);
    redeemed.push(balanceId);
  }
  return redeemed;
}

export async function reversePackageRedemptionsForComanda(clinicId: string, comandaId: string) {
  const { data: items } = await supabaseAdmin.from('hub_comanda_items').select('id').eq('comanda_id', comandaId);
  const itemIds = (items ?? []).map((i) => i.id as string);
  if (!itemIds.length) return;
  const { data: redemptions } = await supabaseAdmin
    .from('hub_package_redemptions')
    .select('id, balance_id')
    .in('comanda_item_id', itemIds)
    .is('reversed_at', null);
  const now = new Date().toISOString();
  for (const r of redemptions ?? []) {
    await supabaseAdmin
      .from('hub_package_redemptions')
      .update({ reversed_at: now })
      .eq('id', r.id as string);
    const { data: bal } = await supabaseAdmin
      .from('hub_customer_package_balances')
      .select('sessions_remaining')
      .eq('id', r.balance_id as string)
      .maybeSingle();
    if (bal) {
      await supabaseAdmin
        .from('hub_customer_package_balances')
        .update({ sessions_remaining: Number(bal.sessions_remaining) + 1 })
        .eq('id', r.balance_id as string);
    }
  }
}

/** Cria saldos de pacote para cada linha `package_purchase` da comanda (idempotente por comanda + pacote + pet). */
export async function fulfillPackagePurchasesOnComandaCheckout(input: {
  clinicId: string;
  comandaId: string;
  purchaseGroupId: string;
  guardianId: string;
  packagePurchaseLines: Array<{ packageId: string; petId: string | null }>;
  purchasedReceivableId: string | null;
}) {
  const seen = new Set<string>();
  for (const line of input.packagePurchaseLines) {
    const key = `${line.packageId}:${line.petId ?? 'null'}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let existingQ = supabaseAdmin
      .from('hub_customer_package_balances')
      .select('id')
      .eq('clinic_id', input.clinicId)
      .eq('comanda_id', input.comandaId)
      .eq('package_id', line.packageId)
      .limit(1);
    existingQ = line.petId ? existingQ.eq('pet_id', line.petId) : existingQ.is('pet_id', null);
    const { data: existingBalances, error: existingErr } = await existingQ;
    if (existingErr) throw new Error(existingErr.message);
    if (existingBalances?.length) continue;

    await createPackageBalancesOnCheckout({
      clinicId: input.clinicId,
      comandaId: input.comandaId,
      purchaseGroupId: input.purchaseGroupId,
      packageId: line.packageId,
      guardianId: input.guardianId,
      petId: line.petId,
      purchasedReceivableId: input.purchasedReceivableId,
    });
  }
}

export function newPurchaseGroupId(): string {
  return randomUUID();
}

export function hasPackageBalanceForServices(
  balances: Awaited<ReturnType<typeof listActivePackageBalances>>,
  guardianId: string | null,
  petId: string | null,
  serviceTypeIds: string[]
): boolean {
  if (!guardianId || !serviceTypeIds.length) return false;
  for (const stId of serviceTypeIds) {
    for (const b of balances) {
      if (String(b.guardian_id) !== guardianId) continue;
      if (String(b.hub_service_type_id) !== stId) continue;
      const balPet = b.pet_id as string | null;
      if (balPet && petId && balPet !== petId) continue;
      if (balPet && !petId) continue;
      return true;
    }
  }
  return false;
}

/**
 * Zera valores de serviços cobertos por saldo (FIFO simulado por item).
 * Retorna novo estimated e services com amounts ajustados.
 */
export function applyPackageCoverageToEstimate(input: {
  balances: Awaited<ReturnType<typeof listActivePackageBalances>>;
  guardianId: string | null;
  petId: string | null;
  serviceTypeIds: string[];
  services: { name: string; amount: number }[];
  estimatedAmount: number;
}): { estimated_amount: number; services: { name: string; amount: number }[]; covered: boolean } {
  if (!input.guardianId || !input.services.length) {
    return { estimated_amount: input.estimatedAmount, services: input.services, covered: false };
  }
  const remainingByBalance = new Map<string, number>();
  for (const b of input.balances) {
    remainingByBalance.set(b.id as string, Number(b.sessions_remaining ?? 0));
  }
  let covered = false;
  const services = input.services.map((svc, idx) => {
    const stId = input.serviceTypeIds[idx];
    if (!stId) return svc;
    for (const b of input.balances) {
      if (String(b.guardian_id) !== input.guardianId) continue;
      if (String(b.hub_service_type_id) !== stId) continue;
      const balPet = b.pet_id as string | null;
      if (balPet && input.petId && balPet !== input.petId) continue;
      if (balPet && !input.petId) continue;
      const left = remainingByBalance.get(b.id as string) ?? 0;
      if (left <= 0) continue;
      remainingByBalance.set(b.id as string, left - 1);
      covered = true;
      return { ...svc, amount: 0 };
    }
    return svc;
  });
  const estimated_amount = Math.round(services.reduce((s, x) => s + Number(x.amount ?? 0), 0) * 100) / 100;
  return { estimated_amount, services, covered };
}

export async function eligibleBalancesForComandaItem(input: {
  clinicId: string;
  guardianId: string;
  petId: string | null;
  hubServiceTypeId: string;
  pricingVariant?: HubQuotePricingVariantInput | null;
}) {
  const balances = await listActivePackageBalances({
    clinicId: input.clinicId,
    guardianId: input.guardianId,
    hubServiceTypeId: input.hubServiceTypeId,
  });
  return balances.filter((b) => {
    const balPet = b.pet_id as string | null;
    if (balPet && input.petId && balPet !== input.petId) return false;
    if (balPet && !input.petId) return false;
    const balVariant = (b.pricing_variant as HubQuotePricingVariantInput | null) ?? null;
    if (balVariant && !pricingVariantsEqual(balVariant, input.pricingVariant)) return false;
    return true;
  });
}

type AutoApplyComandaItem = {
  pet_id: string | null;
  item_kind: string;
  hub_service_type_id: string | null;
  description: string;
  unit_amount: number;
  line_total: number;
  origin_type: string | null;
  origin_id: string | null;
  package_balance_id?: string | null;
  [key: string]: unknown;
};

/**
 * Aplica saldo de pacote elegível (FIFO por expires_at) em linhas de serviço sem cobertura.
 * Mutua `items` in-place; zera valor e anexa descrição "— Pacote …".
 * `excludeAppointmentIdsCoveredByInvoice`: não aplica pacote se a ocorrência já está em fatura de série.
 */
export async function autoApplyEligiblePackagesToItems<T extends AutoApplyComandaItem>(input: {
  clinicId: string;
  guardianId: string;
  items: T[];
  /** Resolve pricing_variant por item (ex.: appointment_service). */
  resolvePricingVariant?: (item: T) => Promise<HubQuotePricingVariantInput | null>;
  skipIfAlreadyCovered?: (item: T) => boolean | Promise<boolean>;
}): Promise<{ appliedCount: number; subtotal: number }> {
  const usedBalanceIds: string[] = [];
  let appliedCount = 0;

  for (const it of input.items) {
    if (it.package_balance_id) continue;
    if (it.item_kind !== 'service') continue;
    const serviceTypeId = it.hub_service_type_id;
    if (!serviceTypeId) continue;
    if (input.skipIfAlreadyCovered && (await input.skipIfAlreadyCovered(it))) continue;

    const pricingVariant = input.resolvePricingVariant
      ? await input.resolvePricingVariant(it)
      : null;

    const balance = await findEligiblePackageBalance({
      clinicId: input.clinicId,
      guardianId: input.guardianId,
      petId: it.pet_id,
      hubServiceTypeId: serviceTypeId,
      pricingVariant,
      excludeBalanceIds: usedBalanceIds,
    });
    if (!balance) continue;

    const pkgEmbed = balance.hub_packages as { name?: string } | { name?: string }[] | null;
    const pkgName = Array.isArray(pkgEmbed) ? pkgEmbed[0]?.name : pkgEmbed?.name;
    const remaining = Number(balance.sessions_remaining ?? 0);
    const baseDesc = String(it.description ?? '').split(' — Pacote')[0].trim();
    it.description = `${baseDesc} — Pacote ${pkgName ?? ''} (${remaining} restantes)`.trim();
    it.unit_amount = 0;
    it.line_total = 0;
    it.package_balance_id = balance.id as string;
    usedBalanceIds.push(balance.id as string);
    appliedCount += 1;
  }

  const subtotal = Math.round(
    input.items.reduce((s, it) => s + Number(it.line_total ?? 0), 0) * 100
  ) / 100;
  return { appliedCount, subtotal };
}
