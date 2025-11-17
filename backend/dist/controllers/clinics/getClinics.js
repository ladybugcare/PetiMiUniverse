"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClinics = void 0;
const supabase_1 = require("../../config/supabase");
const getClinics = async (_req, res) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('clinics')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Erro ao buscar clínicas:', error);
            return res.status(500).json({
                error: 'Erro ao buscar clínicas',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
        return res.json({ clinics: data || [] });
    }
    catch (err) {
        console.error('Erro inesperado ao buscar clínicas:', err);
        return res.status(500).json({
            error: 'Erro interno do servidor',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};
exports.getClinics = getClinics;
