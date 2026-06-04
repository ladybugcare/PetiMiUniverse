// backend/controllers/vets/checkVetEmail.ts
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

export const checkVetEmail = async (req: Request, res: Response) => {
  const { email } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('vets')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    return res.json({ exists: !!data });
  } catch (error: any) {
    console.error('Erro ao verificar email:', error);
    return res.status(500).json({ error: 'Erro ao verificar email' });
  }
};
