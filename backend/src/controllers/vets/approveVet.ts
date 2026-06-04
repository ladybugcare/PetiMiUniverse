import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { createAuditLog, extractRequestMetadata } from '../../utils/auditLog';

/**
 * Aprova um veterinário
 */
export const approveVet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem aprovar veterinários.' });
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

    // Atualizar status para aprovado
    const { error: updateError } = await supabaseAdmin
      .from('vets')
      .update({
        approval_status: 'approved',
        status: 'active',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Erro ao aprovar veterinário:', updateError);
      return res.status(500).json({ error: 'Erro ao aprovar veterinário' });
    }

    // Criar log de auditoria
    const metadata = extractRequestMetadata(req);
    await createAuditLog({
      user_id: adminId,
      action: 'APPROVE_VET',
      entity_type: 'vet',
      entity_id: id,
      new_values: { approval_status: 'approved', status: 'active' },
      ...metadata,
    });

    // TODO: Enviar email de aprovação para o veterinário
    // await sendVetApprovalEmail(vet.email, vet.name);

    return res.json({
      success: true,
      message: 'Veterinário aprovado com sucesso!',
    });
  } catch (error: any) {
    console.error('Erro ao aprovar veterinário:', error);
    return res.status(500).json({ error: error.message || 'Erro interno ao aprovar veterinário' });
  }
};

