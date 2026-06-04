// backend/src/controllers/units/getPendingUnits.ts
import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

/**
 * Retorna todas as unidades com status pendente de aprovação.
 * Inclui dados básicos da clínica associada.
 */
const PENDING_UNITS_SELECT = `
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
    phone,
    status
  )
`;

export const getPendingUnits = async (req: Request, res: Response) => {
  try {
    const role = String((req as any).user?.role || '').toLowerCase();
    if (role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), 25000)
    );

    // 1) Unidades explicitamente em revisão
    const qReview = supabaseAdmin
      .from('units')
      .select(PENDING_UNITS_SELECT)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(1000);

    // 2) Fallback do cadastro: constraint antiga só permitia `active` — unidade principal criada como active
    //    enquanto a clínica fica `pending_approval`. Essas também precisam aparecer na fila do admin.
    const qActiveMain = supabaseAdmin
      .from('units')
      .select(PENDING_UNITS_SELECT)
      .eq('status', 'active')
      .eq('is_main', true)
      .order('created_at', { ascending: false })
      .limit(500);

    const result = await Promise.race([Promise.all([qReview, qActiveMain]), timeoutPromise]);

    const [r1, r2] = result as [{ data: any[] | null; error: any }, { data: any[] | null; error: any }];

    if (r1.error) {
      console.error('Erro ao buscar unidades pending_review:', r1.error);
      return res.status(500).json({
        success: false,
        error: r1.error.message || 'Erro ao buscar unidades pendentes',
      });
    }
    if (r2.error) {
      console.error('Erro ao buscar unidades active (fila alternativa):', r2.error);
      return res.status(500).json({
        success: false,
        error: r2.error.message || 'Erro ao buscar unidades pendentes',
      });
    }

    const byId = new Map<string, any>();
    for (const u of r1.data || []) {
      byId.set(u.id, u);
    }
    for (const u of r2.data || []) {
      const st = (u as any)?.clinic?.status;
      if (st === 'pending_approval') {
        byId.set(u.id, u);
      }
    }

    const merged = Array.from(byId.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Tentar criar audit log, mas não falhar se der erro
    try {
      const metadata = extractRequestMetadata(req);
      await createAuditLog({
        user_id: req.user?.id || 'system',
        action: 'GET_PENDING_UNITS',
        entity_type: 'unit',
        // entity_id não é necessário para operações bulk (listagem)
        new_values: { count: merged.length },
        ...metadata,
      });
    } catch (auditError: any) {
      console.warn('Erro ao criar audit log (não crítico):', auditError?.message);
    }

    return res.status(200).json({
      success: true,
      units: merged,
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
