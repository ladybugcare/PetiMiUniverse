import {
  aggregateReceivableStatus,
  isDayBoardOperationallyComplete,
  isDayBoardPaidAndComplete,
  matchesFinanceiroDayBoardScope,
  pickActiveReceivableId,
} from '../hubFinancialDayBoard';

describe('hubFinancialDayBoard', () => {
  describe('isDayBoardOperationallyComplete', () => {
    it('boarding_reservation checked_out é operacionalmente completo', () => {
      expect(isDayBoardOperationallyComplete('boarding_reservation', 'checked_out')).toBe(true);
    });

    it('appointment done é completo', () => {
      expect(isDayBoardOperationallyComplete('appointment', 'done')).toBe(true);
    });

    it('grooming_session closed é completo', () => {
      expect(isDayBoardOperationallyComplete('grooming_session', 'closed')).toBe(true);
    });
  });

  describe('matchesFinanceiroDayBoardScope', () => {
    it('inclui com finance_handoff_at', () => {
      expect(
        matchesFinanceiroDayBoardScope({
          comanda_id: 'c1',
          comanda_status: 'fechada',
          has_receivable: true,
          receivable_status: 'pending',
          finance_handoff_at: '2026-06-04T12:00:00.000Z',
          active_receivable_id: 'r1',
        })
      ).toBe(true);
    });

    it('inclui recebível pendente', () => {
      expect(
        matchesFinanceiroDayBoardScope({
          comanda_id: 'c1',
          comanda_status: 'fechada',
          has_receivable: true,
          receivable_status: 'pending',
          finance_handoff_at: null,
          active_receivable_id: 'r1',
        })
      ).toBe(true);
    });

    it('exclui sem handoff nem recebível pendente', () => {
      expect(
        matchesFinanceiroDayBoardScope({
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
        })
      ).toBe(false);
    });
  });

  describe('aggregateReceivableStatus', () => {
    it('pending tem prioridade', () => {
      expect(aggregateReceivableStatus(['paid', 'pending'])).toBe('pending');
    });

    it('partially_paid quando não há pending', () => {
      expect(aggregateReceivableStatus(['paid', 'partially_paid'])).toBe('partially_paid');
    });

    it('paid quando todos pagos', () => {
      expect(aggregateReceivableStatus(['paid', 'paid'])).toBe('paid');
    });

    it('null quando vazio', () => {
      expect(aggregateReceivableStatus([])).toBeNull();
    });
  });

  describe('pickActiveReceivableId', () => {
    it('prioriza pending', () => {
      expect(
        pickActiveReceivableId([
          { id: 'paid-1', status: 'paid' },
          { id: 'pending-1', status: 'pending' },
        ])
      ).toBe('pending-1');
    });
  });

  describe('isDayBoardPaidAndComplete', () => {
    it('true quando pago e operação completa', () => {
      expect(isDayBoardPaidAndComplete('boarding_reservation', 'checked_out', 'paid')).toBe(true);
    });

    it('false quando pendente', () => {
      expect(isDayBoardPaidAndComplete('boarding_reservation', 'checked_out', 'pending')).toBe(false);
    });
  });
});
