import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase — CRA usa REACT_APP_*; Expo usa EXPO_PUBLIC_*.
 * Tem de viver em src/ (react-scripts não importa fora de src/).
 */

const getSupabaseUrl = (): string =>
  process.env.REACT_APP_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "";

const getSupabaseAnonKey = (): string =>
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const supabaseUrl = getSupabaseUrl().trim();
const supabaseAnonKey = getSupabaseAnonKey().trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "[PetMi Vet] Supabase URL ou anon key em falta. Crie frontend/.env.local com " +
      "REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY (veja frontend/.env.example). " +
      "Reinicie o servidor depois de guardar o ficheiro."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
