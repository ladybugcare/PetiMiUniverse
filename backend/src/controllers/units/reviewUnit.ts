// backend/src/controllers/units/reviewUnit.ts
import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

/**
 * Permite que um administrador aprove ou rejeite uma unidade pendente.
 */
export const reviewUnit = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approved, rejection_reason } = req.body;
  const adminId = req.user?.id || 'system';

  try {
    // 1️⃣ Verifica se a unidade existe
    const { data: existing, error: fetchError } = await supabase
      .from('units')
      .select('id, name, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, error: 'Unidade não encontrada' });
    }

    // 2️⃣ Define novo status
    const newStatus = approved ? 'approved' : 'rejected';

    // 3️⃣ Atualiza unidade no banco
    const { error: updateError } = await supabase
      .from('units')
      .update({
        status: newStatus,
        rejection_reason: approved ? null : rejection_reason || 'Sem motivo especificado',
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminId,
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // 4️⃣ Cria log de auditoria
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: adminId,
      action: approved ? 'APPROVE_UNIT' : 'REJECT_UNIT',
      entity_type: 'unit',
      entity_id: id,
      new_values: { status: newStatus, rejection_reason },
      ...metadata,
    });

    return res.status(200).json({
      success: true,
      status: newStatus,
      message: approved
        ? 'Unidade aprovada com sucesso!'
        : 'Unidade rejeitada e arquivada com sucesso.',
    });
  } catch (error: any) {
    console.error('Erro ao revisar unidade:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao revisar unidade',
    });
  }
};
