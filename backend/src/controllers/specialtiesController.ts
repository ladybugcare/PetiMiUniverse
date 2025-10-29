import type { Request, Response } from 'express';
import { supabase } from '../config/supabase';

export const getSpecialties = async (req: Request, res: Response) => {
  const { category } = req.query;

  let query = supabase.from('specialties').select('*');

  if (category && typeof category === 'string') {
    query = query.eq('category', category);
  }

  const { data, error } = await query.order('name');

  if (error) return res.status(400).json({ error: error.message });
  res.json({ specialties: data });
};

