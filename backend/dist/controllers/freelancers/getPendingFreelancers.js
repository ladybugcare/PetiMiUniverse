"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingFreelancers = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * Lista freelancers pendentes de aprovação
 */
const getPendingFreelancers = async (req, res) => {
    try {
        // Verificar se é admin
        const user = req.user;
        const userRole = user?.user_metadata?.role || user?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
        }
        // Buscar freelancers com approval_status = 'pending_approval'
        let query = supabase_1.supabaseAdmin
            .from('freelancers')
            .select('*');
        const { data: allFreelancers, error: fetchError } = await query;
        if (fetchError) {
            console.error('Erro ao buscar freelancers:', fetchError);
            console.error('Detalhes do erro:', JSON.stringify(fetchError, null, 2));
            return res.status(500).json({
                error: 'Erro ao buscar freelancers pendentes',
                details: fetchError.message || fetchError.toString(),
                code: fetchError.code,
                hint: fetchError.hint
            });
        }
        // Filtrar no código se necessário (fallback caso as colunas não existam)
        const pendingFreelancers = (allFreelancers || []).filter((freelancer) => {
            const hasApprovalStatus = freelancer.approval_status === 'pending_approval';
            const hasOnboardingCompleted = freelancer.onboarding_completed === true;
            return hasApprovalStatus && hasOnboardingCompleted;
        });
        // Ordenar por updated_at (mais recentes primeiro)
        pendingFreelancers.sort((a, b) => {
            const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return dateB - dateA;
        });
        return res.json({
            success: true,
            freelancers: pendingFreelancers,
            count: pendingFreelancers.length,
        });
    }
    catch (error) {
        console.error('Erro ao listar freelancers pendentes:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao listar freelancers pendentes' });
    }
};
exports.getPendingFreelancers = getPendingFreelancers;
