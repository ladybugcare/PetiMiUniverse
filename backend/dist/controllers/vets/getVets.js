"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVets = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * ✅ Lista todos os veterinários cadastrados
 */
const getVets = async (_req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return res.json({ vets: data || [] });
    }
    catch (err) {
        console.error('Erro ao buscar veterinários:', err);
        return res.status(500).json({
            error: err.message || 'Erro ao buscar lista de veterinários',
        });
    }
};
exports.getVets = getVets;
