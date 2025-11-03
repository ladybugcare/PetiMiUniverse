import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    const { user, session } = data;

    let onboarding: Record<string, any> | null = null;
    let clinicUserRecord: any = null;
    const userRole = user?.user_metadata?.role || user?.role;
    const allowedRolesForOnboarding = ['CADMIN', 'CMANAGER'];
    let clinicStatus: string | null = null;
    let clinicUserStatus: string | null = null;

    try {
      if (user) {
        const {
          data: clinicUser,
          error: clinicUserError,
        } = await supabaseAdmin
          .from('clinic_users')
          .select(
            'id, clinic_id, user_id, role, status, unit_id, first_login_at, first_login_completed_at, onboarding_state'
          )
          .eq('user_id', user.id)
          .in('role', allowedRolesForOnboarding)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        clinicUserRecord = clinicUser;

        const clinicUserRole = clinicUser?.role as string | null;
        clinicUserStatus = clinicUser?.status as string | null;
        const clinicId = clinicUser?.clinic_id || (userRole === 'clinic' ? user.id : null);

        const isEligibleClinicUser =
          clinicUserRole ? allowedRolesForOnboarding.includes(clinicUserRole) : false;
        const isClinicOwner = userRole === 'clinic';

        if (clinicId && (isEligibleClinicUser || isClinicOwner)) {
          // Garantir que first_login_at seja registrado na primeira autenticação
          if (clinicUser && !clinicUser.first_login_at) {
            await supabaseAdmin
              .from('clinic_users')
              .update({ first_login_at: new Date().toISOString() })
              .eq('user_id', user.id)
              .eq('clinic_id', clinicId);
          }

          // Buscar status da clínica
          const {
            data: clinic,
            error: clinicError,
          } = await supabaseAdmin
            .from('clinics')
            .select('status')
            .eq('id', clinicId)
            .maybeSingle();

          if (clinicError) {
            console.error('[AUTH] Erro ao buscar clínica:', clinicError.message);
          }

          // Contar unidades cadastradas
          const {
            count: unitCount,
            error: unitsError,
          } = await supabaseAdmin
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', clinicId);

          if (unitsError) {
            console.error('[AUTH] Erro ao contar unidades:', unitsError.message);
          }

          const hasUnits = (unitCount ?? 0) > 0;
          clinicStatus = clinic?.status || null;
          const firstLoginCompletedAt = clinicUser?.first_login_completed_at || null;
          const firstLoginAt = clinicUser?.first_login_at || null;

          const needsOnboarding =
            clinicStatus === 'pending_unit' || !hasUnits;

          const shouldCompleteFirstUnit =
            needsOnboarding && (isEligibleClinicUser || isClinicOwner);

          onboarding = {
            clinicId,
            clinicStatus,
            hasUnits,
            isFirstLogin: !firstLoginCompletedAt,
            needsOnboarding,
            shouldCompleteFirstUnit,
            firstLoginAt,
            firstLoginCompletedAt,
            onboardingState: clinicUser?.onboarding_state || {},
            clinicUserRole: clinicUserRole || (isClinicOwner ? 'CADMIN' : null),
            clinicUserStatus,
          };
        }
      }
    } catch (onboardingError: any) {
      console.error('[AUTH] Falha ao compor dados de onboarding:', onboardingError);
    }

    if (userRole === 'clinic' && clinicStatus === 'inactive') {
      return res.status(403).json({
        error: 'Conta da clínica inativada. Entre em contato com o suporte para reativação.',
      });
    }

    if (clinicUserStatus === 'inactive') {
      return res.status(403).json({
        error: 'Seu acesso como membro da clínica foi inativado. Solicite reativação ao administrador.',
      });
    }

    const clinicUserPayload = clinicUserRecord
      ? {
          id: clinicUserRecord.id,
          clinic_id: clinicUserRecord.clinic_id,
          user_id: clinicUserRecord.user_id,
          role: clinicUserRecord.role,
          status: clinicUserRecord.status,
          unit_id: clinicUserRecord.unit_id,
          first_login_at: clinicUserRecord.first_login_at,
          first_login_completed_at: clinicUserRecord.first_login_completed_at,
          onboarding_state: clinicUserRecord.onboarding_state,
        }
      : null;

    res.json({ 
      user,
      session,
      onboarding,
      clinicUser: clinicUserPayload,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ 
      user: data.user,
      session: data.session 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
