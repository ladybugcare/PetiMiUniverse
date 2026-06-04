import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

/**
 * Verifica se o veterinário precisa completar o onboarding
 */
export const checkVetOnboarding = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar dados do veterinário (incluindo CRMV)
    const { data: vet, error: vetError } = await supabaseAdmin
      .from('vets')
      .select('id, onboarding_completed, email, crmv')
      .eq('id', userId)
      .maybeSingle();

    if (vetError) {
      console.error('Erro ao buscar veterinário:', vetError);
      return res.status(500).json({ error: 'Erro ao verificar status do onboarding: ' + vetError.message });
    }

    // Se o registro não existe, retornar que precisa fazer onboarding
    if (!vet) {
      // Verificar se email está confirmado no Supabase Auth
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
      
      if (authError) {
        console.error('Erro ao buscar usuário auth:', authError);
        return res.status(500).json({ error: 'Erro ao verificar confirmação de email' });
      }

      const emailConfirmed = !!authUser.user?.email_confirmed_at;
      
      return res.json({
        needsOnboarding: emailConfirmed,
        emailConfirmed,
        onboardingCompleted: false,
        crmv: null,
      });
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
    const needsOnboarding = vet.onboarding_completed !== true && emailConfirmed;

    return res.json({
      needsOnboarding,
      emailConfirmed,
      onboardingCompleted: vet.onboarding_completed,
      crmv: vet.crmv || null,
    });
  } catch (error: any) {
    console.error('Erro ao verificar onboarding:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao verificar onboarding' });
  }
};

