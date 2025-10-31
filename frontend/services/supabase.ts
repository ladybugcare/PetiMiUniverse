import { createClient } from "@supabase/supabase-js"

// Mobile/Expo: usa EXPO_PUBLIC, com fallback para REACT_APP (caso seja usado no web também)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing environment variables. Using defaults may cause auth errors.');
}

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321', // fallback para local se não configurado
  supabaseAnonKey || ''
)
