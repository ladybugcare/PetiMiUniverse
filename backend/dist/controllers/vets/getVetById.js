"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVetById = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * ✅ Retorna os detalhes de um veterinário específico pelo ID
 * Usa supabaseAdmin para não depender de RLS (o cliente anon do backend não carrega a sessão do vet).
 * Alinhado a getVets / getPendingVets, que já leem `vets` via service role.
 */
const getVetById = async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ error: 'ID do veterinário é obrigatório.' });
    }
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('vets')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            throw error;
        if (!data) {
            return res.status(404).json({ error: 'Veterinário não encontrado.' });
        }
        return res.json({ vet: data });
    }
    catch (err) {
        console.error('Erro ao buscar veterinário por ID:', err);
        return res.status(500).json({
            error: err.message || 'Erro ao buscar dados do veterinário',
        });
    }
};
exports.getVetById = getVetById;
