import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

/**
 * ✅ Lista todos os freelancers cadastrados
 */
export const getFreelancers = async (_req: Request, res: Response) => {
  try {
    // Adicionar timeout e limite para evitar queries muito lentas
    // Reduzir limite para 500 e usar apenas colunas essenciais
    const queryPromise = supabaseAdmin
      .from('freelancers')
      .select('id, name, email, document_number, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(500); // Limite reduzido para melhor performance

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 15000) // Timeout reduzido para 15s
    );

    const result = await Promise.race([
      queryPromise,
      timeoutPromise
    ]);

    const { data, error } = result;

    if (error) {
      console.error('Erro ao buscar freelancers:', error);
      return res.status(500).json({
        error: 'Erro ao buscar lista de freelancers',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    return res.json({ freelancers: data || [] });
  } catch (err: any) {
    console.error('Erro inesperado ao buscar freelancers:', err);
    if (err.message === 'Query timeout') {
      return res.status(504).json({ 
        error: 'A requisição demorou muito para responder',
        details: 'Timeout ao buscar freelancers'
      });
    }
    return res.status(500).json({
      error: err.message || 'Erro ao buscar lista de freelancers',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

