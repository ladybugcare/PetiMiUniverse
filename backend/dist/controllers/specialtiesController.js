"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpecialties = void 0;
const supabase_1 = require("../config/supabase");
const getSpecialties = async (req, res) => {
    const { category } = req.query;
    let query = supabase_1.supabase.from('specialties').select('*');
    if (category && typeof category === 'string') {
        query = query.eq('category', category);
    }
    const { data, error } = await query.order('name');
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ specialties: data });
};
exports.getSpecialties = getSpecialties;
