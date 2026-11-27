"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadClinicUserMembership = loadClinicUserMembership;
exports.resolveReportUnitScope = resolveReportUnitScope;
const supabase_1 = require("../../config/supabase");
const permissions_1 = require("../../utils/permissions");
const hubTenantAsserts_1 = require("./hubTenantAsserts");
/** Carrega vínculo ativo do usuário na clínica (membership de unidade). */
async function loadClinicUserMembership(userId, clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('clinic_users')
        .select('role, operational_areas, unit_id, status')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .maybeSingle();
    if (error || !data)
        return null;
    return data;
}
/**
 * Resolve o escopo de unidade autorizado para um relatório.
 * - unit.view.all nunca ultrapassa clinicId autenticado.
 * - Sem unit.view.all, omissão de unit_id não amplia (força unidade do vínculo ou 403).
 * - Consolidação (unitId null) só com unit.view.all e unitMode clinic_aggregate_if_allowed.
 */
async function resolveReportUnitScope(opts) {
    const membership = opts.membership !== undefined
        ? opts.membership
        : await loadClinicUserMembership(opts.userId, opts.clinicId);
    if (!membership) {
        return { ok: false, status: 403, error: 'Sem vínculo ativo nesta clínica' };
    }
    const operationalAreas = membership.operational_areas ?? [];
    const canViewAllUnits = (0, permissions_1.hasEffectivePermission)(membership.role, 'unit.view.all', operationalAreas);
    const membershipUnitId = membership.unit_id ? String(membership.unit_id) : null;
    const raw = opts.requestedUnitId != null && String(opts.requestedUnitId).trim()
        ? String(opts.requestedUnitId).trim()
        : null;
    if (opts.unitMode === 'none') {
        if (raw) {
            const inClinic = await (0, hubTenantAsserts_1.assertUnitInClinic)(opts.clinicId, raw);
            if (!inClinic)
                return { ok: false, status: 403, error: 'Unidade fora da clínica autenticada' };
        }
        return {
            ok: true,
            unitId: null,
            canViewAllUnits,
            membershipUnitId,
            role: membership.role,
            operationalAreas,
        };
    }
    if (raw) {
        const inClinic = await (0, hubTenantAsserts_1.assertUnitInClinic)(opts.clinicId, raw);
        if (!inClinic) {
            return { ok: false, status: 403, error: 'Unidade fora da clínica autenticada' };
        }
        if (!canViewAllUnits) {
            if (!membershipUnitId) {
                return { ok: false, status: 403, error: 'Usuário sem unidade vinculada' };
            }
            if (raw !== membershipUnitId) {
                return { ok: false, status: 403, error: 'Sem permissão para esta unidade' };
            }
        }
        return {
            ok: true,
            unitId: raw,
            canViewAllUnits,
            membershipUnitId,
            role: membership.role,
            operationalAreas,
        };
    }
    // unit_id omitido
    if (opts.unitMode === 'required') {
        if (!canViewAllUnits) {
            if (!membershipUnitId) {
                return { ok: false, status: 400, error: 'unit_id é obrigatório' };
            }
            return {
                ok: true,
                unitId: membershipUnitId,
                canViewAllUnits,
                membershipUnitId,
                role: membership.role,
                operationalAreas,
            };
        }
        return { ok: false, status: 400, error: 'unit_id é obrigatório' };
    }
    if (opts.unitMode === 'optional_single') {
        if (!canViewAllUnits) {
            if (!membershipUnitId) {
                return { ok: false, status: 403, error: 'Usuário sem unidade vinculada' };
            }
            return {
                ok: true,
                unitId: membershipUnitId,
                canViewAllUnits,
                membershipUnitId,
                role: membership.role,
                operationalAreas,
            };
        }
        // Com view.all e sem unit_id: consolidação do próprio escopo self (todas as unidades do staff) —
        // permitido apenas como unitId null para filtros self.
        return {
            ok: true,
            unitId: null,
            canViewAllUnits,
            membershipUnitId,
            role: membership.role,
            operationalAreas,
        };
    }
    // clinic_aggregate_if_allowed
    if (!canViewAllUnits) {
        if (!membershipUnitId) {
            return { ok: false, status: 403, error: 'Usuário sem unidade vinculada' };
        }
        return {
            ok: true,
            unitId: membershipUnitId,
            canViewAllUnits,
            membershipUnitId,
            role: membership.role,
            operationalAreas,
        };
    }
    return {
        ok: true,
        unitId: null,
        canViewAllUnits,
        membershipUnitId,
        role: membership.role,
        operationalAreas,
    };
}
