/**
 * Environment Guard
 * Detects Supabase environment changes and clears auth session
 * Works for both web (localStorage) and mobile (Supabase AsyncStorage)
 */

import { supabase } from '../services/supabase';
import { Platform } from 'react-native';

const ENV_FINGERPRINT_KEY = 'authEnvFingerprint';

type EnvFingerprint = {
  supabaseUrl: string;
  anonKeyPrefix: string; // Only first 16 chars for privacy
  timestamp: number;
};

const getCurrentFingerprint = (): EnvFingerprint | null => {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 
                     process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 
                 process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !anonKey) {
    return null;
  }
  
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''), // Normalize: remove trailing slash
    anonKeyPrefix: anonKey.substring(0, 16),
    timestamp: Date.now(),
  };
};

const getStoredFingerprint = (): EnvFingerprint | null => {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(ENV_FINGERPRINT_KEY);
      return stored ? JSON.parse(stored) : null;
    }
    // Mobile: Supabase stores session in AsyncStorage, we'll check via Supabase client
    return null;
  } catch {
    return null;
  }
};

const clearAuthData = async (): Promise<void> => {
  try {
    // Web: clear localStorage
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      localStorage.removeItem('clinic_user');
    }
    
    // Mobile/Web: clear Supabase session (works for both)
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      // Supabase may not be available or already signed out
      console.warn('[EnvGuard] Supabase signOut failed (non-fatal):', (e as any)?.message);
    }
  } catch (e) {
    console.warn('[EnvGuard] Error clearing auth data:', e);
  }
};

/**
 * Check environment consistency and clear auth if changed
 * Call this on app startup (in App.tsx or similar)
 */
export const enforceEnvConsistency = async (): Promise<void> => {
  try {
    const current = getCurrentFingerprint();
    
    // If no env vars configured, skip check
    if (!current) {
      console.warn('[EnvGuard] No Supabase env vars found. Skipping consistency check.');
      return;
    }
    
    const stored = getStoredFingerprint();
    
    // Check if environment changed
    const envChanged = !stored || 
                       stored.supabaseUrl !== current.supabaseUrl ||
                       stored.anonKeyPrefix !== current.anonKeyPrefix;
    
    if (envChanged) {
      console.log('[EnvGuard] Environment changed. Clearing auth data...', {
        from: stored ? { url: stored.supabaseUrl.substring(0, 30) + '...' } : 'none',
        to: { url: current.supabaseUrl.substring(0, 30) + '...' }
      });
      
      await clearAuthData();
      
      // Store new fingerprint (web only, mobile uses Supabase's storage)
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(ENV_FINGERPRINT_KEY, JSON.stringify(current));
      }
    }
  } catch (e) {
    console.error('[EnvGuard] Error in enforceEnvConsistency:', e);
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




