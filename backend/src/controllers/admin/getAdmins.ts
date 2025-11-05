// backend/controllers/admin/getAdmins.ts
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

/**
 * Controller para listar administradores ativos e inativos.
 * Agora usa `user_metadata.status` como referência principal.
 */
export const getAdmins = async (req: Request, res: Response) => {
  try {
    // 🔹 Lista todos os usuários do Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error('Erro ao listar administradores:', error);
      return res.status(500).json({ error: 'Erro ao listar administradores' });
    }

    // 🔹 Filtra somente os admins
    const admins = data.users
      .filter((user) => user.user_metadata?.role === 'admin')
      .map((user) => ({
        id: user.id,
        name: user.user_metadata?.name || 'Sem nome',
        email: user.email,
        status: user.user_metadata?.status || 'active', // 👈 agora vem de user_metadata
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      }));

    // 🔹 Loga o acesso à listagem
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: req.user?.id || 'system',
      action: 'LIST_ADMINS',
      entity_type: 'admin',
      entity_id: 'bulk',
      new_values: { count: admins.length },
      ...metadata,
    });

    return res.status(200).json({ admins });
  } catch (error: any) {
    console.error('Erro inesperado ao buscar administradores:', error);
    return res.status(500).json({
      error: error.message || 'Erro inesperado ao listar administradores',
    });
  }
};
