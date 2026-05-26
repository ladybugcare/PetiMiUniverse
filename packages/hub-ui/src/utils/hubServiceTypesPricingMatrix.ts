/**
 * Matriz de precificação de `hub_service_types` (espelha o contrato validado no backend).
 * @see docs/architecture/HUB_SERVICE_TYPES_PRICING_MATRIX.md
 */

export const PORTE_VALUES = ['mini', 'pequeno', 'medio', 'grande', 'gigante'] as const;
export type PorteValue = (typeof PORTE_VALUES)[number];

export const PORTE_LABELS: Record<PorteValue, string> = {
  mini: 'Mini',
  pequeno: 'Pequeno',
  medio: 'Médio',
  grande: 'Grande',
  gigante: 'Gigante',
};

export type HubServicePricingMatrixPorte = {
  kind: 'porte';
  tiers: Array<{ porte: PorteValue; cost_amount: number; sale_amount: number }>;
};

export type HubServicePricingMatrixPeriodo = {
  kind: 'periodo';
  tiers: Array<{ period: 'full_day' | 'half_day'; cost_amount: number; sale_amount: number }>;
};

export type HubServicePricingMatrixConsulta = {
  kind: 'consulta';
  tiers: Array<{ consult_type: 'padrao' | 'retorno'; cost_amount: number; sale_amount: number }>;
};

export type HubServicePricingMatrixKmBanda = {
  kind: 'km_banda';
  tiers: Array<{
    label: string;
    km_min?: number | null;
    km_max?: number | null;
    cost_amount: number;
    sale_amount: number;
  }>;
};

export type HubServicePricingMatrix =
  | HubServicePricingMatrixPorte
  | HubServicePricingMatrixPeriodo
  | HubServicePricingMatrixConsulta
  | HubServicePricingMatrixKmBanda;

export function supportsPricingMatrixGroup(serviceGroup: string): boolean {
  return (
    serviceGroup === 'banho_tosa' ||
    serviceGroup === 'hotel' ||
    serviceGroup === 'creche' ||
    serviceGroup === 'clinica' ||
    serviceGroup === 'leva_traz'
  );
}

export function matrixKindForGroup(serviceGroup: string): HubServicePricingMatrix['kind'] | null {
  if (serviceGroup === 'banho_tosa' || serviceGroup === 'hotel') return 'porte';
  if (serviceGroup === 'creche') return 'periodo';
  if (serviceGroup === 'clinica') return 'consulta';
  if (serviceGroup === 'leva_traz') return 'km_banda';
  return null;
}

export function defaultPricingMatrixForGroup(
  serviceGroup: string,
  seed?: { cost_amount: number; sale_amount: number }
): HubServicePricingMatrix | null {
  const c = seed?.cost_amount ?? 0;
  const s = seed?.sale_amount ?? 0;
  if (serviceGroup === 'banho_tosa' || serviceGroup === 'hotel') {
    return {
      kind: 'porte',
      tiers: PORTE_VALUES.map((porte) => ({ porte, cost_amount: c, sale_amount: s })),
    };
  }
  if (serviceGroup === 'creche') {
    return {
      kind: 'periodo',
      tiers: [
        { period: 'full_day', cost_amount: c, sale_amount: s },
        { period: 'half_day', cost_amount: c, sale_amount: s },
      ],
    };
  }
  if (serviceGroup === 'clinica') {
    return {
      kind: 'consulta',
      tiers: [
        { consult_type: 'padrao', cost_amount: c, sale_amount: s },
        { consult_type: 'retorno', cost_amount: c, sale_amount: s },
      ],
    };
  }
  if (serviceGroup === 'leva_traz') {
    return {
      kind: 'km_banda',
      tiers: [{ label: 'Até X km', km_min: null, km_max: null, cost_amount: c, sale_amount: s }],
    };
  }
  return null;
}

function tierKeys(matrix: HubServicePricingMatrix): string[] {
  switch (matrix.kind) {
    case 'porte':
      return matrix.tiers.map((t) => t.porte);
    case 'periodo':
      return matrix.tiers.map((t) => t.period);
    case 'consulta':
      return matrix.tiers.map((t) => t.consult_type);
    case 'km_banda':
      return matrix.tiers.map((t, i) => `${t.label}#${i}`);
    default:
      return [];
  }
}

function isFiniteMoney(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 99_999_999.99;
}

/** Validação leve no cliente (o backend é a fonte de verdade). */
export function validatePricingMatrixClient(
  serviceGroup: string,
  matrix: HubServicePricingMatrix
): string | null {
  if (!supportsPricingMatrixGroup(serviceGroup)) {
    return 'Este grupo não suporta matriz de preços';
  }
  if (serviceGroup === 'banho_tosa' || serviceGroup === 'hotel') {
    if (matrix.kind !== 'porte') return 'Para este grupo, use preços por porte';
  } else if (serviceGroup === 'creche') {
    if (matrix.kind !== 'periodo') return 'Para Creche, use período (dia completo / meio dia)';
  } else if (serviceGroup === 'clinica') {
    if (matrix.kind !== 'consulta') return 'Para Clínica, use tipo de consulta';
  } else if (serviceGroup === 'leva_traz') {
    if (matrix.kind !== 'km_banda') return 'Para Leva e Traz, use faixas de quilometragem';
  }

  const keys = tierKeys(matrix);
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) return 'Não repita a mesma linha (chave duplicada)';
    seen.add(k);
  }

  for (const t of matrix.tiers) {
    if (!isFiniteMoney(t.cost_amount) || !isFiniteMoney(t.sale_amount)) {
      return 'Custos e vendas devem ser números ≥ 0';
    }
  }

  if (matrix.kind === 'km_banda') {
    for (const t of matrix.tiers) {
      if (!t.label || !t.label.trim()) return 'Cada faixa precisa de um nome ou descrição';
      if (t.km_min != null && (!Number.isFinite(t.km_min) || t.km_min < 0)) return 'Km mínimo inválido';
      if (t.km_max != null && (!Number.isFinite(t.km_max) || t.km_max < 0)) return 'Km máximo inválido';
    }
  }

  return null;
}

export function computeReferenceFromMatrix(matrix: HubServicePricingMatrix): { cost: number; sale: number } {
  const tiers = matrix.tiers;
  if (tiers.length === 0) return { cost: 0, sale: 0 };
  let bestIdx = 0;
  let bestSale = tiers[0].sale_amount;
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].sale_amount < bestSale) {
      bestSale = tiers[i].sale_amount;
      bestIdx = i;
    }
  }
  return { cost: tiers[bestIdx].cost_amount, sale: tiers[bestIdx].sale_amount };
}

export function saleRangeSummary(matrix: HubServicePricingMatrix): { min: number; max: number } {
  const sales = matrix.tiers.map((t) => t.sale_amount);
  return { min: Math.min(...sales), max: Math.max(...sales) };
}

export function coercePricingMatrixFromApi(raw: unknown): HubServicePricingMatrix | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as { kind?: string; tiers?: unknown };
  if (o.kind !== 'porte' && o.kind !== 'periodo' && o.kind !== 'consulta' && o.kind !== 'km_banda') return null;
  if (!Array.isArray(o.tiers)) return null;
  return raw as HubServicePricingMatrix;
}
