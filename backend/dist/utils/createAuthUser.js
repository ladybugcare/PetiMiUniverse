"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthUser = void 0;
// backend/utils/createAuthUser.ts
const supabase_1 = require("../config/supabase");
const createAuthUser = async (email, password, name, role) => {
    const { data, error } = await supabase_1.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'VET', name },
    });
    if (error || !data?.user) {
        console.error('Erro ao criar usuário no Supabase Auth:', error);
        throw new Error(error?.message || 'Falha ao criar usuário de autenticação');
    }
    return data.user;
};
exports.createAuthUser = createAuthUser;
