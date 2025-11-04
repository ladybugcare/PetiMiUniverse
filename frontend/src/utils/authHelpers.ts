// Tipos de role que o PetiVet usa hoje
export type Role = 'ADMIN' | 'CADMIN' | 'CMANAGER' | 'VET' | 'UNKNOWN';

export function getUserRole(user: any): Role {
  if (!user) return 'UNKNOWN';

  const rawRole =
    user.user_metadata?.role ||
    user.role ||
    user.user_metadata?.Role ||
    user.Role;

  if (!rawRole) return 'UNKNOWN';

  const role = String(rawRole).toUpperCase();

  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'CADMIN') return 'CADMIN';
  if (role === 'CMANAGER') return 'CMANAGER';
  if (role === 'VET') return 'VET';

  return 'UNKNOWN';
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
    default:
      // Conta sem role conhecida → leva para home/painel genérico
      return '/';
  }
}
