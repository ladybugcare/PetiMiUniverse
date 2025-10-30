import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

/**
 * Middleware to ensure clinic is active before allowing certain operations
 * Blocks clinics with status 'pending_unit', 'pending_approval', 'suspended', or 'rejected'
 */
export const requireActiveClinic = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    // Try to get clinic_id from body, params, or query
    const clinic_id = req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;
    
    if (!clinic_id) {
      return res.status(400).json({ error: 'clinic_id é obrigatório' });
    }
    
    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('status')
      .eq('id', clinic_id)
      .single();
      
    if (error || !clinic) {
      return res.status(404).json({ error: 'Clínica não encontrada' });
    }
    
    if (clinic.status === 'pending_unit') {
      return res.status(403).json({ 
        error: 'Sua clínica precisa criar a primeira unidade.',
        status: 'pending_unit',
        action_required: 'create_first_unit'
      });
    }
    
    if (clinic.status === 'pending_approval') {
      return res.status(403).json({ 
        error: 'Aguarde a aprovação da sua unidade pelo ADMIN.',
        status: 'pending_approval',
        action_required: 'wait_approval'
      });
    }
    
    if (clinic.status === 'suspended') {
      return res.status(403).json({ 
        error: 'Sua clínica está suspensa. Entre em contato com o suporte.',
        status: 'suspended'
      });
    }
    
    if (clinic.status === 'rejected') {
      return res.status(403).json({ 
        error: 'Sua unidade foi reprovada. Crie uma nova unidade para análise.',
        status: 'rejected',
        action_required: 'create_first_unit'
      });
    }
    
    if (clinic.status !== 'active') {
      return res.status(403).json({ 
        error: 'Sua clínica não está ativa. Entre em contato com o suporte.',
        status: clinic.status
      });
    }
    
    // Clinic is active, proceed
    next();
  } catch (error: any) {
    console.error('Error in requireActiveClinic middleware:', error);
    res.status(500).json({ error: 'Erro ao verificar status da clínica' });
  }
};

