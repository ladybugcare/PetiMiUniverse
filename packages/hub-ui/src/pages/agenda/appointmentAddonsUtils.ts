import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  coercePricingMatrixFromApi,
  type HubServicePricingMatrix,
} from '../../utils/hubServiceTypesPricingMatrix';
import { matrixNeedsVariantChoice } from '../../utils/hubPricingVariantUi';

export type AppointmentServiceChip = {
  hub_service_type_id: string;
  name: string;
  duration_minutes: number;
  pricing_variant?: HubQuotePricingVariant | null;
};

function fmtBrl(n: number): string {
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function addonMetaLabel(addon: HubServiceType): string {
  const dur = addon.default_duration_minutes != null ? `${addon.default_duration_minutes} min` : '';
  const m = coercePricingMatrixFromApi(addon.pricing_matrix);
  let price = '';
  if (m?.kind === 'personalizado' && m.tiers.length > 0) {
    const from = Math.min(...m.tiers.map((t) => t.sale_amount));
    price = `a partir de ${fmtBrl(from)}`;
  } else if (addon.sale_amount != null) {
    price = fmtBrl(Number(addon.sale_amount));
  }
  return [dur, price].filter(Boolean).join(' · ');
}

export function addonNeedsVariantOnRow(
  addon: HubServiceType,
  chip: AppointmentServiceChip | undefined
): { matrix: HubServicePricingMatrix } | null {
  const matrix = coercePricingMatrixFromApi(addon.pricing_matrix);
  if (!matrix || !matrixNeedsVariantChoice(matrix)) return null;
  if (!chip) return null;
  return { matrix };
}

export function validateSelectedAddonVariants(
  selectedAddons: AppointmentServiceChip[],
  availableAddons: HubServiceType[],
  serviceTypes: HubServiceType[]
): string | null {
  for (const chip of selectedAddons) {
    const st =
      availableAddons.find((x) => x.id === chip.hub_service_type_id) ??
      serviceTypes.find((x) => x.id === chip.hub_service_type_id);
    if (!st) continue;
    const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
    if (!matrix || !matrixNeedsVariantChoice(matrix)) continue;
    const combo = variantComboValid(matrix, chip.pricing_variant);
    if (!combo) {
      return `Selecione a opção de preço para o adicional «${chip.name}».`;
    }
  }
  return null;
}

function variantComboValid(
  matrix: HubServicePricingMatrix,
  v: HubQuotePricingVariant | null | undefined
): boolean {
  if (!v) return false;
  if (matrix.kind === 'personalizado') {
    const idx = v.custom_tier_index;
    return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < matrix.tiers.length;
  }
  return true;
}
