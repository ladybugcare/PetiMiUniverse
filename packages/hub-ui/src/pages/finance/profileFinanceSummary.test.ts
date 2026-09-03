import { describe, expect, it } from 'vitest';
import type { HubFinanceReceivable } from '../../api/hubFinancialApi';
import { buildProfileFinanceSummary } from './profileFinanceSummary';

function rv(partial: Partial<HubFinanceReceivable> & Pick<HubFinanceReceivable, 'id' | 'status' | 'final_amount'>): HubFinanceReceivable {
  return {
    clinic_id: 'c',
    unit_id: null,
    guardian_id: 'g',
    source_type: 'manual',
    source_id: partial.id,
    original_amount: partial.final_amount,
    currency: 'BRL',
    created_at: '2026-09-01T00:00:00Z',
    due_date: null,
    ...partial,
  };
}

describe('buildProfileFinanceSummary', () => {
  const asOf = new Date('2026-09-03T12:00:00');

  it('soma recebíveis abertos e destaca o mais urgente', () => {
    const summary = buildProfileFinanceSummary(
      [
        rv({ id: '1', status: 'pending', final_amount: 100, due_date: '2026-09-20' }),
        rv({ id: '2', status: 'pending', final_amount: 80, due_date: '2026-09-01' }),
        rv({ id: '3', status: 'paid', final_amount: 50, due_date: '2026-08-01' }),
      ],
      [],
      { asOf },
    );
    expect(summary.outstandingTotal).toBe(180);
    expect(summary.overdueCount).toBe(1);
    expect(summary.okCount).toBe(1);
    expect(summary.nextDue?.amount).toBe(80);
    expect(summary.nextDue?.tone).toBe('overdue');
  });

  it('inclui comandas abertas sem recebível no saldo', () => {
    const summary = buildProfileFinanceSummary(
      [],
      [{ id: 'c1', status: 'aberta', total_amount: 145, item_labels: ['Banho'] }],
      { asOf },
    );
    expect(summary.outstandingTotal).toBe(145);
    expect(summary.openComandasCount).toBe(1);
    expect(summary.hasActivity).toBe(true);
  });

  it('sem movimento fica zerado', () => {
    const summary = buildProfileFinanceSummary([], [], { asOf });
    expect(summary.outstandingTotal).toBe(0);
    expect(summary.hasActivity).toBe(false);
    expect(summary.nextDue).toBeNull();
  });
});
