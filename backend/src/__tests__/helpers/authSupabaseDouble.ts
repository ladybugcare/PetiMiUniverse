import { createMockSupabaseClient, resetMockSupabaseState, type MockSupabaseState } from './mockSupabase';
import { baseAuthTables, validSession, validUser } from './fixtures/auth';

export type AuthSupabaseMockConfig = {
  tables?: MockSupabaseState['tables'];
  signInWithPassword?: jest.Mock;
  signUp?: jest.Mock;
  getUser?: jest.Mock;
  listUsers?: jest.Mock;
  updateUserById?: jest.Mock;
  inviteUserByEmail?: jest.Mock;
  generateLink?: jest.Mock;
};

let currentConfig: AuthSupabaseMockConfig = {};
let client = buildClient({ tables: baseAuthTables() });

function defaultSignIn() {
  return {
    data: { user: validUser(), session: validSession() },
    error: null,
  };
}

function defaultSignUp() {
  return {
    data: { user: validUser(), session: validSession() },
    error: null,
  };
}

function defaultGetUser() {
  return {
    data: { user: validUser() },
    error: null,
  };
}

function buildClient(state: MockSupabaseState) {
  const base = createMockSupabaseClient(state);
  const cfg = currentConfig;

  base.auth.signInWithPassword =
    cfg.signInWithPassword ?? jest.fn().mockResolvedValue(defaultSignIn());
  base.auth.signUp = cfg.signUp ?? jest.fn().mockResolvedValue(defaultSignUp());
  base.auth.getUser = cfg.getUser ?? jest.fn().mockImplementation(defaultGetUser);

  base.auth.admin = {
    ...base.auth.admin,
    listUsers:
      cfg.listUsers ??
      jest.fn().mockResolvedValue({
        data: { users: [validUser({ email_confirmed_at: null })] },
        error: null,
      }),
    updateUserById:
      cfg.updateUserById ?? jest.fn().mockResolvedValue({ data: { user: validUser() }, error: null }),
    inviteUserByEmail:
      cfg.inviteUserByEmail ??
      jest.fn().mockResolvedValue({ data: { user: validUser() }, error: null }),
    generateLink:
      cfg.generateLink ??
      jest.fn().mockResolvedValue({
        data: { properties: { action_link: 'https://example.com' } },
        error: null,
      }),
  };

  return base;
}

export function configureAuthSupabaseMock(config: AuthSupabaseMockConfig = {}) {
  currentConfig = config;
  const tables = config.tables ?? baseAuthTables();
  client = buildClient({ tables });
  return client;
}

export function resetAuthSupabaseMock(tables: MockSupabaseState['tables'] = baseAuthTables()) {
  resetMockSupabaseState(client, { tables });
  currentConfig = {};
  client = buildClient({ tables });
  return client;
}

export function getAuthSupabaseModule() {
  return {
    get supabase() {
      return client;
    },
    get supabaseAdmin() {
      return client;
    },
  };
}

export function getAuthMockSupabaseClient() {
  return client;
}
