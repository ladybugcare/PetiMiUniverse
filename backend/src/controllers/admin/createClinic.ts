// backend/controllers/admin/createClinic.ts
import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase';
import { createAuthUser } from '../../utils/createAuthUser';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';
import { sendWelcomeEmail } from '../../utils/emailService';
import crypto from 'crypto';

/**
 * Controller para criação de clínicas
 * Fluxo:
 * 1. Cria usuário no Supabase Auth
 * 2. Cria registro na tabela `clinics`
 * 3. Cria vínculo em `clinic_users` (como CADMIN)
 * 4. Envia e-mail de boas-vindas e registra log
 */
export const createClinic = async (req: Request, res: Response) => {
  const adminId = req.user?.id || null;

  const {
    name,
    email,
    password,
    generate_password,
    cnpj,
    clinic_role, // pode vir vazio no fluxo de sign up
    phone,
    address,
    city,
    state,
    status,
  } = req.body;

  try {
    // 1️⃣ Gera senha se necessário
    const finalPassword =
      password ||
      crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);

    // 2️⃣ Cria usuário no Auth (usa helper central)
    const authUser = await createAuthUser(email, finalPassword, name, 'clinic');
    const newUserId = authUser.id;

    // 3️⃣ Cria registro da clínica
    const clinicId = crypto.randomUUID();
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .insert([
        {
          id: clinicId,
          name,
          email,
          cnpj: cnpj || null,
          phone: phone || null,
          address: address || null,
          city: city || null,
          state: state || null,
          status: status || 'active',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (clinicError || !clinic) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(clinicError?.message || 'Erro ao criar registro da clínica');
    }

    // 4️⃣ Vincula usuário à clínica
    // Se veio `clinic_role` (admin criando manualmente), respeita.
    // Caso contrário (signup direto), assume CADMIN.
    const finalRole =
      (clinic_role || '').toUpperCase() === 'MANAGER'
        ? 'CMANAGER'
        : (clinic_role || '').toUpperCase() === 'STAFF'
        ? 'CSTAFF'
        : 'CADMIN'; // padrão

    const { error: clinicUserError } = await supabase.from('clinic_users').insert([
      {
        id: crypto.randomUUID(),
        clinic_id: clinicId,
        user_id: newUserId,
        role: finalRole,
        status: status || 'active',
        created_at: new Date().toISOString(),
      },
    ]);

    if (clinicUserError) {
      console.error('Erro ao vincular usuário à clínica:', clinicUserError);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabase.from('clinics').delete().eq('id', clinicId);
      throw new Error(clinicUserError.message);
    }

    // 5️⃣ Envia e-mail de boas-vindas
    try {
      await sendWelcomeEmail(email, name, 'clinic', finalPassword, !!generate_password);
    } catch (err) {
      console.warn('Erro ao enviar e-mail de boas-vindas:', err);
    }

    // 6️⃣ Registra log (caso tenha sido criado por um admin logado)
    if (adminId) {
      const metadata = extractRequestMetadata(req);
      await createAuditLog({
        user_id: adminId,
        action: 'CREATE_CLINIC',
        entity_type: 'clinic',
        entity_id: clinicId,
        new_values: { name, email, status, role: finalRole },
        ...metadata,
      });
    }

    // ✅ Retorna sucesso
    return res.status(201).json({
      success: true,
      message: 'Clínica criada com sucesso!',
      user_id: newUserId,
      clinic_id: clinicId,
      role: finalRole,
      clinic,
    });
  } catch (error: any) {
    console.error('Erro ao criar clínica:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao criar clínica',
    });
  }
};
