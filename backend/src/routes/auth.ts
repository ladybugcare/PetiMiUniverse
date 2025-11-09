import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Login (com rate limiting mais restritivo)
router.post('/login', authLimiter, async (req, res) => {
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

    // Verificar se email está confirmado antes de permitir login
    if (!user.email_confirmed_at) {
      return res.status(403).json({ 
        error: 'EMAIL_NOT_CONFIRMED',
        message: 'Email não confirmado. Verifique sua caixa de entrada ou reenvie o email de confirmação.'
      });
    }

    let onboarding: Record<string, any> | null = null;
    let vetOnboarding: Record<string, any> | null = null;
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
        // ✅ clinic_id pode ser NULL (usuário ainda não criou clínica)
        const clinicId = clinicUser?.clinic_id || null;

        const isEligibleClinicUser =
          clinicUserRole ? allowedRolesForOnboarding.includes(clinicUserRole) : false;
        const isClinicOwner = userRole === 'clinic';

        // ✅ Ajustar: considerar usuários sem clínica (clinic_id NULL)
        if ((isEligibleClinicUser || isClinicOwner) && clinicUser) {
          // Garantir que first_login_at seja registrado na primeira autenticação
          if (!clinicUser.first_login_at) {
            const updateData: any = { first_login_at: new Date().toISOString() };
            // Só adicionar clinic_id na query se não for NULL
            if (clinicId) {
              await supabaseAdmin
                .from('clinic_users')
                .update(updateData)
                .eq('user_id', user.id)
                .eq('clinic_id', clinicId);
            } else {
              await supabaseAdmin
                .from('clinic_users')
                .update(updateData)
                .eq('user_id', user.id)
                .is('clinic_id', null);
            }
          }

          let hasUnits = false;
          let clinicStatusValue: string | null = null;

          // ✅ Só buscar clinic e units se clinic_id não for NULL
          if (clinicId) {
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

            hasUnits = (unitCount ?? 0) > 0;
            clinicStatusValue = clinic?.status || null;
          } else {
            // ✅ Se clinic_id é NULL, usuário precisa criar clínica (primeira unidade)
            clinicStatusValue = null;
            hasUnits = false;
          }

          const firstLoginCompletedAt = clinicUser?.first_login_completed_at || null;
          const firstLoginAt = clinicUser?.first_login_at || null;

          // ✅ needsOnboarding se:
          // - clinic_id é NULL (não tem clínica ainda)
          // - clinic_status é 'pending_unit' (tem clínica mas não tem unidade)
          // - não tem unidades
          const needsOnboarding =
            !clinicId || clinicStatusValue === 'pending_unit' || !hasUnits;

          const shouldCompleteFirstUnit =
            needsOnboarding && (isEligibleClinicUser || isClinicOwner);

          onboarding = {
            clinicId, // Pode ser null
            clinicStatus: clinicStatusValue,
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

    // Verificar onboarding de veterinário (apenas se email estiver confirmado)
    try {
      if (user && (userRole === 'vet' || userRole === 'VET')) {
        const { data: vet, error: vetError } = await supabaseAdmin
          .from('vets')
          .select('id, onboarding_completed, approval_status, status')
          .eq('id', user.id)
          .maybeSingle();

        if (!vetError && vet) {
          // Email já está confirmado (verificado acima), então sempre true
          const emailConfirmed = true;
          // REGRA CRÍTICA: Se onboarding_completed === true, NUNCA mostrar onboarding novamente
          // Tratar NULL como false (vets criados antes da migration)
          const needsOnboarding = vet.onboarding_completed !== true;
          const isApproved = vet.approval_status === 'approved' && vet.status === 'active';

          vetOnboarding = {
            needsOnboarding,
            emailConfirmed,
            onboardingCompleted: vet.onboarding_completed || false,
            approvalStatus: vet.approval_status || 'pending',
            isApproved,
            canAccessDashboard: isApproved,
            canViewDemands: isApproved,
          };
        } else if (!vetError && !vet) {
          // Vet não encontrado = precisa fazer onboarding
          vetOnboarding = {
            needsOnboarding: true,
            emailConfirmed: true,
            onboardingCompleted: false,
            approvalStatus: 'pending',
            isApproved: false,
            canAccessDashboard: false,
            canViewDemands: false,
          };
        }
      }
    } catch (vetOnboardingError: any) {
      console.error('[AUTH] Falha ao compor dados de onboarding do vet:', vetOnboardingError);
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
      vetOnboarding,
      clinicUser: clinicUserPayload,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Signup (com rate limiting mais restritivo)
router.post('/signup', authLimiter, async (req, res) => {
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

/**
 * Reenviar email de confirmação
 */
router.post('/resend-confirmation', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    // Verificar se o usuário existe
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Erro ao listar usuários:', listError);
      return res.status(500).json({ error: 'Erro ao verificar usuário' });
    }

    const user = users.find(u => u.email === email);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Se já está confirmado, não precisa reenviar
    if (user.email_confirmed_at) {
      return res.status(400).json({ error: 'Email já está confirmado' });
    }

    // Construir URL de redirecionamento
    const rawFrontendUrl = process.env.FRONTEND_URL?.trim();
    const FRONTEND_URL = rawFrontendUrl?.replace(/\/$/, '');
    const emailRedirectTo = FRONTEND_URL ? `${FRONTEND_URL}/email-confirmed` : undefined;

    // Para reenviar email de confirmação sem ter a senha:
    // 1. Resetar email_confirmed_at para null usando updateUserById
    // 2. Usar inviteUser que envia email de confirmação sem precisar de senha
    //    (mesmo que o usuário já exista, o inviteUser pode ser usado para reenviar confirmação)
    
    // Resetar email_confirmed_at para null
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { email_confirm: false }
    );

    if (updateError) {
      console.error('Erro ao resetar confirmação de email:', updateError);
      return res.status(500).json({ 
        error: 'Erro ao reenviar email de confirmação',
        message: updateError.message 
      });
    }

    // Usar inviteUser para enviar email de confirmação (não requer senha)
    // Isso envia um email de convite que pode ser usado para confirmar o email
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: emailRedirectTo,
        data: user.user_metadata || {},
      }
    );

    if (inviteError) {
      console.error('Erro ao enviar convite de confirmação:', inviteError);
      // Se inviteUser falhar (por exemplo, se o usuário já existe), tentar generateLink com senha temporária
      // Gerar senha temporária aleatória
      const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!';
      
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email,
        password: tempPassword,
        options: {
          redirectTo: emailRedirectTo,
        },
      });

      if (linkError) {
        console.error('Erro ao gerar link de confirmação:', linkError);
        return res.status(500).json({ 
          error: 'Erro ao reenviar email de confirmação',
          message: linkError.message 
        });
      }
      
      // Avisar que a senha foi alterada e o usuário precisará redefinir
      return res.json({
        success: true,
        message: 'Email de confirmação reenviado com sucesso. Verifique sua caixa de entrada. Nota: Você precisará redefinir sua senha após confirmar o email.',
        passwordChanged: true,
      });
    }

    return res.json({
      success: true,
      message: 'Email de confirmação reenviado com sucesso. Verifique sua caixa de entrada.',
    });
  } catch (error: any) {
    console.error('Erro ao reenviar email de confirmação:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao reenviar email de confirmação',
      message: error.message 
    });
  }
});

export default router;
