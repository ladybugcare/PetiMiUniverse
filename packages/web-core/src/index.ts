export { getSupabase } from './supabase';
export { apiRequest, login, getApiBaseUrl, invalidateApiRequestCache } from './api';
export { handleInvalidToken } from './tokenInvalid';
export { getUserRole, getStoredClinicId, getDashboardPathForRole } from './authHelpers';
export { PERMISSIONS, hasPermission, hasEffectivePermission, mergePermissionsForRoleAndAreas, isClinicAdminRole } from './permissions';
export {
  HUB_OPERATIONAL_AREAS,
  HUB_OPERATIONAL_AREA_LABELS,
  defaultOperationalAreasForJobTitle,
  sanitizeOperationalAreas,
  type HubOperationalArea,
} from './operationalAreas';
export { CLINIC_STORAGE_UPDATED_EVENT } from './constants/appEvents';
export { usePermissions } from './usePermissions';
export { AuthProvider, useAuth } from './AuthContext';
export type { AuthContextType } from './AuthContext';
export type { AppRole, ClinicStaffRole } from './types';
