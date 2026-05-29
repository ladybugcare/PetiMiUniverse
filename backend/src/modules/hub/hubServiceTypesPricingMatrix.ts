import { z } from 'zod';

const moneyAmountSchema = z.coerce.number().finite().min(0).max(99_999_999.99);

export const PORTE_VALUES = ['filhote', 'mini', 'pequeno', 'medio', 'grande', 'gigante'] as const;
export type PorteValue = (typeof PORTE_VALUES)[number];

const porteEnum = z.enum(PORTE_VALUES);

export const COAT_TYPE_VALUES = ['curto', 'medio', 'longo', 'duplo', 'encaracolado', 'sem_pelo', 'outro'] as const;
export type CoatTypeValue = (typeof COAT_TYPE_VALUES)[number];

const coatTypeEnum = z.enum(COAT_TYPE_VALUES);

export const pricingMatrixPorteSchema = z.object({
  kind: z.literal('porte'),
  tiers: z
    .array(
      z.object({
        porte: porteEnum,
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
      })
    )
    .min(1),
});

export const pricingMatrixPelagemSchema = z.object({
  kind: z.literal('pelagem'),
  tiers: z
    .array(
      z.object({
        coat_type: coatTypeEnum,
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
      })
    )
    .min(1),
});

export const pricingMatrixPortePelagemSchema = z.object({
  kind: z.literal('porte_pelagem'),
  tiers: z
    .array(
      z.object({
        porte: porteEnum,
        coat_type: coatTypeEnum,
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
      })
    )
    .min(1),
});

export const pricingMatrixPeriodoSchema = z.object({
  kind: z.literal('periodo'),
  tiers: z
    .array(
      z.object({
        period: z.enum(['full_day', 'half_day']),
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
      })
    )
    .min(1),
});

export const pricingMatrixConsultaSchema = z.object({
  kind: z.literal('consulta'),
  tiers: z
    .array(
      z.object({
        consult_type: z.enum(['padrao', 'retorno']),
        cost_amount: moneyAmountSchema,
        /** Consulta de retorno gratuita: use 0. */
        sale_amount: moneyAmountSchema,
      })
    )
    .min(1),
});

export const pricingMatrixKmBandaSchema = z.object({
  kind: z.literal('km_banda'),
  tiers: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        km_min: z.number().finite().min(0).nullable().optional(),
        km_max: z.number().finite().min(0).nullable().optional(),
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
      })
    )
    .min(1),
});

export const pricingMatrixPersonalizadoSchema = z.object({
  kind: z.literal('personalizado'),
  tiers: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
      })
    )
    .min(1),
});

export const pricingMatrixSchema = z.discriminatedUnion('kind', [
  pricingMatrixPorteSchema,
  pricingMatrixPelagemSchema,
  pricingMatrixPortePelagemSchema,
  pricingMatrixPeriodoSchema,
  pricingMatrixConsultaSchema,
  pricingMatrixKmBandaSchema,
  pricingMatrixPersonalizadoSchema,
]);

export type HubServicePricingMatrix = z.infer<typeof pricingMatrixSchema>;

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Menor venda entre tiers + custo do mesmo tier (primeiro em empate de venda). Usado para preencher cost_amount/sale_amount de referência. */
export function computeReferenceAmountsFromMatrix(matrix: HubServicePricingMatrix): { cost_amount: number; sale_amount: number } {
  const tiers = matrix.tiers as Array<{ cost_amount: number; sale_amount: number }>;
  if (tiers.length === 0) return { cost_amount: 0, sale_amount: 0 };
  let bestIdx = 0;
  let bestSale = tiers[0].sale_amount;
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].sale_amount < bestSale) {
      bestSale = tiers[i].sale_amount;
      bestIdx = i;
    }
  }
  return {
    cost_amount: roundMoney2(tiers[bestIdx].cost_amount),
    sale_amount: roundMoney2(tiers[bestIdx].sale_amount),
  };
}

export function serviceGroupAllowsPricingMatrix(g: string): boolean {
  return g === 'banho_tosa' || g === 'hotel' || g === 'creche' || g === 'clinica' || g === 'leva_traz';
}

/** `personalizado` é permitido em qualquer grupo; os demais `kind` seguem regras por grupo. */
export function pricingMatrixAllowedForGroup(
  group: string,
  matrix: HubServicePricingMatrix
): true | { error: string } {
  if (matrix.kind === 'personalizado') return true;
  if (!serviceGroupAllowsPricingMatrix(group)) {
    return { error: 'Este grupo não suporta matriz de preços' };
  }
  return pricingMatrixKindMatchesGroup(group, matrix);
}

export function pricingMatrixKindMatchesGroup(
  group: string,
  matrix: HubServicePricingMatrix
): true | { error: string } {
  if (matrix.kind === 'personalizado') return true;
  if (!serviceGroupAllowsPricingMatrix(group)) {
    return { error: 'Este grupo não suporta matriz de preços' };
  }
  if (group === 'banho_tosa') {
    if (matrix.kind !== 'porte' && matrix.kind !== 'pelagem' && matrix.kind !== 'porte_pelagem') {
      return { error: 'Para Banho & Tosa, use preços por porte, pelagem ou porte + pelagem' };
    }
    return true;
  }
  if (group === 'hotel') {
    if (matrix.kind !== 'porte') return { error: 'Para Hotel, a matriz deve ser por porte' };
    return true;
  }
  if (group === 'creche') {
    if (matrix.kind !== 'periodo') return { error: 'Para Creche, a matriz deve ser por período (dia completo / meio dia)' };
    return true;
  }
  if (group === 'clinica') {
    if (matrix.kind !== 'consulta') return { error: 'Para Clínica, a matriz deve ser por tipo de consulta' };
    return true;
  }
  if (group === 'leva_traz') {
    if (matrix.kind !== 'km_banda') return { error: 'Para Leva e Traz, a matriz deve ser por faixa de quilometragem' };
    return true;
  }
  return true;
}

/** Adicionais: apenas preço único (sem matriz) ou matriz `personalizado`. */
export function pricingMatrixAllowedForAddon(matrix: HubServicePricingMatrix | null): true | { error: string } {
  if (!matrix) return true;
  if (matrix.kind === 'personalizado') return true;
  return { error: 'Adicionais só permitem preço único ou personalizado' };
}

function tierKeys(matrix: HubServicePricingMatrix): string[] {
  switch (matrix.kind) {
    case 'porte':
      return matrix.tiers.map((t) => t.porte);
    case 'pelagem':
      return matrix.tiers.map((t) => t.coat_type);
    case 'porte_pelagem':
      return matrix.tiers.map((t) => `${t.porte}|${t.coat_type}`);
    case 'periodo':
      return matrix.tiers.map((t) => t.period);
    case 'consulta':
      return matrix.tiers.map((t) => t.consult_type);
    case 'km_banda':
    case 'personalizado':
      return matrix.tiers.map((t, i) => `${t.label}#${i}`);
    default:
      return [];
  }
}

/** Rejeita chaves duplicadas (mesmo porte, mesmo período, etc.). */
export function assertUniqueTierKeys(matrix: HubServicePricingMatrix): true | { error: string } {
  const keys = tierKeys(matrix);
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) {
      return { error: 'Cada linha da matriz deve ter uma chave distinta (sem portes ou períodos duplicados)' };
    }
    seen.add(k);
  }
  return true;
}

export function parsePricingMatrixJson(raw: unknown): HubServicePricingMatrix | null | { error: string } {
  if (raw === null || raw === undefined) return null;
  const parsed = pricingMatrixSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'Matriz de preços inválida' };
  }
  const uniq = assertUniqueTierKeys(parsed.data);
  if (uniq !== true) return uniq;
  return parsed.data;
}
