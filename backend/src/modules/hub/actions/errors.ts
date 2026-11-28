import type { ActionResult, ActionResultStatus } from './types';

export class ActionEngineError extends Error {
  readonly status: ActionResultStatus;
  readonly data?: Record<string, unknown>;

  constructor(status: ActionResultStatus, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'ActionEngineError';
    this.status = status;
    this.data = data;
  }

  toResult(): ActionResult {
    return {
      status: this.status,
      message: this.message,
      data: this.data,
    };
  }
}

export function resultFromUnknown(e: unknown): ActionResult {
  if (e instanceof ActionEngineError) return e.toResult();
  console.error('[actions] unexpected error', e);
  return {
    status: 'temporarily_unavailable',
    message: 'Não consegui processar agora. Tente de novo ou use o Hub.',
  };
}
