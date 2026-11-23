import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';

export type DayBoardComposition = 'service' | 'product' | 'mixed';

const SERVICE_ORIGINS = new Set([
  'appointment',
  'grooming_session',
  'encounter',
  'boarding_reservation',
  'hospitalization',
  'quote',
  'package',
  'series_invoice',
]);

/** Inferência serviço / produto / misto a partir das linhas do day board. */
export function resolveDayBoardComposition(
  item: HubFinanceDayBoardItem,
): DayBoardComposition | null {
  const kinds = (item.services ?? [])
    .map((s) => String(s.kind ?? '').trim())
    .filter(Boolean);

  const hasProduct = kinds.some((k) => k === 'product');
  const hasService = kinds.some((k) => k === 'service' || k === 'fee');

  if (hasProduct && hasService) return 'mixed';
  if (hasProduct) return 'product';
  if (hasService) return 'service';

  // Origens operacionais sem `kind` explícito → serviço.
  if (SERVICE_ORIGINS.has(item.origin_type)) return 'service';
  if ((item.services?.length ?? 0) > 0) return 'service';
  return null;
}

export function dayBoardCompositionLabel(composition: DayBoardComposition | null): string {
  if (composition === 'product') return 'Produto';
  if (composition === 'service') return 'Serviço';
  if (composition === 'mixed') return 'Serviço e produto';
  return '—';
}
