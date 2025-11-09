import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

/**
 * ✅ Retorna os detalhes de um freelancer específico pelo ID
 */
export const getFreelancerById = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID do freelancer é obrigatório.' });
  }

  try {
    const { data, error } = await supabase
      .from('freelancers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Freelancer não encontrado.' });
    }

    return res.json({ freelancer: data });
  } catch (err: any) {
    console.error('Erro ao buscar freelancer por ID:', err);
    return res.status(500).json({
      error: err.message || 'Erro ao buscar dados do freelancer',
    });
  }
};

