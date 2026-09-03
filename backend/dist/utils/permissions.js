"use strict";
// Permission system for role-based access control (RBAC)
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoleDisplayName = exports.hasPermission = exports.isClinicAdminRole = exports.PERMISSIONS = void 0;
exports.mergePermissionsForRoleAndAreas = mergePermissionsForRoleAndAreas;
exports.hasEffectivePermission = hasEffectivePermission;
const operationalAreas_1 = require("./operationalAreas");
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
        'hub.reports.read',
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
        'hub.reports.read',
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
        'hub.reports.read',
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
        'hub.reports.read',
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
        'hub.reports.read',
        'hub.receivables.create',
        'hub.cash.session',
        'hub.cash.receive',
    ],
    /** Base mínima — módulos vêm das áreas operacionais. */
    CSTAFF: ['unit.view'],
};
/** CADMIN tem acesso irrestrito a todas as permissões do Hub e da clínica. */
const isClinicAdminRole = (role) => String(role || '').toUpperCase() === 'CADMIN';
exports.isClinicAdminRole = isClinicAdminRole;
const hasPermission = (role, permission) => {
    if ((0, exports.isClinicAdminRole)(role))
        return true;
    const rolePermissions = exports.PERMISSIONS[role];
    return rolePermissions ? rolePermissions.includes(permission) : false;
};
exports.hasPermission = hasPermission;
/** União das permissões do papel de governança com as das áreas operacionais marcadas. */
function mergePermissionsForRoleAndAreas(role, operationalAreas) {
    const base = exports.PERMISSIONS[role] ?? [];
    const fromAreas = (0, operationalAreas_1.permissionsFromOperationalAreas)((0, operationalAreas_1.sanitizeOperationalAreas)(operationalAreas ?? []));
    return [...new Set([...base, ...fromAreas])];
}
/** Verifica permissão considerando papel + áreas operacionais do usuário. */
function hasEffectivePermission(role, permission, operationalAreas) {
    // CADMIN tem acesso irrestrito.
    if (role && (0, exports.isClinicAdminRole)(String(role).toUpperCase()))
        return true;
    // Verifica pelo role + áreas operacionais juntos.
    // Não fazer early-return para role null/unknown: as áreas operacionais
    // podem conceder a permissão mesmo sem um papel base definido.
    const r = role ? String(role).toUpperCase() : '';
    const fromRole = exports.PERMISSIONS[r] ?? [];
    const fromAreas = (0, operationalAreas_1.permissionsFromOperationalAreas)((0, operationalAreas_1.sanitizeOperationalAreas)(operationalAreas ?? []));
    return fromRole.includes(permission) || fromAreas.includes(permission);
}
;
const getRoleDisplayName = (role) => {
    const names = {
        CADMIN: 'Administrador da Clínica',
        CMANAGER: 'Gerente',
        CASSISTANT: 'Recepção',
        CVET_INTERNAL: 'Veterinário Interno (legado)',
        CGROOMER: 'Banho e Tosa (legado)',
        CFINANCE: 'Financeiro',
        CSTAFF: 'Funcionário',
    };
    return names[role] || role;
};
exports.getRoleDisplayName = getRoleDisplayName;
