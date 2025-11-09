/**
 * Helper functions for safe localStorage operations
 */

/**
 * Safely parse JSON from localStorage
 * Returns null if the key doesn't exist or if parsing fails
 */
export const safeParseJSON = <T = any>(key: string): T | null => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    
    // Check if string is empty or just whitespace
    if (item.trim() === '') return null;
    
    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Failed to parse ${key} from localStorage:`, error);
    return null;
  }
};

/**
 * Safely get user from localStorage
 */
export const getUserFromStorage = () => {
  return safeParseJSON<any>('user');
};

/**
 * Safely get session from localStorage
 */
export const getSessionFromStorage = () => {
  return safeParseJSON<any>('session');
};

/**
 * Safely get clinic_user from localStorage
 */
export const getClinicUserFromStorage = () => {
  return safeParseJSON<any>('clinic_user');
};

