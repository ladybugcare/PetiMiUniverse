import { createAuditLog } from '../../../utils/auditLog';
import type { ActionContext, ActionResult } from './types';

/** Auditoria padronizada de ações de integração (sem tokens/PHI). */
export async function auditActionExecution(opts: {
  context: ActionContext;
  actionId: string;
  result: ActionResult;
  entityType?: string;
  entityId?: string | null;
  durationMs?: number;
}): Promise<void> {
  const { context, actionId, result } = opts;
  try {
    await createAuditLog({
      user_id: context.userId,
      clinic_id: context.clinicId,
      unit_id: context.unitId,
      action: `action.${actionId}.${result.status}`,
      entity_type: opts.entityType ?? 'hub_action',
      entity_id: opts.entityId ?? result.sessionId ?? result.encounterId ?? undefined,
      new_values: {
        provider: context.provider,
        action_id: actionId,
        status: result.status,
        correlation_id: context.correlationId ?? null,
        duration_ms: opts.durationMs ?? null,
        pet_name: result.petName ?? null,
        confirmation_id: result.confirmationId ?? null,
      },
    });
  } catch (e) {
    console.warn('[actions] audit failed', e);
  }
}
