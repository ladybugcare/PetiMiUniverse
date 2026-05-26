import type { AppRole, ClinicStaffRole } from '@petimi/web-core';

/** Rótulo curto em PT para o tipo de acesso no Hub (header). */
export function hubAccessTypeLabel(
  clinicRole: ClinicStaffRole | string | null | undefined,
  authRole: AppRole,
): string {
  const r = String(clinicRole || authRole || 'UNKNOWN').toUpperCase() as AppRole | ClinicStaffRole;

  switch (r) {
    case 'CADMIN':
      return 'Administrador';
    case 'CMANAGER':
      return 'Gestor';
    case 'CASSISTANT':
      return 'Assistente';
    case 'CVET_INTERNAL':
      return 'Veterinário interno';
    case 'ADMIN':
      return 'Administrador PetMi';
    case 'VET':
      return 'Veterinário';
    case 'FREELANCER':
      return 'Profissional autônomo';
    case 'UNKNOWN':
    default:
      return 'Usuário';
  }
}

/** Badge na página Meu Perfil (ex.: «Administrador local»). */
export function hubProfileAccessBadge(
  clinicRole: ClinicStaffRole | string | null | undefined,
  authRole: AppRole,
): string {
  const r = String(clinicRole || authRole || 'UNKNOWN').toUpperCase() as AppRole | ClinicStaffRole;
  switch (r) {
    case 'CADMIN':
      return 'Administrador local';
    case 'CMANAGER':
      return 'Gestor local';
    case 'CASSISTANT':
      return 'Assistente';
    case 'CVET_INTERNAL':
      return 'Veterinário interno';
    case 'ADMIN':
      return 'Administrador PetMi';
    case 'VET':
      return 'Veterinário';
    case 'FREELANCER':
      return 'Profissional autônomo';
    case 'UNKNOWN':
    default:
      return 'Usuário';
  }
}
