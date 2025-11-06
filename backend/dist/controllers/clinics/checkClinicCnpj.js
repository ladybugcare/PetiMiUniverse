"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkClinicCnpj = void 0;
const supabase_1 = require("../../config/supabase");
const checkClinicCnpj = async (req, res) => {
    const { cnpj } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .select('id')
            .eq('cnpj', cnpj)
            .maybeSingle();
        if (error) {
            console.error('Erro ao buscar CNPJ:', error);
            return res.status(500).json({ error: 'Erro interno ao verificar CNPJ' });
        }
        if (data) {
            return res.json({ exists: true });
        }
        return res.json({ exists: false });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.checkClinicCnpj = checkClinicCnpj;
