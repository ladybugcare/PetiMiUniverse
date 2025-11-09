import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

interface CompleteOnboardingBody {
  specialties?: string[];
  service_regions?: string[];
  experience_year?: number;
  bio?: string;
  certifications?: string[];
}

/**
 * Completa o onboarding do freelancer
 * Versão simplificada sem necessidade de CRMV
 */
export const completeFreelancerOnboarding = async (req: Request<{}, {}, CompleteOnboardingBody>, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { specialties, service_regions, experience_year, bio, certifications } = req.body;

    // Verificar se o onboarding já foi completado anteriormente
    // REGRA CRÍTICA: Se já foi completado, não permitir alterações
    const { data: existingFreelancer } = await supabaseAdmin
      .from('freelancers')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();

    if (existingFreelancer?.onboarding_completed === true) {
      return res.status(400).json({ 
        error: 'Onboarding já foi completado anteriormente e não pode ser alterado.' 
      });
    }

    // Preparar dados de atualização
    const updateData: any = {
      onboarding_completed: true, // SEMPRE true após completar - NUNCA pode ser resetado
      approval_status: 'pending_approval', // Muda para aguardar aprovação do admin
      updated_at: new Date().toISOString(),
    };

    // Campos opcionais
    if (specialties && Array.isArray(specialties) && specialties.length > 0) {
      updateData.specialties = specialties;
    }

    if (service_regions && Array.isArray(service_regions) && service_regions.length > 0) {
      updateData.service_regions = service_regions;
    }

    if (experience_year) {
      if (experience_year < 1980 || experience_year > new Date().getFullYear()) {
        return res.status(400).json({ error: 'Ano de experiência inválido (deve ser entre 1980 e o ano atual)' });
      }
      updateData.experience_year = experience_year;
    }

    if (bio && bio.trim().length > 0) {
      const bioLength = bio.trim().length;
      if (bioLength < 100) {
        return res.status(400).json({ error: 'A descrição deve ter no mínimo 100 caracteres' });
      }
      if (bioLength > 600) {
        return res.status(400).json({ error: 'A descrição deve ter no máximo 600 caracteres' });
      }
      updateData.bio = bio.trim();
    }

    if (certifications && Array.isArray(certifications) && certifications.length > 0) {
      updateData.certifications = certifications;
    }

    const { data: updatedFreelancer, error: updateError } = await supabaseAdmin
      .from('freelancers')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Erro ao atualizar onboarding:', updateError);
      return res.status(500).json({ error: 'Erro ao completar onboarding: ' + updateError.message });
    }

    return res.json({
      success: true,
      message: 'Onboarding completado com sucesso! Seu cadastro está em análise.',
      freelancer: updatedFreelancer,
    });
  } catch (error: any) {
    console.error('Erro ao completar onboarding:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao completar onboarding' });
  }
};

