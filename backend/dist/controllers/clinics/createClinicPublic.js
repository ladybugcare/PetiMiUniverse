"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClinicPublic = void 0;
const supabase_js_1 = require("../../config/supabase.js");
const crypto_1 = __importDefault(require("crypto"));
/**
 * Fluxo de criação pública de clínicas (cadastro via sign-up)
 * 1️⃣ Cria usuário no Auth
 * 2️⃣ Cria registro na tabela `clinics`
 * 3️⃣ Cria vínculo em `clinic_users` com role 'CADMIN'
 * 4️⃣ Retorna sucesso
 */
const createClinicPublic = async (req, res) => {
    const { name, cnpj, address, email, password } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }
    try {
        console.log('🔹 Criando clínica pública:', email);
        // 1️⃣ Cria usuário no Auth
        const { data: authData, error: authError } = await supabase_js_1.supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: false,
            user_metadata: { type: 'clinic' },
        });
        if (authError || !authData?.user) {
            console.error('Erro ao criar usuário no Auth:', authError);
            return res.status(500).json({ error: 'Erro ao criar usuário no Auth.' });
        }
        const userId = authData.user.id;
        const clinicId = crypto_1.default.randomUUID();
        // 2️⃣ Cria registro na tabela clinics
        const { data: clinic, error: clinicError } = await supabase_js_1.supabase
            .from('clinics')
            .insert([
            {
                id: clinicId,
                name,
                cnpj,
                address,
                email,
                status: 'pending_verification',
                created_at: new Date().toISOString(),
            },
        ])
            .select()
            .single();
        if (clinicError) {
            console.error('Erro ao criar registro de clínica:', clinicError);
            // rollback: deleta user criado
            await supabase_js_1.supabaseAdmin.auth.admin.deleteUser(userId);
            return res.status(500).json({ error: 'Erro ao criar registro da clínica.' });
        }
        // 3️⃣ Vincula usuário na tabela clinic_users
        const { error: clinicUserError } = await supabase_js_1.supabase.from('clinic_users').insert([
            {
                id: crypto_1.default.randomUUID(),
                clinic_id: clinicId,
                user_id: userId,
                role: 'CADMIN',
                status: 'active',
                created_at: new Date().toISOString(),
            },
        ]);
        if (clinicUserError) {
            console.error('Erro ao criar vínculo clinic_users:', clinicUserError);
            await supabase_js_1.supabase.from('clinics').delete().eq('id', clinicId);
            await supabase_js_1.supabaseAdmin.auth.admin.deleteUser(userId);
            return res.status(500).json({ error: 'Erro ao vincular usuário à clínica.' });
        }
        console.log('✅ Clínica criada com sucesso:', clinicId);
        return res.status(201).json({
            success: true,
            message: 'Clínica criada com sucesso!',
            clinic_id: clinicId,
            user_id: userId,
            clinic,
        });
    }
    catch (error) {
        console.error('Erro ao criar clínica pública:', error);
        return res.status(500).json({
            error: error.message || 'Erro interno ao criar clínica pública.',
        });
    }
};
exports.createClinicPublic = createClinicPublic;
