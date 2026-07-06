"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHubWebUrl = resolveHubWebUrl;
exports.buildInvitationUrl = buildInvitationUrl;
exports.buildInvitationShareMessage = buildInvitationShareMessage;
exports.authUserExistsForEmail = authUserExistsForEmail;
exports.linkStaffMemberToClinicUser = linkStaffMemberToClinicUser;
const supabase_js_1 = require("../../config/supabase.js");
const permissions_js_1 = require("../../utils/permissions.js");
function resolveHubWebUrl() {
    const raw = process.env.HUB_WEB_URL?.trim() ||
        process.env.VITE_HUB_WEB_URL?.trim() ||
        process.env.FRONTEND_URL?.trim();
    return (raw || 'http://localhost:5173').replace(/\/$/, '');
}
function buildInvitationUrl(token) {
    return `${resolveHubWebUrl()}/accept-invitation?token=${encodeURIComponent(token)}`;
}
function buildInvitationShareMessage(opts) {
    const roleLabel = (0, permissions_js_1.getRoleDisplayName)(String(opts.role).toUpperCase());
    const greeting = opts.inviteeName?.trim() ? `Olá, ${opts.inviteeName.trim()}!` : 'Olá!';
    return [
        greeting,
        '',
        `Você foi convidado(a) para a equipe da clínica ${opts.clinicName} (unidade ${opts.unitName}) como ${roleLabel}.`,
        '',
        'Crie sua conta e acesse o PetMi Hub pelo link abaixo (válido por 7 dias):',
        opts.invitationUrl,
        '',
        'PetMi Hub',
    ].join('\n');
}
/** MVP: convite só para e-mails sem conta auth. */
async function authUserExistsForEmail(email) {
    const normalized = email.trim().toLowerCase();
    const { data: usersData } = await supabase_js_1.supabaseAdmin.auth.admin.listUsers();
    return Boolean(usersData?.users?.some((u) => u.email?.toLowerCase() === normalized));
}
async function linkStaffMemberToClinicUser(staffMemberId, clinicUserId) {
    if (!staffMemberId)
        return;
    const { error } = await supabase_js_1.supabaseAdmin
        .from('hub_staff_members')
        .update({ clinic_user_id: clinicUserId, updated_at: new Date().toISOString() })
        .eq('id', staffMemberId)
        .is('deleted_at', null);
    if (error) {
        console.error('[hub_invitations] link staff clinic_user_id', error);
        throw error;
    }
}
