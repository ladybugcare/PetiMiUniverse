import {
  inferAppointmentKindFromServiceGroup,
  PICKUP_MUTEX_MESSAGE,
  PICKUP_VISIT_RHYTHM_MESSAGE,
  recurrenceRhythmSignature,
  validateBoardingBlockIsolation,
  validateHomogeneousServiceGroups,
  validateHotelNoRecurrence,
  validatePickupMutex,
  validateVisitPickupSameRhythm,
} from '../appointmentBlockRules';

describe('appointmentBlockRules', () => {
  const stMap = new Map([
    ['h1', { service_group: 'hotel' }],
    ['h2', { service_group: 'hotel' }],
    ['b1', { service_group: 'banho_tosa' }],
    ['c1', { service_group: 'creche' }],
    ['lt', { service_group: 'leva_traz' }],
  ]);

  it('homogeneidade de grupo', () => {
    expect(validateHomogeneousServiceGroups([{ hub_service_type_id: 'h1' }, { hub_service_type_id: 'b1' }], stMap)).toMatch(
      /apenas um grupo/,
    );
    expect(validateHomogeneousServiceGroups([{ hub_service_type_id: 'h1' }, { hub_service_type_id: 'h2' }], stMap)).toBeNull();
  });

  it('isolamento boarding', () => {
    expect(
      validateBoardingBlockIsolation({
        primaryGroup: 'hotel',
        extraBlockGroups: ['banho_tosa'],
        allowBoardingWithSiblingBlocks: false,
      }),
    ).toMatch(/não podem compartilhar/);
    expect(
      validateBoardingBlockIsolation({
        primaryGroup: 'hotel',
        extraBlockGroups: ['banho_tosa'],
        allowBoardingWithSiblingBlocks: true,
      }),
    ).toBeNull();
  });

  it('hotel sem recorrência', () => {
    expect(validateHotelNoRecurrence({ primaryGroup: 'hotel', hasRecurrence: true })).toMatch(/não aceita/);
    expect(validateHotelNoRecurrence({ primaryGroup: 'creche', hasRecurrence: true })).toBeNull();
  });

  it('infere kind', () => {
    expect(inferAppointmentKindFromServiceGroup(undefined, 'hotel')).toBe('hotel_stay');
    expect(inferAppointmentKindFromServiceGroup(undefined, 'creche')).toBe('daycare_block');
    expect(inferAppointmentKindFromServiceGroup(undefined, 'leva_traz')).toBe('pickup_route');
    expect(inferAppointmentKindFromServiceGroup('walk_in', 'hotel')).toBeNull();
  });

  it('mutex L&T visita × extra', () => {
    expect(validatePickupMutex({ visitHasPickup: true, extrasHavePickup: true })).toBe(PICKUP_MUTEX_MESSAGE);
    expect(validatePickupMutex({ visitHasPickup: true, extrasHavePickup: false })).toBeNull();
    expect(validatePickupMutex({ visitHasPickup: false, extrasHavePickup: true })).toBeNull();
  });

  it('ritmo L&T da visita', () => {
    expect(recurrenceRhythmSignature(null)).toBe('none');
    expect(
      recurrenceRhythmSignature({
        kind: 'weekly',
        interval_value: 1,
        days_of_week: [1],
        occurrences: 4,
      }),
    ).toBe('weekly:1:1:occ:4');
    expect(
      validateVisitPickupSameRhythm({
        visitHasPickup: true,
        rhythms: ['none', 'none'],
      }),
    ).toBeNull();
    expect(
      validateVisitPickupSameRhythm({
        visitHasPickup: true,
        rhythms: ['none', 'weekly:1::occ:4'],
      }),
    ).toBe(PICKUP_VISIT_RHYTHM_MESSAGE);
    expect(
      validateVisitPickupSameRhythm({
        visitHasPickup: false,
        rhythms: ['none', 'weekly:1::occ:4'],
      }),
    ).toBeNull();
  });
});
