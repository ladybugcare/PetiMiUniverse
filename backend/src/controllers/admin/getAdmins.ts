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

    // Tentar usar Admin API com paginação para evitar problemas
    let allUsers: any[] = [];
    let page = 1;
    const perPage = 1000;
    let hasMore = true;

    while (hasMore) {
      try {
        const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

        if (usersError) {
          console.error(`Erro ao listar administradores (página ${page}):`, usersError);
          // Se for erro de database, tentar abordagem alternativa
          if (usersError.message?.includes('Database error')) {
            console.warn('Admin API falhou, retornando lista vazia');
            return res.status(200).json({ admins: [] });
          }
          throw usersError;
        }

        if (usersData?.users && usersData.users.length > 0) {
          allUsers = allUsers.concat(usersData.users);
          hasMore = usersData.users.length === perPage;
          page++;
        } else {
          hasMore = false;
        }
      } catch (apiError: any) {
        console.error('Erro na Admin API:', apiError);
        // Se a Admin API falhar completamente, retornar lista vazia em vez de erro
        if (apiError.message?.includes('Database error')) {
          console.warn('Admin API com erro de database, retornando lista vazia');
          return res.status(200).json({ admins: [] });
        }
        throw apiError;
      }
    }

    // Filtrar apenas admins
    const admins = allUsers
      .filter((user) => {
        const role = user.user_metadata?.role || user.raw_user_meta_data?.role;
        return role === 'admin';
      })
      .map((user) => {
        const metadata = user.user_metadata || user.raw_user_meta_data || {};
        return {
          id: user.id,
          name: metadata.name || user.email?.split('@')[0] || 'Sem nome',
          email: user.email || '',
          status: metadata.status || 'active',
          created_at: user.created_at || new Date().toISOString(),
          last_sign_in_at: user.last_sign_in_at || null,
        };
      });

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
