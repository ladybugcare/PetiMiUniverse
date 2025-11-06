"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkVetEmail = void 0;
const supabase_1 = require("../../config/supabase");
const checkVetEmail = async (req, res) => {
    const { email } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from('vets')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (error)
            throw error;
        return res.json({ exists: !!data });
    }
    catch (error) {
        console.error('Erro ao verificar email:', error);
        return res.status(500).json({ error: 'Erro ao verificar email' });
    }
};
exports.checkVetEmail = checkVetEmail;
