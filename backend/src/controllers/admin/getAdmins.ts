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

    // Verificar se SUPABASE_SERVICE_ROLE_KEY está configurado
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('🚨 SUPABASE_SERVICE_ROLE_KEY não configurado');
      return res.status(500).json({ 
        error: 'Erro ao listar administradores: Configuração do Supabase incompleta',
        details: process.env.NODE_ENV === 'development' ? 'SUPABASE_SERVICE_ROLE_KEY não encontrado' : undefined
      });
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

    if (!usersData) {
      console.error('usersData é null ou undefined');
      return res.status(500).json({ 
        error: 'Erro ao listar administradores: Resposta inválida do Supabase'
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

    // Tentar criar audit log, mas não falhar se der erro
    try {
      const metadata = extractRequestMetadata(req);
      await createAuditLog({
        user_id: req.user?.id || 'system',
        action: 'LIST_ADMINS',
        entity_type: 'admin',
        entity_id: 'bulk',
        new_values: { count: admins.length },
        ...metadata,
      });
    } catch (auditError: any) {
      console.warn('Erro ao criar audit log (não crítico):', auditError?.message);
      // Não falhar a requisição por causa do audit log
    }

    return res.status(200).json({ admins });
  } catch (error: any) {
    console.error('Erro inesperado ao buscar administradores:', error);
    return res.status(500).json({
      error: error.message || 'Erro inesperado ao listar administradores',
    });
  }
};
