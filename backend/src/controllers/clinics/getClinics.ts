import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

export const getClinics = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar clínicas:', error);
      return res.status(500).json({ error: 'Erro ao buscar clínicas' });
    }

    return res.json({ clinics: data || [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
