"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHubWebUrl = exports.buildInvitationShareMessage = exports.buildInvitationUrl = exports.signupFromHubInvitation = exports.checkHubInviteEmail = exports.previewHubInvitation = void 0;
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
        blocked: accountExists,
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
            available: false,
            reason: 'Este e-mail já possui conta. No MVP, use um e-mail novo para convites.',
        });
    }
    const { data: pending } = await supabase_js_1.supabaseAdmin
        .from('user_invitations')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('clinic_id', clinic_id)
        .eq('status', 'pending')
        .limit(1);
    if (pending?.length) {
        return res.json({
            available: false,
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
            error: 'Este e-mail já possui conta. No MVP, o convite é apenas para novos usuários.',
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
    try {
        const { data: clinicUser, error: cuError } = await supabase_js_1.supabaseAdmin
            .from('clinic_users')
            .insert({
            id: crypto_1.default.randomUUID(),
            user_id: userId,
            clinic_id: invitation.clinic_id,
            unit_id: invitation.unit_id,
            role: invitation.role,
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
