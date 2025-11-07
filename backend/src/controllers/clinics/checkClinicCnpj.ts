import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { normalizeCNPJ } from '../../utils/cnpjUtils';
import { logger } from '../../utils/logger.js';
import { z } from 'zod';
import { validate } from '../../utils/validation.js';

// Schema de validação para CNPJ
const cnpjParamSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
});

export const checkClinicCnpj = [
  validate(cnpjParamSchema, 'params'),
  async (req: Request, res: Response) => {
    const { cnpj } = req.params;
    
    logger.debug('Checking CNPJ', { cnpj });
    
    // Normaliza o CNPJ (remove formatação) para garantir busca consistente
    const normalizedCnpj = normalizeCNPJ(cnpj);
    
    logger.debug('Normalized CNPJ', { normalizedCnpj });
    
    if (!normalizedCnpj || normalizedCnpj.length !== 14) {
      logger.warn('Invalid CNPJ format', { normalizedCnpj });
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
      logger.error('Error checking CNPJ', { error: error.message, cnpj: normalizedCnpj });
      return res.status(500).json({ error: 'Erro interno ao verificar CNPJ' });
    }

    logger.debug('CNPJ check result', { exists: !!data, cnpj: normalizedCnpj });
    
    if (data) {
      return res.json({ exists: true });
    }

    return res.json({ exists: false });
  } catch (err) {
    logger.error('Unexpected error checking CNPJ', { error: err, cnpj: normalizedCnpj });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  },
];
