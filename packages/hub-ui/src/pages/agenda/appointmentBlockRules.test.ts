import { describe, expect, it } from 'vitest';
import {
  canAddServiceToBlock,
  HOTEL_STAY_RANGE_MESSAGE,
  PICKUP_MUTEX_MESSAGE,
  PICKUP_VISIT_RHYTHM_MESSAGE,
  recurrenceRhythmSignature,
  shouldHideExtraPickup,
  shouldHideMainBlockPickup,
  shouldHideVisitPickup,
  validateBoardingBlockIsolation,
  validateHomogeneousServiceGroup,
  validateHotelNoRecurrence,
  validateHotelStayRange,
  validatePickupMutex,
  validateVisitPickupAgainstBoardingStay,
  validateVisitPickupSameRhythm,
} from './appointmentBlockRules';

const types = [
  { id: 'h1', service_group: 'hotel' },
  { id: 'h2', service_group: 'hotel' },
  { id: 'b1', service_group: 'banho_tosa' },
  { id: 'c1', service_group: 'creche' },
];

describe('appointmentBlockRules', () => {
  it('bloqueia misturar grupos no mesmo bloco', () => {
    const gate = canAddServiceToBlock({
      existingServiceTypeIds: ['h1'],
      newServiceTypeId: 'b1',
      serviceTypes: types,
    });
    expect(gate.ok).toBe(false);
  });

  it('permite vários serviços do mesmo grupo', () => {
    const gate = canAddServiceToBlock({
      existingServiceTypeIds: ['h1'],
      newServiceTypeId: 'h2',
      serviceTypes: types,
    });
    expect(gate.ok).toBe(true);
  });

  it('valida homogeneidade', () => {
    expect(validateHomogeneousServiceGroup(['h1', 'b1'], types)).toMatch(/apenas um grupo/);
    expect(validateHomogeneousServiceGroup(['h1', 'h2'], types)).toBeNull();
  });

  it('isola hotel/creche sem sibling blocks na fase 0', () => {
    expect(
      validateBoardingBlockIsolation({
        mainServiceTypeIds: ['h1'],
        extraBlocksServiceTypeIds: [['b1']],
        serviceTypes: types,
        allowBoardingWithSiblingBlocks: false,
      }),
    ).toMatch(/não podem compartilhar/);
    expect(
      validateBoardingBlockIsolation({
        mainServiceTypeIds: ['h1'],
        extraBlocksServiceTypeIds: [['b1']],
        serviceTypes: types,
        allowBoardingWithSiblingBlocks: true,
      }),
    ).toBeNull();
  });

  it('rejeita recorrência em hotel', () => {
    expect(
      validateHotelNoRecurrence({
        mainServiceTypeIds: ['h1'],
        serviceTypes: types,
        withRecurrence: true,
      }),
    ).toMatch(/não usa/);
    expect(
      validateHotelNoRecurrence({
        mainServiceTypeIds: ['b1'],
        serviceTypes: types,
        withRecurrence: true,
      }),
    ).toBeNull();
  });

  describe('L&T visita × bloco', () => {
    it('mutex: visita + extra com L&T', () => {
      expect(validatePickupMutex({ visitPickup: true, extrasWithPickup: true })).toBe(PICKUP_MUTEX_MESSAGE);
      expect(validatePickupMutex({ visitPickup: true, extrasWithPickup: false })).toBeNull();
      expect(validatePickupMutex({ visitPickup: false, extrasWithPickup: true })).toBeNull();
    });

    it('assinatura de ritmo: none vs weekly', () => {
      expect(recurrenceRhythmSignature(null)).toBe('none');
      expect(recurrenceRhythmSignature({ enabled: false })).toBe('none');
      expect(
        recurrenceRhythmSignature({
          enabled: true,
          kind: 'weekly',
          interval_value: 1,
          days_of_week: [1, 3],
          end_kind: 'occurrences',
          occurrences: 4,
        }),
      ).toBe('weekly:1:1,3:occ:4');
      expect(
        recurrenceRhythmSignature({
          enabled: true,
          kind: 'biweekly',
          interval_value: 1,
          days_of_week: [2],
          end_mode: 'occurrences',
          occurrences: 4,
        }),
      ).toBe('weekly:2:2:occ:4');
    });

    it('I1: L&T visita + vários blocos sem repetir → ok', () => {
      expect(
        validateVisitPickupSameRhythm({
          visitPickup: true,
          rhythms: ['none', 'none', 'none'],
        }),
      ).toBeNull();
    });

    it('I2: L&T visita + todos weekly iguais → ok', () => {
      const sig = 'weekly:1:1,3:occ:4';
      expect(
        validateVisitPickupSameRhythm({
          visitPickup: true,
          rhythms: [sig, sig],
        }),
      ).toBeNull();
    });

    it('I3: L&T visita + ritmos mistos → bloqueia', () => {
      expect(
        validateVisitPickupSameRhythm({
          visitPickup: true,
          rhythms: ['none', 'weekly:1::occ:4'],
        }),
      ).toBe(PICKUP_VISIT_RHYTHM_MESSAGE);
      expect(
        validateVisitPickupSameRhythm({
          visitPickup: true,
          rhythms: ['weekly:1::occ:4', 'weekly:2::occ:4'],
        }),
      ).toBe(PICKUP_VISIT_RHYTHM_MESSAGE);
    });

    it('I4: sem L&T visita, ritmos mistos → ok (L&T por bloco)', () => {
      expect(
        validateVisitPickupSameRhythm({
          visitPickup: false,
          rhythms: ['none', 'weekly:1::occ:4'],
        }),
      ).toBeNull();
    });

    it('esconde L&T da visita com 1 bloco, L&T de bloco, ou ritmos divergentes', () => {
      expect(
        shouldHideVisitPickup({ blockCount: 1, anyBlockPickup: false, rhythms: ['none'] }),
      ).toBe(true);
      expect(
        shouldHideVisitPickup({
          blockCount: 2,
          anyBlockPickup: false,
          rhythms: ['none', 'none'],
        }),
      ).toBe(false);
      expect(
        shouldHideVisitPickup({
          blockCount: 2,
          anyBlockPickup: true,
          rhythms: ['none', 'none'],
        }),
      ).toBe(true);
      expect(
        shouldHideVisitPickup({
          blockCount: 2,
          anyBlockPickup: false,
          rhythms: ['none', 'weekly:2::occ:4'],
        }),
      ).toBe(true);
    });

    it('esconde L&T no bloco só quando a visita já cobre', () => {
      expect(shouldHideExtraPickup({ visitPickup: true })).toBe(true);
      expect(shouldHideExtraPickup({ visitPickup: false })).toBe(false);
      expect(shouldHideExtraPickup({ visitPickup: false, anyExtraRecurrence: false })).toBe(false);
      expect(shouldHideMainBlockPickup({ visitPickup: true })).toBe(true);
      expect(shouldHideMainBlockPickup({ visitPickup: false })).toBe(false);
    });

    it('valida range da estadia hotel', () => {
      expect(
        validateHotelStayRange({
          checkInIso: '2026-04-10T14:00:00.000Z',
          checkOutIso: '2026-04-10T10:00:00.000Z',
        }),
      ).toBe(HOTEL_STAY_RANGE_MESSAGE);
      expect(
        validateHotelStayRange({
          checkInIso: '2026-04-10T14:00:00.000Z',
          checkOutIso: '2026-04-12T11:00:00.000Z',
        }),
      ).toBeNull();
    });

    it('validateVisitPickupAgainstBoardingStay espelha ritmo', () => {
      expect(
        validateVisitPickupAgainstBoardingStay({
          visitPickup: true,
          parentIsBoarding: true,
          rhythms: ['none', 'weekly:2::occ:4'],
        }),
      ).toBe(PICKUP_VISIT_RHYTHM_MESSAGE);
      expect(
        validateVisitPickupAgainstBoardingStay({
          visitPickup: true,
          parentIsBoarding: false,
          rhythms: ['none', 'weekly:2::occ:4'],
        }),
      ).toBeNull();
    });
  });
});
