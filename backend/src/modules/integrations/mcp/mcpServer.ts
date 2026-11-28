import { z } from 'zod';
import { ensureActionsRegistered } from '../../hub/actions/registerAll';
import { listActions, getAction } from '../../hub/actions/registry';
import { executeAction } from '../../hub/actions/executeAction';
import type { ActionContext } from '../../hub/actions/types';

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema) as Record<string, unknown>;
  } catch {
    return { type: 'object', properties: {} };
  }
}

export function listMcpTools() {
  ensureActionsRegistered();
  return listActions().map((a) => ({
    name: a.id,
    description: a.description,
    inputSchema: zodToJsonSchema(a.inputSchema),
    annotations: {
      readOnlyHint: a.readOnlyHint,
      destructiveHint: !a.readOnlyHint && a.kind === 'write',
      openWorldHint: false,
    },
  }));
}

function scopeAllowsAction(scopes: string[] | undefined, actionId: string): boolean {
  if (!scopes || scopes.length === 0) return true;
  if (actionId.startsWith('grooming.')) {
    const needWrite = !actionId.includes('list') && !actionId.includes('hint');
    if (needWrite) return scopes.includes('petmi.grooming.write');
    return scopes.includes('petmi.grooming.read') || scopes.includes('petmi.grooming.write');
  }
  if (actionId.startsWith('clinical.')) {
    const needWrite = actionId.includes('confirm_save') || actionId.includes('prepare');
    if (actionId.includes('get_active')) {
      return scopes.includes('petmi.clinical.read') || scopes.includes('petmi.clinical.write');
    }
    if (needWrite) return scopes.includes('petmi.clinical.write');
    return scopes.includes('petmi.clinical.read') || scopes.includes('petmi.clinical.write');
  }
  return true;
}

export async function callMcpTool(opts: {
  name: string;
  args: unknown;
  context: ActionContext;
  scopes?: string[];
  idempotencyKey?: string | null;
}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  ensureActionsRegistered();
  const def = getAction(opts.name);
  if (!def) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ status: 'forbidden', message: 'Tool desconhecida' }) }],
      isError: true,
    };
  }
  if (!scopeAllowsAction(opts.scopes, opts.name)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ status: 'forbidden', message: 'Escopo OAuth insuficiente para esta ferramenta.' }),
        },
      ],
      isError: true,
    };
  }

  const result = await executeAction({
    actionId: opts.name,
    params: opts.args ?? {},
    context: opts.context,
    idempotencyKey: opts.idempotencyKey,
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: result.status === 'forbidden' || result.status === 'unauthorized',
  };
}

export const MCP_SERVER_INFO = {
  name: 'petmi-hub',
  version: '0.1.0',
  instructions:
    'PetMi Hub Action Engine. Use grooming.* for banho e tosa and clinical.* for anamnese drafts. Always confirm sensitive clinical saves with confirmation_id. Never invent clinical data. Prefer explicit pet names and unit context already bound by OAuth.',
};
