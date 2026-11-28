import { checkPermission } from '../../../middleware/authMiddleware';
import { auditActionExecution } from './audit';
import { resultFromUnknown } from './errors';
import { lookupIdempotency, storeIdempotency } from './idempotency';
import { getAction } from './registry';
import type { ActionResult, ExecuteActionInput } from './types';
import { ensureActionsRegistered } from './registerAll';

export async function executeAction(input: ExecuteActionInput): Promise<ActionResult> {
  ensureActionsRegistered();
  const startedAt = Date.now();
  const def = getAction(input.actionId);
  if (!def) {
    return {
      status: 'forbidden',
      message: 'Essa ação não está disponível no PetMi.',
    };
  }

  const parsed = def.inputSchema.safeParse(input.params ?? {});
  if (!parsed.success) {
    return {
      status: 'validation_error',
      message: 'Parâmetros inválidos para esta ação.',
      data: { issues: parsed.error.flatten() },
    };
  }

  const enforceRbac = input.context.enforceRbac !== false;
  if (enforceRbac) {
    for (const perm of def.permissions) {
      const ok = await checkPermission(input.context.userId, input.context.clinicId, perm);
      if (!ok) {
        const result: ActionResult = {
          status: 'forbidden',
          message: 'Você não tem permissão para executar esta ação.',
        };
        await auditActionExecution({
          context: input.context,
          actionId: input.actionId,
          result,
          durationMs: Date.now() - startedAt,
        });
        return result;
      }
    }
  }

  if (input.idempotencyKey && def.kind === 'write') {
    const replayed = await lookupIdempotency({
      userId: input.context.userId,
      clinicId: input.context.clinicId,
      actionId: input.actionId,
      key: input.idempotencyKey,
    });
    if (replayed) return replayed;
  }

  try {
    const result = await def.handler(input.context, parsed.data);
    if (input.idempotencyKey && def.kind === 'write' && result.status === 'executed') {
      await storeIdempotency({
        userId: input.context.userId,
        clinicId: input.context.clinicId,
        actionId: input.actionId,
        key: input.idempotencyKey,
        result,
      });
    }
    await auditActionExecution({
      context: input.context,
      actionId: input.actionId,
      result,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (e) {
    const result = resultFromUnknown(e);
    await auditActionExecution({
      context: input.context,
      actionId: input.actionId,
      result,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }
}
