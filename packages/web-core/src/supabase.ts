import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Vite only injects env vars when `import.meta.env.VITE_*` is accessed with a
 * **static** property name. Dynamic `import.meta.env[name]` stays empty in the
 * browser build, which broke Hub (web-core lives outside the Vite app root).
 */
const getSupabaseUrl = (): string => {
  if (typeof process !== 'undefined' && process.env) {
    const p =
      process.env.VITE_SUPABASE_URL ||
      process.env.REACT_APP_SUPABASE_URL ||
      process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (p) return String(p);
  }
  try {
    const u =
      import.meta.env.VITE_SUPABASE_URL ||
      import.meta.env.REACT_APP_SUPABASE_URL ||
      import.meta.env.EXPO_PUBLIC_SUPABASE_URL;
    if (u) return String(u);
  } catch {
    /* non-Vite */
  }
  return '';
};

const getSupabaseAnonKey = (): string => {
  if (typeof process !== 'undefined' && process.env) {
    const p =
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.REACT_APP_SUPABASE_ANON_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (p) return String(p);
  }
  try {
    const k =
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.REACT_APP_SUPABASE_ANON_KEY ||
      import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (k) return String(k);
  } catch {
    /* non-Vite */
  }
  return '';
};

let _client: SupabaseClient | null = null;

/**
 * Singleton Supabase client for web apps (Vite / CRA).
 * Reads VITE_* (hub-web) or REACT_APP_* (CRA) at first call.
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = getSupabaseUrl().trim();
  const key = getSupabaseAnonKey().trim();
  if (!url || !key) {
    throw new Error(
      '[@petimi/web-core] Supabase URL ou anon key em falta. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ou REACT_APP_* no CRA).'
    );
  }
  _client = createClient(url, key);
  return _client;
}
