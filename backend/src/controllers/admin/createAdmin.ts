// backend/controllers/admin/createAdmin.ts
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuthUser } from '../../utils/createAuthUser';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';
import { sendWelcomeEmail } from '../../utils/emailService';
import crypto from 'crypto';

/**
 * Controller para criação de administradores pelo painel.
 * Fluxo:
 * 1️⃣ Cria usuário no Supabase Auth
 * 2️⃣ Define o papel como "admin"
 * 3️⃣ (Opcional) Bloqueia se status = inactive
 * 4️⃣ Envia e-mail de boas-vindas
 * 5️⃣ Registra log de auditoria
 */
export const createAdmin = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const {
    name,
    email,
    password,
    generate_password,
    status = 'active',
  } = req.body;

  try {
    // 1️⃣ Gera senha se necessário
    const finalPassword =
      password ||
      crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);

    // 2️⃣ Cria usuário no Auth (com role = 'admin' no user_metadata)
    const authUser = await createAuthUser(email, finalPassword, name, 'admin');
    const newUserId = authUser.id;

    // 3️⃣ Se marcado como "inactive", bloqueia via ban_duration (campo correto do Supabase)
    if (status === 'inactive') {
      await supabaseAdmin.auth.admin.updateUserById(newUserId, {
        // Exemplo: 8760h = 1 ano de bloqueio — você pode ajustar esse valor
        ban_duration: '8760h',
      });
    }

    // 4️⃣ Envia e-mail de boas-vindas
    try {
      await sendWelcomeEmail(email, name, 'admin', finalPassword, !!generate_password);
    } catch (err) {
      console.warn('Erro ao enviar e-mail de boas-vindas:', err);
    }

    // 5️⃣ Log de auditoria
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: adminId,
      action: 'CREATE_ADMIN',
      entity_type: 'admin',
      entity_id: newUserId,
      new_values: { name, email, status },
      ...metadata,
    });

    // ✅ Retorno de sucesso
    return res.status(201).json({
      success: true,
      message: 'Administrador criado com sucesso!',
      user: {
        id: newUserId,
        name,
        email,
        role: 'admin',
        status,
      },
    });
  } catch (error: any) {
    console.error('Erro ao criar administrador:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao criar administrador',
    });
  }
};
