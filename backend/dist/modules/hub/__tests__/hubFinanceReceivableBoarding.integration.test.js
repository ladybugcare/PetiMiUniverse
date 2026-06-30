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
describe('Financeiro boarding — preview, receivable e waive', () => {
    beforeEach(() => {
        (0, supabaseTestDouble_1.configureSupabaseMock)((0, boarding_1.baseBoardingFixture)());
    });
    it('GET /finance/preview retorna diárias corretas', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/preview')
            .query({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            source_type: 'boarding_reservation',
            source_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(res.status).toBe(200);
        expect(res.body.preview.estimated_amount).toBe(450);
        expect(res.body.preview.lines[0].description).toMatch(/Hotel/);
    });
    it('POST /finance/receivables cria recebível para boarding', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/hub/finance/receivables')
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            source_type: 'boarding_reservation',
            source_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(res.status).toBe(201);
        expect(res.body.receivable.source_type).toBe('boarding_reservation');
        expect(res.body.receivable.source_id).toBe(boarding_1.TEST_RESERVATION_ID);
    });
    it('POST /finance/waive-billing persiste waive na reserva', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/hub/finance/waive-billing')
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            source_type: 'boarding_reservation',
            source_id: boarding_1.TEST_RESERVATION_ID,
            reason: 'Cortesia promocional',
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        const state = (0, supabaseTestDouble_1.getMockSupabaseClient)()._state.tables.hub_boarding_reservations?.[0];
        expect(state?.billing_waived_at).toBeTruthy();
        expect(state?.billing_waive_reason).toBe('Cortesia promocional');
    });
    it('preview retorna 409 para reserva não checked_out', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [(0, boarding_1.hotelReservationCheckedOut)({ status: 'checked_in' })],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/hub/finance/preview')
            .query({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            source_type: 'boarding_reservation',
            source_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(res.status).toBe(409);
    });
});
