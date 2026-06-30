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
describe('GET /api/hub/finance/day-board (boarding)', () => {
    beforeEach(() => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [
                    (0, boarding_1.hotelReservationCheckedOut)({
                        expected_check_out: '2026-06-30T10:00:00.000Z',
                        checked_out_at: '2026-06-30T10:00:00.000Z',
                    }),
                ],
            },
        });
    });
    it('inclui reserva com expected_check_out no dia', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/day-board')
            .query({ clinic_id: boarding_1.TEST_CLINIC_ID, unit_id: boarding_1.TEST_UNIT_ID, date: '2026-06-30' });
        expect(res.status).toBe(200);
        const boarding = res.body.items.find((it) => it.origin_type === 'boarding_reservation' && it.origin_id === boarding_1.TEST_RESERVATION_ID);
        expect(boarding).toBeDefined();
        expect(boarding.operational_status).toBe('checked_out');
    });
    it('filtra scope financeiro por finance_handoff_at', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [
                    (0, boarding_1.hotelReservationCheckedOut)({
                        expected_check_out: '2026-06-30T10:00:00.000Z',
                        checked_out_at: '2026-06-30T10:00:00.000Z',
                    }),
                ],
                hub_comandas: [
                    {
                        id: 'comanda-handoff',
                        clinic_id: boarding_1.TEST_CLINIC_ID,
                        origin_type: 'boarding_reservation',
                        origin_id: boarding_1.TEST_RESERVATION_ID,
                        status: 'fechada',
                        finance_handoff_at: '2026-06-30T12:00:00.000Z',
                        deleted_at: null,
                    },
                ],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/day-board')
            .query({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            unit_id: boarding_1.TEST_UNIT_ID,
            date: '2026-06-30',
            billing_scope: 'financeiro',
        });
        expect(res.status).toBe(200);
        const boarding = res.body.items.find((it) => it.origin_id === boarding_1.TEST_RESERVATION_ID);
        expect(boarding).toBeDefined();
        expect(boarding.billing.finance_handoff_at).toBeTruthy();
    });
});
