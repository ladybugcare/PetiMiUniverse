// Tipos de role que o PetMi Vet usa hoje
export type Role = 'ADMIN' | 'CADMIN' | 'CMANAGER' | 'VET' | 'FREELANCER' | 'UNKNOWN';

export function getUserRole(user: any): Role {
  if (!user) {
    console.warn('[getUserRole] User is null or undefined');
    return 'UNKNOWN';
  }

  // Tentar múltiplos lugares onde a role pode estar armazenada
  const rawRole =
    user.user_metadata?.role ||
    user.user_metadata?.Role ||
    user.role ||
    user.Role ||
    user.app_metadata?.role ||
    user.app_metadata?.Role;

  if (!rawRole) {
    console.warn('[getUserRole] No role found in user object:', {
      hasUserMetadata: !!user.user_metadata,
      hasAppMetadata: !!user.app_metadata,
      userKeys: Object.keys(user || {}),
    });
    return 'UNKNOWN';
  }

  // Normalizar para uppercase e remover espaços
  const role = String(rawRole).trim().toUpperCase();

  // Mapear variações comuns de roles
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'CADMIN' || role === 'CLINIC_ADMIN' || role === 'CLINICADMIN') return 'CADMIN';
  if (role === 'CMANAGER' || role === 'CLINIC_MANAGER' || role === 'CLINICMANAGER') return 'CMANAGER';
  if (role === 'VET' || role === 'VETERINARIAN' || role === 'VETERINARIO') return 'VET';
  if (role === 'FREELANCER' || role === 'FREELA') return 'FREELANCER';
  if (role === 'CLINIC' || role === 'CLINICA') {
    // Clinic pode ser CADMIN ou CMANAGER, mas por padrão retornamos CADMIN
    console.log('[getUserRole] Role "clinic" detected, defaulting to CADMIN');
    return 'CADMIN';
  }

  console.warn('[getUserRole] Unknown role detected:', role, 'from user:', user.id);
  return 'UNKNOWN';
}

/**
 * ID da clínica persistido após login (`clinic_user`) ou no payload de onboarding (`clinicOnboarding`).
 * Nunca use o UUID do Auth (`user.id`) como ID de clínica.
 */
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

export function getDashboardPathForRole(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/admin-dashboard';
    case 'CADMIN':
    case 'CMANAGER':
      return '/clinic-dashboard';
    case 'VET':
      return '/vet-dashboard';
    case 'FREELANCER':
      return '/freelancer-dashboard';
    default:
      // Conta sem role conhecida → leva para home/painel genérico
      return '/';
  }
}
