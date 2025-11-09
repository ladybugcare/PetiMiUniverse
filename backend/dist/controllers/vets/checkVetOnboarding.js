"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkVetOnboarding = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * Verifica se o veterinário precisa completar o onboarding
 */
const checkVetOnboarding = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        // Buscar dados do veterinário
        const { data: vet, error: vetError } = await supabase_1.supabaseAdmin
            .from('vets')
            .select('id, onboarding_completed, email')
            .eq('id', userId)
            .maybeSingle();
        if (vetError) {
            console.error('Erro ao buscar veterinário:', vetError);
            return res.status(500).json({ error: 'Erro ao verificar status do onboarding' });
        }
        if (!vet) {
            return res.status(404).json({ error: 'Veterinário não encontrado' });
        }
        // Verificar se email está confirmado no Supabase Auth
        const { data: authUser, error: authError } = await supabase_1.supabaseAdmin.auth.admin.getUserById(userId);
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
        });
    }
    catch (error) {
        console.error('Erro ao verificar onboarding:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao verificar onboarding' });
    }
};
exports.checkVetOnboarding = checkVetOnboarding;
