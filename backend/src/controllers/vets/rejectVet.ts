import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

interface RejectVetBody {
  rejection_reason: string;
}

/**
 * Rejeita um veterinário
 */
export const rejectVet = async (req: Request<{ id: string }, {}, RejectVetBody>, res: Response) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem rejeitar veterinários.' });
    }

    if (!rejection_reason || rejection_reason.trim().length === 0) {
      return res.status(400).json({ error: 'Motivo da rejeição é obrigatório' });
    }

    // Verificar se o veterinário existe e está pendente
    const { data: vet, error: vetError } = await supabaseAdmin
      .from('vets')
      .select('id, name, email, approval_status')
      .eq('id', id)
      .maybeSingle();

    if (vetError || !vet) {
      return res.status(404).json({ error: 'Veterinário não encontrado' });
    }

    if (vet.approval_status !== 'pending_approval') {
      return res.status(400).json({ 
        error: `Veterinário não está pendente de aprovação. Status atual: ${vet.approval_status}` 
      });
    }

    // Atualizar status para rejeitado
    const { error: updateError } = await supabaseAdmin
      .from('vets')
      .update({
        approval_status: 'rejected',
        status: 'inactive',
        rejection_reason: rejection_reason.trim(),
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Erro ao rejeitar veterinário:', updateError);
      return res.status(500).json({ error: 'Erro ao rejeitar veterinário' });
    }

    // Criar log de auditoria
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: adminId,
      action: 'REJECT_VET',
      entity_type: 'vet',
      entity_id: id,
      new_values: { 
        approval_status: 'rejected', 
        status: 'inactive',
        rejection_reason: rejection_reason.trim(),
      },
      ...metadata,
    });

    // TODO: Enviar email de rejeição para o veterinário com o motivo
    // await sendVetRejectionEmail(vet.email, vet.name, rejection_reason);

    return res.json({
      success: true,
      message: 'Veterinário rejeitado. Email com motivo foi enviado.',
    });
  } catch (error: any) {
    console.error('Erro ao rejeitar veterinário:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao rejeitar veterinário' });
  }
};

