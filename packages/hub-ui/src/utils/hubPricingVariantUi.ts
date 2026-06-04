import type { HubComboboxOption } from '../components/HubSearchableCombobox';
import type { HubQuotePricingVariant } from '../api/hubQuotesApi';
import type { HubServicePricingMatrix } from './hubServiceTypesPricingMatrix';

function fmtBrlShort(n: number): string {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function matrixNeedsVariantChoice(matrix: HubServicePricingMatrix | null): boolean {
  if (!matrix) return false;
  return (
    matrix.kind === 'periodo' ||
    matrix.kind === 'consulta' ||
    matrix.kind === 'km_banda' ||
    matrix.kind === 'personalizado'
  );
}

export function defaultPricingVariantForMatrix(matrix: HubServicePricingMatrix): HubQuotePricingVariant {
  if (matrix.kind === 'periodo') return { period: matrix.tiers[0]!.period };
  if (matrix.kind === 'consulta') {
    const t = matrix.tiers.find((x) => x.consult_type === 'padrao') ?? matrix.tiers[0];
    return { consult_type: t!.consult_type };
  }
  if (matrix.kind === 'km_banda') return { km_tier_index: 0 };
  if (matrix.kind === 'personalizado') return { custom_tier_index: 0 };
  return {};
}

export function variantComboboxOptionsForMatrix(matrix: HubServicePricingMatrix): HubComboboxOption[] {
  if (matrix.kind === 'periodo') {
    const PERIOD_LABEL: Record<'full_day' | 'half_day', string> = {
      full_day: 'Dia completo',
      half_day: 'Meio dia',
    };
    return matrix.tiers.map((t) => ({
      value: `period:${t.period}`,
      label: `${PERIOD_LABEL[t.period]} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  if (matrix.kind === 'consulta') {
    const CONSULT_LABEL: Record<'padrao' | 'retorno', string> = {
      padrao: 'Consulta padrão',
      retorno: 'Consulta de retorno',
    };
    return matrix.tiers.map((t) => ({
      value: `consult:${t.consult_type}`,
      label: `${CONSULT_LABEL[t.consult_type]} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  if (matrix.kind === 'km_banda') {
    return matrix.tiers.map((t, i) => ({
      value: `km:${i}`,
      label: `${(t.label || `Faixa ${i + 1}`).trim()} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  if (matrix.kind === 'personalizado') {
    return matrix.tiers.map((t, i) => ({
      value: `custom:${i}`,
      label: `${(t.label || `Opção ${i + 1}`).trim()} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  return [];
}

export function variantToComboValue(matrix: HubServicePricingMatrix, v: HubQuotePricingVariant | null): string {
  if (!v) return '';
  if (matrix.kind === 'periodo' && v.period) return `period:${v.period}`;
  if (matrix.kind === 'consulta' && v.consult_type) return `consult:${v.consult_type}`;
  if (matrix.kind === 'km_banda' && typeof v.km_tier_index === 'number') return `km:${v.km_tier_index}`;
  if (matrix.kind === 'personalizado' && typeof v.custom_tier_index === 'number') return `custom:${v.custom_tier_index}`;
  return '';
}

export function comboValueToVariant(matrix: HubServicePricingMatrix, raw: string): HubQuotePricingVariant | null {
  const [k, val] = raw.split(':');
  if (matrix.kind === 'periodo' && k === 'period' && (val === 'full_day' || val === 'half_day')) {
    return { period: val };
  }
  if (matrix.kind === 'consulta' && k === 'consult' && (val === 'padrao' || val === 'retorno')) {
    return { consult_type: val };
  }
  if (matrix.kind === 'km_banda' && k === 'km') {
    const i = Number.parseInt(val, 10);
    if (Number.isInteger(i) && i >= 0 && i < matrix.tiers.length) return { km_tier_index: i };
  }
  if (matrix.kind === 'personalizado' && k === 'custom') {
    const i = Number.parseInt(val, 10);
    if (Number.isInteger(i) && i >= 0 && i < matrix.tiers.length) return { custom_tier_index: i };
  }
  return null;
}

export function saleForMatrixVariant(matrix: HubServicePricingMatrix, v: HubQuotePricingVariant | null): number {
  const idx =
    matrix.kind === 'personalizado'
      ? v?.custom_tier_index
      : matrix.kind === 'km_banda'
        ? v?.km_tier_index
        : null;
  if (matrix.kind === 'personalizado' || matrix.kind === 'km_banda') {
    const i = typeof idx === 'number' ? idx : 0;
    const row = matrix.tiers[i] ?? matrix.tiers[0];
    return row ? row.sale_amount : 0;
  }
  if (matrix.kind === 'periodo' && v?.period) {
    const row = matrix.tiers.find((t) => t.period === v.period);
    return row?.sale_amount ?? 0;
  }
  if (matrix.kind === 'consulta' && v?.consult_type) {
    const row = matrix.tiers.find((t) => t.consult_type === v.consult_type);
    return row?.sale_amount ?? 0;
  }
  return matrix.tiers[0]?.sale_amount ?? 0;
}
