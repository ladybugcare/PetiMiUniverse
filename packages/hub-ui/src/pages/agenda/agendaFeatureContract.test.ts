/**
 * Contrato da feature agenda-por-bloco (catálogo A–I).
 * Testa o comportamento desejado do produto — não só o que já passa hoje.
 * Falhas aqui = gap ou regressão a investigar.
 */
import { describe, expect, it } from 'vitest';
import * as blockRules from './appointmentBlockRules';
import {
  buildBlockPickupApiPayload,
  buildExtraBlocksApiPayload,
  blockRecurrenceToApi,
  createEmptyExtraBlock,
  defaultBlockPickup,
  defaultBlockRecurrence,
  toIsoTs,
  type ExtraBlock,
} from './appointmentSchedulingUtils';

const types = [
  { id: 'hotel-1', service_group: 'hotel' },
  { id: 'hotel-2', service_group: 'hotel' },
  { id: 'banho-1', service_group: 'banho_tosa' },
  { id: 'banho-2', service_group: 'banho_tosa' },
  { id: 'clin-1', service_group: 'clinica' },
  { id: 'creche-1', service_group: 'creche' },
  { id: 'lt-1', service_group: 'leva_traz' },
];

function weeklyRec(overrides: Partial<ReturnType<typeof defaultBlockRecurrence>> = {}) {
  return {
    ...defaultBlockRecurrence(),
    enabled: true,
    kind: 'weekly' as const,
    interval_value: 1,
    days_of_week: [1],
    end_mode: 'occurrences' as const,
    occurrences: 4,
    ...overrides,
  };
}

function biweeklyRec() {
  return weeklyRec({ kind: 'biweekly', interval_value: 1, occurrences: 4 });
}

function bathBlock(opts?: Partial<ExtraBlock>): ExtraBlock {
  const b = createEmptyExtraBlock({
    groupFilter: 'banho_tosa',
    startsHm: '10:00',
    staffId: '',
    resourceLabel: '',
  });
  b.services = [{ hub_service_type_id: 'banho-1', name: 'Banho', duration_minutes: 60 }];
  return { ...b, ...opts, services: opts?.services ?? b.services };
}

describe('A — um grupo por bloco', () => {
  it('A1: banho + tosa mesmo grupo', () => {
    expect(
      blockRules.canAddServiceToBlock({
        existingServiceTypeIds: ['banho-1'],
        newServiceTypeId: 'banho-2',
        serviceTypes: types,
      }).ok,
    ).toBe(true);
  });

  it('A2: banho + clínica no mesmo bloco', () => {
    expect(
      blockRules.canAddServiceToBlock({
        existingServiceTypeIds: ['banho-1'],
        newServiceTypeId: 'clin-1',
        serviceTypes: types,
      }).ok,
    ).toBe(false);
  });

  it('A3: dois hotéis', () => {
    expect(
      blockRules.canAddServiceToBlock({
        existingServiceTypeIds: ['hotel-1'],
        newServiceTypeId: 'hotel-2',
        serviceTypes: types,
      }).ok,
    ).toBe(true);
  });

  it('A4: hotel + banho', () => {
    expect(
      blockRules.canAddServiceToBlock({
        existingServiceTypeIds: ['hotel-1'],
        newServiceTypeId: 'banho-1',
        serviceTypes: types,
      }).ok,
    ).toBe(false);
  });
});

describe('B — hotel entrada/saída', () => {
  it('B2: hotel não aceita recorrência', () => {
    expect(
      blockRules.validateHotelNoRecurrence({
        mainServiceTypeIds: ['hotel-1'],
        serviceTypes: types,
        withRecurrence: true,
      }),
    ).toBeTruthy();
  });

  it('B3: rejeita saída ≤ entrada', () => {
    const checkIn = toIsoTs('2026-04-10', '14:00');
    const checkOut = toIsoTs('2026-04-10', '10:00');
    expect(blockRules.validateHotelStayRange({ checkInIso: checkIn, checkOutIso: checkOut })).toBe(
      blockRules.HOTEL_STAY_RANGE_MESSAGE,
    );
    expect(
      blockRules.validateHotelStayRange({
        checkInIso: checkIn,
        checkOutIso: toIsoTs('2026-04-12', '11:00'),
      }),
    ).toBeNull();
  });
});

describe('C — creche', () => {
  it('C2: payload do bloco creche carrega period half_day', () => {
    const b = createEmptyExtraBlock({
      groupFilter: 'creche',
      startsHm: '08:00',
      staffId: '',
      resourceLabel: '',
    });
    b.services = [{ hub_service_type_id: 'creche-1', name: 'Creche', duration_minutes: 480 }];
    b.daycare_period = 'half_day';
    const payload = buildExtraBlocksApiPayload([b], '2026-05-01', '2026-05-01T08:00:00.000Z');
    expect(payload?.[0]?.services[0]?.pricing_variant).toMatchObject({ period: 'half_day' });
  });
});

describe('D — recorrência por bloco (payload)', () => {
  it('D2: extra com recorrência própria no payload', () => {
    const bath = bathBlock({ recurrence: biweeklyRec() });
    const payload = buildExtraBlocksApiPayload([bath], '2026-05-01', '2026-05-01T09:00:00.000Z');
    expect(payload?.[0]?.recurrence).toMatchObject({ kind: 'weekly', interval_value: 2 });
  });

  it('D3: hotel multi-dia (checkout) + banho em dia explícito da saída', () => {
    const bath = bathBlock({
      starts_date_ymd: '2026-04-30',
      starts_hm: '10:00',
      ends_hm: '11:00',
      recurrence: biweeklyRec(),
    });
    // Cursor = fim da estadia (checkout) — banho não pode ser empurrado para maio.
    const hotelEnds = toIsoTs('2026-04-30', '12:00');
    const payload = buildExtraBlocksApiPayload([bath], '2026-04-01', hotelEnds);
    expect(payload?.[0]?.starts_at.slice(0, 10)).toBe('2026-04-30');
    expect(payload?.[0]?.recurrence?.interval_value).toBe(2);
  });

  it('D5: extra sem recurrence não envia recurrence no API', () => {
    const bath = bathBlock({ recurrence: defaultBlockRecurrence() });
    const payload = buildExtraBlocksApiPayload([bath], '2026-05-01', '2026-05-01T09:00:00.000Z');
    expect(payload?.[0]?.recurrence).toBeNull();
  });
});

describe('E — L&T por bloco', () => {
  it('E2: pickup no extra gera with_pickup_route_*', () => {
    const bath = bathBlock({
      pickup: {
        ...defaultBlockPickup('10:00', '11:00'),
        enabled: true,
        lt_service_type_id: 'lt-1',
        mode: 'round_trip',
      },
    });
    const payload = buildExtraBlocksApiPayload([bath], '2026-05-01', '2026-05-01T09:00:00.000Z');
    expect(payload?.[0]?.with_pickup_route_before).toBeTruthy();
    expect(payload?.[0]?.with_pickup_route_after).toBeTruthy();
    expect(payload?.[0]?.pickup_route_pricing?.hub_service_type_id).toBe('lt-1');
  });

  it('E5/mutex: visita + extra com L&T', () => {
    expect(
      blockRules.validatePickupMutex({ visitPickup: true, extrasWithPickup: true }),
    ).toBe(blockRules.PICKUP_MUTEX_MESSAGE);
  });
});

describe('I — L&T da visita (um transporte, vários blocos)', () => {
  it('I1: vários blocos sem repetir → ritmo ok', () => {
    expect(
      blockRules.validateVisitPickupSameRhythm({
        visitPickup: true,
        rhythms: ['none', 'none'],
      }),
    ).toBeNull();
  });

  it('I2: todos weekly iguais → ok', () => {
    const sig = blockRules.recurrenceRhythmSignature(weeklyRec());
    expect(
      blockRules.validateVisitPickupSameRhythm({
        visitPickup: true,
        rhythms: [sig, sig],
      }),
    ).toBeNull();
  });

  it('I3: pai weekly + extra none → bloqueia', () => {
    const main = blockRules.recurrenceRhythmSignature(weeklyRec());
    const extra = blockRules.recurrenceRhythmSignature(defaultBlockRecurrence());
    expect(
      blockRules.validateVisitPickupSameRhythm({
        visitPickup: true,
        rhythms: [main, extra],
      }),
    ).toBe(blockRules.PICKUP_VISIT_RHYTHM_MESSAGE);
  });

  it('I4: weekly vs biweekly → bloqueia', () => {
    expect(
      blockRules.validateVisitPickupSameRhythm({
        visitPickup: true,
        rhythms: [
          blockRules.recurrenceRhythmSignature(weeklyRec()),
          blockRules.recurrenceRhythmSignature(biweeklyRec()),
        ],
      }),
    ).toBe(blockRules.PICKUP_VISIT_RHYTHM_MESSAGE);
  });

  it('I6 UX: hotel(none) + banho quinzenal — L&T da visita não é oferecido na UI', () => {
    expect(
      blockRules.shouldHideVisitPickup({
        blockCount: 2,
        anyBlockPickup: false,
        rhythms: ['none', blockRules.recurrenceRhythmSignature(biweeklyRec())],
      }),
    ).toBe(true);
  });

  it('extra sem repetir ainda pode ter L&T do bloco', () => {
    expect(
      blockRules.shouldHideExtraPickup({
        visitPickup: false,
        anyExtraRecurrence: false,
      }),
    ).toBe(false);
  });

  it('I6 regra: hotel none + banho biweekly + L&T visita → ritmo inválido no save', () => {
    expect(
      blockRules.validateVisitPickupSameRhythm({
        visitPickup: true,
        rhythms: [
          'none',
          blockRules.recurrenceRhythmSignature(biweeklyRec()),
        ],
      }),
    ).toBe(blockRules.PICKUP_VISIT_RHYTHM_MESSAGE);
  });

  it('I7: com L&T da visita, extras não devem levar pickup no payload', () => {
    // Após sync de UI, pickup.enabled=false nos extras. Contrato do payload:
    const bath = bathBlock({
      pickup: { ...defaultBlockPickup('10:00', '11:00'), enabled: false, lt_service_type_id: 'lt-1' },
      recurrence: weeklyRec(),
    });
    const payload = buildExtraBlocksApiPayload([bath], '2026-05-01', '2026-05-01T09:00:00.000Z');
    expect(payload?.[0]?.with_pickup_route_before).toBeUndefined();
    expect(payload?.[0]?.pickup_route_pricing).toBeUndefined();
  });

  it('I8: sem L&T visita + ritmos diferentes + L&T no banho → ok', () => {
    expect(
      blockRules.validateVisitPickupSameRhythm({
        visitPickup: false,
        rhythms: ['none', blockRules.recurrenceRhythmSignature(biweeklyRec())],
      }),
    ).toBeNull();
    expect(
      blockRules.shouldHideExtraPickup({
        visitPickup: false,
        anyExtraRecurrence: true,
      }),
    ).toBe(false);
  });
});

describe('G — contrato de kind / boarding flags (helpers)', () => {
  it('G5: grupos boarding/hotel/creche detectáveis', () => {
    expect(blockRules.isHotelServiceGroup('hotel')).toBe(true);
    expect(blockRules.isCrecheServiceGroup('creche')).toBe(true);
    expect(blockRules.isBoardingServiceGroup('hotel')).toBe(true);
    expect(blockRules.isBoardingServiceGroup('banho_tosa')).toBe(false);
  });

  it('G1 vs G2: isolamento boarding respeita allowBoardingWithSiblingBlocks', () => {
    expect(
      blockRules.validateBoardingBlockIsolation({
        mainServiceTypeIds: ['hotel-1'],
        extraBlocksServiceTypeIds: [['banho-1']],
        serviceTypes: types,
        allowBoardingWithSiblingBlocks: false,
      }),
    ).toBeTruthy();
    expect(
      blockRules.validateBoardingBlockIsolation({
        mainServiceTypeIds: ['hotel-1'],
        extraBlocksServiceTypeIds: [['banho-1']],
        serviceTypes: types,
        allowBoardingWithSiblingBlocks: true,
      }),
    ).toBeNull();
  });
});

describe('Contratos auxiliares', () => {
  it('I6 boarding: validateVisitPickupAgainstBoardingStay com ritmos mistos', () => {
    expect(
      blockRules.validateVisitPickupAgainstBoardingStay({
        visitPickup: true,
        parentIsBoarding: true,
        rhythms: ['none', blockRules.recurrenceRhythmSignature(biweeklyRec())],
      }),
    ).toBe(blockRules.PICKUP_VISIT_RHYTHM_MESSAGE);
  });

  it('blockRecurrenceToApi: biweekly vira weekly×2 (contrato estável)', () => {
    expect(blockRecurrenceToApi(biweeklyRec())).toMatchObject({
      kind: 'weekly',
      interval_value: 2,
      occurrences: 4,
    });
  });

  it('L&T round_trip no bloco: busca no dia do bloco (não no cursor do hotel)', () => {
    const pickup = {
      ...defaultBlockPickup('10:00', '11:00'),
      enabled: true,
      lt_service_type_id: 'lt-1',
      mode: 'round_trip' as const,
      before_starts_hm: '09:30',
      before_ends_hm: '10:00',
      after_starts_hm: '11:00',
      after_ends_hm: '11:30',
    };
    const blockStart = toIsoTs('2026-04-30', '10:00');
    const blockEnd = toIsoTs('2026-04-30', '11:00');
    const legs = buildBlockPickupApiPayload({
      pickup,
      dateYmd: '2026-04-30',
      blockStartsAt: blockStart,
      blockEndsAt: blockEnd,
      toIso: toIsoTs,
      toReturnIso: (ymd, hm, anchor) => {
        const c = toIsoTs(ymd, hm);
        return new Date(c).getTime() >= new Date(anchor).getTime() ? c : anchor;
      },
    });
    expect(legs.with_pickup_route_before?.starts_at.slice(0, 10)).toBe('2026-04-30');
    expect(legs.with_pickup_route_after?.starts_at.slice(0, 10)).toBe('2026-04-30');
  });
});
