"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUB_MANAGER_ROLES = void 0;
exports.resolveNotificationTargets = resolveNotificationTargets;
exports.hubNotifyStaff = hubNotifyStaff;
/**
 * Notificações operacionais internas do Hub direcionadas por área operacional / papel.
 *
 * Reusa a tabela `notifications` e o helper `createNotification` do sistema Vet:
 * aqui só resolvemos **quem** deve receber cada aviso, evitando broadcast para
 * toda a unidade.
 */
const supabase_1 = require("../../config/supabase");
const notificationsController_1 = require("../../controllers/notificationsController");
const operationalAreas_1 = require("../../utils/operationalAreas");
/** Papéis de governança que acompanham tudo que é crítico na unidade. */
exports.HUB_MANAGER_ROLES = ['CADMIN', 'CMANAGER'];
/**
 * Papéis que equivalem a áreas operacionais mesmo sem marcação na Equipe.
 * Ex.: CFINANCE recebe o que o financeiro e o caixa recebem.
 */
const ROLE_IMPLICIT_AREAS = {
    CFINANCE: ['financeiro', 'caixa'],
    CASSISTANT: ['recepcao'],
};
function normalizeRole(role) {
    return String(role ?? '').trim().toUpperCase();
}
/**
 * Resolve os `user_id` que devem receber o aviso (papel OU interseção de áreas),
 * já sem duplicados. Função pura para permitir teste sem banco.
 */
function resolveNotificationTargets(candidates, filter) {
    const wantedAreas = new Set(filter.areas ?? []);
    const wantedRoles = new Set((filter.roles ?? []).map(normalizeRole));
    const includeManagers = filter.includeManagers !== false;
    const excluded = new Set(filter.excludeUserIds ?? []);
    const out = [];
    const seen = new Set();
    for (const candidate of candidates) {
        const userId = String(candidate.user_id ?? '').trim();
        if (!userId || seen.has(userId) || excluded.has(userId))
            continue;
        const role = normalizeRole(candidate.role);
        const areas = new Set([
            ...(0, operationalAreas_1.sanitizeOperationalAreas)(candidate.operational_areas ?? []),
            ...(ROLE_IMPLICIT_AREAS[role] ?? []),
        ]);
        const byRole = wantedRoles.has(role);
        const byArea = [...wantedAreas].some((area) => areas.has(area));
        const byManager = includeManagers && exports.HUB_MANAGER_ROLES.includes(role);
        if (!byRole && !byArea && !byManager)
            continue;
        seen.add(userId);
        out.push(userId);
    }
    return out;
}
/** Carrega a equipe com acesso ao Hub (opcionalmente escopada à unidade do evento). */
async function fetchHubStaffCandidates(clinicId, unitId) {
    let staffQuery = supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('clinic_user_id')
        .eq('clinic_id', clinicId)
        .eq('has_hub_access', true)
        .eq('active', true)
        .not('clinic_user_id', 'is', null)
        .is('deleted_at', null);
    // Quem não tem unidade padrão atende a clínica toda — segue recebendo.
    if (unitId) {
        staffQuery = staffQuery.or(`default_unit_id.eq.${unitId},default_unit_id.is.null`);
    }
    const { data: staff, error: staffErr } = await staffQuery;
    if (staffErr)
        throw staffErr;
    const clinicUserIds = [
        ...new Set((staff ?? []).map((s) => s.clinic_user_id).filter(Boolean)),
    ];
    if (!clinicUserIds.length)
        return [];
    const { data: clinicUsers, error: cuErr } = await supabase_1.supabaseAdmin
        .from('clinic_users')
        .select('user_id, role, operational_areas')
        .in('id', clinicUserIds)
        .eq('status', 'active');
    if (cuErr)
        throw cuErr;
    return (clinicUsers ?? []);
}
/**
 * Notifica a equipe do Hub conforme área operacional / papel.
 * Nunca lança: falha de notificação não deve quebrar o fluxo de negócio.
 *
 * @returns quantidade de notificações criadas.
 */
async function hubNotifyStaff(opts) {
    try {
        if (!opts.clinicId)
            return 0;
        const candidates = await fetchHubStaffCandidates(opts.clinicId, opts.unitId);
        const targets = resolveNotificationTargets(candidates, {
            areas: opts.areas,
            roles: opts.roles,
            includeManagers: opts.includeManagers,
            excludeUserIds: opts.excludeUserIds,
        });
        if (!targets.length)
            return 0;
        await Promise.all(targets.map((userId) => (0, notificationsController_1.createNotification)({
            user_id: userId,
            type: opts.type,
            title: opts.title,
            message: opts.message,
            link: opts.link,
            entity_type: opts.entityType,
            entity_id: opts.entityId,
        })));
        return targets.length;
    }
    catch (e) {
        console.error('hubNotifyStaff', opts.type, e);
        return 0;
    }
}
