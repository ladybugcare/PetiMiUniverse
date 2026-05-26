import { getUserRole, type AppRole } from '@petimi/web-core';

/** Roles that belong to Hub. Any other role is redirected out. */
export const HUB_VALID_ROLES: AppRole[] = ['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL'];

/** Internal-path landing per role (all Hub-valid roles). */
function hubLandingForRole(role: AppRole): string {
  switch (role) {
    case 'CADMIN':
    case 'CMANAGER':
      return '/hub/dashboard';
    case 'CASSISTANT':
      return '/hub/appointments';
    case 'CVET_INTERNAL':
      return '/hub/encounters';
    default:
      return '/hub/clientes';
  }
}

function staffRoleFromLoginPayload(data: unknown): string | null {
  const d = data as { clinicUser?: { role?: string } } | null;
  const r = d?.clinicUser?.role;
  return r ? String(r).toUpperCase() : null;
}

/**
 * Discriminated result so callers know whether to use React Router's navigate
 * (internal) or window.location (external). This is necessary because React
 * Router v6 does not handle absolute URLs — it appends them to the current
 * origin instead of performing a full navigation.
 */
export type PostLoginDestination =
  | { type: 'internal'; path: string }
  | { type: 'external'; url: string };

/**
 * Determines where to send the user after a successful Hub login.
 *
 * Priority:
 * 1. `clinicUser.role` from the login payload (most reliable — set by the server).
 * 2. `user.user_metadata.role` via getUserRole (fallback for owners who don't yet
 *    have a clinic_user row).
 *
 * Non-Hub roles are sent to Vet's /login page (not a dashboard — sessions are
 * per-origin and there is no cross-app token handoff by design).
 */
export function getHubPostLoginDestination(
  data: unknown,
  vetWebUrl: string | undefined,
): PostLoginDestination {
  // 1. Authoritative: server-resolved clinic_user role
  const staffRole = staffRoleFromLoginPayload(data);
  if (staffRole && (HUB_VALID_ROLES as string[]).includes(staffRole)) {
    return { type: 'internal', path: hubLandingForRole(staffRole as AppRole) };
  }

  // 2. Fallback: user metadata role
  const d = data as { user?: unknown } | null;
  const role = getUserRole(d?.user);
  if (HUB_VALID_ROLES.includes(role)) {
    return { type: 'internal', path: hubLandingForRole(role) };
  }

  // Non-Hub role — redirect to Vet login (re-login per app is the design).
  const base = (vetWebUrl || '').replace(/\/$/, '');
  if (base) {
    return { type: 'external', url: `${base}/login` };
  }

  // No Vet URL configured — stay on Hub login with no session to avoid a blank screen.
  return { type: 'internal', path: '/login' };
}
