export { getSupabase } from './supabase';
export { authErrorMessage } from './authErrorMessage';
export type { AuthErrorContext, AuthLikeError } from './authErrorMessage';
export { apiRequest, login, getApiBaseUrl, invalidateApiRequestCache, type ApiRequestOptions } from './api';
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
export {
  AUTH_LOGOUT_STARTED_EVENT,
  beginAuthLogout,
  endAuthLogout,
  isAuthLogoutInProgress,
  getAuthLogoutGeneration,
  isAuthLogoutAbortError,
  createAuthLogoutAbortError,
} from './authLogoutGate';
export { usePermissions } from './usePermissions';
export { AuthProvider, useAuth } from './AuthContext';
export type { AuthContextType } from './AuthContext';
export {
  buildLoginHref,
  isAuthShellReturnPath,
  safeInternalReturnPath,
} from './loginReturnUrl';
export type { AppRole, ClinicStaffRole } from './types';
