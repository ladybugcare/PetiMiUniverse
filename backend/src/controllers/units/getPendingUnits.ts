// backend/src/controllers/units/getPendingUnits.ts
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

/**
 * Retorna todas as unidades com status pendente de aprovação.
 * Inclui dados básicos da clínica associada.
 */
export const getPendingUnits = async (req: Request, res: Response) => {
  try {
    // Adicionar timeout para evitar queries muito lentas
    const queryPromise = supabaseAdmin
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
        clinic:clinics!units_clinic_id_fkey (
          id,
          name,
          email,
          cnpj,
          phone
        )
      `)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(1000);

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 25000)
    );

    const result = await Promise.race([
      queryPromise,
      timeoutPromise
    ]);

    const { data, error } = result;

    if (error) {
      console.error('Erro ao buscar unidades pendentes:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar unidades pendentes',
      });
    }

    // Tentar criar audit log, mas não falhar se der erro
    try {
      const metadata = extractRequestMetadata(req);
      await createAuditLog({
        user_id: req.user?.id || 'system',
        action: 'GET_PENDING_UNITS',
        entity_type: 'unit',
        // entity_id não é necessário para operações bulk (listagem)
        new_values: { count: data?.length || 0 },
        ...metadata,
      });
    } catch (auditError: any) {
      console.warn('Erro ao criar audit log (não crítico):', auditError?.message);
    }

    return res.status(200).json({
      success: true,
      units: data || [],
    });
  } catch (error: any) {
    console.error('Erro inesperado ao buscar unidades pendentes:', error);
    if (error.message === 'Query timeout') {
      return res.status(504).json({
        success: false,
        error: 'A requisição demorou muito para responder',
        details: 'Timeout ao buscar unidades pendentes'
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar unidades pendentes',
    });
  }
};
