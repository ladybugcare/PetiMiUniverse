"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () => require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule());
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../../../app"));
const supabaseTestDouble_1 = require("../../../__tests__/helpers/supabaseTestDouble");
const boarding_1 = require("../../../__tests__/helpers/fixtures/boarding");
describe('GET /api/hub/finance/unbilled-completed (boarding)', () => {
    beforeEach(() => {
        (0, supabaseTestDouble_1.configureSupabaseMock)((0, boarding_1.baseBoardingFixture)());
    });
    it('lista reserva checked_out com valor de diárias correto', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/unbilled-completed')
            .query({ clinic_id: boarding_1.TEST_CLINIC_ID });
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(1);
        const item = res.body.items[0];
        expect(item.source_type).toBe('boarding_reservation');
        expect(item.source_id).toBe(boarding_1.TEST_RESERVATION_ID);
        expect(item.estimated_amount).toBe(450);
    });
    it('exclui reserva com billing_waived_at', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [
                    (0, boarding_1.hotelReservationCheckedOut)({ billing_waived_at: '2026-06-05T00:00:00.000Z' }),
                ],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/unbilled-completed')
            .query({ clinic_id: boarding_1.TEST_CLINIC_ID });
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(0);
    });
    it('exclui reserva com comanda aberta', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [(0, boarding_1.hotelReservationCheckedOut)()],
                hub_comandas: [
                    {
                        id: 'comanda-open-1',
                        clinic_id: boarding_1.TEST_CLINIC_ID,
                        origin_type: 'boarding_reservation',
                        origin_id: boarding_1.TEST_RESERVATION_ID,
                        status: 'aberta',
                        deleted_at: null,
                    },
                ],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/unbilled-completed')
            .query({ clinic_id: boarding_1.TEST_CLINIC_ID });
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(0);
    });
    it('exclui reserva com recebível ativo por source_type', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [(0, boarding_1.hotelReservationCheckedOut)()],
                hub_receivables: [
                    {
                        id: 'rec-1',
                        clinic_id: boarding_1.TEST_CLINIC_ID,
                        source_type: 'boarding_reservation',
                        source_id: boarding_1.TEST_RESERVATION_ID,
                        status: 'pending',
                        deleted_at: null,
                    },
                ],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/unbilled-completed')
            .query({ clinic_id: boarding_1.TEST_CLINIC_ID });
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(0);
    });
    it('exclui reserva com recebível manual via comanda_id', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [(0, boarding_1.hotelReservationCheckedOut)()],
                hub_comandas: [
                    {
                        id: 'comanda-closed-1',
                        clinic_id: boarding_1.TEST_CLINIC_ID,
                        origin_type: 'boarding_reservation',
                        origin_id: boarding_1.TEST_RESERVATION_ID,
                        status: 'fechada',
                        deleted_at: null,
                    },
                ],
                hub_receivables: [
                    {
                        id: 'rec-manual-1',
                        clinic_id: boarding_1.TEST_CLINIC_ID,
                        source_type: 'manual',
                        source_id: 'manual-src-1',
                        comanda_id: 'comanda-closed-1',
                        status: 'pending',
                        deleted_at: null,
                    },
                ],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/unbilled-completed')
            .query({ clinic_id: boarding_1.TEST_CLINIC_ID });
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(0);
    });
});
