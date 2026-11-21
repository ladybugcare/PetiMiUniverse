import { createClient } from '@supabase/supabase-js'
import './loadEnv'

// Client anon sem persistência — preferir createAuthClient() em login e
// supabaseAdmin.auth.getUser(jwt) na validação de Bearer (evita contaminação).
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

/** Client anon efêmero por request (ex.: /auth/login). Não compartilha sessão em memória. */
export function createAuthClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

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

