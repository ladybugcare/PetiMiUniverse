import {
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
} from '../mockAuth';

export {
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
};

export function hotelReservationCheckedOut(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_RESERVATION_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    pet_id: TEST_PET_ID,
    guardian_id: TEST_GUARDIAN_ID,
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
    pet: { id: TEST_PET_ID, name: 'Rex' },
    guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
    ...overrides,
  };
}

export function daycareReservationCheckedOut(overrides: Record<string, unknown> = {}) {
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

export function emptyBoardingTables() {
  return {
    hub_boarding_reservations: [] as Record<string, unknown>[],
    hub_comandas: [] as Record<string, unknown>[],
    hub_comanda_items: [] as Record<string, unknown>[],
    hub_receivables: [] as Record<string, unknown>[],
    hub_receivable_lines: [] as Record<string, unknown>[],
    hub_payments: [] as Record<string, unknown>[],
    hub_appointments: [] as Record<string, unknown>[],
    hub_grooming_sessions: [] as Record<string, unknown>[],
    hub_encounters: [] as Record<string, unknown>[],
    hub_quotes: [] as Record<string, unknown>[],
    hub_guardians: [
      { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva', phone: null, email: null, tax_id: null, deleted_at: null },
    ],
    hub_pets: [
      {
        id: TEST_PET_ID,
        name: 'Rex',
        species: 'dog',
        breed: null,
        size_tier: 'medio',
        sex: 'M',
        deleted_at: null,
      },
    ],
    hub_pet_guardians: [{ pet_id: TEST_PET_ID, guardian_id: TEST_GUARDIAN_ID, role: 'primary' }],
    hub_clinic_settings: [
      {
        clinic_id: TEST_CLINIC_ID,
        accepted_payment_methods: ['cash', 'pix', 'credit_card', 'debit_card'],
      },
    ],
    units: [{ id: TEST_UNIT_ID, clinic_id: TEST_CLINIC_ID, is_main: true, name: 'Unidade 1' }],
    clinic_users: [
      { user_id: '11111111-1111-4111-8111-111111111111', clinic_id: TEST_CLINIC_ID, role: 'CADMIN', status: 'active' },
    ],
  };
}

export function baseBoardingFixture() {
  return {
    tables: {
      ...emptyBoardingTables(),
      hub_boarding_reservations: [hotelReservationCheckedOut()],
    },
  };
}
