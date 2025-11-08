import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

/**
 * ✅ Lista todos os veterinários cadastrados
 */
export const getVets = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('vets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ vets: data || [] });
  } catch (err: any) {
    console.error('Erro ao buscar veterinários:', err);
    return res.status(500).json({
      error: err.message || 'Erro ao buscar lista de veterinários',
    });
  }
};
