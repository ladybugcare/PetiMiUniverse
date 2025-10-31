/**
 * Auth Env Guard
 * - Detects Supabase environment changes and clears only auth-related keys
 *   to prevent invalid JWT signature when switching between local/staging/prod.
 */

const AUTH_ENV_KEY = 'authEnvFingerprint';

type Fingerprint = {
  supabaseUrl: string | undefined;
  anonKeyPrefix: string | undefined; // store only a short prefix, not full key
};

const getCurrentFingerprint = (): Fingerprint => {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return {
    supabaseUrl,
    anonKeyPrefix: anon ? anon.substring(0, 16) : undefined,
  };
};

export const enforceAuthEnvConsistency = () => {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return;

    const current = getCurrentFingerprint();
    const savedRaw = localStorage.getItem(AUTH_ENV_KEY);
    const saved: Fingerprint | null = savedRaw ? JSON.parse(savedRaw) : null;

    const changed =
      !saved ||
      saved.supabaseUrl !== current.supabaseUrl ||
      saved.anonKeyPrefix !== current.anonKeyPrefix;

    if (changed) {
      // Clear only auth-related items; keep the rest of the app data intact
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      localStorage.removeItem('clinic_user');

      localStorage.setItem(AUTH_ENV_KEY, JSON.stringify(current));
    }
  } catch (_) {
    // no-op
  }
};


