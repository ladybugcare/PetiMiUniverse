import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

/**
 * ✅ Lista todos os veterinários cadastrados
 */
export const getVets = async (_req: Request, res: Response) => {
  try {
    // Adicionar timeout e limite para evitar queries muito lentas
    const queryPromise = supabaseAdmin
      .from('vets')
      .select('id, name, email, crmv, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(1000); // Limite para evitar queries muito grandes

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 25000)
    );

    const { data, error } = await Promise.race([
      queryPromise,
      timeoutPromise
    ]) as any;

    if (error) {
      console.error('Erro ao buscar veterinários:', error);
      return res.status(500).json({
        error: 'Erro ao buscar lista de veterinários',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    return res.json({ vets: data || [] });
  } catch (err: any) {
    console.error('Erro inesperado ao buscar veterinários:', err);
    if (err.message === 'Query timeout') {
      return res.status(504).json({ 
        error: 'A requisição demorou muito para responder',
        details: 'Timeout ao buscar veterinários'
      });
    }
    return res.status(500).json({
      error: err.message || 'Erro ao buscar lista de veterinários',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
