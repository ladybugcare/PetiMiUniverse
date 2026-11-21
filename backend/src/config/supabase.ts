import { createClient } from '@supabase/supabase-js'
import './loadEnv'

// Client padrão (anon key) — só para Auth no servidor (login, getUser(jwt), etc.).
// Sem persistência/refresh: um singleton com sessão compartilhada fazia o
// signInWithPassword do /auth/login contaminar getUser() de outras requests
// e o Hub derrubava a sessão do browser (401 → logout) segundos após o login.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

// Admin client (service role key) - usado apenas no backend para operações administrativas
// IMPORTANTE: Nunca exponha esta chave no frontend!
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('🚨 Faltando SUPABASE_SERVICE_ROLE_KEY no .env — operações admin irão falhar.');
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // 👈 só aceita a chave service
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

