"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeHubReport = authorizeHubReport;
exports.authorizeHubReportFromRequest = authorizeHubReportFromRequest;
const permissions_1 = require("../../utils/permissions");
const reportsContract_1 = require("./reportsContract");
const hubReportUnitScope_1 = require("./hubReportUnitScope");
const hubStaffResolve_1 = require("./hubStaffResolve");
function hasDomainPermission(role, areas, permissionsAny) {
    return permissionsAny.some((p) => (0, permissions_1.hasEffectivePermission)(role, p, areas));
}
/**
 * Autorização completa de um relatório por report_id.
 * Reutiliza hasEffectivePermission — não cria engine RBAC nova.
 */
async function authorizeHubReport(opts) {
    const report = (0, reportsContract_1.getHubReportDefinition)(opts.reportId);
    if (!report) {
        return { ok: false, status: 400, error: 'report_id inválido ou não reconhecido' };
    }
    if (opts.requireSchedule && !report.operations.schedule) {
        return { ok: false, status: 400, error: 'Relatório não permite agendamento por e-mail' };
    }
    if (opts.requireExportPdf && !report.operations.exportPdf) {
        return { ok: false, status: 400, error: 'Relatório não permite exportação PDF' };
    }
    const membership = await (0, hubReportUnitScope_1.loadClinicUserMembership)(opts.userId, opts.clinicId);
    if (!membership) {
        return { ok: false, status: 403, error: 'Sem vínculo ativo nesta clínica' };
    }
    const areas = membership.operational_areas ?? [];
    const hasPerm = (p) => (0, permissions_1.hasEffectivePermission)(membership.role, p, areas);
    if (!hasDomainPermission(membership.role, areas, report.permissionsAny)) {
        return { ok: false, status: 403, error: 'Permissão negada para este relatório' };
    }
    const clinicalAudience = (0, reportsContract_1.isClinicalReportsAudience)(hasPerm);
    if (clinicalAudience && !report.clinicalAudience) {
        return { ok: false, status: 403, error: 'Relatório indisponível para o seu perfil clínico' };
    }
    const unitMode = opts.unitModeOverride ?? report.unitMode;
    const unitScope = await (0, hubReportUnitScope_1.resolveReportUnitScope)({
        userId: opts.userId,
        clinicId: opts.clinicId,
        requestedUnitId: opts.requestedUnitId,
        unitMode,
        membership,
    });
    if (!unitScope.ok) {
        return { ok: false, status: unitScope.status, error: unitScope.error };
    }
    let staffId = null;
    if (report.scope === 'self') {
        staffId = await (0, hubStaffResolve_1.resolveStaffIdForUser)(opts.clinicId, opts.userId);
        if (!staffId) {
            return {
                ok: false,
                status: 403,
                error: 'Seu usuário não está vinculado a um profissional da equipe nesta clínica.',
            };
        }
    }
    const forceClinicalStock = !!report.clinicalStockScope && (0, reportsContract_1.usesClinicalStockScope)(hasPerm);
    return {
        ok: true,
        report,
        unitScope,
        staffId,
        forceClinicalStock,
        isClinicalAudience: clinicalAudience,
    };
}
/** Helper para handlers GET que já conhecem o report_id do contrato. */
async function authorizeHubReportFromRequest(opts) {
    if (!opts.userId) {
        return { ok: false, status: 403, error: 'Usuário não autenticado' };
    }
    return authorizeHubReport({
        userId: opts.userId,
        clinicId: opts.clinicId,
        reportId: opts.reportId,
        requestedUnitId: opts.requestedUnitId,
    });
}
