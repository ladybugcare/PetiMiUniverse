"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveClinicUserByEmailInClinic = resolveClinicUserByEmailInClinic;
exports.findConflictingStaffForClinicUser = findConflictingStaffForClinicUser;
exports.syncOperationalAreasToClinicUser = syncOperationalAreasToClinicUser;
exports.syncStaffHubAccessLink = syncStaffHubAccessLink;
const supabase_js_1 = require("../../config/supabase.js");
const hubInvitationUtils_js_1 = require("./hubInvitationUtils.js");
const operationalAreas_js_1 = require("../../utils/operationalAreas.js");
/** Resolve `clinic_users` ativo na clínica pelo e-mail de login (auth). */
async function resolveClinicUserByEmailInClinic(clinicId, email) {
    const normalized = email.trim().toLowerCase();
    if (!normalized)
        return null;
    const { data: usersData } = await supabase_js_1.supabaseAdmin.auth.admin.listUsers();
    const authUser = usersData?.users?.find((u) => u.email?.toLowerCase() === normalized);
    if (!authUser?.id)
        return null;
    const { data: cu, error } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .select('id, role, user_id, status')
        .eq('clinic_id', clinicId)
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .maybeSingle();
    if (error || !cu?.id)
        return null;
    return { id: cu.id, role: String(cu.role || ''), user_id: cu.user_id };
}
/** Outro profissional da mesma clínica já vinculado a este `clinic_user_id`. */
async function findConflictingStaffForClinicUser(clinicId, clinicUserId, excludeStaffId) {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('hub_staff_members')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('clinic_user_id', clinicUserId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data?.id)
        return null;
    const id = data.id;
    if (excludeStaffId && id === excludeStaffId)
        return null;
    return id;
}
/** Copia `operational_areas` do profissional para a linha `clinic_users` vinculada. */
async function syncOperationalAreasToClinicUser(clinicUserId, operationalAreas) {
    const areas = (0, operationalAreas_js_1.sanitizeOperationalAreas)(operationalAreas ?? []);
    const now = new Date().toISOString();
    const { error } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .update({ operational_areas: areas, updated_at: now })
        .eq('id', clinicUserId);
    if (error)
        throw error;
}
/**
 * Vincula (ou desvincula) o profissional ao login da clínica quando o e-mail de acesso
 * corresponde a um `clinic_users` ativo. Sincroniza `hub_access_role` e `operational_areas`.
 */
async function syncStaffHubAccessLink(state) {
    const { staffId, clinicId, hasHubAccess, hubAccessEmail, hubAccessRole, operationalAreas } = state;
    const now = new Date().toISOString();
    const sanitizedAreas = (0, operationalAreas_js_1.sanitizeOperationalAreas)(operationalAreas ?? []);
    if (!hasHubAccess || !hubAccessEmail?.trim()) {
        await supabase_js_1.supabaseAdmin
            .from('hub_staff_members')
            .update({ clinic_user_id: null, updated_at: now })
            .eq('id', staffId)
            .eq('clinic_id', clinicId);
        return { clinic_user_id: null, linked: false, role_synced: false, areas_synced: false };
    }
    const clinicUser = await resolveClinicUserByEmailInClinic(clinicId, hubAccessEmail);
    if (!clinicUser) {
        await supabase_js_1.supabaseAdmin
            .from('hub_staff_members')
            .update({ clinic_user_id: null, updated_at: now })
            .eq('id', staffId)
            .eq('clinic_id', clinicId);
        return {
            clinic_user_id: null,
            linked: false,
            role_synced: false,
            areas_synced: false,
            message: 'Nenhuma conta ativa com este e-mail nesta clínica. Use «Enviar convite» para criar o acesso ou corrija o e-mail.',
        };
    }
    const conflictId = await findConflictingStaffForClinicUser(clinicId, clinicUser.id, staffId);
    if (conflictId) {
        throw new Error('Este login já está vinculado a outro profissional da equipe.');
    }
    let roleSynced = false;
    let areasSynced = false;
    const targetRole = hubAccessRole?.trim().toUpperCase();
    const patch = { updated_at: now };
    if (targetRole && targetRole !== String(clinicUser.role || '').toUpperCase()) {
        patch.role = targetRole;
        roleSynced = true;
    }
    patch.operational_areas = sanitizedAreas;
    areasSynced = true;
    if (roleSynced || areasSynced) {
        const { error: patchErr } = await supabase_js_1.supabaseAdmin
            .from('clinic_users')
            .update(patch)
            .eq('id', clinicUser.id);
        if (patchErr)
            throw patchErr;
    }
    await (0, hubInvitationUtils_js_1.linkStaffMemberToClinicUser)(staffId, clinicUser.id);
    const messages = [];
    if (roleSynced) {
        messages.push('perfil de permissão atualizado');
    }
    if (areasSynced) {
        messages.push('áreas operacionais sincronizadas');
    }
    return {
        clinic_user_id: clinicUser.id,
        linked: true,
        role_synced: roleSynced,
        areas_synced: areasSynced,
        message: messages.length > 0
            ? `Conta vinculada (${messages.join(', ')}). O usuário deve entrar novamente para aplicar as permissões.`
            : 'Conta vinculada ao profissional.',
    };
}
