import { createHash, randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../config/supabase';

export type ConfirmationRecord = {
  id: string;
  userId: string;
  clinicId: string;
  unitId: string;
  actionId: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  entityIds: Record<string, string | null>;
  expiresAt: string;
  status: 'pending' | 'consumed' | 'expired';
};

const MEMORY = new Map<string, ConfirmationRecord>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function canonicalPayloadHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function useDb(): boolean {
  return String(process.env.PETMI_ACTION_CONFIRMATIONS_DB ?? 'true').toLowerCase() !== 'false';
}

export async function createConfirmation(opts: {
  userId: string;
  clinicId: string;
  unitId: string;
  actionId: string;
  payload: Record<string, unknown>;
  entityIds?: Record<string, string | null>;
  ttlMs?: number;
}): Promise<ConfirmationRecord> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS)).toISOString();
  const payloadHash = canonicalPayloadHash(opts.payload);
  const record: ConfirmationRecord = {
    id,
    userId: opts.userId,
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    actionId: opts.actionId,
    payloadHash,
    payload: opts.payload,
    entityIds: opts.entityIds ?? {},
    expiresAt,
    status: 'pending',
  };

  if (useDb()) {
    const { error } = await supabaseAdmin.from('hub_action_confirmations').insert({
      id: record.id,
      user_id: record.userId,
      clinic_id: record.clinicId,
      unit_id: record.unitId,
      action_id: record.actionId,
      payload_hash: record.payloadHash,
      payload: record.payload,
      entity_ids: record.entityIds,
      expires_at: record.expiresAt,
      status: record.status,
    });
    if (error) {
      console.warn('[actions] confirmation DB insert failed, using memory', error.message);
      MEMORY.set(id, record);
    }
  } else {
    MEMORY.set(id, record);
  }

  return record;
}

export async function consumeConfirmation(opts: {
  confirmationId: string;
  userId: string;
  clinicId: string;
  unitId: string;
  actionId: string;
  payload: Record<string, unknown>;
}): Promise<
  | { ok: true; record: ConfirmationRecord }
  | { ok: false; reason: 'not_found' | 'expired' | 'mismatch' | 'consumed' }
> {
  const expectedHash = canonicalPayloadHash(opts.payload);
  let record: ConfirmationRecord | null = MEMORY.get(opts.confirmationId) ?? null;

  if (!record && useDb()) {
    const { data, error } = await supabaseAdmin
      .from('hub_action_confirmations')
      .select('*')
      .eq('id', opts.confirmationId)
      .maybeSingle();
    if (error) {
      console.warn('[actions] confirmation DB read failed', error.message);
    }
    if (data) {
      record = {
        id: data.id as string,
        userId: data.user_id as string,
        clinicId: data.clinic_id as string,
        unitId: data.unit_id as string,
        actionId: data.action_id as string,
        payloadHash: data.payload_hash as string,
        payload: (data.payload as Record<string, unknown>) ?? {},
        entityIds: (data.entity_ids as Record<string, string | null>) ?? {},
        expiresAt: data.expires_at as string,
        status: data.status as ConfirmationRecord['status'],
      };
    }
  }

  if (!record) return { ok: false, reason: 'not_found' };
  if (record.status === 'consumed') return { ok: false, reason: 'consumed' };
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (
    record.userId !== opts.userId ||
    record.clinicId !== opts.clinicId ||
    record.unitId !== opts.unitId ||
    record.actionId !== opts.actionId ||
    record.payloadHash !== expectedHash
  ) {
    return { ok: false, reason: 'mismatch' };
  }

  record.status = 'consumed';
  MEMORY.set(record.id, record);

  if (useDb()) {
    await supabaseAdmin
      .from('hub_action_confirmations')
      .update({ status: 'consumed', consumed_at: new Date().toISOString() })
      .eq('id', record.id)
      .eq('status', 'pending');
  }

  return { ok: true, record };
}

export function clearConfirmationsForTests(): void {
  MEMORY.clear();
}
