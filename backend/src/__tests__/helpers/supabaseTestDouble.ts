import { createMockSupabaseClient, type MockSupabaseState } from './mockSupabase';

let client = createMockSupabaseClient({ tables: {} });

export function configureSupabaseMock(initial: MockSupabaseState) {
  client = createMockSupabaseClient(initial);
  return client;
}

export function getSupabaseModule() {
  return {
    get supabase() {
      return client;
    },
    get supabaseAdmin() {
      return client;
    },
  };
}

export function getMockSupabaseClient() {
  return client;
}
