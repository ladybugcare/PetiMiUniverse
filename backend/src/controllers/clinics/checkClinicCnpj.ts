import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { normalizeCNPJ } from '../../utils/cnpjUtils';

export const checkClinicCnpj = async (req: Request, res: Response) => {
  const { cnpj } = req.params;
  
  console.log('[checkClinicCnpj] Recebido CNPJ:', cnpj);
  
  // Normaliza o CNPJ (remove formatação) para garantir busca consistente
  const normalizedCnpj = normalizeCNPJ(cnpj);
  
  console.log('[checkClinicCnpj] CNPJ normalizado:', normalizedCnpj);
  
  if (!normalizedCnpj || normalizedCnpj.length !== 14) {
    console.warn('[checkClinicCnpj] CNPJ inválido:', normalizedCnpj);
    return res.status(400).json({ error: 'CNPJ inválido' });
  }

  try {
    console.log('[checkClinicCnpj] Buscando CNPJ no banco...');
    
    // Busca usando CNPJ normalizado
    // Como agora salvamos sempre normalizado, a busca é simples
    const { data, error } = await supabase
      .from('clinics')
      .select('id')
      .eq('cnpj', normalizedCnpj)
      .maybeSingle();

    if (error) {
      console.error('[checkClinicCnpj] Erro ao buscar CNPJ:', error);
      return res.status(500).json({ error: 'Erro interno ao verificar CNPJ' });
    }

    console.log('[checkClinicCnpj] Resultado:', data ? 'existe' : 'não existe');
    
    if (data) {
      return res.json({ exists: true });
    }

    return res.json({ exists: false });
  } catch (err) {
    console.error('[checkClinicCnpj] Erro:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
