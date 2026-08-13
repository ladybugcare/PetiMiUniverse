import { supabaseAdmin } from '../../config/supabase.js';
import { linkStaffMemberToClinicUser } from './hubInvitationUtils.js';
import { sanitizeOperationalAreas } from '../../utils/operationalAreas.js';

export type StaffHubAccessState = {
  staffId: string;
  clinicId: string;
  hasHubAccess: boolean;
  hubAccessEmail: string | null;
  hubAccessRole: string | null;
  operationalAreas?: string[] | null;
};

export type StaffLinkSyncResult = {
  clinic_user_id: string | null;
  linked: boolean;
  role_synced: boolean;
  areas_synced: boolean;
  message?: string;
};

/** Resolve `clinic_users` ativo na clínica pelo e-mail de login (auth). */
export async function resolveClinicUserByEmailInClinic(
  clinicId: string,
  email: string,
): Promise<{ id: string; role: string; user_id: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const authUser = usersData?.users?.find((u) => u.email?.toLowerCase() === normalized);
  if (!authUser?.id) return null;

  const { data: cu, error } = await supabaseAdmin
    .from('clinic_users')
    .select('id, role, user_id, status')
    .eq('clinic_id', clinicId)
    .eq('user_id', authUser.id)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !cu?.id) return null;
  return { id: cu.id as string, role: String(cu.role || ''), user_id: cu.user_id as string };
}

/** Outro profissional da mesma clínica já vinculado a este `clinic_user_id`. */
export async function findConflictingStaffForClinicUser(
  clinicId: string,
  clinicUserId: string,
  excludeStaffId?: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('clinic_user_id', clinicUserId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data?.id) return null;
  const id = data.id as string;
  if (excludeStaffId && id === excludeStaffId) return null;
  return id;
}

/** Copia `operational_areas` do profissional para a linha `clinic_users` vinculada. */
export async function syncOperationalAreasToClinicUser(
  clinicUserId: string,
  operationalAreas: string[] | null | undefined,
): Promise<void> {
  const areas = sanitizeOperationalAreas(operationalAreas ?? []);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('clinic_users')
    .update({ operational_areas: areas, updated_at: now })
    .eq('id', clinicUserId);
  if (error) throw error;
}

/**
 * Vincula (ou desvincula) o profissional ao login da clínica quando o e-mail de acesso
 * corresponde a um `clinic_users` ativo. Sincroniza `hub_access_role` e `operational_areas`.
 */
export async function syncStaffHubAccessLink(state: StaffHubAccessState): Promise<StaffLinkSyncResult> {
  const { staffId, clinicId, hasHubAccess, hubAccessEmail, hubAccessRole, operationalAreas } = state;
  const now = new Date().toISOString();
  const sanitizedAreas = sanitizeOperationalAreas(operationalAreas ?? []);

  if (!hasHubAccess || !hubAccessEmail?.trim()) {
    await supabaseAdmin
      .from('hub_staff_members')
      .update({ clinic_user_id: null, updated_at: now })
      .eq('id', staffId)
      .eq('clinic_id', clinicId);
    return { clinic_user_id: null, linked: false, role_synced: false, areas_synced: false };
  }

  const clinicUser = await resolveClinicUserByEmailInClinic(clinicId, hubAccessEmail);
  if (!clinicUser) {
    await supabaseAdmin
      .from('hub_staff_members')
      .update({ clinic_user_id: null, updated_at: now })
      .eq('id', staffId)
      .eq('clinic_id', clinicId);
    return {
      clinic_user_id: null,
      linked: false,
      role_synced: false,
      areas_synced: false,
      message:
        'Nenhuma conta ativa com este e-mail nesta clínica. Use «Enviar convite» para criar o acesso ou corrija o e-mail.',
    };
  }

  const conflictId = await findConflictingStaffForClinicUser(clinicId, clinicUser.id, staffId);
  if (conflictId) {
    throw new Error('Este login já está vinculado a outro profissional da equipe.');
  }

  let roleSynced = false;
  let areasSynced = false;
  const targetRole = hubAccessRole?.trim().toUpperCase();
  const patch: Record<string, unknown> = { updated_at: now };

  if (targetRole && targetRole !== String(clinicUser.role || '').toUpperCase()) {
    patch.role = targetRole;
    roleSynced = true;
  }

  patch.operational_areas = sanitizedAreas;
  areasSynced = true;

  if (roleSynced || areasSynced) {
    const { error: patchErr } = await supabaseAdmin
      .from('clinic_users')
      .update(patch)
      .eq('id', clinicUser.id);
    if (patchErr) throw patchErr;
  }

  await linkStaffMemberToClinicUser(staffId, clinicUser.id);

  const messages: string[] = [];
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
    message:
      messages.length > 0
        ? `Conta vinculada (${messages.join(', ')}). O usuário deve entrar novamente para aplicar as permissões.`
        : 'Conta vinculada ao profissional.',
  };
}
