import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

/**
 * ✅ Lista todos os freelancers cadastrados
 */
export const getFreelancers = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('freelancers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ freelancers: data || [] });
  } catch (err: any) {
    console.error('Erro ao buscar freelancers:', err);
    return res.status(500).json({
      error: err.message || 'Erro ao buscar lista de freelancers',
    });
  }
};

