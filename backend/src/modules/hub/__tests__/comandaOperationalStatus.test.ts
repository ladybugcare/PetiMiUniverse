import { classifyComandaOperationalComplete } from '../comandaOperationalStatus';

describe('classifyComandaOperationalComplete', () => {
  it('manual/quote/package são sempre prontos', () => {
    expect(
      classifyComandaOperationalComplete({ originType: 'manual', originId: 'm1' }),
    ).toBe(true);
    expect(classifyComandaOperationalComplete({ originType: 'quote', originId: 'q1' })).toBe(true);
  });

  it('appointment: exige done/paid e sem encounter aberto', () => {
    expect(
      classifyComandaOperationalComplete({
        originType: 'appointment',
        originId: 'a1',
        appointmentStatus: 'scheduled',
        hasOpenEncounter: false,
      }),
    ).toBe(false);
    expect(
      classifyComandaOperationalComplete({
        originType: 'appointment',
        originId: 'a1',
        appointmentStatus: 'done',
        hasOpenEncounter: true,
      }),
    ).toBe(false);
    expect(
      classifyComandaOperationalComplete({
        originType: 'appointment',
        originId: 'a1',
        appointmentStatus: 'done',
        hasOpenEncounter: false,
      }),
    ).toBe(true);
  });

  it('grooming: ready/delivered/closed contam como prontos', () => {
    expect(
      classifyComandaOperationalComplete({
        originType: 'grooming_session',
        originId: 'g1',
        groomingStage: 'in_service',
      }),
    ).toBe(false);
    expect(
      classifyComandaOperationalComplete({
        originType: 'grooming_session',
        originId: 'g1',
        groomingStage: 'ready',
      }),
    ).toBe(true);
  });

  it('encounter e boarding', () => {
    expect(
      classifyComandaOperationalComplete({
        originType: 'encounter',
        originId: 'e1',
        encounterStatus: 'in_progress',
      }),
    ).toBe(false);
    expect(
      classifyComandaOperationalComplete({
        originType: 'encounter',
        originId: 'e1',
        encounterStatus: 'completed',
      }),
    ).toBe(true);
    expect(
      classifyComandaOperationalComplete({
        originType: 'boarding_reservation',
        originId: 'b1',
        boardingStatus: 'checked_in',
      }),
    ).toBe(false);
    expect(
      classifyComandaOperationalComplete({
        originType: 'boarding_reservation',
        originId: 'b1',
        boardingStatus: 'checked_out',
      }),
    ).toBe(true);
  });
});
