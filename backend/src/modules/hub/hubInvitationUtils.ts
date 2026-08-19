import { supabaseAdmin } from '../../config/supabase.js';
import { getRoleDisplayName, type Role } from '../../utils/permissions.js';

export function resolveHubWebUrl(): string {
  const raw =
    process.env.HUB_WEB_URL?.trim() ||
    process.env.VITE_HUB_WEB_URL?.trim() ||
    process.env.FRONTEND_URL?.trim();
  return (raw || 'http://localhost:5173').replace(/\/$/, '');
}

export function buildInvitationUrl(token: string): string {
  return `${resolveHubWebUrl()}/accept-invitation?token=${encodeURIComponent(token)}`;
}

export function buildInvitationShareMessage(opts: {
  clinicName: string;
  unitName: string;
  role: Role | string;
  invitationUrl: string;
  inviteeName?: string | null;
}): string {
  const roleLabel = getRoleDisplayName(String(opts.role).toUpperCase() as Role);
  const greeting = opts.inviteeName?.trim() ? `Olá, ${opts.inviteeName.trim()}!` : 'Olá!';
  return [
    greeting,
    '',
    `Você foi convidado(a) para a equipe da clínica ${opts.clinicName} (unidade ${opts.unitName}) como ${roleLabel}.`,
    '',
    'Crie sua conta (ou entre se já tiver) e acesse o PetMi Hub pelo link abaixo (válido por 7 dias):',
    opts.invitationUrl,
    '',
    'PetMi Hub',
  ].join('\n');
}

/** MVP: convite só para e-mails sem conta auth. */
export async function authUserExistsForEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  return Boolean(usersData?.users?.some((u) => u.email?.toLowerCase() === normalized));
}

export async function linkStaffMemberToClinicUser(
  staffMemberId: string | null | undefined,
  clinicUserId: string,
): Promise<void> {
  if (!staffMemberId) return;
  const { error } = await supabaseAdmin
    .from('hub_staff_members')
    .update({ clinic_user_id: clinicUserId, updated_at: new Date().toISOString() })
    .eq('id', staffMemberId)
    .is('deleted_at', null);
  if (error) {
    console.error('[hub_invitations] link staff clinic_user_id', error);
    throw error;
  }
}
