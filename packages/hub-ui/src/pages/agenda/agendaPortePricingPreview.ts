import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  COAT_TYPE_VALUES,
  PORTE_VALUES,
  type CoatTypeValue,
  type PorteValue,
  PET_BODY_PORTE_VALUES,
  type PetBodyPorteValue,
  coercePricingMatrixFromApi,
  type HubServicePricingMatrix,
  type HubServicePricingMatrixPelagem,
  type HubServicePricingMatrixPorte,
  type HubServicePricingMatrixPortePelagem,
} from '../../utils/hubServiceTypesPricingMatrix';

function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/** Idade em meses completos entre birthYmd e refYmd (ref ≥ birth). Espelha o backend. */
export function ageInWholeMonths(birthYmd: string | null, refYmd: string): number | null {
  if (!birthYmd || !/^\d{4}-\d{2}-\d{2}$/.test(birthYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(refYmd)) return null;
  const [by, bm, bd] = birthYmd.split('-').map(Number);
  const [ry, rm, rd] = refYmd.split('-').map(Number);
  if (!by || !bm || !bd || !ry || !rm || !rd) return null;
  let months = (ry - by) * 12 + (rm - bm);
  if (rd < bd) months -= 1;
  return Math.max(0, months);
}

function parsePricingMatrix(st: HubServiceType): HubServicePricingMatrix | null {
  return coercePricingMatrixFromApi(st.pricing_matrix);
}

function pickCoatAmounts(matrix: HubServicePricingMatrixPelagem, coatType: string): { cost: number; sale: number } | null {
  const row = matrix.tiers.find((t) => t.coat_type === (coatType as CoatTypeValue));
  if (!row) return null;
  return { cost: round2(row.cost_amount), sale: round2(row.sale_amount) };
}

function pickPorteCoatAmounts(
  matrix: HubServicePricingMatrixPortePelagem,
  tier: string,
  coatType: string,
): { cost: number; sale: number } | null {
  const row = matrix.tiers.find((t) => t.porte === (tier as PorteValue) && t.coat_type === (coatType as CoatTypeValue));
  if (!row) return null;
  return { cost: round2(row.cost_amount), sale: round2(row.sale_amount) };
}

function resolveAutoPorte(input: {
  matrix: HubServicePricingMatrixPorte | HubServicePricingMatrixPortePelagem;
  petSizeTier: string;
  petBirthDate: string | null;
  appointmentDateYmd: string;
  puppyMaxMonths: number;
  appointmentOverrideTier: string | null;
}): string | null {
  const { matrix, petSizeTier, petBirthDate, appointmentDateYmd, puppyMaxMonths, appointmentOverrideTier } = input;
  const tierSet = new Set<string>(matrix.tiers.map((t) => t.porte));
  const ov = appointmentOverrideTier?.trim() || null;
  if (ov && tierSet.has(ov)) return ov;
  const ageM = ageInWholeMonths(petBirthDate, appointmentDateYmd);
  if (ageM != null && ageM < puppyMaxMonths && tierSet.has('filhote')) return 'filhote';
  const bodyTier = PET_BODY_PORTE_VALUES.includes(petSizeTier as PetBodyPorteValue) ? petSizeTier : 'medio';
  if (tierSet.has(bodyTier)) return bodyTier;
  return matrix.tiers[0]?.porte ?? null;
}

function resolveAutoCoat(input: {
  matrix: HubServicePricingMatrixPelagem | HubServicePricingMatrixPortePelagem;
  petCoatType: string | null;
  appointmentOverrideCoatType: string | null;
}): string | null {
  const { matrix, petCoatType, appointmentOverrideCoatType } = input;
  const coatSet = new Set<string>(matrix.tiers.map((t) => t.coat_type));
  const ov = appointmentOverrideCoatType?.trim() || null;
  if (ov && coatSet.has(ov)) return ov;
  if (petCoatType && COAT_TYPE_VALUES.includes(petCoatType as CoatTypeValue) && coatSet.has(petCoatType)) return petCoatType;
  return null;
}

function pickAmounts(matrix: HubServicePricingMatrixPorte, tier: string): { cost: number; sale: number } | null {
  const row = matrix.tiers.find((t) => t.porte === (tier as PorteValue));
  if (!row) return null;
  return { cost: round2(row.cost_amount), sale: round2(row.sale_amount) };
}

export function resolvePorteLinePreview(input: {
  serviceType: HubServiceType;
  petSizeTier: string;
  petBirthDate: string | null;
  appointmentDateYmd: string;
  puppyMaxMonths: number;
  appointmentOverrideTier: string | null;
  petCoatType?: string | null;
  appointmentOverrideCoatType?: string | null;
}): { tierApplied: string | null; coatTypeApplied: string | null; cost: number; sale: number; needsCoatType: boolean } {
  const { serviceType, petSizeTier, petBirthDate, appointmentDateYmd, puppyMaxMonths, appointmentOverrideTier, petCoatType, appointmentOverrideCoatType } =
    input;
  const refCost = round2(Number(serviceType.cost_amount) || 0);
  const refSale = round2(Number(serviceType.sale_amount) || 0);
  const matrix = parsePricingMatrix(serviceType);
  if (!matrix) {
    return { tierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, needsCoatType: false };
  }
  if (matrix.kind === 'porte') {
    const tier = resolveAutoPorte({ matrix, petSizeTier, petBirthDate, appointmentDateYmd, puppyMaxMonths, appointmentOverrideTier });
    const picked = tier ? pickAmounts(matrix, tier) : null;
    return picked
      ? { tierApplied: tier, coatTypeApplied: null, ...picked, needsCoatType: false }
      : { tierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, needsCoatType: false };
  }
  if (matrix.kind === 'pelagem') {
    const coat = resolveAutoCoat({ matrix, petCoatType: petCoatType ?? null, appointmentOverrideCoatType: appointmentOverrideCoatType ?? null });
    const picked = coat ? pickCoatAmounts(matrix, coat) : null;
    return picked
      ? { tierApplied: null, coatTypeApplied: coat, ...picked, needsCoatType: false }
      : { tierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, needsCoatType: true };
  }
  if (matrix.kind === 'porte_pelagem') {
    const tier = resolveAutoPorte({ matrix, petSizeTier, petBirthDate, appointmentDateYmd, puppyMaxMonths, appointmentOverrideTier });
    const coat = resolveAutoCoat({ matrix, petCoatType: petCoatType ?? null, appointmentOverrideCoatType: appointmentOverrideCoatType ?? null });
    const picked = tier && coat ? pickPorteCoatAmounts(matrix, tier, coat) : null;
    return picked
      ? { tierApplied: tier, coatTypeApplied: coat, ...picked, needsCoatType: false }
      : { tierApplied: tier, coatTypeApplied: coat, cost: refCost, sale: refSale, needsCoatType: !coat };
  }
  if (matrix.kind === 'km_banda') {
    const t0 = matrix.tiers[0];
    if (t0) {
      return {
        tierApplied: null,
        coatTypeApplied: null,
        cost: round2(t0.cost_amount),
        sale: round2(t0.sale_amount),
        needsCoatType: false,
      };
    }
  }
  if (matrix.kind === 'periodo') {
    const t0 = matrix.tiers[0];
    if (t0) {
      return {
        tierApplied: null,
        coatTypeApplied: null,
        cost: round2(t0.cost_amount),
        sale: round2(t0.sale_amount),
        needsCoatType: false,
      };
    }
  }
  if (matrix.kind === 'consulta') {
    const t = matrix.tiers.find((x) => x.consult_type === 'padrao') ?? matrix.tiers[0];
    if (t) {
      return {
        tierApplied: null,
        coatTypeApplied: null,
        cost: round2(t.cost_amount),
        sale: round2(t.sale_amount),
        needsCoatType: false,
      };
    }
  }
  if (matrix.kind === 'personalizado') {
    const t0 = matrix.tiers[0];
    if (t0) {
      return {
        tierApplied: null,
        coatTypeApplied: null,
        cost: round2(t0.cost_amount),
        sale: round2(t0.sale_amount),
        needsCoatType: false,
      };
    }
  }
  return { tierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, needsCoatType: false };
}

function resolveVariantLinePreview(
  serviceType: HubServiceType,
  pricingVariant: HubQuotePricingVariant | null | undefined
): { cost: number; sale: number } {
  const refCost = round2(Number(serviceType.cost_amount) || 0);
  const refSale = round2(Number(serviceType.sale_amount) || 0);
  const matrix = parsePricingMatrix(serviceType);
  if (!matrix) return { cost: refCost, sale: refSale };

  if (matrix.kind === 'personalizado') {
    const idx = pricingVariant?.custom_tier_index;
    const i =
      typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < matrix.tiers.length ? idx : 0;
    const row = matrix.tiers[i] ?? matrix.tiers[0];
    return row ? { cost: round2(row.cost_amount), sale: round2(row.sale_amount) } : { cost: refCost, sale: refSale };
  }
  if (matrix.kind === 'km_banda') {
    const idx = pricingVariant?.km_tier_index;
    const i =
      typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < matrix.tiers.length ? idx : 0;
    const row = matrix.tiers[i] ?? matrix.tiers[0];
    return row ? { cost: round2(row.cost_amount), sale: round2(row.sale_amount) } : { cost: refCost, sale: refSale };
  }
  if (matrix.kind === 'periodo' && pricingVariant?.period) {
    const row = matrix.tiers.find((t) => t.period === pricingVariant.period);
    return row ? { cost: round2(row.cost_amount), sale: round2(row.sale_amount) } : { cost: refCost, sale: refSale };
  }
  if (matrix.kind === 'consulta' && pricingVariant?.consult_type) {
    const row = matrix.tiers.find((t) => t.consult_type === pricingVariant.consult_type);
    return row ? { cost: round2(row.cost_amount), sale: round2(row.sale_amount) } : { cost: refCost, sale: refSale };
  }
  return { cost: refCost, sale: refSale };
}

/** União ordenada dos tiers `porte` presentes nas matrizes dos serviços selecionados. */
export function unionPorteTiersForServiceSelection(
  serviceTypeIds: string[],
  serviceTypes: HubServiceType[],
): PorteValue[] {
  const set = new Set<string>();
  for (const id of serviceTypeIds) {
    const st = serviceTypes.find((x) => x.id === id);
    const m = st ? parsePricingMatrix(st) : null;
    if (m?.kind === 'porte' || m?.kind === 'porte_pelagem') {
      for (const t of m.tiers) set.add(t.porte);
    }
  }
  return (PORTE_VALUES as readonly string[]).filter((v) => set.has(v)) as PorteValue[];
}

export function validateAppointmentPorteOverride(
  override: string | null,
  serviceTypeIds: string[],
  serviceTypes: HubServiceType[],
): string | null {
  const t = override?.trim();
  if (!t) return null;
  const seen = new Set(serviceTypeIds);
  for (const id of seen) {
    const st = serviceTypes.find((x) => x.id === id);
    if (!st) continue;
    const m = parsePricingMatrix(st);
    if (m?.kind !== 'porte' && m?.kind !== 'porte_pelagem') continue;
    if (!m.tiers.some((x) => x.porte === (t as PorteValue))) {
      return `O porte «${t}» não existe na matriz de preços do serviço «${st.name}». Ajuste a matriz ou escolha outro porte.`;
    }
  }
  return null;
}

export function unionCoatTypesForServiceSelection(
  serviceTypeIds: string[],
  serviceTypes: HubServiceType[],
): CoatTypeValue[] {
  const set = new Set<string>();
  for (const id of serviceTypeIds) {
    const st = serviceTypes.find((x) => x.id === id);
    const m = st ? parsePricingMatrix(st) : null;
    if (m?.kind === 'pelagem' || m?.kind === 'porte_pelagem') {
      for (const t of m.tiers) set.add(t.coat_type);
    }
  }
  return (COAT_TYPE_VALUES as readonly string[]).filter((v) => set.has(v)) as CoatTypeValue[];
}

export function validateAppointmentCoatOverride(
  override: string | null,
  serviceTypeIds: string[],
  serviceTypes: HubServiceType[],
): string | null {
  const t = override?.trim();
  if (!t) return null;
  const seen = new Set(serviceTypeIds);
  for (const id of seen) {
    const st = serviceTypes.find((x) => x.id === id);
    if (!st) continue;
    const m = parsePricingMatrix(st);
    if (m?.kind !== 'pelagem' && m?.kind !== 'porte_pelagem') continue;
    if (!m.tiers.some((x) => x.coat_type === (t as CoatTypeValue))) {
      return `A pelagem «${t}» não existe na matriz de preços do serviço «${st.name}». Ajuste a matriz ou escolha outra pelagem.`;
    }
  }
  return null;
}

export type AgendaPricingPreviewLine = {
  hub_service_type_id: string;
  name: string;
  tierApplied: string | null;
  coatTypeApplied: string | null;
  sale: number;
  cost: number;
  needsCoatType: boolean;
  isAddon?: boolean;
};

export type AgendaPricingPreviewRow = {
  hub_service_type_id: string;
  name: string;
  pricing_variant?: HubQuotePricingVariant | null;
  isAddon?: boolean;
};

export function buildAgendaPricingPreview(input: {
  mainServices: AgendaPricingPreviewRow[];
  extraServices: AgendaPricingPreviewRow[];
  serviceTypes: HubServiceType[];
  petSizeTier: string;
  petBirthDate: string | null;
  petCoatType: string | null;
  appointmentDateYmd: string;
  puppyMaxMonths: number;
  appointmentOverrideTier: string | null;
  appointmentOverrideCoatType: string | null;
}): { lines: AgendaPricingPreviewLine[]; totalSale: number; totalCost: number } {
  const { mainServices, extraServices, serviceTypes, petSizeTier, petBirthDate, petCoatType, appointmentDateYmd, puppyMaxMonths, appointmentOverrideTier, appointmentOverrideCoatType } =
    input;
  const all = [...mainServices, ...extraServices];
  const lines: AgendaPricingPreviewLine[] = [];
  let totalSale = 0;
  let totalCost = 0;
  for (const row of all) {
    const st = serviceTypes.find((x) => x.id === row.hub_service_type_id);
    if (!st) continue;
    const isAddon = row.isAddon === true || st.is_addon === true;
    const matrix = parsePricingMatrix(st);
    if (isAddon) {
      const p = resolveVariantLinePreview(st, row.pricing_variant);
      lines.push({
        hub_service_type_id: row.hub_service_type_id,
        name: row.name,
        tierApplied: null,
        coatTypeApplied: null,
        sale: p.sale,
        cost: p.cost,
        needsCoatType: false,
        isAddon: true,
      });
      totalSale += p.sale;
      totalCost += p.cost;
      continue;
    }
    const variantPricing =
      matrix &&
      (matrix.kind === 'personalizado' ||
        matrix.kind === 'km_banda' ||
        matrix.kind === 'periodo' ||
        matrix.kind === 'consulta');
    const r = variantPricing
      ? (() => {
          const p = resolveVariantLinePreview(st, row.pricing_variant);
          return {
            tierApplied: null as string | null,
            coatTypeApplied: null as string | null,
            sale: p.sale,
            cost: p.cost,
            needsCoatType: false,
          };
        })()
      : resolvePorteLinePreview({
          serviceType: st,
          petSizeTier,
          petBirthDate,
          appointmentDateYmd,
          puppyMaxMonths,
          appointmentOverrideTier,
          petCoatType,
          appointmentOverrideCoatType,
        });
    lines.push({
      hub_service_type_id: row.hub_service_type_id,
      name: row.name,
      tierApplied: r.tierApplied,
      coatTypeApplied: r.coatTypeApplied,
      sale: r.sale,
      cost: r.cost,
      needsCoatType: r.needsCoatType,
      isAddon: false,
    });
    totalSale += r.sale;
    totalCost += r.cost;
  }
  return { lines, totalSale: round2(totalSale), totalCost: round2(totalCost) };
}

/** Matriz km_banda: o valor do tier é a cobrança ida+volta (uma vez), não por perna. */
export function previewLevaTrazBandPricing(
  serviceType: HubServiceType,
  kmTierIndex: number,
): { bandLabel: string; saleRoundTrip: number; costRoundTrip: number } {
  const matrix = parsePricingMatrix(serviceType);
  if (!matrix || matrix.kind !== 'km_banda') {
    return {
      bandLabel: '—',
      saleRoundTrip: round2(Number(serviceType.sale_amount) || 0),
      costRoundTrip: round2(Number(serviceType.cost_amount) || 0),
    };
  }
  const idx = Math.max(0, Math.min(Math.floor(Number(kmTierIndex)) || 0, matrix.tiers.length - 1));
  const t = matrix.tiers[idx]!;
  return {
    bandLabel: t.label || `Faixa ${idx + 1}`,
    saleRoundTrip: round2(t.sale_amount),
    costRoundTrip: round2(t.cost_amount),
  };
}
