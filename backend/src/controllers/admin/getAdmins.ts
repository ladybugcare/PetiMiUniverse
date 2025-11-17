// backend/controllers/admin/getAdmins.ts
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

/**
 * Controller para listar administradores ativos e inativos.
 * Usa Admin API do Supabase para listar usuários e filtra por role.
 */
export const getAdmins = async (req: Request, res: Response) => {
  try {
    const requesterRole = req.user?.role?.toLowerCase();
    if (requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Usar Admin API para listar todos os usuários
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error('Erro ao listar administradores:', usersError);
      return res.status(500).json({ 
        error: 'Erro ao listar administradores',
        details: process.env.NODE_ENV === 'development' ? usersError.message : undefined
      });
    }

    // Filtrar apenas admins
    const admins = (usersData?.users || [])
      .filter((user) => user.user_metadata?.role === 'admin')
      .map((user) => ({
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Sem nome',
        email: user.email || '',
        status: user.user_metadata?.status || 'active',
        created_at: user.created_at || new Date().toISOString(),
        last_sign_in_at: user.last_sign_in_at || null,
      }));

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
