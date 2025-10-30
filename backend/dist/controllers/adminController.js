"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewUnit = exports.getPendingUnits = void 0;
const supabase_1 = require("../config/supabase");
const auditLog_1 = require("../utils/auditLog");
// Listar unidades pendentes de aprovação
const getPendingUnits = async (req, res) => {
    try {
        // Verificar se é ADMIN
        const user = req.user;
        const userRole = user.user_metadata?.role || user.raw_user_meta_data?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const { data: units, error } = await supabase_1.supabase
            .from('units')
            .select(`
        *,
        clinic:clinics!inner(id, name, email, cnpj, phone)
      `)
            .eq('status', 'pending_review')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({ units });
    }
    catch (error) {
        console.error('Error fetching pending units:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.getPendingUnits = getPendingUnits;
// Aprovar ou reprovar unidade
const reviewUnit = async (req, res) => {
    const { id } = req.params;
    const { approved, rejection_reason } = req.body;
    const admin_id = req.user.id;
    try {
        // Verificar se é ADMIN
        const userRole = req.user?.user_metadata?.role || req.user?.raw_user_meta_data?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const newStatus = approved ? 'approved' : 'rejected';
        // Buscar unidade e clínica
        const { data: unit, error: unitFetchError } = await supabase_1.supabase
            .from('units')
            .select('clinic_id, status')
            .eq('id', id)
            .single();
        if (unitFetchError || !unit) {
            return res.status(404).json({ error: 'Unidade não encontrada' });
        }
        if (unit.status !== 'pending_review') {
            return res.status(400).json({ error: 'Unidade não está pendente de aprovação' });
        }
        // Atualizar unidade
        await supabase_1.supabase
            .from('units')
            .update({
            status: newStatus,
            reviewed_by: admin_id,
            reviewed_at: new Date().toISOString(),
            rejection_reason: rejection_reason || null
        })
            .eq('id', id);
        if (approved) {
            // Ativar clínica
            await supabase_1.supabase
                .from('clinics')
                .update({ status: 'active' })
                .eq('id', unit.clinic_id);
            // Ativar todos clinic_users desta clínica
            await supabase_1.supabase
                .from('clinic_users')
                .update({
                status: 'active',
                accepted_at: new Date().toISOString()
            })
                .eq('clinic_id', unit.clinic_id)
                .eq('status', 'pending_activation');
            // TODO: Enviar email de aprovação
        }
        else {
            // Voltar status da clínica para pending_unit
            await supabase_1.supabase
                .from('clinics')
                .update({ status: 'pending_unit' })
                .eq('id', unit.clinic_id);
            // Remover vínculo de unit_id do CADMIN
            await supabase_1.supabase
                .from('clinic_users')
                .update({ unit_id: null })
                .eq('clinic_id', unit.clinic_id)
                .eq('role', 'CADMIN');
            // TODO: Enviar email de rejeição
        }
        // Audit log
        const metadata = (0, auditLog_1.extractRequestMetadata)(req);
        await (0, auditLog_1.createAuditLog)({
            user_id: admin_id,
            clinic_id: unit.clinic_id,
            unit_id: id,
            action: approved ? 'APPROVE_UNIT' : 'REJECT_UNIT',
            entity_type: 'unit',
            entity_id: id,
            new_values: { status: newStatus, rejection_reason },
            ...metadata,
        });
        res.json({
            success: true,
            status: newStatus,
            message: approved ? 'Unidade aprovada!' : 'Unidade reprovada'
        });
    }
    catch (error) {
        console.error('Error reviewing unit:', error);
        res.status(500).json({ error: 'Erro ao revisar unidade' });
    }
};
exports.reviewUnit = reviewUnit;
