"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeVetOnboarding = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * Completa o onboarding do veterinário
 * Calcula automaticamente os anos de experiência baseado no experience_year
 */
const completeVetOnboarding = async (req, res) => {
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
        // Verificar se o registro do veterinário existe
        // IMPORTANTE: O registro deve existir com o CRMV preenchido do cadastro público
        const { data: existingVet, error: fetchError } = await supabase_1.supabaseAdmin
            .from('vets')
            .select('id, onboarding_completed, email, name, crmv')
            .eq('id', userId)
            .maybeSingle();
        if (fetchError) {
            console.error('Erro ao buscar veterinário:', fetchError);
            return res.status(500).json({
                error: 'Erro ao verificar registro do veterinário: ' + fetchError.message
            });
        }
        // Se o registro não existe, significa que o cadastro público não foi completado
        if (!existingVet) {
            console.error('[completeVetOnboarding] Registro do veterinário não encontrado', {
                userId,
                timestamp: new Date().toISOString(),
            });
            // Verificar se o usuário existe no auth
            const { data: authUser, error: authError } = await supabase_1.supabaseAdmin.auth.admin.getUserById(userId);
            if (authError) {
                console.error('[completeVetOnboarding] Erro ao buscar usuário no auth:', authError);
            }
            else if (authUser?.user) {
                console.error('[completeVetOnboarding] Usuário existe no auth mas não na tabela vets', {
                    userId,
                    email: authUser.user.email,
                    role: authUser.user.user_metadata?.role,
                });
            }
            return res.status(400).json({
                error: 'Registro do veterinário não encontrado. Por favor, complete o cadastro público primeiro.'
            });
        }
        // Verificar se o CRMV está preenchido (deve vir do cadastro público)
        if (!existingVet.crmv || existingVet.crmv.trim() === '') {
            console.error('CRMV não encontrado para o veterinário:', userId);
            return res.status(400).json({
                error: 'CRMV não encontrado. Por favor, complete o cadastro público com o CRMV primeiro.'
            });
        }
        // Verificar se o onboarding já foi completado anteriormente
        // REGRA CRÍTICA: Se já foi completado, não permitir alterações
        const { data: currentVet } = await supabase_1.supabaseAdmin
            .from('vets')
            .select('onboarding_completed')
            .eq('id', userId)
            .maybeSingle();
        if (currentVet?.onboarding_completed === true) {
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
        const updateData = {
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
        const { data: updatedVet, error: updateError } = await supabase_1.supabaseAdmin
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
    }
    catch (error) {
        console.error('Erro ao completar onboarding:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao completar onboarding' });
    }
};
exports.completeVetOnboarding = completeVetOnboarding;
