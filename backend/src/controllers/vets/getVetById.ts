import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

/**
 * ✅ Retorna os detalhes de um veterinário específico pelo ID
 */
export const getVetById = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID do veterinário é obrigatório.' });
  }

  try {
    const { data, error } = await supabase
      .from('vets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Veterinário não encontrado.' });
    }

    return res.json(data);
  } catch (err: any) {
    console.error('Erro ao buscar veterinário por ID:', err);
    return res.status(500).json({
      error: err.message || 'Erro ao buscar dados do veterinário',
    });
  }
};
