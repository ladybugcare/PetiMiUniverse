import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const ALLOWED_CLINIC_ROLES = new Set(['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL']);

function pickClinicUserRow(rows: Array<Record<string, unknown>>) {
  const withClinic = (r: Record<string, unknown>) =>
    r.clinic_id != null && String(r.clinic_id).trim() !== '';

  return (
    rows.find((r) => ALLOWED_CLINIC_ROLES.has(String(r.role || '').toUpperCase()) && withClinic(r)) ||
    rows.find((r) => ALLOWED_CLINIC_ROLES.has(String(r.role || '').toUpperCase())) ||
    rows.find((r) => withClinic(r)) ||
    rows[0] ||
    null
  );
}

/** GET /api/hub/session/context — reidrata clinic_user / onboarding no Hub após refresh. */
export const getHubSessionContext = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const userEmail = req.user!.email || null;
  const userRole = (req.user as { user_metadata?: { role?: string } })?.user_metadata?.role;

  const { data: rows, error } = await supabaseAdmin
    .from('clinic_users')
    .select(
      'id, clinic_id, user_id, role, status, unit_id, first_login_at, first_login_completed_at, onboarding_state, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'Erro ao carregar vínculo com a clínica.' });
  }

  const list = rows || [];
  let clinicUser: Record<string, unknown> | null = pickClinicUserRow(
    list as Array<Record<string, unknown>>,
  );

  let resolvedClinicId =
    (clinicUser?.clinic_id as string | null) ||
    list.map((r) => r.clinic_id).find((id) => id != null && String(id).trim() !== '') ||
    null;

  const isClinicOwnerMetadata = String(userRole || '').toLowerCase() === 'clinic';

  if (!resolvedClinicId && isClinicOwnerMetadata && userEmail) {
    const { data: clinicByEmail } = await supabaseAdmin
      .from('clinics')
      .select('id')
      .eq('email', String(userEmail).trim())
      .maybeSingle();
    if (clinicByEmail?.id) {
      resolvedClinicId = String(clinicByEmail.id);
    }
  }

  // Hub onboarding: clínica criada com id = user_id
  if (!resolvedClinicId && isClinicOwnerMetadata) {
    const { data: clinicByOwnerId } = await supabaseAdmin
      .from('clinics')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (clinicByOwnerId?.id) {
      resolvedClinicId = String(clinicByOwnerId.id);
    }
  }

  let hasUnits = false;
  let clinicStatus: string | null = null;

  if (resolvedClinicId) {
    const [{ data: clinic }, { count: unitCount }] = await Promise.all([
      supabaseAdmin.from('clinics').select('status').eq('id', resolvedClinicId).maybeSingle(),
      supabaseAdmin
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', resolvedClinicId),
    ]);
    clinicStatus = clinic?.status || null;
    hasUnits = (unitCount ?? 0) > 0;
  }

  if (clinicUser?.id && resolvedClinicId && !clinicUser.clinic_id) {
    await supabaseAdmin
      .from('clinic_users')
      .update({
        clinic_id: resolvedClinicId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clinicUser.id as string);
    clinicUser = { ...clinicUser, clinic_id: resolvedClinicId };
  }

  const clinicUserPayload = clinicUser
    ? {
        id: clinicUser.id,
        clinic_id: (clinicUser.clinic_id as string | null) ?? resolvedClinicId,
        user_id: clinicUser.user_id,
        role: clinicUser.role,
        status: clinicUser.status,
        unit_id: clinicUser.unit_id,
        first_login_at: clinicUser.first_login_at,
        first_login_completed_at: clinicUser.first_login_completed_at,
        onboarding_state: clinicUser.onboarding_state,
      }
    : resolvedClinicId && isClinicOwnerMetadata
      ? {
          id: null,
          clinic_id: resolvedClinicId,
          user_id: userId,
          role: 'CADMIN',
          status: 'active',
          unit_id: null,
          first_login_at: null,
          first_login_completed_at: null,
          onboarding_state: {},
        }
      : null;

  const needsOnboarding = !resolvedClinicId || !hasUnits;
  const role = String(clinicUserPayload?.role || '').toUpperCase();
  const shouldCompleteClinicProfile =
    needsOnboarding && (role === 'CADMIN' || role === 'CMANAGER' || isClinicOwnerMetadata);

  res.json({
    clinicUser: clinicUserPayload,
    onboarding: {
      clinicId: resolvedClinicId,
      clinicStatus,
      hasUnits,
      needsOnboarding,
      shouldCompleteClinicProfile,
      shouldCompleteFirstUnit: needsOnboarding && (role === 'CADMIN' || role === 'CMANAGER' || isClinicOwnerMetadata),
    },
  });
});
