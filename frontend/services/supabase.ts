import { createClient } from "@supabase/supabase-js";

/**
 * 🐾 Configuração do cliente Supabase para múltiplos ambientes
 * - Suporta web (CRA / Vite / Next) e mobile (Expo)
 * - Detecta automaticamente se está em ambiente local, staging ou produção
 */

const getSupabaseUrl = (): string => {
  return (
    process.env.REACT_APP_SUPABASE_URL || // React Web (Create React App)
    process.env.VITE_SUPABASE_URL || // Vite
    process.env.NEXT_PUBLIC_SUPABASE_URL || // Next.js
    process.env.EXPO_PUBLIC_SUPABASE_URL || // Expo Mobile
    "http://127.0.0.1:54321" // Fallback local
  );
};

const getSupabaseAnonKey = (): string => {
  return (
    process.env.REACT_APP_SUPABASE_ANON_KEY || // React Web
    process.env.VITE_SUPABASE_ANON_KEY || // Vite
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || // Next.js
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || // Expo
    ""
  );
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] ⚠️ Variáveis de ambiente ausentes! Verifique seu arquivo .env.local ou .env.staging.local"
  );
  console.warn("URL atual:", supabaseUrl);
}

/**
 * ✅ Cliente Supabase configurado
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * 🧠 Dica:
 * - Local → .env.local  → http://127.0.0.1:54321
 * - Staging → .env.staging.local → https://xxxx.supabase.co
 * - Produção → .env.production → https://xxxxx.supabase.co
 */
