import { describe, expect, it } from 'vitest';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import { dayBoardItemSupportsMarkExecution } from './resolveGroomingExecutionFromDayBoard';

function item(origin_type: string): HubFinanceDayBoardItem {
  return {
    origin_type,
    origin_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    origin_label: 'Teste',
    starts_at: null,
    guardian_id: null,
    guardian: null,
    pet_id: null,
    pet: null,
    operational_status: 'done',
    estimated_amount: 0,
    services: [],
    billing: {
      comanda_id: null,
      comanda_status: null,
      has_receivable: false,
      receivable_status: null,
    },
  };
}

describe('dayBoardItemSupportsMarkExecution', () => {
  it('aceita origens com possível appointment_service', () => {
    expect(dayBoardItemSupportsMarkExecution(item('appointment'))).toBe(true);
    expect(dayBoardItemSupportsMarkExecution(item('grooming_session'))).toBe(true);
    expect(dayBoardItemSupportsMarkExecution(item('encounter'))).toBe(true);
    expect(dayBoardItemSupportsMarkExecution(item('hospitalization'))).toBe(true);
  });

  it('rejeita origens sem gate de executor', () => {
    expect(dayBoardItemSupportsMarkExecution(item('boarding_reservation'))).toBe(false);
    expect(dayBoardItemSupportsMarkExecution(item('quote'))).toBe(false);
  });
});
