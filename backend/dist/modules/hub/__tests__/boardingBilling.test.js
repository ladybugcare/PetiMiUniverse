"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const boardingBilling_1 = require("../boardingBilling");
describe('boardingBilling', () => {
    describe('computeBoardingQuantity', () => {
        it('hotel: 3 noites entre check-in e check-out', () => {
            expect((0, boardingBilling_1.computeBoardingQuantity)('hotel', '2026-06-01T14:00:00.000Z', '2026-06-04T10:00:00.000Z')).toBe(3);
        });
        it('hotel: mesmo dia cobra 1 diária', () => {
            expect((0, boardingBilling_1.computeBoardingQuantity)('hotel', '2026-06-04T08:00:00.000Z', '2026-06-04T18:00:00.000Z')).toBe(1);
        });
        it('hotel: usa expected_* quando checked_* ausente', () => {
            expect((0, boardingBilling_1.computeBoardingQuantity)('hotel', '2026-06-01T14:00:00.000Z', '2026-06-04T10:00:00.000Z')).toBe(3);
        });
        it('creche: sempre quantidade 1', () => {
            expect((0, boardingBilling_1.computeBoardingQuantity)('daycare', '2026-06-01T14:00:00.000Z', '2026-06-04T10:00:00.000Z')).toBe(1);
        });
    });
    describe('computeBoardingLineAmount', () => {
        it('taxa zero resulta em line_total 0', () => {
            expect((0, boardingBilling_1.computeBoardingLineAmount)(0, 3)).toEqual({ unitAmount: 0, lineTotal: 0 });
        });
        it('calcula valor com 3 diárias de R$ 150', () => {
            expect((0, boardingBilling_1.computeBoardingLineAmount)(15000, 3)).toEqual({ unitAmount: 150, lineTotal: 450 });
        });
    });
    describe('resolveBoardingCheckInOut', () => {
        it('prefere checked_* sobre expected_*', () => {
            expect((0, boardingBilling_1.resolveBoardingCheckInOut)({
                id: 'x',
                mode: 'hotel',
                checked_in_at: '2026-06-02T00:00:00.000Z',
                expected_check_in: '2026-06-01T00:00:00.000Z',
                checked_out_at: '2026-06-05T00:00:00.000Z',
                expected_check_out: '2026-06-04T00:00:00.000Z',
            })).toEqual({
                checkIn: '2026-06-02T00:00:00.000Z',
                checkOut: '2026-06-05T00:00:00.000Z',
            });
        });
    });
    describe('buildBoardingComandaLine', () => {
        it('monta linha de hotel com descrição de diárias', () => {
            const { line, subtotal } = (0, boardingBilling_1.buildBoardingComandaLine)({
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
            activeReceivableKeys: new Set(),
            comandaOpenKeys: new Set(),
            billedViaComandaKeys: new Set(),
        };
        const baseReservation = {
            id: 'res-1',
            mode: 'hotel',
            status: 'checked_out',
            billing_waived_at: null,
            deleted_at: null,
        };
        it('inclui reserva checked_out sem cobrança', () => {
            expect((0, boardingBilling_1.shouldIncludeInUnbilledBoarding)(baseReservation, baseCtx)).toBe(true);
        });
        it('exclui status diferente de checked_out', () => {
            expect((0, boardingBilling_1.shouldIncludeInUnbilledBoarding)({ ...baseReservation, status: 'checked_in' }, baseCtx)).toBe(false);
        });
        it('exclui com billing_waived_at', () => {
            expect((0, boardingBilling_1.shouldIncludeInUnbilledBoarding)({ ...baseReservation, billing_waived_at: '2026-06-01T00:00:00.000Z' }, baseCtx)).toBe(false);
        });
        it('exclui com deleted_at', () => {
            expect((0, boardingBilling_1.shouldIncludeInUnbilledBoarding)({ ...baseReservation, deleted_at: '2026-06-01T00:00:00.000Z' }, baseCtx)).toBe(false);
        });
        it('exclui com comanda aberta', () => {
            expect((0, boardingBilling_1.shouldIncludeInUnbilledBoarding)(baseReservation, {
                ...baseCtx,
                comandaOpenKeys: new Set(['boarding_reservation:res-1']),
            })).toBe(false);
        });
        it('exclui com recebível ativo', () => {
            expect((0, boardingBilling_1.shouldIncludeInUnbilledBoarding)(baseReservation, {
                ...baseCtx,
                activeReceivableKeys: new Set(['boarding_reservation:res-1']),
            })).toBe(false);
        });
        it('exclui com recebível via comanda_id', () => {
            expect((0, boardingBilling_1.shouldIncludeInUnbilledBoarding)(baseReservation, {
                ...baseCtx,
                billedViaComandaKeys: new Set(['boarding_reservation:res-1']),
            })).toBe(false);
        });
    });
    describe('estimateBoardingUnbilledAmount', () => {
        it('estima valor correto para hotel 3 diárias', () => {
            expect((0, boardingBilling_1.estimateBoardingUnbilledAmount)({
                id: 'res-1',
                mode: 'hotel',
                checked_in_at: '2026-06-01T14:00:00.000Z',
                checked_out_at: '2026-06-04T10:00:00.000Z',
                daily_rate_cents: 15000,
            })).toBe(450);
        });
    });
    describe('isBilledViaComandaHandoff', () => {
        it('true quando finance_handoff_at preenchido', () => {
            expect((0, boardingBilling_1.isBilledViaComandaHandoff)({
                comanda_id: 'c1',
                comanda_status: 'fechada',
                has_receivable: true,
                receivable_status: 'pending',
                finance_handoff_at: '2026-06-04T12:00:00.000Z',
                active_receivable_id: 'r1',
            })).toBe(true);
        });
        it('false sem handoff nem recebível pendente', () => {
            expect((0, boardingBilling_1.isBilledViaComandaHandoff)({
                comanda_id: null,
                comanda_status: null,
                has_receivable: false,
                receivable_status: null,
                finance_handoff_at: null,
                active_receivable_id: null,
            })).toBe(false);
        });
    });
    it.todo('check-out após horário-limite cobra diária extra (regra futura)');
});
describe('computeBoardingNights', () => {
    it('retorna 0 sem datas', () => {
        expect((0, boardingBilling_1.computeBoardingNights)(null, null)).toBe(0);
    });
});
