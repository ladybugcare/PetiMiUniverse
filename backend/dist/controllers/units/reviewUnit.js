"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewUnit = void 0;
const supabase_1 = require("../../config/supabase");
const auditLog_1 = require("../../utils/auditLog");
/**
 * Permite que um administrador aprove ou rejeite uma unidade.
 * Funciona tanto para unidades pendentes quanto já aprovadas.
 */
const reviewUnit = async (req, res) => {
    const { id } = req.params;
    const { approved, rejection_reason } = req.body;
    const adminId = req.user?.id || 'system';
    try {
        // 1️⃣ Verifica se a unidade existe e obtém dados completos
        const { data: existing, error: fetchError } = await supabase_1.supabase
            .from('units')
            .select('id, name, status, clinic_id, is_main')
            .eq('id', id)
            .maybeSingle();
        if (fetchError || !existing) {
            return res.status(404).json({ success: false, error: 'Unidade não encontrada' });
        }
        // 2️⃣ Define novo status
        const newStatus = approved ? 'approved' : 'rejected';
        // 3️⃣ Atualiza unidade no banco
        const { error: updateError } = await supabase_1.supabase
            .from('units')
            .update({
            status: newStatus,
            rejection_reason: approved ? null : rejection_reason || 'Sem motivo especificado',
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminId,
        })
            .eq('id', id);
        if (updateError)
            throw updateError;
        // 4️⃣ Se aprovando e for unidade principal, ativa a clínica
        if (approved && existing.is_main && existing.clinic_id) {
            await supabase_1.supabase
                .from('clinics')
                .update({ status: 'active' })
                .eq('id', existing.clinic_id);
            // Ativa usuários da clínica
            await supabase_1.supabase
                .from('clinic_users')
                .update({
                status: 'active',
                accepted_at: new Date().toISOString(),
            })
                .eq('clinic_id', existing.clinic_id)
                .eq('status', 'pending_activation');
        }
        // 5️⃣ Se rejeitando e for unidade principal, volta clínica para pending_unit
        if (!approved && existing.is_main && existing.clinic_id) {
            await supabase_1.supabase
                .from('clinics')
                .update({ status: 'pending_unit' })
                .eq('id', existing.clinic_id);
        }
        // 6️⃣ Cria log de auditoria
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id: adminId,
            action: approved ? 'APPROVE_UNIT' : 'REJECT_UNIT',
            entity_type: 'unit',
            entity_id: id,
            new_values: { status: newStatus, rejection_reason },
            ...metadata,
        });
        return res.status(200).json({
            success: true,
            status: newStatus,
            message: approved
                ? 'Unidade aprovada com sucesso!'
                : 'Unidade rejeitada e arquivada com sucesso.',
        });
    }
    catch (error) {
        console.error('Erro ao revisar unidade:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erro interno ao revisar unidade',
        });
    }
};
exports.reviewUnit = reviewUnit;
