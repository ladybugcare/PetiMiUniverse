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

  it('exibe troco estruturado no subtítulo do pagamento cash', () => {
    const items = buildCaixaSessionHistoryItems(
      {
        id: 'sess-1',
        clinic_id: 'c1',
        unit_id: 'u1',
        status: 'open',
        opened_at: '2026-09-04T08:00:00.000Z',
        opening_balance: 0,
        all_payments: [
          {
            id: 'pay-1',
            amount: 70,
            payment_method: 'cash',
            payment_date: '2026-09-04T09:00:00.000Z',
            tendered_amount: 100,
            change_amount: 30,
            notes: null,
            receivable: { id: 'rec-1' },
          },
        ],
        payments: [],
        movements: [],
      } as never,
      [],
      [],
    );
    const pay = items.find((i) => i.row_kind === 'payment');
    expect(pay?.subtitle).toMatch(/Troco R\$ 30\.00/);
    expect(pay?.subtitle).toMatch(/recebido R\$ 100\.00/);
  });
});
