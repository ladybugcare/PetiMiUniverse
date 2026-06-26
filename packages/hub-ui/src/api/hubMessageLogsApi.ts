import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/message-logs';

export type MessageLogChannel = 'whatsapp_link' | 'in_app';

export interface CreateMessageLogPayload {
  clinic_id: string;
  unit_id?: string | null;
  guardian_id?: string | null;
  pet_id?: string | null;
  channel: MessageLogChannel;
  template_key?: string | null;
  triggered_by_staff_id?: string | null;
}

/**
 * Registra uma tentativa de comunicação (fire-and-forget).
 * Erros são silenciados para não bloquear o fluxo operacional.
 */
export async function logMessageAttempt(payload: CreateMessageLogPayload): Promise<void> {
  try {
    await apiRequest(base, { method: 'POST', body: JSON.stringify(payload) });
  } catch {
    // Intencionalmente silencioso: falha no log não deve interromper o operador.
  }
}
