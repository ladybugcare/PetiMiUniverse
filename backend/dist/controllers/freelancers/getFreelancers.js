"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFreelancers = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * ✅ Lista todos os freelancers cadastrados
 */
const getFreelancers = async (_req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('freelancers')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return res.json({ freelancers: data || [] });
    }
    catch (err) {
        console.error('Erro ao buscar freelancers:', err);
        return res.status(500).json({
            error: err.message || 'Erro ao buscar lista de freelancers',
        });
    }
};
exports.getFreelancers = getFreelancers;
