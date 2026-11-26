import { describe, expect, it } from 'vitest';
import type { HubFinancePayment } from '../../api/hubFinancialApi';
import { resolveComandaTimelinePayments } from './hubComandaTimelinePayments';

function pay(partial: Partial<HubFinancePayment> & Pick<HubFinancePayment, 'id' | 'amount' | 'payment_method'>): HubFinancePayment {
  return {
    clinic_id: 'c1',
    receivable_id: 'r1',
    payment_date: '2026-11-26T12:00:00.000Z',
    status: 'posted',
    ...partial,
  };
}

describe('resolveComandaTimelinePayments', () => {
  it('usa payments do detail quando a API já envia', () => {
    const fromApi = [
      {
        id: 'a',
        amount: 40,
        payment_method: 'cash',
        status: 'posted',
        payment_date: '2026-11-26T12:00:00.000Z',
      },
    ];
    expect(
      resolveComandaTimelinePayments({ payments: fromApi }, [
        pay({ id: 'ignored', amount: 99, payment_method: 'pix' }),
      ]),
    ).toEqual(fromApi);
  });

  it('hidrata cash+Pix separados a partir dos recebíveis', () => {
    const result = resolveComandaTimelinePayments({ payments: [] }, [
      pay({
        id: 'cash',
        amount: 40,
        payment_method: 'cash',
        payment_date: '2026-11-26T12:30:00.000Z',
      }),
      pay({
        id: 'pix',
        amount: 40,
        payment_method: 'pix',
        payment_date: '2026-11-26T12:31:00.000Z',
      }),
    ]);
    expect(result.map((p) => `${p.payment_method}:${p.amount}`)).toEqual(['cash:40', 'pix:40']);
  });
});
