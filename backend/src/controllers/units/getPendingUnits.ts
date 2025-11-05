// backend/src/controllers/units/getPendingUnits.ts
import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

/**
 * Retorna todas as unidades com status pendente de aprovação.
 * Inclui dados básicos da clínica associada.
 */
export const getPendingUnits = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('units')
      .select(`
        id,
        name,
        nickname,
        address,
        city,
        state,
        phone,
        cnpj,
        technical_manager,
        is_main,
        status,
        created_at,
        clinic:clinics (
          id,
          name,
          email,
          cnpj,
          phone
        )
      `)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: req.user?.id || 'system',
      action: 'GET_PENDING_UNITS',
      entity_type: 'unit',
      entity_id: 'bulk',
      new_values: { count: data?.length || 0 },
      ...metadata,
    });

    return res.status(200).json({
      success: true,
      units: data || [],
    });
  } catch (error: any) {
    console.error('Erro ao buscar unidades pendentes:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar unidades pendentes',
    });
  }
};
