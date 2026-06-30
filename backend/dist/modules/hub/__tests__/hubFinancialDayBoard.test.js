"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hubFinancialDayBoard_1 = require("../hubFinancialDayBoard");
describe('hubFinancialDayBoard', () => {
    describe('isDayBoardOperationallyComplete', () => {
        it('boarding_reservation checked_out é operacionalmente completo', () => {
            expect((0, hubFinancialDayBoard_1.isDayBoardOperationallyComplete)('boarding_reservation', 'checked_out')).toBe(true);
        });
        it('appointment done é completo', () => {
            expect((0, hubFinancialDayBoard_1.isDayBoardOperationallyComplete)('appointment', 'done')).toBe(true);
        });
        it('grooming_session closed é completo', () => {
            expect((0, hubFinancialDayBoard_1.isDayBoardOperationallyComplete)('grooming_session', 'closed')).toBe(true);
        });
    });
    describe('matchesFinanceiroDayBoardScope', () => {
        it('inclui com finance_handoff_at', () => {
            expect((0, hubFinancialDayBoard_1.matchesFinanceiroDayBoardScope)({
                comanda_id: 'c1',
                comanda_status: 'fechada',
                has_receivable: true,
                receivable_status: 'pending',
                finance_handoff_at: '2026-06-04T12:00:00.000Z',
                active_receivable_id: 'r1',
            })).toBe(true);
        });
        it('inclui recebível pendente', () => {
            expect((0, hubFinancialDayBoard_1.matchesFinanceiroDayBoardScope)({
                comanda_id: 'c1',
                comanda_status: 'fechada',
                has_receivable: true,
                receivable_status: 'pending',
                finance_handoff_at: null,
                active_receivable_id: 'r1',
            })).toBe(true);
        });
        it('exclui sem handoff nem recebível pendente', () => {
            expect((0, hubFinancialDayBoard_1.matchesFinanceiroDayBoardScope)({
                comanda_id: null,
                comanda_status: null,
                has_receivable: false,
                receivable_status: null,
                finance_handoff_at: null,
                active_receivable_id: null,
            })).toBe(false);
        });
    });
    describe('aggregateReceivableStatus', () => {
        it('pending tem prioridade', () => {
            expect((0, hubFinancialDayBoard_1.aggregateReceivableStatus)(['paid', 'pending'])).toBe('pending');
        });
        it('partially_paid quando não há pending', () => {
            expect((0, hubFinancialDayBoard_1.aggregateReceivableStatus)(['paid', 'partially_paid'])).toBe('partially_paid');
        });
        it('paid quando todos pagos', () => {
            expect((0, hubFinancialDayBoard_1.aggregateReceivableStatus)(['paid', 'paid'])).toBe('paid');
        });
        it('null quando vazio', () => {
            expect((0, hubFinancialDayBoard_1.aggregateReceivableStatus)([])).toBeNull();
        });
    });
    describe('pickActiveReceivableId', () => {
        it('prioriza pending', () => {
            expect((0, hubFinancialDayBoard_1.pickActiveReceivableId)([
                { id: 'paid-1', status: 'paid' },
                { id: 'pending-1', status: 'pending' },
            ])).toBe('pending-1');
        });
    });
    describe('isDayBoardPaidAndComplete', () => {
        it('true quando pago e operação completa', () => {
            expect((0, hubFinancialDayBoard_1.isDayBoardPaidAndComplete)('boarding_reservation', 'checked_out', 'paid')).toBe(true);
        });
        it('false quando pendente', () => {
            expect((0, hubFinancialDayBoard_1.isDayBoardPaidAndComplete)('boarding_reservation', 'checked_out', 'pending')).toBe(false);
        });
    });
});
