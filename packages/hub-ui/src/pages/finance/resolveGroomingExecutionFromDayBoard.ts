import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';

/** Origens do day board que podem ter linhas appointment_service sujeitas ao gate de comissão. */
export function dayBoardItemSupportsMarkExecution(item: HubFinanceDayBoardItem): boolean {
  return (
    item.origin_type === 'appointment' ||
    item.origin_type === 'grooming_session' ||
    item.origin_type === 'encounter' ||
    item.origin_type === 'hospitalization'
  );
}
