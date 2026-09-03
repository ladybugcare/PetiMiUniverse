/**
 * Preços especiais (pet / tutor / plano família) — resolução e sync com catálogo.
 */
import { supabaseAdmin } from '../../config/supabase';
import { roundMoney2 } from './hubServiceTypesPricingMatrix';

export type SpecialPriceScope = 'pet' | 'guardian' | 'family_plan';
export type SpecialPriceStatus = 'pending_approval' | 'active' | 'inactive';
export type PricingSource = 'catalog' | 'special_pet' | 'special_guardian' | 'special_family' | 'manual';

export type HubSpecialPriceRow = {
  id: string;
  clinic_id: string;
  scope: SpecialPriceScope;
  guardian_id: string | null;
  pet_id: string | null;
  hub_service_type_id: string;
  sale_amount: number;
  cost_amount: number | null;
  notes: string | null;
  status: SpecialPriceStatus;
  catalog_sale_at_set: number | null;
  auto_track_catalog: boolean;
  needs_catalog_review: boolean;
  valid_from: string | null;
  valid_until: string | null;
  member_pet_ids?: string[];
};

export type ResolvedSpecialPrice = {
  special_price_id: string;
  scope: SpecialPriceScope;
  /** Valor já rateado (plano família) ou o sale_amount do acordo. */
  sale_amount: number;
  cost_amount: number | null;
  catalog_sale: number | null;
  pricing_source: Exclude<PricingSource, 'catalog' | 'manual'>;
  notes: string | null;
  /** Só family_plan: total do grupo e qtd de pets. */
  family_total?: number;
  family_pet_count?: number;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidOnDate(row: HubSpecialPriceRow, ymd: string): boolean {
  if (row.valid_from && ymd < row.valid_from) return false;
  if (row.valid_until && ymd > row.valid_until) return false;
  return true;
}

/** Rateio igualitário em centavos (resto nos primeiros pets). */
export function splitFamilyPlanAmounts(total: number, petCount: number): number[] {
  const n = Math.max(1, Math.floor(petCount));
  const cents = Math.round(roundMoney2(total) * 100);
  const base = Math.floor(cents / n);
  const rem = cents % n;
  return Array.from({ length: n }, (_, i) => roundMoney2((base + (i < rem ? 1 : 0)) / 100));
}

export function familyShareForPet(total: number, petCount: number, petIndex = 0): number {
  const shares = splitFamilyPlanAmounts(total, petCount);
  return shares[Math.min(Math.max(0, petIndex), shares.length - 1)] ?? roundMoney2(total / Math.max(1, petCount));
}

type DbSpecialPrice = {
  id: string;
  clinic_id: string;
  scope: SpecialPriceScope;
  guardian_id: string | null;
  pet_id: string | null;
  hub_service_type_id: string;
  sale_amount: number | string;
  cost_amount: number | string | null;
  notes: string | null;
  status: SpecialPriceStatus;
  catalog_sale_at_set: number | string | null;
  auto_track_catalog: boolean;
  needs_catalog_review: boolean;
  valid_from: string | null;
  valid_until: string | null;
};

function mapRow(r: DbSpecialPrice, memberPetIds?: string[]): HubSpecialPriceRow {
  return {
    id: r.id,
    clinic_id: r.clinic_id,
    scope: r.scope,
    guardian_id: r.guardian_id,
    pet_id: r.pet_id,
    hub_service_type_id: r.hub_service_type_id,
    sale_amount: roundMoney2(Number(r.sale_amount) || 0),
    cost_amount: r.cost_amount == null ? null : roundMoney2(Number(r.cost_amount) || 0),
    notes: r.notes,
    status: r.status,
    catalog_sale_at_set:
      r.catalog_sale_at_set == null ? null : roundMoney2(Number(r.catalog_sale_at_set) || 0),
    auto_track_catalog: Boolean(r.auto_track_catalog),
    needs_catalog_review: Boolean(r.needs_catalog_review),
    valid_from: r.valid_from,
    valid_until: r.valid_until,
    member_pet_ids: memberPetIds,
  };
}

async function loadMemberPetIds(specialPriceIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (specialPriceIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from('hub_special_price_pets')
    .select('special_price_id, pet_id')
    .in('special_price_id', specialPriceIds);
  if (error || !data) return map;
  for (const row of data as { special_price_id: string; pet_id: string }[]) {
    const list = map.get(row.special_price_id) ?? [];
    list.push(row.pet_id);
    map.set(row.special_price_id, list);
  }
  return map;
}

/**
 * Prioridade: pet > plano família (pet membro) > tutor.
 * Só status `active` e dentro da validade.
 */
export async function resolveActiveSpecialPrice(input: {
  clinicId: string;
  petId: string | null;
  guardianId: string | null;
  hubServiceTypeId: string;
  onDateYmd?: string;
  catalogSale?: number | null;
}): Promise<ResolvedSpecialPrice | null> {
  const { clinicId, petId, guardianId, hubServiceTypeId } = input;
  const ymd = input.onDateYmd ?? todayYmd();
  const catalogSale =
    input.catalogSale != null && Number.isFinite(input.catalogSale)
      ? roundMoney2(input.catalogSale)
      : null;

  if (!petId && !guardianId) return null;

  // 1) Override por pet
  if (petId) {
    const { data: petRows } = await supabaseAdmin
      .from('hub_special_prices')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('scope', 'pet')
      .eq('pet_id', petId)
      .eq('hub_service_type_id', hubServiceTypeId)
      .eq('status', 'active')
      .limit(1);
    const petRow = (petRows as DbSpecialPrice[] | null)?.[0];
    if (petRow && isValidOnDate(mapRow(petRow), ymd)) {
      const mapped = mapRow(petRow);
      return {
        special_price_id: mapped.id,
        scope: 'pet',
        sale_amount: mapped.sale_amount,
        cost_amount: mapped.cost_amount,
        catalog_sale: catalogSale ?? mapped.catalog_sale_at_set,
        pricing_source: 'special_pet',
        notes: mapped.notes,
      };
    }
  }

  // 2) Plano família que inclui o pet
  if (petId && guardianId) {
    const { data: familyRows } = await supabaseAdmin
      .from('hub_special_prices')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('scope', 'family_plan')
      .eq('guardian_id', guardianId)
      .eq('hub_service_type_id', hubServiceTypeId)
      .eq('status', 'active')
      .limit(5);
    const families = (familyRows as DbSpecialPrice[] | null) ?? [];
    if (families.length > 0) {
      const members = await loadMemberPetIds(families.map((f) => f.id));
      for (const fr of families) {
        const mapped = mapRow(fr, members.get(fr.id) ?? []);
        if (!isValidOnDate(mapped, ymd)) continue;
        const pets = mapped.member_pet_ids ?? [];
        const idx = pets.indexOf(petId);
        if (idx < 0) continue;
        const share = familyShareForPet(mapped.sale_amount, pets.length, idx);
        return {
          special_price_id: mapped.id,
          scope: 'family_plan',
          sale_amount: share,
          cost_amount: mapped.cost_amount,
          catalog_sale: catalogSale ?? mapped.catalog_sale_at_set,
          pricing_source: 'special_family',
          notes: mapped.notes,
          family_total: mapped.sale_amount,
          family_pet_count: pets.length,
        };
      }
    }
  }

  // 3) Override por tutor (vale para todos os pets do tutor)
  if (guardianId) {
    const { data: gRows } = await supabaseAdmin
      .from('hub_special_prices')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('scope', 'guardian')
      .eq('guardian_id', guardianId)
      .eq('hub_service_type_id', hubServiceTypeId)
      .eq('status', 'active')
      .limit(1);
    const gRow = (gRows as DbSpecialPrice[] | null)?.[0];
    if (gRow && isValidOnDate(mapRow(gRow), ymd)) {
      const mapped = mapRow(gRow);
      return {
        special_price_id: mapped.id,
        scope: 'guardian',
        sale_amount: mapped.sale_amount,
        cost_amount: mapped.cost_amount,
        catalog_sale: catalogSale ?? mapped.catalog_sale_at_set,
        pricing_source: 'special_guardian',
        notes: mapped.notes,
      };
    }
  }

  return null;
}

/** Resolve vários serviços de uma vez (agenda / refresh). */
export async function resolveSpecialPricesForServices(input: {
  clinicId: string;
  petId: string | null;
  guardianId: string | null;
  hubServiceTypeIds: string[];
  onDateYmd?: string;
  catalogSaleByServiceId?: Map<string, number>;
}): Promise<Map<string, ResolvedSpecialPrice>> {
  const out = new Map<string, ResolvedSpecialPrice>();
  const ids = [...new Set(input.hubServiceTypeIds.filter(Boolean))];
  for (const sid of ids) {
    const resolved = await resolveActiveSpecialPrice({
      clinicId: input.clinicId,
      petId: input.petId,
      guardianId: input.guardianId,
      hubServiceTypeId: sid,
      onDateYmd: input.onDateYmd,
      catalogSale: input.catalogSaleByServiceId?.get(sid) ?? null,
    });
    if (resolved) out.set(sid, resolved);
  }
  return out;
}

/**
 * Quando o sale_amount de referência do catálogo muda:
 * - auto_track_catalog: aplica o mesmo delta em R$ no sale_amount
 * - senão: marca needs_catalog_review
 */
export async function syncSpecialPricesOnCatalogChange(input: {
  clinicId: string;
  hubServiceTypeId: string;
  previousCatalogSale: number;
  nextCatalogSale: number;
}): Promise<{ reviewed: number; autoAdjusted: number }> {
  const prev = roundMoney2(input.previousCatalogSale);
  const next = roundMoney2(input.nextCatalogSale);
  if (prev === next) return { reviewed: 0, autoAdjusted: 0 };

  const { data, error } = await supabaseAdmin
    .from('hub_special_prices')
    .select('id, sale_amount, auto_track_catalog, catalog_sale_at_set, status')
    .eq('clinic_id', input.clinicId)
    .eq('hub_service_type_id', input.hubServiceTypeId)
    .in('status', ['active', 'pending_approval']);

  if (error || !data?.length) return { reviewed: 0, autoAdjusted: 0 };

  let reviewed = 0;
  let autoAdjusted = 0;
  const delta = roundMoney2(next - prev);

  for (const row of data as Array<{
    id: string;
    sale_amount: number | string;
    auto_track_catalog: boolean;
    catalog_sale_at_set: number | string | null;
    status: string;
  }>) {
    if (row.auto_track_catalog) {
      const oldSale = roundMoney2(Number(row.sale_amount) || 0);
      const newSale = Math.max(0, roundMoney2(oldSale + delta));
      await supabaseAdmin
        .from('hub_special_prices')
        .update({
          sale_amount: newSale,
          catalog_sale_at_set: next,
          needs_catalog_review: false,
        })
        .eq('id', row.id);
      autoAdjusted += 1;
    } else {
      await supabaseAdmin
        .from('hub_special_prices')
        .update({
          needs_catalog_review: true,
          catalog_sale_at_set: row.catalog_sale_at_set == null ? prev : row.catalog_sale_at_set,
        })
        .eq('id', row.id);
      reviewed += 1;
    }
  }

  return { reviewed, autoAdjusted };
}

export { mapRow as mapSpecialPriceRow, loadMemberPetIds, type DbSpecialPrice };
