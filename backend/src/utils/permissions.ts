// Permission system for role-based access control (RBAC)

import {
  permissionsFromOperationalAreas,
  sanitizeOperationalAreas,
} from './operationalAreas';

export type Role = 'CADMIN' | 'CMANAGER' | 'CASSISTANT' | 'CVET_INTERNAL' | 'CGROOMER' | 'CFINANCE';

export const PERMISSIONS: Record<Role, string[]> = {
  CADMIN: [
    'unit.create',
    'unit.edit',
    'unit.delete',
    'unit.view.all',
    'user.invite',
    'user.edit',
    'user.delete',
    'user.view.all',
    'demand.create',
    'demand.edit',
    'demand.delete',
    'demand.view.all',
    'application.approve',
    'application.reject',
    'application.view.all',
    'marketplace.create',
    'marketplace.edit',
    'marketplace.delete',
    'audit.view',
    'hub.guardians.read',
    'hub.guardians.write',
    'hub.pets.read',
    'hub.pets.write',
    'hub.service_types.read',
    'hub.service_types.write',
    'hub.inventory.read',
    'hub.inventory.write',
    'hub.staff.read',
    'hub.staff.write',
    'hub.staff.invite',
    'hub.appointments.read',
    'hub.appointments.write',
    'hub.prospects.read',
    'hub.prospects.write',
    'hub.quotes.read',
    'hub.quotes.write',
    'hub.clinic.read',
    'hub.clinic.write',
    'grooming.queue.read',
    'grooming.queue.manage',
    'boarding.reservations.read',
    'boarding.reservations.manage',
    'boarding.daily_report.write',
    'pickup.routes.read',
    'pickup.routes.manage',
    'pickup.stops.update',
    'hub.financial.read',
    'hub.financial.write',
    'hub.receivables.create',
    'hub.cash.session',
    'hub.cash.receive',
  ],
  CMANAGER: [
    'unit.edit',
    'unit.view',
    'user.invite',
    'user.view',
    'demand.create',
    'demand.edit',
    'demand.delete',
    'demand.view',
    'application.approve',
    'application.reject',
    'application.view',
    'marketplace.create',
    'marketplace.edit',
    'hub.guardians.read',
    'hub.guardians.write',
    'hub.pets.read',
    'hub.pets.write',
    'hub.service_types.read',
    'hub.service_types.write',
    'hub.inventory.read',
    'hub.inventory.write',
    'hub.staff.read',
    'hub.staff.write',
    'hub.staff.invite',
    'hub.appointments.read',
    'hub.appointments.write',
    'hub.prospects.read',
    'hub.prospects.write',
    'hub.quotes.read',
    'hub.quotes.write',
    'hub.clinic.read',
    'hub.clinic.write',
    'grooming.queue.read',
    'grooming.queue.manage',
    'boarding.reservations.read',
    'boarding.reservations.manage',
    'boarding.daily_report.write',
    'pickup.routes.read',
    'pickup.routes.manage',
    'pickup.stops.update',
    'hub.financial.read',
    'hub.financial.write',
    'hub.receivables.create',
    'hub.cash.session',
    'hub.cash.receive',
  ],
  CASSISTANT: [
    'unit.view',
    'user.view',
    'demand.create',
    'demand.view',
    'application.view',
    'marketplace.view',
    'hub.guardians.read',
    'hub.pets.read',
    'hub.service_types.read',
    'hub.inventory.read',
    'hub.staff.read',
    'hub.appointments.read',
    'hub.appointments.write',
    'hub.prospects.read',
    'hub.quotes.read',
    'grooming.queue.read',
    'boarding.reservations.read',
    'boarding.reservations.manage',
    'boarding.daily_report.write',
    'pickup.routes.read',
    'pickup.routes.manage',
    'pickup.stops.update',
    'hub.financial.read',
    'hub.cash.session',
    'hub.cash.receive',
    'hub.receivables.create',
  ],
  CVET_INTERNAL: [
    'unit.view',
    'demand.view',
    'application.create.internal',
    'application.view.own',
    'hub.inventory.read',
    'hub.staff.read',
    'hub.appointments.read',
    'hub.clinic.read',
    'hub.clinic.write',
    'hub.financial.read',
  ],
  CGROOMER: [
    'unit.view',
    'hub.guardians.read',
    'hub.pets.read',
    'hub.service_types.read',
    'hub.appointments.read',
    'grooming.queue.read',
    'grooming.queue.manage',
    'boarding.reservations.read',
    'boarding.reservations.manage',
    'boarding.daily_report.write',
  ],
  CFINANCE: [
    'unit.view',
    'hub.guardians.read',
    'hub.pets.read',
    'hub.service_types.read',
    'hub.inventory.read',
    'hub.inventory.write',
    'hub.appointments.read',
    'grooming.queue.read',
    'boarding.reservations.read',
    'pickup.routes.read',
    'hub.financial.read',
    'hub.financial.write',
    'hub.receivables.create',
    'hub.cash.session',
    'hub.cash.receive',
  ],
};

/** CADMIN tem acesso irrestrito a todas as permissões do Hub e da clínica. */
export const isClinicAdminRole = (role: string | null | undefined): boolean =>
  String(role || '').toUpperCase() === 'CADMIN';

export const hasPermission = (role: Role, permission: string): boolean => {
  if (isClinicAdminRole(role)) return true;
  const rolePermissions = PERMISSIONS[role];
  return rolePermissions ? rolePermissions.includes(permission) : false;
};

/** União das permissões do papel de governança com as das áreas operacionais marcadas. */
export function mergePermissionsForRoleAndAreas(
  role: Role,
  operationalAreas?: readonly string[] | null,
): string[] {
  const base = PERMISSIONS[role] ?? [];
  const fromAreas = permissionsFromOperationalAreas(sanitizeOperationalAreas(operationalAreas ?? []));
  return [...new Set([...base, ...fromAreas])];
}

/** Verifica permissão considerando papel + áreas operacionais do usuário. */
export function hasEffectivePermission(
  role: Role | string | null | undefined,
  permission: string,
  operationalAreas?: readonly string[] | null,
): boolean {
  // CADMIN tem acesso irrestrito.
  if (role && isClinicAdminRole(String(role).toUpperCase())) return true;

  // Verifica pelo role + áreas operacionais juntos.
  // Não fazer early-return para role null/unknown: as áreas operacionais
  // podem conceder a permissão mesmo sem um papel base definido.
  const r = role ? (String(role).toUpperCase() as Role) : ('' as Role);
  const fromRole = PERMISSIONS[r] ?? [];
  const fromAreas = permissionsFromOperationalAreas(sanitizeOperationalAreas(operationalAreas ?? []));
  return fromRole.includes(permission) || fromAreas.includes(permission);
};

export const getRoleDisplayName = (role: Role): string => {
  const names: Record<Role, string> = {
    CADMIN: 'Administrador da Clínica',
    CMANAGER: 'Gestor de Unidade',
    CASSISTANT: 'Assistente/Secretário',
    CVET_INTERNAL: 'Veterinário Interno',
    CGROOMER: 'Banho e Tosa',
    CFINANCE: 'Financeiro',
  };
  return names[role] || role;
};

