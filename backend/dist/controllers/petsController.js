"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPets = exports.createPet = void 0;
const supabase_1 = require("../config/supabase");
const createPet = async (req, res) => {
    const { name, species, breed, age, owner_id } = req.body;
    const { data, error } = await supabase_1.supabase
        .from('pets')
        .insert([{ name, species, breed, age, owner_id }])
        .select();
    if (error)
        return res.status(400).json({ error });
    res.status(201).json({ pet: data[0] });
};
exports.createPet = createPet;
const getPets = async (_req, res) => {
    const { data, error } = await supabase_1.supabase.from('pets').select('*');
    if (error)
        return res.status(400).json({ error });
    res.json({ pets: data });
};
exports.getPets = getPets;
