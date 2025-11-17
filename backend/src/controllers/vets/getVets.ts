import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

/**
 * ✅ Lista todos os veterinários cadastrados
 */
export const getVets = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('vets')
      .select('*')
      .order('created_at', { ascending: false });

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
    return res.status(500).json({
      error: err.message || 'Erro ao buscar lista de veterinários',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
