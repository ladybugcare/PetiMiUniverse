import { getSupabase } from './supabase';

/** Limpa dados de sessão locais (web) após 401 / token inválido. */
export async function handleInvalidToken(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      localStorage.removeItem('clinic_user');
    }
    await getSupabase().auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('[web-core] handleInvalidToken:', (e as Error)?.message);
  }
}
