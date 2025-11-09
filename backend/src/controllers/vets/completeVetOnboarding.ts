import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

interface CompleteOnboardingBody {
  specialties: string[];
  service_regions: string[];
  experience_year: number;
  bio: string;
  crmv_file_url?: string;
}

/**
 * Completa o onboarding do veterinário
 * Calcula automaticamente os anos de experiência baseado no experience_year
 */
export const completeVetOnboarding = async (req: Request<{}, {}, CompleteOnboardingBody>, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { specialties, service_regions, experience_year, bio, crmv_file_url } = req.body;

    // Validações
    if (!specialties || !Array.isArray(specialties) || specialties.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos uma especialidade' });
    }

    if (!service_regions || !Array.isArray(service_regions) || service_regions.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos uma região de atendimento' });
    }

    if (!experience_year || experience_year < 1980 || experience_year > new Date().getFullYear()) {
      return res.status(400).json({ error: 'Ano de experiência inválido (deve ser entre 1980 e o ano atual)' });
    }

    if (!bio || bio.trim().length < 30) {
      return res.status(400).json({ error: 'A descrição deve ter no mínimo 30 caracteres' });
    }

    if (!crmv_file_url) {
      return res.status(400).json({ error: 'É necessário enviar o arquivo do CRMV' });
    }

    // Verificar se o onboarding já foi completado anteriormente
    // REGRA CRÍTICA: Se já foi completado, não permitir alterações
    const { data: existingVet } = await supabaseAdmin
      .from('vets')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();

    if (existingVet?.onboarding_completed === true) {
      return res.status(400).json({ 
        error: 'Onboarding já foi completado anteriormente e não pode ser alterado.' 
      });
    }

    // Calcular anos de experiência automaticamente
    const currentYear = new Date().getFullYear();
    const yearsOfExperience = currentYear - experience_year;
    const experienceText = yearsOfExperience === 1 ? '1 ano' : `${yearsOfExperience} anos`;

    // Atualizar registro do veterinário
    // IMPORTANTE: onboarding_completed sempre será true após completar
    const updateData: any = {
      specialties,
      service_regions,
      experience_year,
      experience: experienceText, // Armazenar o texto calculado
      bio: bio.trim(),
      crmv_file_url,
      onboarding_completed: true, // SEMPRE true após completar - NUNCA pode ser resetado
      approval_status: 'pending_approval', // Muda para aguardar aprovação do admin
      updated_at: new Date().toISOString(),
    };

    const { data: updatedVet, error: updateError } = await supabaseAdmin
      .from('vets')
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
      vet: updatedVet,
    });
  } catch (error: any) {
    console.error('Erro ao completar onboarding:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao completar onboarding' });
  }
};

