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
});
