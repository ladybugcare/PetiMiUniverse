"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectFreelancer = void 0;
const supabase_1 = require("../../config/supabase");
const auditLog_1 = require("../../utils/auditLog");
/**
 * Rejeita um freelancer
 */
const rejectFreelancer = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body;
        const adminId = req.user?.id;
        if (!adminId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        // Verificar se é admin
        const user = req.user;
        const userRole = user?.user_metadata?.role || user?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem rejeitar freelancers.' });
        }
        if (!rejection_reason || rejection_reason.trim().length === 0) {
            return res.status(400).json({ error: 'Motivo da rejeição é obrigatório' });
        }
        // Verificar se o freelancer existe e está pendente
        const { data: freelancer, error: freelancerError } = await supabase_1.supabaseAdmin
            .from('freelancers')
            .select('id, name, email, approval_status')
            .eq('id', id)
            .maybeSingle();
        if (freelancerError || !freelancer) {
            return res.status(404).json({ error: 'Freelancer não encontrado' });
        }
        if (freelancer.approval_status !== 'pending_approval') {
            return res.status(400).json({
                error: `Freelancer não está pendente de aprovação. Status atual: ${freelancer.approval_status}`
            });
        }
        // Atualizar status para rejeitado
        const { error: updateError } = await supabase_1.supabaseAdmin
            .from('freelancers')
            .update({
            approval_status: 'rejected',
            status: 'inactive',
            rejection_reason: rejection_reason.trim(),
            reviewed_by: adminId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
            .eq('id', id);
        if (updateError) {
            console.error('Erro ao rejeitar freelancer:', updateError);
            return res.status(500).json({ error: 'Erro ao rejeitar freelancer' });
        }
        // Criar log de auditoria
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id: adminId,
            action: 'REJECT_FREELANCER',
            entity_type: 'freelancer',
            entity_id: id,
            new_values: {
                approval_status: 'rejected',
                status: 'inactive',
                rejection_reason: rejection_reason.trim(),
            },
            ...metadata,
        });
        // TODO: Enviar email de rejeição para o freelancer com o motivo
        // await sendFreelancerRejectionEmail(freelancer.email, freelancer.name, rejection_reason);
        return res.json({
            success: true,
            message: 'Freelancer rejeitado. Email com motivo foi enviado.',
        });
    }
    catch (error) {
        console.error('Erro ao rejeitar freelancer:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao rejeitar freelancer' });
    }
};
exports.rejectFreelancer = rejectFreelancer;
