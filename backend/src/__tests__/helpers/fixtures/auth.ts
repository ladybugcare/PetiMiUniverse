export const TEST_AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const TEST_AUTH_CLINIC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const TEST_AUTH_UNIT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

export function validSession() {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
  };
}

export function validUser(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_AUTH_USER_ID,
    email: 'user@test.com',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    user_metadata: { role: 'CADMIN', name: 'Usuário Teste' },
    role: 'authenticated',
    ...overrides,
  };
}

export function clinicUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clinic-user-1',
    user_id: TEST_AUTH_USER_ID,
    clinic_id: TEST_AUTH_CLINIC_ID,
    role: 'CADMIN',
    status: 'active',
    unit_id: null,
    first_login_at: '2026-01-01T00:00:00.000Z',
    first_login_completed_at: '2026-01-01T00:00:00.000Z',
    onboarding_state: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function clinicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_AUTH_CLINIC_ID,
    status: 'active',
    email: 'user@test.com',
    ...overrides,
  };
}

export function unitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_AUTH_UNIT_ID,
    clinic_id: TEST_AUTH_CLINIC_ID,
    status: 'active',
    ...overrides,
  };
}

export function baseAuthTables() {
  return {
    clinic_users: [clinicUserRow()],
    clinics: [clinicRow()],
    units: [unitRow()],
  };
}

export function emptyAuthTables() {
  return {
    clinic_users: [] as Record<string, unknown>[],
    clinics: [] as Record<string, unknown>[],
    units: [] as Record<string, unknown>[],
  };
}
