import type { AppRole } from './types';

export function getUserRole(user: unknown): AppRole {
  if (!user || typeof user !== 'object') {
    return 'UNKNOWN';
  }
  const u = user as Record<string, unknown>;
  const rawRole =
    (u.user_metadata as Record<string, unknown> | undefined)?.role ||
    (u.user_metadata as Record<string, unknown> | undefined)?.Role ||
    u.role ||
    u.Role ||
    (u.app_metadata as Record<string, unknown> | undefined)?.role ||
    (u.app_metadata as Record<string, unknown> | undefined)?.Role;

  if (!rawRole) {
    return 'UNKNOWN';
  }

  const role = String(rawRole).trim().toUpperCase();

  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'CADMIN' || role === 'CLINIC_ADMIN' || role === 'CLINICADMIN') return 'CADMIN';
  if (role === 'CMANAGER' || role === 'CLINIC_MANAGER' || role === 'CLINICMANAGER') return 'CMANAGER';
  if (role === 'CASSISTANT' || role === 'ASSISTANT' || role === 'SECRETARY') return 'CASSISTANT';
  if (role === 'CVET_INTERNAL' || role === 'VET_INTERNAL' || role === 'INTERNAL_VET') return 'CVET_INTERNAL';
  if (role === 'VET' || role === 'VETERINARIAN' || role === 'VETERINARIO') return 'VET';
  if (role === 'FREELANCER' || role === 'FREELA') return 'FREELANCER';
  if (role === 'CLINIC' || role === 'CLINICA') return 'CADMIN';

  return 'UNKNOWN';
}

export function getStoredClinicId(): string | null {
  try {
    const clinicUserRaw = localStorage.getItem('clinic_user');
    if (clinicUserRaw) {
      const cu = JSON.parse(clinicUserRaw);
      if (cu?.clinic_id) return cu.clinic_id as string;
    }
    const onboardingRaw = localStorage.getItem('clinicOnboarding');
    if (onboardingRaw) {
      const o = JSON.parse(onboardingRaw);
      if (o?.clinicId) return o.clinicId as string;
    }
    const userRaw = localStorage.getItem('user');
    if (userRaw) {
      const u = JSON.parse(userRaw);
      if (u?.user_metadata?.clinic_id) return u.user_metadata.clinic_id as string;
    }
    const sessionRaw = localStorage.getItem('session');
    if (sessionRaw) {
      const s = JSON.parse(sessionRaw);
      const fromSessionUser = s?.user?.user_metadata?.clinic_id;
      if (fromSessionUser) return String(fromSessionUser);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getDashboardPathForRole(role: AppRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin-dashboard';
    case 'CADMIN':
    case 'CMANAGER':
    case 'CASSISTANT':
    case 'CVET_INTERNAL':
      return '/clinic-dashboard';
    case 'VET':
      return '/vet-dashboard';
    case 'FREELANCER':
      return '/freelancer-dashboard';
    default:
      return '/';
  }
}
