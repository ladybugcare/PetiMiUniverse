"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFreelancers = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * ✅ Lista todos os freelancers cadastrados
 */
const getFreelancers = async (_req, res) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('freelancers')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Erro ao buscar freelancers:', error);
            return res.status(500).json({
                error: 'Erro ao buscar lista de freelancers',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
        return res.json({ freelancers: data || [] });
    }
    catch (err) {
        console.error('Erro inesperado ao buscar freelancers:', err);
        return res.status(500).json({
            error: err.message || 'Erro ao buscar lista de freelancers',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};
exports.getFreelancers = getFreelancers;
