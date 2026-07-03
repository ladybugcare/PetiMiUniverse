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

export const TEST_APPOINTMENT_ID = '77777777-7777-4777-8777-777777777777';
export const TEST_HOTEL_SERVICE_TYPE_ID = '88888888-8888-4888-8888-888888888888';
export const TEST_DAYCARE_SERVICE_TYPE_ID = '99999999-9999-4999-8999-999999999999';

export function reservedHotelReservation(overrides: Record<string, unknown> = {}) {
  return {
    ...hotelReservationCheckedOut({ status: 'reserved', checked_in_at: null, checked_out_at: null }),
    ...overrides,
  };
}

export function checkedInHotelReservation(overrides: Record<string, unknown> = {}) {
  return {
    ...hotelReservationCheckedOut({
      status: 'checked_in',
      checked_out_at: null,
    }),
    ...overrides,
  };
}

export function walkInReservation(overrides: Record<string, unknown> = {}) {
  return {
    ...checkedInHotelReservation({
      hub_appointment_id: null,
      created_at: '2026-06-01T10:00:00.000Z',
    }),
    ...overrides,
  };
}

export function boardingAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_APPOINTMENT_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    pet_id: TEST_PET_ID,
    guardian_id: TEST_GUARDIAN_ID,
    starts_at: '2026-06-01T14:00:00.000Z',
    ends_at: '2026-06-04T10:00:00.000Z',
    status: 'scheduled',
    title: 'Hotel Rex',
    hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
    appointment_kind: 'hotel_stay',
    notes: null,
    deleted_at: null,
    ...overrides,
  };
}

export function hotelServiceType() {
  return {
    id: TEST_HOTEL_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    service_group: 'hotel',
    name: 'Hotel',
    deleted_at: null,
  };
}

export function daycareServiceType() {
  return {
    id: TEST_DAYCARE_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    service_group: 'creche',
    name: 'Creche',
    deleted_at: null,
  };
}

export function unitBoardingSettings(overrides: Record<string, unknown> = {}) {
  return {
    unit_id: TEST_UNIT_ID,
    clinic_id: TEST_CLINIC_ID,
    hotel_slots: 10,
    daycare_slots_per_shift: 15,
    checkout_cutoff_time: '12:00',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function boardingDailyLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    clinic_id: TEST_CLINIC_ID,
    hub_boarding_reservation_id: TEST_RESERVATION_ID,
    log_date: '2026-06-02',
    fed: { breakfast: true },
    medication: null,
    walks: null,
    mood: 'feliz',
    notes: 'Comeu bem',
    created_by_staff_id: null,
    created_at: '2026-06-02T18:00:00.000Z',
    ...overrides,
  };
}

export function baseOperationalBoardingFixture() {
  const appt = boardingAppointment();
  return {
    tables: {
      ...emptyBoardingTables(),
      hub_service_types: [hotelServiceType(), daycareServiceType()],
      hub_appointments: [appt],
      hub_appointment_services: [],
      hub_boarding_reservations: [
        reservedHotelReservation({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          hub_appointment_id: TEST_APPOINTMENT_ID,
        }),
      ],
      hub_unit_boarding_settings: [unitBoardingSettings()],
      hub_boarding_daily_logs: [],
      hub_pet_clinical_flags: [],
    },
  };
}

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
    hub_appointment_services: [] as Record<string, unknown>[],
    hub_service_types: [] as Record<string, unknown>[],
    hub_unit_boarding_settings: [] as Record<string, unknown>[],
    hub_boarding_daily_logs: [] as Record<string, unknown>[],
    hub_pet_clinical_flags: [] as Record<string, unknown>[],
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
