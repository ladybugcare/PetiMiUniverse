import { describe, expect, it } from 'vitest';
import { resolveOpenOriginKeysFromParts } from '../hubFinanceDayBoardOpen';

describe('resolveOpenOriginKeysFromParts', () => {
  it('usa origem da comanda em vez do source_id aleatório do checkout', () => {
    const comandasById = new Map([
      [
        'cmd-1',
        { origin_type: 'appointment', origin_id: 'appt-1' },
      ],
    ]);
    const keys = resolveOpenOriginKeysFromParts({
      receivables: [
        {
          source_type: 'manual',
          source_id: 'random-uuid',
          comanda_id: 'cmd-1',
          final_amount: 100,
        },
      ],
      handoffs: [],
      comandasById,
    });
    expect(keys).toEqual([{ origin_type: 'appointment', origin_id: 'appt-1' }]);
  });

  it('mantém manual quando a comanda é venda rápida', () => {
    const comandasById = new Map([
      ['cmd-q', { origin_type: 'manual', origin_id: 'quick-origin' }],
    ]);
    const keys = resolveOpenOriginKeysFromParts({
      receivables: [
        {
          source_type: 'manual',
          source_id: 'other-uuid',
          comanda_id: 'cmd-q',
          final_amount: 50,
        },
      ],
      handoffs: [],
      comandasById,
    });
    expect(keys).toEqual([{ origin_type: 'manual', origin_id: 'quick-origin' }]);
  });

  it('cai no source_type/source_id quando não há comanda', () => {
    const keys = resolveOpenOriginKeysFromParts({
      receivables: [
        {
          source_type: 'manual',
          source_id: 'standalone',
          comanda_id: null,
          final_amount: 30,
        },
      ],
      handoffs: [],
      comandasById: new Map(),
    });
    expect(keys).toEqual([{ origin_type: 'manual', origin_id: 'standalone' }]);
  });

  it('não duplica handoff já coberto por recebível', () => {
    const keys = resolveOpenOriginKeysFromParts({
      receivables: [
        {
          source_type: 'manual',
          source_id: 'x',
          comanda_id: 'cmd-1',
          final_amount: 80,
        },
      ],
      handoffs: [
        { origin_type: 'appointment', origin_id: 'appt-1', total_amount: 80 },
      ],
      comandasById: new Map([['cmd-1', { origin_type: 'appointment', origin_id: 'appt-1' }]]),
    });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toEqual({ origin_type: 'appointment', origin_id: 'appt-1' });
  });

  it('ignora recebível com valor zerado', () => {
    const keys = resolveOpenOriginKeysFromParts({
      receivables: [
        {
          source_type: 'manual',
          source_id: 'z',
          comanda_id: null,
          final_amount: 0,
        },
      ],
      handoffs: [],
      comandasById: new Map(),
    });
    expect(keys).toEqual([]);
  });
});
