import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

export const getClinics = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('clinics')
      .select('*')
      .order('created_at', { ascending: false });

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
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
