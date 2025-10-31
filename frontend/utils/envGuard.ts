/**
 * Environment Guard (Mobile/Expo)
 * Detects Supabase environment changes and clears auth session
 * This version uses the mobile Supabase client
 * 
 * Note: For mobile, we validate the current session against the environment
 * and clear it if the Supabase URL doesn't match (token from wrong environment)
 */

import { supabase } from '../services/supabase';

const getCurrentSupabaseUrl = (): string | null => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 
              process.env.REACT_APP_SUPABASE_URL;
  return url ? url.replace(/\/$/, '') : null; // Normalize: remove trailing slash
};

const clearAuthData = async (): Promise<void> => {
  try {
    // Clear Supabase session (uses AsyncStorage internally)
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[EnvGuard] Supabase signOut failed (non-fatal):', (e as any)?.message);
    }
  } catch (e) {
    console.warn('[EnvGuard] Error clearing auth data:', e);
  }
};

/**
 * Check environment consistency and clear auth if changed
 * Call this on app startup (in App.tsx or similar)
 * 
 * For mobile: Validates that the current session's Supabase URL matches
 * the configured environment. If not, clears the session.
 */
export const enforceEnvConsistency = async (): Promise<void> => {
  try {
    const currentUrl = getCurrentSupabaseUrl();
    
    // If no env vars configured, skip check
    if (!currentUrl) {
      console.warn('[EnvGuard] No Supabase URL found. Skipping consistency check.');
      return;
    }
    
    // Get current session
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      // If there's a session, validate it matches current environment
      if (session) {
        // Extract Supabase URL from the token's issuer (JWT standard claim)
        // The token's 'iss' claim contains the Supabase URL
        const tokenIssuer = (session as any).access_token 
          ? parseJwtIssuer(session.access_token) 
          : null;
        
        // If token issuer doesn't match current URL, clear session
        if (tokenIssuer && tokenIssuer !== currentUrl) {
          console.log('[EnvGuard] Environment mismatch detected. Clearing auth data...', {
            tokenIssuer: tokenIssuer.substring(0, 30) + '...',
            currentUrl: currentUrl.substring(0, 30) + '...'
          });
          await clearAuthData();
        }
      }
    } catch (e) {
      // If session check fails, it might be an invalid token from wrong environment
      // Try to clear anyway
      console.warn('[EnvGuard] Session check failed, clearing auth data:', e);
      await clearAuthData();
    }
  } catch (e) {
    console.error('[EnvGuard] Error in enforceEnvConsistency:', e);
  }
};

/**
 * Parse JWT to extract issuer (Supabase URL)
 * Returns null if token is invalid or doesn't have issuer
 */
const parseJwtIssuer = (token: string): string | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.iss || null;
  } catch {
    return null;
  }
};

/**
 * Clear auth data on invalid token error
 * Call this when receiving 401 with token signature errors
 */
export const handleInvalidToken = async (): Promise<void> => {
  console.warn('[EnvGuard] Invalid token detected. Clearing auth data...');
  await clearAuthData();
};

