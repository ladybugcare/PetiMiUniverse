import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase.js';
import crypto from 'crypto';

/**
 * Fluxo de criação pública de clínicas (cadastro via sign-up)
 * 1️⃣ Cria usuário no Auth
 * 2️⃣ Cria registro na tabela `clinics`
 * 3️⃣ Cria vínculo em `clinic_users` com role 'CADMIN'
 * 4️⃣ Retorna sucesso
 */
export const createClinicPublic = async (req: Request, res: Response) => {
  const { name, cnpj, address, email, password } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  try {
    console.log('🔹 Criando clínica pública:', email);

    // 1️⃣ Cria usuário no Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
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
    const clinicId = crypto.randomUUID();

    // 2️⃣ Cria registro na tabela clinics
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .insert([
        {
          id: clinicId,
          name,
          cnpj,
          address,
          email,
          status: 'pending_email', // Aguardando confirmação de email          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (clinicError) {
      console.error('Erro ao criar registro de clínica:', clinicError);
      // rollback: deleta user criado
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Erro ao criar registro da clínica.' });
    }

    // 3️⃣ Vincula usuário na tabela clinic_users
    const { error: clinicUserError } = await supabase.from('clinic_users').insert([
      {
        id: crypto.randomUUID(),
        clinic_id: clinicId,
        user_id: userId,
        role: 'CADMIN',
        status: 'active',
        created_at: new Date().toISOString(),
      },
    ]);

    if (clinicUserError) {
      console.error('Erro ao criar vínculo clinic_users:', clinicUserError);
      await supabase.from('clinics').delete().eq('id', clinicId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
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
  } catch (error: any) {
    console.error('Erro ao criar clínica pública:', error);
    return res.status(500).json({
      error: error.message || 'Erro interno ao criar clínica pública.',
    });
  }
};
