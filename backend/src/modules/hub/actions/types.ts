import type { z } from 'zod';
import type { GroomingStage } from '../groomingStages';

/** Origem da integração que disparou a ação. */
export type ActionProvider =
  | 'hub_web'
  | 'alexa'
  | 'chatgpt'
  | 'petmi_voice'
  | 'external_integration'
  | 'system';

export type ActionKind = 'read' | 'write';

export type ConfirmationPolicy = 'none' | 'explicit_command' | 'server_challenge';

export type ActionResultStatus =
  | 'executed'
  | 'already_applied'
  | 'needs_confirmation'
  | 'needs_disambiguation'
  | 'not_found'
  | 'invalid_state'
  | 'forbidden'
  | 'unauthorized'
  | 'resource_conflict'
  | 'temporarily_unavailable'
  | 'validation_error';

export type ActionContext = {
  userId: string;
  clinicId: string;
  unitId: string;
  provider: ActionProvider;
  correlationId?: string | null;
  /** Quando false, pula checkPermission (ex.: Alexa allowlist POC legado). Default true. */
  enforceRbac?: boolean;
};

export type ActionResult = {
  status: ActionResultStatus;
  message: string;
  data?: Record<string, unknown>;
  sessionId?: string;
  petName?: string;
  encounterId?: string;
  confirmationId?: string;
  candidates?: Array<{ sessionId: string; petName: string; stage: GroomingStage }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: string;
  description: string;
  kind: ActionKind;
  inputSchema: TInput;
  permissions: string[];
  confirmationPolicy: ConfirmationPolicy;
  /** Annotation MCP readOnlyHint */
  readOnlyHint: boolean;
  // Handler receives parsed input; callers validate with inputSchema first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (ctx: ActionContext, input: any) => Promise<ActionResult>;
};

export type ExecuteActionInput = {
  actionId: string;
  context: ActionContext;
  params: unknown;
  /** Chave de idempotência opcional (tool call id / header). */
  idempotencyKey?: string | null;
};
