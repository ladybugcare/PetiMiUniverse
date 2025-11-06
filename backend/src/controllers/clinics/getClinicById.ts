import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

export const getClinicById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar clínica:', error);
      return res.status(500).json({ error: 'Erro ao buscar clínica' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Clínica não encontrada' });
    }

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
