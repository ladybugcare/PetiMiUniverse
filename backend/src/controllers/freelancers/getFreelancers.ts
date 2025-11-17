import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

/**
 * ✅ Lista todos os freelancers cadastrados
 */
export const getFreelancers = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('freelancers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar freelancers:', error);
      return res.status(500).json({
        error: 'Erro ao buscar lista de freelancers',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    return res.json({ freelancers: data || [] });
  } catch (err: any) {
    console.error('Erro inesperado ao buscar freelancers:', err);
    return res.status(500).json({
      error: err.message || 'Erro ao buscar lista de freelancers',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

