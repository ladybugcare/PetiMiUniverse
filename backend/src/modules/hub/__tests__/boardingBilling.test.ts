import {
  buildBoardingComandaLine,
  buildBoardingExtraLines,
  computeBoardingLineAmount,
  estimateBoardingStayTotal,
  isAppointmentLineReplacedByBoarding,
  isCheckoutAfterCutoff,
  computeBoardingNights,
  computeBoardingQuantity,
  estimateBoardingUnbilledAmount,
  isBilledViaComandaHandoff,
  resolveBoardingCheckInOut,
  shouldIncludeInUnbilledBoarding,
} from '../boardingBilling';

describe('boardingBilling', () => {
  describe('computeBoardingQuantity', () => {
    it('hotel: 3 noites entre check-in e check-out', () => {
      expect(
        computeBoardingQuantity('hotel', '2026-06-01T14:00:00.000Z', '2026-06-04T10:00:00.000Z')
      ).toBe(3);
    });

    it('hotel: mesmo dia cobra 1 diária', () => {
      expect(
        computeBoardingQuantity('hotel', '2026-06-04T08:00:00.000Z', '2026-06-04T18:00:00.000Z')
      ).toBe(1);
    });

    it('hotel: usa expected_* quando checked_* ausente', () => {
      expect(
        computeBoardingQuantity('hotel', '2026-06-01T14:00:00.000Z', '2026-06-04T10:00:00.000Z')
      ).toBe(3);
    });

    it('creche: sempre quantidade 1', () => {
      expect(
        computeBoardingQuantity('daycare', '2026-06-01T14:00:00.000Z', '2026-06-04T10:00:00.000Z')
      ).toBe(1);
    });
  });

  describe('computeBoardingLineAmount', () => {
    it('taxa zero resulta em line_total 0', () => {
      expect(computeBoardingLineAmount(0, 3)).toEqual({ unitAmount: 0, lineTotal: 0 });
    });

    it('calcula valor com 3 diárias de R$ 150', () => {
      expect(computeBoardingLineAmount(15000, 3)).toEqual({ unitAmount: 150, lineTotal: 450 });
    });
  });

  describe('resolveBoardingCheckInOut', () => {
    it('prefere checked_* sobre expected_*', () => {
      expect(
        resolveBoardingCheckInOut({
          id: 'x',
          mode: 'hotel',
          checked_in_at: '2026-06-02T00:00:00.000Z',
          expected_check_in: '2026-06-01T00:00:00.000Z',
          checked_out_at: '2026-06-05T00:00:00.000Z',
          expected_check_out: '2026-06-04T00:00:00.000Z',
        })
      ).toEqual({
        checkIn: '2026-06-02T00:00:00.000Z',
        checkOut: '2026-06-05T00:00:00.000Z',
      });
    });
  });

  describe('buildBoardingComandaLine', () => {
    it('monta linha de hotel com descrição de diárias', () => {
      const { line, subtotal } = buildBoardingComandaLine({
        id: 'res-1',
        mode: 'hotel',
        pet_id: 'pet-1',
        checked_in_at: '2026-06-01T14:00:00.000Z',
        checked_out_at: '2026-06-04T10:00:00.000Z',
        daily_rate_cents: 15000,
      });
      expect(line.quantity).toBe(3);
      expect(line.description).toBe('Hotel — 3 diárias');
      expect(subtotal).toBe(450);
      expect(line.origin_type).toBe('boarding_reservation');
    });
  });

  describe('shouldIncludeInUnbilledBoarding', () => {
    const baseCtx = {
      activeReceivableKeys: new Set<string>(),
      comandaOpenKeys: new Set<string>(),
      billedViaComandaKeys: new Set<string>(),
    };

    const baseReservation = {
      id: 'res-1',
      mode: 'hotel',
      status: 'checked_out',
      billing_waived_at: null,
      deleted_at: null,
    };

    it('inclui reserva checked_out sem cobrança', () => {
      expect(shouldIncludeInUnbilledBoarding(baseReservation, baseCtx)).toBe(true);
    });

    it('exclui status diferente de checked_out', () => {
      expect(shouldIncludeInUnbilledBoarding({ ...baseReservation, status: 'checked_in' }, baseCtx)).toBe(
        false
      );
    });

    it('exclui com billing_waived_at', () => {
      expect(
        shouldIncludeInUnbilledBoarding(
          { ...baseReservation, billing_waived_at: '2026-06-01T00:00:00.000Z' },
          baseCtx
        )
      ).toBe(false);
    });

    it('exclui com deleted_at', () => {
      expect(
        shouldIncludeInUnbilledBoarding({ ...baseReservation, deleted_at: '2026-06-01T00:00:00.000Z' }, baseCtx)
      ).toBe(false);
    });

    it('exclui com comanda aberta', () => {
      expect(
        shouldIncludeInUnbilledBoarding(baseReservation, {
          ...baseCtx,
          comandaOpenKeys: new Set(['boarding_reservation:res-1']),
        })
      ).toBe(false);
    });

    it('exclui com recebível ativo', () => {
      expect(
        shouldIncludeInUnbilledBoarding(baseReservation, {
          ...baseCtx,
          activeReceivableKeys: new Set(['boarding_reservation:res-1']),
        })
      ).toBe(false);
    });

    it('exclui com recebível via comanda_id', () => {
      expect(
        shouldIncludeInUnbilledBoarding(baseReservation, {
          ...baseCtx,
          billedViaComandaKeys: new Set(['boarding_reservation:res-1']),
        })
      ).toBe(false);
    });
  });

  describe('estimateBoardingUnbilledAmount', () => {
    it('estima valor correto para hotel 3 diárias', () => {
      expect(
        estimateBoardingUnbilledAmount({
          id: 'res-1',
          mode: 'hotel',
          checked_in_at: '2026-06-01T14:00:00.000Z',
          checked_out_at: '2026-06-04T10:00:00.000Z',
          daily_rate_cents: 15000,
        })
      ).toBe(450);
    });

    it('soma adicionais ao total estimado', () => {
      expect(
        estimateBoardingUnbilledAmount(
          {
            id: 'res-1',
            mode: 'hotel',
            checked_in_at: '2026-06-01T14:00:00.000Z',
            checked_out_at: '2026-06-04T10:00:00.000Z',
            daily_rate_cents: 15000,
          },
          [
            {
              id: 'ex-1',
              description: 'Banho',
              quantity: 1,
              unit_amount_cents: 8000,
            },
          ],
        )
      ).toBe(530);
    });
  });

  describe('isBilledViaComandaHandoff', () => {
    it('true quando finance_handoff_at preenchido', () => {
      expect(
        isBilledViaComandaHandoff({
          comanda_id: 'c1',
          comanda_status: 'fechada',
          has_receivable: true,
          receivable_status: 'pending',
          finance_handoff_at: '2026-06-04T12:00:00.000Z',
          active_receivable_id: 'r1',
        due_date: null,
        })
      ).toBe(true);
    });

    it('false sem handoff nem recebível pendente', () => {
      expect(
        isBilledViaComandaHandoff({
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
        due_date: null,
        })
      ).toBe(false);
    });
  });

  describe('horário-limite de saída', () => {
    // 2026-06-04T15:30Z = 12:30 em São Paulo
    const checkIn = '2026-06-01T14:00:00.000Z';
    const lateOut = '2026-06-04T15:30:00.000Z';

    it('saída depois do horário-limite cobra uma diária a mais', () => {
      expect(isCheckoutAfterCutoff(lateOut, '12:00:00')).toBe(true);
      expect(computeBoardingQuantity('hotel', checkIn, lateOut, { cutoffTime: '12:00:00' })).toBe(4);
    });

    it('saída antes do horário-limite não cobra extra', () => {
      expect(computeBoardingQuantity('hotel', checkIn, lateOut, { cutoffTime: '14:00' })).toBe(3);
    });

    it('sem horário-limite configurado mantém as noites', () => {
      expect(computeBoardingQuantity('hotel', checkIn, lateOut, { cutoffTime: null })).toBe(3);
    });

    it('estadia no mesmo dia continua com 1 diária mesmo depois do limite', () => {
      expect(
        computeBoardingQuantity('hotel', '2026-06-04T11:00:00.000Z', lateOut, { cutoffTime: '12:00' }),
      ).toBe(1);
    });

    it('creche não usa horário-limite', () => {
      expect(computeBoardingQuantity('daycare', checkIn, lateOut, { cutoffTime: '08:00' })).toBe(1);
    });
  });

  describe('adicionais e total da estadia', () => {
    it('gera uma linha por adicional e ignora removidos', () => {
      const { lines, subtotal } = buildBoardingExtraLines(
        [
          { id: 'e1', description: 'Banho no dia', quantity: 1, unit_amount_cents: 6000 },
          { id: 'e2', description: 'Petisco', quantity: 2, unit_amount_cents: 1250 },
          { id: 'e3', description: 'Removido', quantity: 1, unit_amount_cents: 999, deleted_at: '2026-06-01' },
        ],
        'pet-1',
      );
      expect(lines.map((l) => l.origin_type)).toEqual(['boarding_extra', 'boarding_extra']);
      expect(lines[1].line_total).toBe(25);
      expect(subtotal).toBe(85);
    });

    it('total da estadia soma diárias e adicionais', () => {
      const total = estimateBoardingStayTotal(
        {
          id: 'r1',
          mode: 'hotel',
          checked_in_at: '2026-06-01T14:00:00.000Z',
          checked_out_at: '2026-06-04T15:30:00.000Z',
          daily_rate_cents: 15000,
        },
        [{ id: 'e1', description: 'Banho', quantity: 1, unit_amount_cents: 6000 }],
        { cutoffTime: '12:00' },
      );
      expect(total).toEqual({ quantity: 4, base: 600, extras: 60, total: 660 });
    });

    it('creche descreve o período', () => {
      const { line } = buildBoardingComandaLine({
        id: 'r2',
        mode: 'daycare',
        daycare_period: 'half_day',
        checked_in_at: '2026-06-01T11:00:00.000Z',
        checked_out_at: '2026-06-01T15:00:00.000Z',
        daily_rate_cents: 5000,
      });
      expect(line.description).toBe('Creche — meio período');
      expect(line.line_total).toBe(50);
    });
  });

  describe('isAppointmentLineReplacedByBoarding', () => {
    it('substitui a linha do mesmo serviço da reserva', () => {
      expect(isAppointmentLineReplacedByBoarding('svc-1', 'outro', 'svc-1')).toBe(true);
    });

    it('substitui linhas de grupo hotel/creche', () => {
      expect(isAppointmentLineReplacedByBoarding('svc-2', 'hotel', null)).toBe(true);
      expect(isAppointmentLineReplacedByBoarding('svc-3', 'creche', null)).toBe(true);
    });

    it('mantém outros serviços (ex.: banho no agendamento)', () => {
      expect(isAppointmentLineReplacedByBoarding('svc-4', 'banho_tosa', 'svc-1')).toBe(false);
    });
  });
});

describe('computeBoardingNights', () => {
  it('retorna 0 sem datas', () => {
    expect(computeBoardingNights(null, null)).toBe(0);
  });
});
