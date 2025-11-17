// backend/controllers/admin/getAdmins.ts
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  raw_user_meta_data: {
    role?: string;
    name?: string;
    status?: string;
    [key: string]: any;
  } | null;
};

/**
 * Controller para listar administradores ativos e inativos.
 * Agora consulta diretamente `auth.users` para contornar limites do Admin API.
 */
export const getAdmins = async (req: Request, res: Response) => {
  try {
    const requesterRole = req.user?.role?.toLowerCase();
    if (requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { data, error } = await supabaseAdmin
      .from<AuthUserRow>('auth.users')
      .select('id, email, created_at, last_sign_in_at, raw_user_meta_data')
      .contains('raw_user_meta_data', { role: 'admin' })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao listar administradores:', error);
      return res.status(500).json({ error: 'Erro ao listar administradores' });
    }

    const admins = (data || []).map((user) => {
      const metadata = user.raw_user_meta_data || {};
      return {
        id: user.id,
        name: metadata.name || user.email?.split('@')[0] || 'Sem nome',
        email: user.email,
        status: metadata.status || 'active',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      };
    });

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
