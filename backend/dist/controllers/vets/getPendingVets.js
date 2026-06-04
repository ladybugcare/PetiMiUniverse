"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingVets = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * Lista veterinários pendentes de aprovação
 */
const getPendingVets = async (req, res) => {
    try {
        // Verificar se é admin
        const user = req.user;
        const userRole = user?.user_metadata?.role || user?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
        }
        // Buscar veterinários com approval_status = 'pending_approval'
        // Usando select * para evitar problemas com colunas que podem não existir
        let query = supabase_1.supabaseAdmin
            .from('vets')
            .select('*');
        // Aplicar filtros apenas se as colunas existirem
        // Primeiro, vamos tentar buscar todos e filtrar depois se necessário
        const { data: allVets, error: fetchError } = await query;
        if (fetchError) {
            console.error('Erro ao buscar veterinários:', fetchError);
            console.error('Detalhes do erro:', JSON.stringify(fetchError, null, 2));
            return res.status(500).json({
                error: 'Erro ao buscar veterinários pendentes',
                details: fetchError.message || fetchError.toString(),
                code: fetchError.code,
                hint: fetchError.hint
            });
        }
        // Filtrar no código se necessário (fallback caso as colunas não existam)
        const pendingVets = (allVets || []).filter((vet) => {
            const hasApprovalStatus = vet.approval_status === 'pending_approval';
            const hasOnboardingCompleted = vet.onboarding_completed === true;
            return hasApprovalStatus && hasOnboardingCompleted;
        });
        // Ordenar por updated_at (mais recentes primeiro)
        pendingVets.sort((a, b) => {
            const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return dateB - dateA;
        });
        return res.json({
            success: true,
            vets: pendingVets,
            count: pendingVets.length,
        });
    }
    catch (error) {
        console.error('Erro ao listar veterinários pendentes:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao listar veterinários pendentes' });
    }
};
exports.getPendingVets = getPendingVets;
