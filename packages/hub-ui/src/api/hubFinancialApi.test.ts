import { describe, expect, it } from 'vitest';
import type { HubFinanceUnbilledSourceType } from '../../api/hubFinancialApi';

describe('HubFinanceUnbilledSourceType', () => {
  it('inclui boarding_reservation', () => {
    const source: HubFinanceUnbilledSourceType = 'boarding_reservation';
    expect(source).toBe('boarding_reservation');
  });
});
