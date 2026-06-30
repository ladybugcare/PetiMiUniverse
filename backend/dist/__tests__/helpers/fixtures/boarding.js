"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_UNIT_ID = exports.TEST_RESERVATION_ID = exports.TEST_PET_ID = exports.TEST_GUARDIAN_ID = exports.TEST_CLINIC_ID = void 0;
exports.hotelReservationCheckedOut = hotelReservationCheckedOut;
exports.daycareReservationCheckedOut = daycareReservationCheckedOut;
exports.emptyBoardingTables = emptyBoardingTables;
exports.baseBoardingFixture = baseBoardingFixture;
const mockAuth_1 = require("../mockAuth");
Object.defineProperty(exports, "TEST_CLINIC_ID", { enumerable: true, get: function () { return mockAuth_1.TEST_CLINIC_ID; } });
Object.defineProperty(exports, "TEST_GUARDIAN_ID", { enumerable: true, get: function () { return mockAuth_1.TEST_GUARDIAN_ID; } });
Object.defineProperty(exports, "TEST_PET_ID", { enumerable: true, get: function () { return mockAuth_1.TEST_PET_ID; } });
Object.defineProperty(exports, "TEST_RESERVATION_ID", { enumerable: true, get: function () { return mockAuth_1.TEST_RESERVATION_ID; } });
Object.defineProperty(exports, "TEST_UNIT_ID", { enumerable: true, get: function () { return mockAuth_1.TEST_UNIT_ID; } });
function hotelReservationCheckedOut(overrides = {}) {
    return {
        id: mockAuth_1.TEST_RESERVATION_ID,
        clinic_id: mockAuth_1.TEST_CLINIC_ID,
        unit_id: mockAuth_1.TEST_UNIT_ID,
        pet_id: mockAuth_1.TEST_PET_ID,
        guardian_id: mockAuth_1.TEST_GUARDIAN_ID,
        hub_appointment_id: null,
        mode: 'hotel',
        status: 'checked_out',
        expected_check_in: '2026-06-01T14:00:00.000Z',
        expected_check_out: '2026-06-04T10:00:00.000Z',
        checked_in_at: '2026-06-01T14:00:00.000Z',
        checked_out_at: '2026-06-04T10:00:00.000Z',
        daily_rate_cents: 15000,
        billing_waived_at: null,
        billing_waive_reason: null,
        deleted_at: null,
        pet: { id: mockAuth_1.TEST_PET_ID, name: 'Rex' },
        guardian: { id: mockAuth_1.TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
        ...overrides,
    };
}
function daycareReservationCheckedOut(overrides = {}) {
    return {
        ...hotelReservationCheckedOut(),
        mode: 'daycare',
        expected_check_in: '2026-06-04T08:00:00.000Z',
        expected_check_out: '2026-06-04T18:00:00.000Z',
        checked_in_at: '2026-06-04T08:00:00.000Z',
        checked_out_at: '2026-06-04T18:00:00.000Z',
        daily_rate_cents: 8000,
        ...overrides,
    };
}
function emptyBoardingTables() {
    return {
        hub_boarding_reservations: [],
        hub_comandas: [],
        hub_comanda_items: [],
        hub_receivables: [],
        hub_receivable_lines: [],
        hub_payments: [],
        hub_appointments: [],
        hub_grooming_sessions: [],
        hub_encounters: [],
        hub_quotes: [],
        hub_guardians: [
            { id: mockAuth_1.TEST_GUARDIAN_ID, full_name: 'Maria Silva', phone: null, email: null, tax_id: null, deleted_at: null },
        ],
        hub_pets: [
            {
                id: mockAuth_1.TEST_PET_ID,
                name: 'Rex',
                species: 'dog',
                breed: null,
                size_tier: 'medio',
                sex: 'M',
                deleted_at: null,
            },
        ],
        hub_pet_guardians: [{ pet_id: mockAuth_1.TEST_PET_ID, guardian_id: mockAuth_1.TEST_GUARDIAN_ID, role: 'primary' }],
        hub_clinic_settings: [
            {
                clinic_id: mockAuth_1.TEST_CLINIC_ID,
                accepted_payment_methods: ['cash', 'pix', 'credit_card', 'debit_card'],
            },
        ],
        units: [{ id: mockAuth_1.TEST_UNIT_ID, clinic_id: mockAuth_1.TEST_CLINIC_ID, is_main: true, name: 'Unidade 1' }],
        clinic_users: [
            { user_id: '11111111-1111-4111-8111-111111111111', clinic_id: mockAuth_1.TEST_CLINIC_ID, role: 'CADMIN', status: 'active' },
        ],
    };
}
function baseBoardingFixture() {
    return {
        tables: {
            ...emptyBoardingTables(),
            hub_boarding_reservations: [hotelReservationCheckedOut()],
        },
    };
}
