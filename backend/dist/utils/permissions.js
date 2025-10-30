"use strict";
// Permission system for role-based access control (RBAC)
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoleDisplayName = exports.hasPermission = exports.PERMISSIONS = void 0;
exports.PERMISSIONS = {
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
const hasPermission = (role, permission) => {
    const rolePermissions = exports.PERMISSIONS[role];
    return rolePermissions ? rolePermissions.includes(permission) : false;
};
exports.hasPermission = hasPermission;
const getRoleDisplayName = (role) => {
    const names = {
        CADMIN: 'Administrador da Clínica',
        CMANAGER: 'Gestor de Unidade',
        CASSISTANT: 'Assistente/Secretário',
        CVET_INTERNAL: 'Veterinário Interno',
    };
    return names[role] || role;
};
exports.getRoleDisplayName = getRoleDisplayName;
