import type { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase';
import { checkClinicAccess } from '../../middleware/authMiddleware';

/** Utilizador autenticado via Bearer (Hub / painel clínica). */
async function resolveAuthUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

export const getClinicById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const userId = await resolveAuthUserId(req);

    // Sessão Hub: RLS do client anon costuma bloquear — usar service role após validar acesso
    if (userId) {
      const hasAccess = await checkClinicAccess(userId, id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { data, error } = await supabaseAdmin
        .from('clinics')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar clínica (admin):', error);
        return res.status(500).json({ error: 'Erro ao buscar clínica' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Clínica não encontrada' });
      }

      return res.json({ clinic: data });
    }

    // Leitura pública (marketplace / sem token) — sujeita a RLS
    const { data, error } = await supabase.from('clinics').select('*').eq('id', id).maybeSingle();

    if (error) {
      console.error('Erro ao buscar clínica:', error);
      return res.status(500).json({ error: 'Erro ao buscar clínica' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Clínica não encontrada' });
    }

    return res.json({ clinic: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
