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
describe('POST /api/hub/comandas/open (boarding)', () => {
    beforeEach(() => {
        (0, supabaseTestDouble_1.configureSupabaseMock)((0, boarding_1.baseBoardingFixture)());
    });
    it('abre comanda de reserva checked_out com diárias corretas', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/hub/comandas/open')
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(res.status).toBe(201);
        expect(res.body.comanda.origin_type).toBe('boarding_reservation');
        expect(res.body.comanda.origin_id).toBe(boarding_1.TEST_RESERVATION_ID);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].quantity).toBe(3);
        expect(res.body.items[0].line_total).toBe(450);
    });
    it('retorna 409 quando reserva não está checked_out', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [(0, boarding_1.hotelReservationCheckedOut)({ status: 'checked_in' })],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/hub/comandas/open')
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/não está pronta/i);
    });
    it('retorna 409 quando reserva sem tutor', async () => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [(0, boarding_1.hotelReservationCheckedOut)({ guardian_id: null })],
            },
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/hub/comandas/open')
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/tutor/i);
    });
    it('retorna comanda existente ao abrir segunda vez (idempotência)', async () => {
        const first = await (0, supertest_1.default)(app_1.default)
            .post('/api/hub/comandas/open')
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(first.status).toBe(201);
        const comandaId = first.body.comanda.id;
        const second = await (0, supertest_1.default)(app_1.default)
            .post('/api/hub/comandas/open')
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: boarding_1.TEST_RESERVATION_ID,
        });
        expect(second.status).toBe(200);
        expect(second.body.comanda.id).toBe(comandaId);
    });
});
describe('POST /api/hub/comandas/:id/checkout cancel (boarding waive)', () => {
    const COMANDA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    beforeEach(() => {
        (0, supabaseTestDouble_1.configureSupabaseMock)({
            tables: {
                ...(0, boarding_1.emptyBoardingTables)(),
                hub_boarding_reservations: [(0, boarding_1.hotelReservationCheckedOut)()],
                hub_comandas: [
                    {
                        id: COMANDA_ID,
                        clinic_id: boarding_1.TEST_CLINIC_ID,
                        guardian_id: boarding_1.TEST_GUARDIAN_ID,
                        origin_type: 'boarding_reservation',
                        origin_id: boarding_1.TEST_RESERVATION_ID,
                        status: 'aberta',
                        financial_status: 'open',
                        total_amount: 450,
                        subtotal_amount: 450,
                        discount_amount: 0,
                        deleted_at: null,
                    },
                ],
                hub_comanda_items: [
                    {
                        id: 'item-1',
                        comanda_id: COMANDA_ID,
                        clinic_id: boarding_1.TEST_CLINIC_ID,
                        line_total: 450,
                        quantity: 3,
                        unit_amount: 150,
                        sort_order: 0,
                        pet_id: null,
                    },
                ],
            },
        });
    });
    it('persiste billing_waived_at na reserva ao cancelar comanda', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post(`/api/hub/comandas/${COMANDA_ID}/checkout`)
            .send({
            clinic_id: boarding_1.TEST_CLINIC_ID,
            grouping: 'all',
            action: 'cancel',
            waive_reason: 'Cortesia ao cliente',
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        const state = (0, supabaseTestDouble_1.getMockSupabaseClient)()._state.tables.hub_boarding_reservations?.[0];
        expect(state?.billing_waived_at).toBeTruthy();
        expect(state?.billing_waive_reason).toBe('Cortesia ao cliente');
    });
});
