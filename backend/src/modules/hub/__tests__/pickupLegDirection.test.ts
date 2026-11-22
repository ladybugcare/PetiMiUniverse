import { inferPickupLegDirection } from '../pickupLegDirection';

describe('inferPickupLegDirection', () => {
  it('preserva direção explícita da parada', () => {
    expect(
      inferPickupLegDirection({
        explicitDirection: 'delivery',
        legStartsAt: '2026-11-06T10:00:00.000Z',
        siblingLegStartsAts: ['2026-11-06T10:00:00.000Z'],
        parentStartsAt: '2026-11-06T12:00:00.000Z',
      }),
    ).toBe('delivery');
    expect(
      inferPickupLegDirection({
        explicitDirection: 'pickup',
        legStartsAt: '2026-11-06T18:00:00.000Z',
        siblingLegStartsAts: ['2026-11-06T18:00:00.000Z'],
        parentStartsAt: '2026-11-05T12:00:00.000Z',
      }),
    ).toBe('pickup');
  });

  it('com duas pernas: primeira coleta, demais entrega', () => {
    expect(
      inferPickupLegDirection({
        explicitDirection: null,
        legStartsAt: '2026-11-05T10:00:00.000Z',
        siblingLegStartsAts: ['2026-11-05T10:00:00.000Z', '2026-11-06T18:00:00.000Z'],
        parentStartsAt: '2026-11-05T14:00:00.000Z',
      }),
    ).toBe('pickup');
    expect(
      inferPickupLegDirection({
        explicitDirection: null,
        legStartsAt: '2026-11-06T18:00:00.000Z',
        siblingLegStartsAts: ['2026-11-05T10:00:00.000Z', '2026-11-06T18:00:00.000Z'],
        parentStartsAt: '2026-11-05T14:00:00.000Z',
      }),
    ).toBe('delivery');
  });

  it('perna única após início do hotel/banho vira devolução', () => {
    expect(
      inferPickupLegDirection({
        explicitDirection: null,
        legStartsAt: '2026-11-06T18:00:00.000Z',
        siblingLegStartsAts: ['2026-11-06T18:00:00.000Z'],
        parentStartsAt: '2026-11-05T14:00:00.000Z',
      }),
    ).toBe('delivery');
  });

  it('perna única antes do serviço vira coleta', () => {
    expect(
      inferPickupLegDirection({
        explicitDirection: null,
        legStartsAt: '2026-11-06T08:00:00.000Z',
        siblingLegStartsAts: ['2026-11-06T08:00:00.000Z'],
        parentStartsAt: '2026-11-06T10:00:00.000Z',
      }),
    ).toBe('pickup');
  });
});
