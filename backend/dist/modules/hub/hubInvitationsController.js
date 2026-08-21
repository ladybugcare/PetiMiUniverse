"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHubWebUrl = exports.buildInvitationShareMessage = exports.buildInvitationUrl = exports.acceptHubInvitation = exports.signupFromHubInvitation = exports.checkHubInviteEmail = exports.previewHubInvitation = void 0;
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = require("zod");
const supabase_js_1 = require("../../config/supabase.js");
const authMiddleware_js_1 = require("../../middleware/authMiddleware.js");
const errorHandler_js_1 = require("../../middleware/errorHandler.js");
const auditLog_js_1 = require("../../utils/auditLog.js");
const errors_js_1 = require("../../utils/errors.js");
const permissions_js_1 = require("../../utils/permissions.js");
const hubInvitationUtils_js_1 = require("./hubInvitationUtils.js");
Object.defineProperty(exports, "buildInvitationShareMessage", { enumerable: true, get: function () { return hubInvitationUtils_js_1.buildInvitationShareMessage; } });
Object.defineProperty(exports, "buildInvitationUrl", { enumerable: true, get: function () { return hubInvitationUtils_js_1.buildInvitationUrl; } });
Object.defineProperty(exports, "resolveHubWebUrl", { enumerable: true, get: function () { return hubInvitationUtils_js_1.resolveHubWebUrl; } });
const operationalAreas_js_1 = require("../../utils/operationalAreas.js");
const uuidStr = zod_1.z.string().uuid();
function resolveHubWebUrlForSignup() {
    const raw = process.env.HUB_WEB_URL?.trim() ||
        process.env.VITE_HUB_WEB_URL?.trim() ||
        process.env.FRONTEND_URL?.trim();
    if (!raw) {
        throw new errors_js_1.ValidationError('HUB_WEB_URL não configurada no servidor');
    }
    return raw.replace(/\/$/, '');
}
async function loadPendingInvitation(token) {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('user_invitations')
        .select('*')
        .eq('token', token)
        .eq('status', 'pending')
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        return null;
    if (new Date(data.expires_at) < new Date()) {
        await supabase_js_1.supabaseAdmin.from('user_invitations').update({ status: 'expired' }).eq('token', token);
        return null;
    }
    return data;
}
/** GET /api/hub/invitations/preview?token= */
exports.previewHubInvitation = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token)
        return res.status(400).json({ error: 'Token inválido' });
    const invitation = await loadPendingInvitation(token);
    if (!invitation)
        return res.status(404).json({ error: 'Convite inválido ou expirado' });
    const email = String(invitation.email || '').trim();
    const accountExists = await (0, hubInvitationUtils_js_1.authUserExistsForEmail)(email);
    const [{ data: clinic }, { data: unit }] = await Promise.all([
        supabase_js_1.supabaseAdmin.from('clinics').select('id, name').eq('id', invitation.clinic_id).maybeSingle(),
        supabase_js_1.supabaseAdmin.from('units').select('id, name').eq('id', invitation.unit_id).maybeSingle(),
    ]);
    return res.json({
        invitation: {
            email,
            role: invitation.role,
            expires_at: invitation.expires_at,
            clinic_id: invitation.clinic_id,
            unit_id: invitation.unit_id,
        },
        clinic_name: clinic?.name ?? null,
        unit_name: unit?.name ?? null,
        role_label: (0, permissions_js_1.getRoleDisplayName)(String(invitation.role).toUpperCase()),
        account_exists: accountExists,
        /** Conta existente não bloqueia — o usuário faz login e aceita o convite. */
        blocked: false,
        invitation_url: (0, hubInvitationUtils_js_1.buildInvitationUrl)(token),
    });
});
/** GET /api/hub/invitations/check-email?email=&clinic_id= */
exports.checkHubInviteEmail = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!email || !clinicParsed.success) {
        return res.status(400).json({ error: 'email e clinic_id são obrigatórios' });
    }
    const userId = req.user.id;
    const clinic_id = clinicParsed.data;
    const canStaff = await (0, authMiddleware_js_1.checkPermission)(userId, clinic_id, 'hub.staff.invite');
    const canUserInvite = await (0, authMiddleware_js_1.checkPermission)(userId, clinic_id, 'user.invite');
    if (!canStaff || !canUserInvite) {
        return res.status(403).json({ error: 'Sem permissão' });
    }
    const accountExists = await (0, hubInvitationUtils_js_1.authUserExistsForEmail)(email);
    if (accountExists) {
        return res.json({
            available: true,
            account_exists: true,
            reason: 'Este e-mail já possui conta. O convidado deve entrar e aceitar o convite pelo link.',
        });
    }
    const nowIso = new Date().toISOString();
    await supabase_js_1.supabaseAdmin
        .from('user_invitations')
        .update({ status: 'expired' })
        .eq('clinic_id', clinic_id)
        .ilike('email', email)
        .eq('status', 'pending')
        .lt('expires_at', nowIso);
    const { data: pending } = await supabase_js_1.supabaseAdmin
        .from('user_invitations')
        .select('id')
        .ilike('email', email)
        .eq('clinic_id', clinic_id)
        .eq('status', 'pending')
        .gte('expires_at', nowIso)
        .limit(1);
    if (pending?.length) {
        return res.json({
            available: true,
            has_pending: true,
            reason: 'Já existe um convite pendente para este e-mail nesta clínica.',
        });
    }
    return res.json({ available: true });
});
const signupFromInviteSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(1),
    full_name: zod_1.z.string().trim().min(2).max(200),
    password: zod_1.z.string().min(8).max(128),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
});
/** POST /api/hub/invitations/signup — cria conta e aceita convite (MVP: só e-mail sem conta). */
exports.signupFromHubInvitation = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const parsed = signupFromInviteSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { token, full_name, password, phone } = parsed.data;
    const invitation = await loadPendingInvitation(token);
    if (!invitation) {
        return res.status(404).json({ error: 'Convite inválido ou expirado' });
    }
    const email = String(invitation.email || '').trim().toLowerCase();
    if (await (0, hubInvitationUtils_js_1.authUserExistsForEmail)(email)) {
        return res.status(409).json({
            error: 'Este e-mail já possui conta. Faça login e aceite o convite pelo mesmo link (não é necessário criar outra conta).',
        });
    }
    const hubWebUrl = resolveHubWebUrlForSignup();
    const isLocalEnv = hubWebUrl.includes('localhost') || hubWebUrl.includes('127.0.0.1');
    const { data: authData, error: authError } = await supabase_js_1.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: isLocalEnv,
        user_metadata: {
            role: 'clinic',
            name: full_name,
            full_name,
            phone: phone?.trim() || null,
            hub_invited: true,
        },
    });
    if (authError || !authData?.user) {
        const msg = authError?.message || 'Erro ao criar usuário';
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
            return res.status(409).json({ error: 'Este e-mail já possui conta.' });
        }
        return res.status(400).json({ error: msg });
    }
    const userId = authData.user.id;
    const nowIso = new Date().toISOString();
    let operationalAreas = [];
    const staffMemberId = invitation.staff_member_id;
    if (staffMemberId) {
        const { data: staffRow } = await supabase_js_1.supabaseAdmin
            .from('hub_staff_members')
            .select('operational_areas')
            .eq('id', staffMemberId)
            .maybeSingle();
        operationalAreas = (0, operationalAreas_js_1.sanitizeOperationalAreas)(staffRow?.operational_areas);
    }
    try {
        const { data: clinicUser, error: cuError } = await supabase_js_1.supabaseAdmin
            .from('clinic_users')
            .insert({
            id: crypto_1.default.randomUUID(),
            user_id: userId,
            clinic_id: invitation.clinic_id,
            unit_id: invitation.unit_id,
            role: invitation.role,
            operational_areas: operationalAreas,
            status: 'active',
            invited_by: invitation.invited_by,
            invited_at: invitation.created_at,
            accepted_at: nowIso,
            first_login_completed_at: nowIso,
            onboarding_state: {
                source: 'hub_invitation',
                completed: true,
                completed_at: nowIso,
            },
            created_at: nowIso,
            updated_at: nowIso,
        })
            .select()
            .single();
        if (cuError || !clinicUser) {
            await supabase_js_1.supabaseAdmin.auth.admin.deleteUser(userId);
            return res.status(400).json({ error: cuError?.message || 'Erro ao vincular à clínica' });
        }
        await (0, hubInvitationUtils_js_1.linkStaffMemberToClinicUser)(invitation.staff_member_id, clinicUser.id);
        await supabase_js_1.supabaseAdmin.from('user_invitations').update({ status: 'accepted' }).eq('token', token);
        const metadata = (0, auditLog_js_1.extractRequestMetadata)(req);
        await (0, auditLog_js_1.createAuditLog)({
            user_id: userId,
            clinic_id: invitation.clinic_id,
            unit_id: invitation.unit_id,
            action: 'HUB_INVITATION_SIGNUP',
            entity_type: 'clinic_user',
            entity_id: clinicUser.id,
            new_values: { email, role: invitation.role, invitation_id: invitation.id },
            ...metadata,
        });
        return res.status(201).json({
            success: true,
            message: isLocalEnv
                ? 'Conta criada. Pode iniciar sessão.'
                : 'Conta criada. Confirme o e-mail para continuar.',
            user_id: userId,
            email_confirmed: isLocalEnv,
            clinic_user: clinicUser,
            role: invitation.role,
        });
    }
    catch (e) {
        await supabase_js_1.supabaseAdmin.auth.admin.deleteUser(userId);
        throw e;
    }
});
const acceptInviteSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(1),
});
async function resolveOperationalAreasForInvitation(staffMemberId) {
    if (!staffMemberId)
        return [];
    const { data: staffRow } = await supabase_js_1.supabaseAdmin
        .from('hub_staff_members')
        .select('operational_areas')
        .eq('id', staffMemberId)
        .maybeSingle();
    return (0, operationalAreas_js_1.sanitizeOperationalAreas)(staffRow?.operational_areas);
}
/** POST /api/hub/invitations/accept — aceita convite com conta já autenticada. */
exports.acceptHubInvitation = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const userId = req.user.id;
    const userEmail = String(req.user.email || '')
        .trim()
        .toLowerCase();
    if (!userEmail) {
        return res.status(400).json({ error: 'Sessão sem e-mail. Faça login novamente.' });
    }
    const invitation = await loadPendingInvitation(parsed.data.token);
    if (!invitation) {
        return res.status(404).json({ error: 'Convite inválido ou expirado' });
    }
    const inviteEmail = String(invitation.email || '')
        .trim()
        .toLowerCase();
    if (inviteEmail !== userEmail) {
        return res.status(403).json({
            error: 'Este convite é para outro e-mail. Entre com a conta convidada para aceitar.',
        });
    }
    const clinicId = invitation.clinic_id;
    const unitId = invitation.unit_id;
    const role = invitation.role;
    const nowIso = new Date().toISOString();
    const operationalAreas = await resolveOperationalAreasForInvitation(invitation.staff_member_id);
    const { data: memberships, error: memErr } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .select('id, clinic_id, unit_id, role, status, user_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
    if (memErr) {
        return res.status(500).json({ error: 'Erro ao verificar vínculos existentes' });
    }
    const rows = memberships || [];
    const sameClinic = rows.find((r) => r.clinic_id != null && String(r.clinic_id) === String(clinicId));
    const pendingOwner = rows.find((r) => (r.clinic_id == null || String(r.clinic_id).trim() === '') &&
        String(r.status || '').toLowerCase() === 'pending_clinic');
    const otherActive = rows.find((r) => r.clinic_id != null &&
        String(r.clinic_id).trim() !== '' &&
        String(r.clinic_id) !== String(clinicId) &&
        String(r.status || '').toLowerCase() !== 'pending_clinic');
    if (otherActive && !sameClinic) {
        return res.status(400).json({
            error: 'Esta conta já está vinculada a outra organização. Use outro e-mail ou peça suporte para transferir o acesso.',
        });
    }
    let clinicUser;
    if (sameClinic) {
        const { data: updated, error: updErr } = await supabase_js_1.supabaseAdmin
            .from('clinic_users')
            .update({
            unit_id: unitId,
            role,
            operational_areas: operationalAreas,
            status: 'active',
            accepted_at: nowIso,
            first_login_completed_at: nowIso,
            onboarding_state: {
                source: 'hub_invitation_accept',
                completed: true,
                completed_at: nowIso,
            },
            updated_at: nowIso,
        })
            .eq('id', sameClinic.id)
            .select()
            .single();
        if (updErr || !updated) {
            return res.status(400).json({ error: updErr?.message || 'Erro ao atualizar vínculo' });
        }
        clinicUser = updated;
    }
    else if (pendingOwner) {
        const { data: updated, error: updErr } = await supabase_js_1.supabaseAdmin
            .from('clinic_users')
            .update({
            clinic_id: clinicId,
            unit_id: unitId,
            role,
            operational_areas: operationalAreas,
            status: 'active',
            invited_by: invitation.invited_by,
            invited_at: invitation.created_at,
            accepted_at: nowIso,
            first_login_completed_at: nowIso,
            onboarding_state: {
                source: 'hub_invitation_accept',
                completed: true,
                completed_at: nowIso,
                converted_from: 'pending_clinic',
            },
            updated_at: nowIso,
        })
            .eq('id', pendingOwner.id)
            .select()
            .single();
        if (updErr || !updated) {
            return res.status(400).json({ error: updErr?.message || 'Erro ao vincular à clínica do convite' });
        }
        clinicUser = updated;
    }
    else {
        const { data: created, error: cuError } = await supabase_js_1.supabaseAdmin
            .from('clinic_users')
            .insert({
            id: crypto_1.default.randomUUID(),
            user_id: userId,
            clinic_id: clinicId,
            unit_id: unitId,
            role,
            operational_areas: operationalAreas,
            status: 'active',
            invited_by: invitation.invited_by,
            invited_at: invitation.created_at,
            accepted_at: nowIso,
            first_login_completed_at: nowIso,
            onboarding_state: {
                source: 'hub_invitation_accept',
                completed: true,
                completed_at: nowIso,
            },
            created_at: nowIso,
            updated_at: nowIso,
        })
            .select()
            .single();
        if (cuError || !created) {
            return res.status(400).json({ error: cuError?.message || 'Erro ao vincular à clínica' });
        }
        clinicUser = created;
    }
    await (0, hubInvitationUtils_js_1.linkStaffMemberToClinicUser)(invitation.staff_member_id, clinicUser.id);
    await supabase_js_1.supabaseAdmin.from('user_invitations').update({ status: 'accepted' }).eq('token', parsed.data.token);
    const metadata = (0, auditLog_js_1.extractRequestMetadata)(req);
    await (0, auditLog_js_1.createAuditLog)({
        user_id: userId,
        clinic_id: clinicId,
        unit_id: unitId,
        action: 'HUB_INVITATION_ACCEPT',
        entity_type: 'clinic_user',
        entity_id: clinicUser.id,
        new_values: { email: userEmail, role, invitation_id: invitation.id },
        ...metadata,
    });
    return res.json({
        success: true,
        message: 'Convite aceito. Você já está vinculado à clínica.',
        clinic_user: clinicUser,
        role,
    });
});
