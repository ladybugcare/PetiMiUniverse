import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { normalizeCNPJ } from '../../utils/cnpjUtils';

// Helper para logging seguro (não quebra se logger falhar)
const safeLog = (level: 'debug' | 'warn' | 'error', message: string, meta?: any) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger } = require('../../utils/logger.js');
    logger[level](message, meta);
  } catch (err) {
    // Fallback para console se logger não estiver disponível
    console[level === 'debug' ? 'log' : level](`[CNPJ] ${message}`, meta || '');
  }
};

export const checkClinicCnpj = async (req: Request, res: Response) => {
  const { cnpj } = req.params;
  
  try {
    safeLog('debug', 'Checking CNPJ', { cnpj });
    
    // Normaliza o CNPJ (remove formatação) para garantir busca consistente
    const normalizedCnpj = normalizeCNPJ(cnpj);
    
    safeLog('debug', 'Normalized CNPJ', { normalizedCnpj });
    
    // Validação básica: deve ter 14 dígitos após normalização
    if (!normalizedCnpj || normalizedCnpj.length !== 14) {
      safeLog('warn', 'Invalid CNPJ format', { cnpj, normalizedCnpj });
      return res.status(400).json({ error: 'CNPJ inválido' });
    }

    // Busca usando CNPJ normalizado
    // Como agora salvamos sempre normalizado, a busca é simples
    const { data, error } = await supabase
      .from('clinics')
      .select('id')
      .eq('cnpj', normalizedCnpj)
      .maybeSingle();

    if (error) {
      safeLog('error', 'Error checking CNPJ', { error: error.message, cnpj: normalizedCnpj });
      return res.status(500).json({ error: 'Erro interno ao verificar CNPJ' });
    }

    safeLog('debug', 'CNPJ check result', { exists: !!data, cnpj: normalizedCnpj });
    
    if (data) {
      return res.json({ exists: true });
    }

    return res.json({ exists: false });
  } catch (err: any) {
    safeLog('error', 'Unexpected error checking CNPJ', { error: err?.message || err, cnpj });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
