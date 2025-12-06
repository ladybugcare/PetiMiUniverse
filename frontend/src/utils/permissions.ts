import { Role } from '../types/units';
import { colors } from '../styles/colors';

// Permission system for role-based access control (RBAC)
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
  ],
  CASSISTANT: [
    'unit.view',
    'user.view',
    'demand.create',
    'demand.view',
    'application.view',
    'marketplace.view',
  ],
  CVET_INTERNAL: [
    'unit.view',
    'demand.view',
    'application.create.internal',
    'application.view.own',
  ],
};

export const hasPermission = (role: Role | null, permission: string): boolean => {
  if (!role) return false;
  const rolePermissions = PERMISSIONS[role];
  return rolePermissions ? rolePermissions.includes(permission) : false;
};

export const getRoleDisplayName = (role: Role): string => {
  const names: Record<Role, string> = {
    CADMIN: 'Administrador da Clínica',
    CMANAGER: 'Gestor de Unidade',
    CASSISTANT: 'Assistente/Secretário',
    CVET_INTERNAL: 'Veterinário Interno',
  };
  return names[role] || role;
};

export const getRoleColor = (role: Role): string => {
  const roleColors: Record<Role, string> = {
    CADMIN: colors.brand.primary[500],
    CMANAGER: colors.info[500],
    CASSISTANT: colors.success[500],
    CVET_INTERNAL: colors.warning[500],
  };
  return roleColors[role] || colors.neutral[600];
};

