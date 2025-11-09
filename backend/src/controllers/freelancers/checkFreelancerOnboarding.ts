import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

/**
 * Verifica se o freelancer precisa completar o onboarding
 */
export const checkFreelancerOnboarding = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar dados do freelancer
    const { data: freelancer, error: freelancerError } = await supabaseAdmin
      .from('freelancers')
      .select('id, onboarding_completed, email')
      .eq('id', userId)
      .maybeSingle();

    if (freelancerError) {
      console.error('Erro ao buscar freelancer:', freelancerError);
      return res.status(500).json({ error: 'Erro ao verificar status do onboarding' });
    }

    if (!freelancer) {
      return res.status(404).json({ error: 'Freelancer não encontrado' });
    }

    // Verificar se email está confirmado no Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (authError) {
      console.error('Erro ao buscar usuário auth:', authError);
      return res.status(500).json({ error: 'Erro ao verificar confirmação de email' });
    }

    const emailConfirmed = !!authUser.user?.email_confirmed_at;
    // REGRA CRÍTICA: Se onboarding_completed === true, NUNCA mostrar onboarding novamente
    // needsOnboarding só é true se onboarding_completed for false ou NULL
    const needsOnboarding = freelancer.onboarding_completed !== true && emailConfirmed;

    return res.json({
      needsOnboarding,
      emailConfirmed,
      onboardingCompleted: freelancer.onboarding_completed,
    });
  } catch (error: any) {
    console.error('Erro ao verificar onboarding:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao verificar onboarding' });
  }
};

