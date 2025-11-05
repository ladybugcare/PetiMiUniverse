// backend/utils/createAuthUser.ts
import { supabaseAdmin } from '../config/supabase';

export const createAuthUser = async (
  email: string,
  password: string,
  name: string,
  role: string
) => {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
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
