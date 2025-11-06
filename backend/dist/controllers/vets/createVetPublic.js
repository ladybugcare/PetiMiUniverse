"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVetPublic = void 0;
const supabase_1 = require("../../config/supabase");
const createAuthUser_1 = require("../../utils/createAuthUser");
/**
 * ===========================================================
 * 🩺 Controller: Cadastro público de veterinários
 * ===========================================================
 */
const createVetPublic = async (req, res) => {
    const { name, crmv, specialties, experience, email, password } = req.body;
    try {
        // 1️⃣ Cria usuário no Auth
        const authUser = await (0, createAuthUser_1.createAuthUser)(email, password, name, 'vet');
        const newUserId = authUser.id;
        // 2️⃣ Cria registro em "vets"
        const { data: vet, error: vetError } = await supabase_1.supabase
            .from('vets')
            .insert([
            {
                id: newUserId,
                name,
                crmv,
                specialties,
                experience,
                email,
                created_at: new Date().toISOString(),
            },
        ])
            .select()
            .single();
        if (vetError || !vet) {
            await supabase_1.supabaseAdmin.auth.admin.deleteUser(newUserId);
            throw new Error(vetError?.message || 'Erro ao criar veterinário');
        }
        return res.status(201).json({
            success: true,
            message: 'Veterinário cadastrado com sucesso!',
            vet,
        });
    }
    catch (error) {
        console.error('Erro ao cadastrar veterinário:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Erro interno ao cadastrar veterinário',
        });
    }
};
exports.createVetPublic = createVetPublic;
