import { createClient } from "@supabase/supabase-js";

/**
 * Configuração do cliente Supabase
 * Suporta ambientes web (CRA) e mobile (Expo) sem conflito
 */
const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "http://127.0.0.1:54321";

const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!process.env.REACT_APP_SUPABASE_URL) {
  console.warn(
    "[Supabase] ⚠️ Nenhuma URL encontrada nas variáveis de ambiente. Verifique seu arquivo .env.local ou .env.staging"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
