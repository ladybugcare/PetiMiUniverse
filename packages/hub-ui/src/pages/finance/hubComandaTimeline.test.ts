import { describe, expect, it } from 'vitest';
import { buildComandaTimelineSteps } from './hubComandaTimeline';

describe('buildComandaTimelineSteps', () => {
  it('intercala eventos de itens entre abertura e marcos finais', () => {
    const steps = buildComandaTimelineSteps({
      openedAt: '2026-07-02T10:00:00.000Z',
      status: 'aberta',
      balanceDue: 50,
      events: [
        {
          id: 'ev-1',
          event_type: 'item_added',
          title: 'Serviço adicionado',
          body: 'Banho · 1 un.',
          created_at: '2026-07-02T11:00:00.000Z',
        },
        {
          id: 'ev-2',
          event_type: 'item_removed',
          title: 'Produto removido',
          body: 'Shampoo · 1 un.',
          created_at: '2026-07-02T12:00:00.000Z',
        },
      ],
    });

    expect(steps.map((s) => s.id)).toEqual([
      'milestone-opened',
      'ev-1',
      'ev-2',
      'milestone-balance',
    ]);
    expect(steps[1]?.title).toBe('Serviço adicionado');
  });

  it('lista cada pagamento como evento próprio (não soma cash+Pix num único marco)', () => {
    const steps = buildComandaTimelineSteps({
      openedAt: '2026-11-26T12:00:00.000Z',
      status: 'fechada',
      closedAt: '2026-11-26T13:00:00.000Z',
      paidTotal: 80,
      balanceDue: 0,
      payments: [
        {
          id: 'pay-cash',
          amount: 40,
          payment_method: 'cash',
          status: 'posted',
          payment_date: '2026-11-26T12:30:00.000Z',
        },
        {
          id: 'pay-pix',
          amount: 40,
          payment_method: 'pix',
          status: 'posted',
          payment_date: '2026-11-26T12:31:00.000Z',
        },
      ],
    });

    const paymentSteps = steps.filter((s) => s.id.startsWith('payment-'));
    expect(paymentSteps).toHaveLength(2);
    expect(paymentSteps[0]?.sub).toMatch(/^Dinheiro · R\$\s*40,00$/);
    expect(paymentSteps[1]?.sub).toMatch(/^Pix · R\$\s*40,00$/);
    expect(steps.some((s) => s.id === 'milestone-paid')).toBe(false);
    expect(steps.map((s) => s.id)).toEqual([
      'milestone-opened',
      'payment-pay-cash',
      'payment-pay-pix',
      'milestone-closed',
    ]);
  });

  it('marca pagamento reversed como estornado', () => {
    const steps = buildComandaTimelineSteps({
      openedAt: '2026-11-26T12:00:00.000Z',
      status: 'aberta',
      paidTotal: 0,
      payments: [
        {
          id: 'pay-1',
          amount: 50,
          payment_method: 'pix',
          status: 'reversed',
          payment_date: '2026-11-26T12:40:00.000Z',
        },
      ],
    });

    expect(steps.find((s) => s.id === 'payment-pay-1')?.title).toBe('Pagamento estornado');
  });

  it('fallback legado: sem payments usa marco agregado de paidTotal', () => {
    const steps = buildComandaTimelineSteps({
      openedAt: '2026-11-26T12:00:00.000Z',
      closedAt: '2026-11-26T13:00:00.000Z',
      status: 'fechada',
      paidTotal: 80,
    });

    const paid = steps.find((s) => s.id === 'milestone-paid');
    expect(paid).toBeTruthy();
    expect(paid?.sub).toMatch(/^R\$\s*80,00$/);
  });
});
