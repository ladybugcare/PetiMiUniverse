"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClinicById = void 0;
const supabase_1 = require("../../config/supabase");
const getClinicById = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) {
            console.error('Erro ao buscar clínica:', error);
            return res.status(500).json({ error: 'Erro ao buscar clínica' });
        }
        if (!data) {
            return res.status(404).json({ error: 'Clínica não encontrada' });
        }
        return res.json({ clinic: data });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.getClinicById = getClinicById;
