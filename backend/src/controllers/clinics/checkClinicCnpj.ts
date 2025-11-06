import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { normalizeCNPJ } from '../../utils/cnpjUtils';

export const checkClinicCnpj = async (req: Request, res: Response) => {
  const { cnpj } = req.params;
  
  // Normaliza o CNPJ (remove formatação) para garantir busca consistente
  const normalizedCnpj = normalizeCNPJ(cnpj);
  
  if (!normalizedCnpj || normalizedCnpj.length !== 14) {
    return res.status(400).json({ error: 'CNPJ inválido' });
  }

  try {
    // Busca usando CNPJ normalizado
    // Como agora salvamos sempre normalizado, a busca é simples
    const { data, error } = await supabase
      .from('clinics')
      .select('id')
      .eq('cnpj', normalizedCnpj)
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
