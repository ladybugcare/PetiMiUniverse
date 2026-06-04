"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveClinic = void 0;
const supabase_1 = require("../config/supabase");
/**
 * Garante que a clínica pode operar antes de criar demanda / marketplace / etc.
 * Usa service role para ler `clinics` (evita falsos 404 com RLS no client anon).
 * `pending_approval`: permitido se existir pelo menos uma unidade `approved` ou `active`.
 * Bloqueia: `pending_unit`, `pending_approval` sem unidade aprovada, `suspended`, `rejected`.
 */
const requireActiveClinic = async (req, res, next) => {
    try {
        // Try to get clinic_id from body, params, or query
        const clinic_id = req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;
        if (!clinic_id) {
            return res.status(400).json({ error: 'clinic_id é obrigatório' });
        }
        const { data: clinic, error } = await supabase_1.supabaseAdmin
            .from('clinics')
            .select('status')
            .eq('id', clinic_id)
            .single();
        if (error || !clinic) {
            return res.status(404).json({ error: 'Clínica não encontrada' });
        }
        if (clinic.status === 'pending_unit') {
            return res.status(403).json({
                error: 'Sua clínica precisa criar a primeira unidade.',
                status: 'pending_unit',
                action_required: 'create_first_unit'
            });
        }
        if (clinic.status === 'pending_approval') {
            const { count, error: unitsCountError } = await supabase_1.supabaseAdmin
                .from('units')
                .select('*', { count: 'exact', head: true })
                .eq('clinic_id', clinic_id)
                .in('status', ['approved', 'active']);
            if (!unitsCountError && (count ?? 0) > 0) {
                return next();
            }
            return res.status(403).json({
                error: 'Aguarde a aprovação da sua unidade pelo ADMIN.',
                status: 'pending_approval',
                action_required: 'wait_approval',
            });
        }
        if (clinic.status === 'suspended') {
            return res.status(403).json({
                error: 'Sua clínica está suspensa. Entre em contato com o suporte.',
                status: 'suspended'
            });
        }
        if (clinic.status === 'rejected') {
            return res.status(403).json({
                error: 'Sua unidade foi reprovada. Crie uma nova unidade para análise.',
                status: 'rejected',
                action_required: 'create_first_unit'
            });
        }
        if (clinic.status !== 'active') {
            return res.status(403).json({
                error: 'Sua clínica não está ativa. Entre em contato com o suporte.',
                status: clinic.status
            });
        }
        // Clinic is active, proceed
        next();
    }
    catch (error) {
        console.error('Error in requireActiveClinic middleware:', error);
        res.status(500).json({ error: 'Erro ao verificar status da clínica' });
    }
};
exports.requireActiveClinic = requireActiveClinic;
