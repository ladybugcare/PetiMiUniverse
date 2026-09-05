import { describe, expect, it } from 'vitest';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import {
  buildCaixaSessionHistoryItems,
  sumDayBoardPendingAmount,
  sumOpenComandasPendingAmount,
} from './hubCaixaSessionHistory';

function dayBoardItem(partial: Partial<HubFinanceDayBoardItem['billing']> & { estimated_amount?: number }): HubFinanceDayBoardItem {
  const { estimated_amount, ...billing } = partial;
  return {
    origin_type: 'appointment',
    origin_id: 'appt-1',
    origin_label: 'Consulta',
    starts_at: '2026-09-04T10:00:00.000Z',
    guardian_id: null,
    guardian: { id: 'g1', full_name: 'Ana' },
    pet_id: null,
    pet: { id: 'p1', name: 'Luna' },
    operational_status: 'done',
    estimated_amount: estimated_amount ?? 100,
    services: [],
    billing: {
      comanda_id: 'c1',
      comanda_status: 'aberta',
      has_receivable: true,
      receivable_status: 'pending',
      finance_handoff_at: null,
      ...billing,
    },
  };
}

describe('sumDayBoardPendingAmount', () => {
  it('ignora item enviado ao financeiro', () => {
    expect(
      sumDayBoardPendingAmount([
        dayBoardItem({ finance_handoff_at: '2026-09-04T20:00:00.000Z', estimated_amount: 90 }),
        dayBoardItem({ finance_handoff_at: null, estimated_amount: 40 }),
      ]),
    ).toBe(40);
  });
});

describe('sumOpenComandasPendingAmount', () => {
  it('ignora comanda já enviada ao financeiro', () => {
    expect(
      sumOpenComandasPendingAmount(
        [
          { id: 'c-old', status: 'aberta', finance_handoff_at: '2026-09-04T20:00:00.000Z', total_amount: 70 },
          { id: 'c-open', status: 'aberta', finance_handoff_at: null, total_amount: 30 },
        ],
        new Set(),
      ),
    ).toBe(30);
  });
});

describe('buildCaixaSessionHistoryItems', () => {
  it('não lista handoff como pendência do caixa', () => {
    const items = buildCaixaSessionHistoryItems(
      null,
      [dayBoardItem({ finance_handoff_at: '2026-09-04T20:00:00.000Z' })],
      [
        {
          id: 'c-old',
          status: 'aberta',
          finance_handoff_at: '2026-09-04T20:00:00.000Z',
          opened_at: '2026-09-03T10:00:00.000Z',
          total_amount: 70,
        },
      ],
    );
    expect(items).toEqual([]);
  });
});
