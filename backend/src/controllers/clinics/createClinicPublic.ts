import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase.js';
import crypto from 'crypto';
import { normalizeCNPJ } from '../../utils/cnpjUtils.js';

/**
 * Fluxo de criação pública de clínicas (cadastro via sign-up)
 * ✅ NOVO FLUXO:
 * 1️⃣ Cria usuário no Auth
 * 2️⃣ O trigger cria clinic_users com clinic_id = NULL e status = 'pending_clinic'
 * 3️⃣ NÃO cria registro em clinics (será criado quando a primeira unidade for cadastrada)
 * 4️⃣ Retorna sucesso
 */
export const createClinicPublic = async (req: Request, res: Response) => {
  const { name, cnpj, address, email, password } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  try {
    console.log('🔹 Criando usuário de clínica (signup):', email);

    // 1️⃣ Cria usuário no Auth
    // IMPORTANTE: Usa 'role' para acionar o trigger handle_new_user
    // O trigger criará clinic_users com clinic_id = NULL e status = 'pending_clinic'
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ✅ Envia email automaticamente (Inbucket local, Supabase Cloud staging/prod)
      user_metadata: { 
        role: 'clinic', // Trigger procura por 'role'
        name,
        cnpj: cnpj ? normalizeCNPJ(cnpj) : null,
        address,
      },
    });

    if (authError || !authData?.user) {
      console.error('Erro ao criar usuário no Auth:', authError);
      return res.status(500).json({ error: 'Erro ao criar usuário no Auth.' });
    }

    const userId = authData.user.id;

    // 2️⃣ Verifica se clinic_users foi criado pelo trigger
    // O trigger handle_new_user deve ter criado clinic_users com clinic_id = NULL
    const { data: existingClinicUser, error: fetchError } = await supabase
      .from('clinic_users')
      .select('id, status, clinic_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('Erro ao verificar clinic_users:', fetchError);
      // Rollback: deleta user criado
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Erro ao verificar vínculo do usuário.' });
    }

    // Se o trigger não criou, cria manualmente
    if (!existingClinicUser) {
      console.log('🔹 Trigger não criou clinic_users, criando manualmente...');
      const { error: insertError } = await supabase.from('clinic_users').insert([
        {
          id: crypto.randomUUID(),
          user_id: userId,
          clinic_id: null, // ✅ NULL até criar primeira unidade
          unit_id: null,   // ✅ NULL até criar primeira unidade
          role: 'CADMIN',
          status: 'pending_clinic', // ✅ Status: aguardando criar clínica
          created_at: new Date().toISOString(),
        },
      ]);

      if (insertError) {
        console.error('Erro ao criar clinic_users:', insertError);
        // Rollback: deleta user criado
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return res.status(500).json({ error: 'Erro ao criar vínculo do usuário.' });
      }
    } else {
      // Atualiza clinic_users se necessário (garantir role e status corretos)
      if (existingClinicUser.status !== 'pending_clinic' || existingClinicUser.clinic_id !== null) {
        console.log('🔹 Atualizando clinic_users para status correto...');
        const { error: updateError } = await supabase
          .from('clinic_users')
          .update({
            clinic_id: null, // ✅ Garantir que é NULL
            status: 'pending_clinic', // ✅ Status correto
            role: 'CADMIN',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingClinicUser.id);

        if (updateError) {
          console.error('Erro ao atualizar clinic_users:', updateError);
          // Rollback: deleta user criado
          await supabaseAdmin.auth.admin.deleteUser(userId);
          return res.status(500).json({ error: 'Erro ao atualizar vínculo do usuário.' });
        }
      }
    }

    // ❌ NÃO criar registro em clinics aqui!
    // A clinic será criada quando o usuário criar a primeira unidade

    console.log('✅ Usuário de clínica criado com sucesso (aguardando criação da primeira unidade):', userId);

    return res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso! Agora você pode criar sua primeira unidade.',
      user_id: userId,
      needs_onboarding: true, // Indica que precisa criar primeira unidade
      clinic_id: null, // Ainda não tem clínica
    });
  } catch (error: any) {
    console.error('Erro ao criar usuário de clínica:', error);
    return res.status(500).json({
      error: error.message || 'Erro interno ao criar usuário de clínica.',
    });
  }
};
