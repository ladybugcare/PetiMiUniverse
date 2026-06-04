"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFreelancerById = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * ✅ Retorna os detalhes de um freelancer específico pelo ID
 */
const getFreelancerById = async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ error: 'ID do freelancer é obrigatório.' });
    }
    try {
        const { data, error } = await supabase_1.supabase
            .from('freelancers')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            throw error;
        if (!data) {
            return res.status(404).json({ error: 'Freelancer não encontrado.' });
        }
        return res.json({ freelancer: data });
    }
    catch (err) {
        console.error('Erro ao buscar freelancer por ID:', err);
        return res.status(500).json({
            error: err.message || 'Erro ao buscar dados do freelancer',
        });
    }
};
exports.getFreelancerById = getFreelancerById;
