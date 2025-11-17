import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

export const getClinics = async (_req: Request, res: Response) => {
  try {
    // Adicionar timeout e limite para evitar queries muito lentas
    const queryPromise = supabaseAdmin
      .from('clinics')
      .select('id, name, email, cnpj, status, created_at, updated_at, deleted_at')
      .order('created_at', { ascending: false })
      .limit(1000); // Limite para evitar queries muito grandes

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 25000)
    );

    const result = await Promise.race([
      queryPromise,
      timeoutPromise
    ]);

    const { data, error } = result;

    if (error) {
      console.error('Erro ao buscar clínicas:', error);
      return res.status(500).json({ 
        error: 'Erro ao buscar clínicas',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    return res.json({ clinics: data || [] });
  } catch (err: any) {
    console.error('Erro inesperado ao buscar clínicas:', err);
    if (err.message === 'Query timeout') {
      return res.status(504).json({ 
        error: 'A requisição demorou muito para responder',
        details: 'Timeout ao buscar clínicas'
      });
    }
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
