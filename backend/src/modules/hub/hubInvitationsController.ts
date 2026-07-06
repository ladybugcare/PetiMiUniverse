import type { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { checkPermission } from '../../middleware/authMiddleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog.js';
import { ValidationError } from '../../utils/errors.js';
import { getRoleDisplayName, type Role } from '../../utils/permissions.js';
import {
  authUserExistsForEmail,
  buildInvitationShareMessage,
  buildInvitationUrl,
  linkStaffMemberToClinicUser,
  resolveHubWebUrl,
} from './hubInvitationUtils.js';

const uuidStr = z.string().uuid();

function resolveHubWebUrlForSignup(): string {
  const raw =
    process.env.HUB_WEB_URL?.trim() ||
    process.env.VITE_HUB_WEB_URL?.trim() ||
    process.env.FRONTEND_URL?.trim();
  if (!raw) {
    throw new ValidationError('HUB_WEB_URL não configurada no servidor');
  }
  return raw.replace(/\/$/, '');
}

async function loadPendingInvitation(token: string) {
  const { data, error } = await supabaseAdmin
    .from('user_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at as string) < new Date()) {
    await supabaseAdmin.from('user_invitations').update({ status: 'expired' }).eq('token', token);
    return null;
  }
  return data;
}

/** GET /api/hub/invitations/preview?token= */
export const previewHubInvitation = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!token) return res.status(400).json({ error: 'Token inválido' });

  const invitation = await loadPendingInvitation(token);
  if (!invitation) return res.status(404).json({ error: 'Convite inválido ou expirado' });

  const email = String(invitation.email || '').trim();
  const accountExists = await authUserExistsForEmail(email);

  const [{ data: clinic }, { data: unit }] = await Promise.all([
    supabaseAdmin.from('clinics').select('id, name').eq('id', invitation.clinic_id).maybeSingle(),
    supabaseAdmin.from('units').select('id, name').eq('id', invitation.unit_id).maybeSingle(),
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
    role_label: getRoleDisplayName(String(invitation.role).toUpperCase() as Role),
    account_exists: accountExists,
    blocked: accountExists,
    invitation_url: buildInvitationUrl(token),
  });
});

/** GET /api/hub/invitations/check-email?email=&clinic_id= */
export const checkHubInviteEmail = asyncHandler(async (req: Request, res: Response) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
  const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
  if (!email || !clinicParsed.success) {
    return res.status(400).json({ error: 'email e clinic_id são obrigatórios' });
  }

  const userId = req.user!.id;
  const clinic_id = clinicParsed.data;
  const canStaff = await checkPermission(userId, clinic_id, 'hub.staff.invite');
  const canUserInvite = await checkPermission(userId, clinic_id, 'user.invite');
  if (!canStaff || !canUserInvite) {
    return res.status(403).json({ error: 'Sem permissão' });
  }

  const accountExists = await authUserExistsForEmail(email);
  if (accountExists) {
    return res.json({
      available: false,
      reason: 'Este e-mail já possui conta. No MVP, use um e-mail novo para convites.',
    });
  }

  const { data: pending } = await supabaseAdmin
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

const signupFromInviteSchema = z.object({
  token: z.string().trim().min(1),
  full_name: z.string().trim().min(2).max(200),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional().nullable(),
});

/** POST /api/hub/invitations/signup — cria conta e aceita convite (MVP: só e-mail sem conta). */
export const signupFromHubInvitation = asyncHandler(async (req: Request, res: Response) => {
  const parsed = signupFromInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { token, full_name, password, phone } = parsed.data;
  const invitation = await loadPendingInvitation(token);
  if (!invitation) {
    return res.status(404).json({ error: 'Convite inválido ou expirado' });
  }

  const email = String(invitation.email || '').trim().toLowerCase();
  if (await authUserExistsForEmail(email)) {
    return res.status(409).json({
      error: 'Este e-mail já possui conta. No MVP, o convite é apenas para novos usuários.',
    });
  }

  const hubWebUrl = resolveHubWebUrlForSignup();
  const isLocalEnv = hubWebUrl.includes('localhost') || hubWebUrl.includes('127.0.0.1');

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
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
    const { data: clinicUser, error: cuError } = await supabaseAdmin
      .from('clinic_users')
      .insert({
        id: crypto.randomUUID(),
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
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: cuError?.message || 'Erro ao vincular à clínica' });
    }

    await linkStaffMemberToClinicUser(
      invitation.staff_member_id as string | null | undefined,
      clinicUser.id as string,
    );

    await supabaseAdmin.from('user_invitations').update({ status: 'accepted' }).eq('token', token);

    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: userId,
      clinic_id: invitation.clinic_id as string,
      unit_id: invitation.unit_id as string,
      action: 'HUB_INVITATION_SIGNUP',
      entity_type: 'clinic_user',
      entity_id: clinicUser.id as string,
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
  } catch (e) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw e;
  }
});

export { buildInvitationUrl, buildInvitationShareMessage, resolveHubWebUrl };
