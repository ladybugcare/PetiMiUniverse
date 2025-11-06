import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

export const checkClinicCnpj = async (req: Request, res: Response) => {
  const { cnpj } = req.params;

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('id')
      .eq('cnpj', cnpj)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar CNPJ:', error);
      return res.status(500).json({ error: 'Erro interno ao verificar CNPJ' });
    }

    if (data) {
      return res.json({ exists: true });
    }

    return res.json({ exists: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
