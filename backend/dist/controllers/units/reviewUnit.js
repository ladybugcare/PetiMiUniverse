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
        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }
        // 1️⃣ Verifica se a unidade existe e obtém dados completos (service role — RLS não bloqueia admin)
        const { data: existing, error: fetchError } = await supabase_1.supabaseAdmin
            .from('units')
            .select('id, name, status, clinic_id, is_main')
            .eq('id', id)
            .maybeSingle();
        if (fetchError || !existing) {
            return res.status(404).json({ success: false, error: 'Unidade não encontrada' });
        }
        // 2️⃣ Define novo status (schema novo: approved/rejected; schema legado: só active/inactive)
        const newStatus = approved ? 'approved' : 'rejected';
        const unitUpdatePayload = {
            status: newStatus,
            rejection_reason: approved ? null : rejection_reason || 'Sem motivo especificado',
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminId,
        };
        // 3️⃣ Atualiza unidade no banco
        let { error: updateError } = await supabase_1.supabaseAdmin
            .from('units')
            .update(unitUpdatePayload)
            .eq('id', id);
        let finalStatus = newStatus;
        if (updateError?.message?.includes('units_status_check')) {
            const legacyStatus = approved ? 'active' : 'inactive';
            console.warn(`[reviewUnit] units_status_check rejected "${newStatus}". Retrying with legacy status "${legacyStatus}". ` +
                'Execute backend/database_migrations/petimi_vet/fix_units_status_constraint.sql (ou backend/database_migrations/petimi_vet/add_clinic_approval_system.sql) no Supabase.');
            const retry = await supabase_1.supabaseAdmin
                .from('units')
                .update({ ...unitUpdatePayload, status: legacyStatus })
                .eq('id', id);
            if (retry.error)
                throw retry.error;
            finalStatus = legacyStatus;
        }
        else if (updateError) {
            throw updateError;
        }
        // 4️⃣ Se aprovando e for unidade principal, ativa a clínica
        if (approved && existing.is_main && existing.clinic_id) {
            await supabase_1.supabaseAdmin
                .from('clinics')
                .update({ status: 'active' })
                .eq('id', existing.clinic_id);
            // Ativa usuários da clínica
            await supabase_1.supabaseAdmin
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
            await supabase_1.supabaseAdmin
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
            new_values: { status: finalStatus, rejection_reason },
            ...metadata,
        });
        return res.status(200).json({
            success: true,
            status: finalStatus,
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
