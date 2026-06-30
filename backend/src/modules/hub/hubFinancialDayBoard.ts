import type { DayBoardBilling } from './boardingBilling';

export function isDayBoardOperationallyComplete(originType: string, operationalStatus: string): boolean {
  switch (originType) {
    case 'appointment':
      return operationalStatus === 'done' || operationalStatus === 'paid';
    case 'grooming_session':
      return operationalStatus === 'closed';
    case 'encounter':
      return operationalStatus === 'completed';
    case 'quote':
    case 'manual':
    case 'boarding_reservation':
      return true;
    default:
      return true;
  }
}

export function isDayBoardPaidAndComplete(
  originType: string,
  operationalStatus: string,
  receivableStatus: DayBoardBilling['receivable_status']
): boolean {
  return receivableStatus === 'paid' && isDayBoardOperationallyComplete(originType, operationalStatus);
}

export function pickActiveReceivableId(statusesWithIds: Array<{ id: string; status: string }>): string | null {
  const pending = statusesWithIds.find((r) => r.status === 'pending');
  if (pending) return pending.id;
  const partial = statusesWithIds.find((r) => r.status === 'partially_paid');
  if (partial) return partial.id;
  const paid = statusesWithIds.find((r) => r.status === 'paid');
  return paid?.id ?? null;
}

export function matchesFinanceiroDayBoardScope(billing: DayBoardBilling): boolean {
  if (billing.finance_handoff_at) return true;
  if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid') return true;
  return false;
}

export function aggregateReceivableStatus(statuses: string[]): 'pending' | 'partially_paid' | 'paid' | null {
  if (statuses.length === 0) return null;
  if (statuses.some((s) => s === 'pending')) return 'pending';
  if (statuses.some((s) => s === 'partially_paid')) return 'partially_paid';
  if (statuses.every((s) => s === 'paid')) return 'paid';
  return null;
}
