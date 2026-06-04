import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { authLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { UnauthorizedError, ValidationError, DatabaseError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Login (com rate limiting mais restritivo)
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    throw new ValidationError('Email e senha são obrigatórios');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logger.warn('Tentativa de login falhou', {
      email,
      error: error.message,
      correlationId: req.correlationId,
    });
    throw new UnauthorizedError(error.message);
  }

  const { user, session } = data;

  // 🔍 Verifica se é ambiente local ou staging (não precisa confirmar email)
  // Local: URL contém localhost ou 127.0.0.1
  // Staging: NODE_ENV === 'staging'
  // Production: NODE_ENV === 'production' (precisa confirmar email)
  const rawFrontendUrl = process.env.FRONTEND_URL?.trim();
  const FRONTEND_URL = rawFrontendUrl?.replace(/\/$/, '');
  const isLocalEnv = FRONTEND_URL?.includes('localhost') || 
                    FRONTEND_URL?.includes('127.0.0.1');
  const isStaging = process.env.NODE_ENV === 'staging';
  const skipEmailConfirmation = isLocalEnv || isStaging;

  // Verificar se email está confirmado antes de permitir login (apenas em produção)
  if (!skipEmailConfirmation && !user.email_confirmed_at) {
    logger.warn('Tentativa de login com email não confirmado', {
      email,
      userId: user.id,
      correlationId: req.correlationId,
    });
    throw new UnauthorizedError(
      'Email não confirmado. Verifique sua caixa de entrada ou reenvie o email de confirmação.',
      { code: 'EMAIL_NOT_CONFIRMED' }
    );
  }

  let onboarding: Record<string, any> | null = null;
  let vetOnboarding: Record<string, any> | null = null;
  let freelancerOnboarding: Record<string, any> | null = null;
  let clinicUserRecord: any = null;
  /** clinic_id resolvido (linha + metadata + qualquer membership) — usado no payload e contagens */
  let lastResolvedClinicId: string | null = null;
  const userRole = user?.user_metadata?.role || user?.role;
  const allowedRolesForOnboarding = ['CADMIN', 'CMANAGER'];
  let clinicStatus: string | null = null;
  let clinicUserStatus: string | null = null;

  try {
    if (user) {
      const {
        data: clinicUserRows,
        error: clinicUserError,
      } = await supabaseAdmin
        .from('clinic_users')
        .select(
          'id, clinic_id, user_id, role, status, unit_id, first_login_at, first_login_completed_at, onboarding_state'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (clinicUserError) {
        logger.warn('Erro ao buscar clinic_users no login', {
          userId: user.id,
          error: clinicUserError.message,
          correlationId: req.correlationId,
        });
      }

      const rows = clinicUserRows || [];
      // Preferir linha de dono/gestor para onboarding (evita .in() que falha se role vier diferente na DB)
      const hasClinicId = (r: any) => r?.clinic_id != null && String(r.clinic_id).trim() !== '';
      const clinicUser =
        rows.find(
          (r: any) => allowedRolesForOnboarding.includes(String(r.role || '')) && hasClinicId(r),
        ) ||
        rows.find((r: any) => allowedRolesForOnboarding.includes(String(r.role || ''))) ||
        rows.find((r: any) => hasClinicId(r)) ||
        rows[0] ||
        null;

      clinicUserRecord = clinicUser;

      const clinicUserRole = clinicUser?.role as string | null;
      clinicUserStatus = clinicUser?.status as string | null;
      // ✅ clinic_id pode ser NULL na linha escolhida; outra membership ou user_metadata pode ter o UUID
      const clinicIdFromPrimaryRow = clinicUser?.clinic_id || null;
      const clinicIdFromAnyMembership =
        rows
          .map((r: any) => r?.clinic_id)
          .find((id: any) => id != null && String(id).trim() !== '') || null;
      const metaClinicRaw = user?.user_metadata?.clinic_id;
      const metaClinicId =
        metaClinicRaw != null && String(metaClinicRaw).trim() !== ''
          ? String(metaClinicRaw).trim()
          : null;
      let resolvedClinicId =
        clinicIdFromPrimaryRow || metaClinicId || clinicIdFromAnyMembership;

      const isEligibleClinicUser =
        clinicUserRole ? allowedRolesForOnboarding.includes(clinicUserRole) : false;
      const isClinicOwnerMetadata = String(userRole || '').toLowerCase() === 'clinic';

      // Dono sem clinic_id na linha/metadata: último recurso — clínica criada com o mesmo email
      if (!resolvedClinicId && isClinicOwnerMetadata && user?.email) {
        const emailTrim = String(user.email).trim();
        const { data: clinicByEmail, error: clinicByEmailErr } = await supabaseAdmin
          .from('clinics')
          .select('id')
          .eq('email', emailTrim)
          .maybeSingle();
        if (!clinicByEmailErr && clinicByEmail?.id) {
          resolvedClinicId = String(clinicByEmail.id);
        }
      }

      lastResolvedClinicId = resolvedClinicId;

      // Qualquer vínculo clinic_users ou dono em metadata entra no bloco (ex.: CASSISTANT com clinic_id preenchido)
      const participatesInClinicOnboarding =
        isClinicOwnerMetadata || isEligibleClinicUser || Boolean(clinicUser);

      // ✅ Ajustar: considerar usuários sem clínica (clinic_id NULL)
      if (participatesInClinicOnboarding && (clinicUser || isClinicOwnerMetadata)) {
        // Garantir que first_login_at seja registrado na primeira autenticação (só se existe linha)
        if (clinicUser && !clinicUser.first_login_at) {
          const updateData: any = { first_login_at: new Date().toISOString() };
          const rowClinicId = clinicUser.clinic_id || null;
          if (rowClinicId) {
            await supabaseAdmin
              .from('clinic_users')
              .update(updateData)
              .eq('user_id', user.id)
              .eq('clinic_id', rowClinicId);
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

        // ✅ Contar unidades / status usando clinic_id da linha OU do metadata (evita hasUnits falso)
        if (resolvedClinicId) {
          // Buscar status da clínica
          const {
            data: clinic,
            error: clinicError,
          } = await supabaseAdmin
            .from('clinics')
            .select('status')
            .eq('id', resolvedClinicId)
            .maybeSingle();

          if (clinicError) {
            logger.warn('Erro ao buscar clínica durante login', {
              clinicId: resolvedClinicId,
              userId: user.id,
              error: clinicError.message,
              correlationId: req.correlationId,
            });
          }

          // Contar unidades cadastradas
          const {
            count: unitCount,
            error: unitsError,
          } = await supabaseAdmin
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', resolvedClinicId);

          if (unitsError) {
            logger.warn('Erro ao contar unidades durante login', {
              clinicId: resolvedClinicId,
              userId: user.id,
              error: unitsError.message,
              correlationId: req.correlationId,
            });
          }

          hasUnits = (unitCount ?? 0) > 0;
          clinicStatusValue = clinic?.status || null;
        } else {
          // ✅ Sem clinic_id resolvido (DB + metadata): tratar como sem clínica vinculada
          clinicStatusValue = null;
          hasUnits = false;
        }

        const firstLoginCompletedAt = clinicUser?.first_login_completed_at || null;
        const firstLoginAt = clinicUser?.first_login_at || null;

        // ✅ needsOnboarding: falta clínica vinculada OU ainda não existe nenhuma unidade cadastrada.
        // `pending_unit` no registro da clínica não deve forçar onboarding se já houver linha em `units`.
        const needsOnboarding = !resolvedClinicId || !hasUnits;

        const shouldCompleteFirstUnit =
          needsOnboarding && (isEligibleClinicUser || isClinicOwnerMetadata);

        const shouldCompleteClinicProfile =
          (!resolvedClinicId || !hasUnits) &&
          (isEligibleClinicUser || isClinicOwnerMetadata || clinicUserRole === 'CADMIN');

        onboarding = {
          clinicId: resolvedClinicId,
          clinicStatus: clinicStatusValue,
          hasUnits,
          isFirstLogin: !firstLoginCompletedAt,
          needsOnboarding,
          shouldCompleteFirstUnit,
          shouldCompleteClinicProfile,
          firstLoginAt,
          firstLoginCompletedAt,
          onboardingState: clinicUser?.onboarding_state || {},
          clinicUserRole: clinicUserRole || (isClinicOwnerMetadata ? 'CADMIN' : null),
          clinicUserStatus,
        };
        if (clinicStatusValue) {
          clinicStatus = clinicStatusValue;
        }
      }
    }
  } catch (onboardingError: any) {
    logger.error('Falha ao compor dados de onboarding durante login', {
      userId: user?.id,
      error: onboardingError.message,
      correlationId: req.correlationId,
    });
    // Não falha o login se onboarding falhar, apenas loga o erro
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
    logger.error('Falha ao compor dados de onboarding do vet durante login', {
      userId: user?.id,
      error: vetOnboardingError.message,
      correlationId: req.correlationId,
    });
    // Não falha o login se onboarding falhar, apenas loga o erro
  }

  // Verificar onboarding de freelancer (apenas se email estiver confirmado)
  try {
    if (user && (userRole === 'freelancer' || userRole === 'FREELANCER')) {
      const { data: freelancer, error: freelancerError } = await supabaseAdmin
        .from('freelancers')
        .select('id, onboarding_completed, approval_status, status')
        .eq('id', user.id)
        .maybeSingle();

      if (!freelancerError && freelancer) {
        // Email já está confirmado (verificado acima), então sempre true
        const emailConfirmed = true;
        // REGRA CRÍTICA: Se onboarding_completed === true, NUNCA mostrar onboarding novamente
        // Tratar NULL como false (freelancers criados antes da migration)
        const needsOnboarding = freelancer.onboarding_completed !== true;
        const isApproved = freelancer.approval_status === 'approved' && freelancer.status === 'active';

        freelancerOnboarding = {
          needsOnboarding,
          emailConfirmed,
          onboardingCompleted: freelancer.onboarding_completed || false,
          approvalStatus: freelancer.approval_status || 'pending',
          isApproved,
          canAccessDashboard: isApproved,
          canViewDemands: isApproved,
        };
      } else if (!freelancerError && !freelancer) {
        // Freelancer não encontrado = precisa fazer onboarding
        freelancerOnboarding = {
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
  } catch (freelancerOnboardingError: any) {
    logger.error('Falha ao compor dados de onboarding do freelancer durante login', {
      userId: user?.id,
      error: freelancerOnboardingError.message,
      correlationId: req.correlationId,
    });
    // Não falha o login se onboarding falhar, apenas loga o erro
  }

  if (userRole === 'clinic' && clinicStatus === 'inactive') {
    logger.warn('Tentativa de login com clínica inativa', {
      userId: user.id,
      clinicStatus,
      correlationId: req.correlationId,
    });
    throw new UnauthorizedError('Conta da clínica inativada. Entre em contato com o suporte para reativação.');
  }

  if (clinicUserStatus === 'inactive') {
    logger.warn('Tentativa de login com usuário de clínica inativo', {
      userId: user.id,
      clinicUserStatus,
      correlationId: req.correlationId,
    });
    throw new UnauthorizedError('Seu acesso como membro da clínica foi inativado. Solicite reativação ao administrador.');
  }

  const isClinicOwnerRole = String(userRole || '').toLowerCase() === 'clinic';

  const clinicUserPayload = clinicUserRecord
    ? {
        id: clinicUserRecord.id,
        clinic_id: clinicUserRecord.clinic_id ?? lastResolvedClinicId,
        user_id: clinicUserRecord.user_id,
        role: clinicUserRecord.role,
        status: clinicUserRecord.status,
        unit_id: clinicUserRecord.unit_id,
        first_login_at: clinicUserRecord.first_login_at,
        first_login_completed_at: clinicUserRecord.first_login_completed_at,
        onboarding_state: clinicUserRecord.onboarding_state,
      }
    : isClinicOwnerRole && lastResolvedClinicId
      ? {
          id: null,
          clinic_id: lastResolvedClinicId,
          user_id: user.id,
          role: 'CADMIN',
          status: 'active',
          unit_id: null,
          first_login_at: null,
          first_login_completed_at: null,
          onboarding_state: {},
        }
      : null;

  logger.info('Login realizado com sucesso', {
    userId: user.id,
    email: user.email,
    role: userRole,
    correlationId: req.correlationId,
  });

  res.json({ 
    user,
    session,
    onboarding,
    vetOnboarding,
    freelancerOnboarding,
    clinicUser: clinicUserPayload,
  });
}));

// Signup (com rate limiting mais restritivo)
router.post('/signup', authLimiter, asyncHandler(async (req, res) => {
  const { email, password, name, role } = req.body;
  
  if (!email || !password) {
    throw new ValidationError('Email e senha são obrigatórios');
  }

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
    logger.warn('Tentativa de signup falhou', {
      email,
      error: error.message,
      correlationId: req.correlationId,
    });
    throw new ValidationError(error.message);
  }

  logger.info('Signup realizado com sucesso', {
    userId: data.user?.id,
    email: data.user?.email,
    role,
    correlationId: req.correlationId,
  });

  res.json({ 
    user: data.user,
    session: data.session 
  });
}));

/**
 * Reenviar email de confirmação
 */
router.post('/resend-confirmation', authLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email é obrigatório');
  }

  // Verificar se o usuário existe
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (listError) {
    logger.error('Erro ao listar usuários para reenvio de confirmação', {
      email,
      error: listError.message,
      correlationId: req.correlationId,
    });
    throw new DatabaseError('Erro ao verificar usuário', listError);
  }

  const user = users.find(u => u.email === email);

  if (!user) {
    throw new ValidationError('Usuário não encontrado');
  }

  // Se já está confirmado, não precisa reenviar
  if (user.email_confirmed_at) {
    throw new ValidationError('Email já está confirmado');
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
    logger.error('Erro ao resetar confirmação de email', {
      userId: user.id,
      email,
      error: updateError.message,
      correlationId: req.correlationId,
    });
    throw new DatabaseError('Erro ao reenviar email de confirmação', updateError);
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
    logger.warn('Erro ao enviar convite de confirmação, tentando generateLink', {
      userId: user.id,
      email,
      error: inviteError.message,
      correlationId: req.correlationId,
    });
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
      logger.error('Erro ao gerar link de confirmação', {
        userId: user.id,
        email,
        error: linkError.message,
        correlationId: req.correlationId,
      });
      throw new DatabaseError('Erro ao reenviar email de confirmação', linkError);
    }
    
    logger.info('Email de confirmação reenviado via generateLink', {
      userId: user.id,
      email,
      correlationId: req.correlationId,
    });

    // Avisar que a senha foi alterada e o usuário precisará redefinir
    return res.json({
      success: true,
      message: 'Email de confirmação reenviado com sucesso. Verifique sua caixa de entrada. Nota: Você precisará redefinir sua senha após confirmar o email.',
      passwordChanged: true,
    });
  }

  logger.info('Email de confirmação reenviado com sucesso', {
    userId: user.id,
    email,
    correlationId: req.correlationId,
  });

  return res.json({
    success: true,
    message: 'Email de confirmação reenviado com sucesso. Verifique sua caixa de entrada.',
  });
}));

export default router;
