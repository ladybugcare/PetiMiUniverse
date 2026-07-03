import {
  appointmentMatchesBoardingTypes,
  calcBoardingNights,
  dayBoundsFromYmdSaoPaulo,
  isValidStatusTransition,
  modeFromAppointmentKind,
  resolveDayBoardRange,
  stageFromAppointmentStatus,
  VALID_STATUS_TRANSITIONS,
} from '../boardingOperational';

describe('boardingOperational', () => {
  describe('dayBoundsFromYmdSaoPaulo', () => {
    it('retorna limites do dia em UTC-3', () => {
      const { from, to } = dayBoundsFromYmdSaoPaulo('2026-06-01');
      expect(from).toBe('2026-06-01T03:00:00.000Z');
      expect(to).toBe('2026-06-02T02:59:59.999Z');
    });
  });

  describe('resolveDayBoardRange', () => {
    it('usa date quando informado', () => {
      const r = resolveDayBoardRange({ date: '2026-06-01' });
      expect(r.dateYmd).toBe('2026-06-01');
      expect(r.from).toContain('2026-06-01');
    });

    it('usa from e to customizados', () => {
      const r = resolveDayBoardRange({
        from: '2026-06-01T08:00:00-03:00',
        to: '2026-06-01T20:00:00-03:00',
      });
      expect(r.from).toBe('2026-06-01T08:00:00-03:00');
      expect(r.to).toBe('2026-06-01T20:00:00-03:00');
    });
  });

  describe('appointmentMatchesBoardingTypes', () => {
    const hotelTypeId = 'type-hotel';
    const boardingSet = new Set([hotelTypeId]);
    const emptyLines = new Map<string, string[]>();

    it('match por appointment_kind hotel_stay', () => {
      expect(
        appointmentMatchesBoardingTypes(
          { id: 'a1', appointment_kind: 'hotel_stay' },
          boardingSet,
          emptyLines,
        ),
      ).toBe(true);
    });

    it('match por service type primário', () => {
      expect(
        appointmentMatchesBoardingTypes(
          { id: 'a2', hub_service_type_id: hotelTypeId },
          boardingSet,
          emptyLines,
        ),
      ).toBe(true);
    });

    it('match por linha multi-serviço', () => {
      const lines = new Map([['a3', [hotelTypeId]]]);
      expect(
        appointmentMatchesBoardingTypes({ id: 'a3' }, boardingSet, lines),
      ).toBe(true);
    });

    it('não match quando tipo irrelevante', () => {
      expect(
        appointmentMatchesBoardingTypes(
          { id: 'a4', appointment_kind: 'grooming' },
          boardingSet,
          emptyLines,
        ),
      ).toBe(false);
    });
  });

  describe('modeFromAppointmentKind', () => {
    it('daycare_block → daycare', () => {
      expect(modeFromAppointmentKind('daycare_block')).toBe('daycare');
    });

    it('default → hotel', () => {
      expect(modeFromAppointmentKind('hotel_stay')).toBe('hotel');
      expect(modeFromAppointmentKind(null)).toBe('hotel');
    });
  });

  describe('stageFromAppointmentStatus', () => {
    it('mapeia status do agendamento para stage boarding', () => {
      expect(stageFromAppointmentStatus('in_progress')).toBe('checked_in');
      expect(stageFromAppointmentStatus('done')).toBe('checked_out');
      expect(stageFromAppointmentStatus('paid')).toBe('checked_out');
      expect(stageFromAppointmentStatus('cancelled')).toBe('cancelled');
      expect(stageFromAppointmentStatus('scheduled')).toBe('reserved');
    });
  });

  describe('calcBoardingNights', () => {
    it('calcula noites entre check-in e check-out (floor)', () => {
      expect(
        calcBoardingNights('2026-06-01T14:00:00.000Z', '2026-06-04T10:00:00.000Z'),
      ).toBe(2);
    });

    it('mesmo dia retorna 0 noites', () => {
      expect(
        calcBoardingNights('2026-06-04T08:00:00.000Z', '2026-06-04T18:00:00.000Z'),
      ).toBe(0);
    });

    it('sem checkout usa Date.now()', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-04T10:00:00.000Z'));
      expect(calcBoardingNights('2026-06-01T14:00:00.000Z', null)).toBe(2);
      jest.useRealTimers();
    });

    it('retorna 0 sem check-in', () => {
      expect(calcBoardingNights(null, '2026-06-04T10:00:00.000Z')).toBe(0);
    });
  });

  describe('isValidStatusTransition', () => {
    it('aceita transições válidas da matriz', () => {
      for (const [from, targets] of Object.entries(VALID_STATUS_TRANSITIONS)) {
        for (const to of targets) {
          expect(isValidStatusTransition(from, to)).toBe(true);
        }
      }
    });

    it('rejeita cancelled → checked_in', () => {
      expect(isValidStatusTransition('cancelled', 'checked_in')).toBe(false);
    });

    it('rejeita reserved → checked_out direto', () => {
      expect(isValidStatusTransition('reserved', 'checked_out')).toBe(false);
    });
  });
});
