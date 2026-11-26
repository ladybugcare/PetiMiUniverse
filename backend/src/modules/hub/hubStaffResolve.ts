import { supabaseAdmin } from '../../config/supabase';

/**
 * Resolve o `hub_staff_members.id` do usuário autenticado na clínica.
 * auth.users.id → clinic_users.id → hub_staff_members.clinic_user_id
 * Múltiplos vínculos ativos → null (falha fechada; sem fallback global).
 */
export async function resolveStaffIdForUser(
  clinicId: string,
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const { data: clinicUser } = await supabaseAdmin
    .from('clinic_users')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!clinicUser?.id) return null;
  const { data: staffRows, error } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('clinic_user_id', clinicUser.id)
    .is('deleted_at', null)
    .limit(3);
  if (error || !staffRows || staffRows.length === 0) return null;
  if (staffRows.length > 1) {
    console.error('resolveStaffIdForUser: múltiplos hub_staff_members para clinic_user', {
      clinicId,
      clinicUserId: clinicUser.id,
      count: staffRows.length,
    });
    return null;
  }
  return (staffRows[0]?.id as string | undefined) ?? null;
}
