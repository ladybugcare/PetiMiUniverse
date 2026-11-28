import { supabaseAdmin } from '../../../config/supabase';
import type { ActionResult } from './types';

const MEMORY = new Map<string, { result: ActionResult; expiresAt: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

function memKey(userId: string, actionId: string, key: string): string {
  return `${userId}:${actionId}:${key}`;
}

export async function lookupIdempotency(opts: {
  userId: string;
  clinicId: string;
  actionId: string;
  key: string;
}): Promise<ActionResult | null> {
  const k = memKey(opts.userId, opts.actionId, opts.key);
  const hit = MEMORY.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  const { data, error } = await supabaseAdmin
    .from('hub_action_idempotency_keys')
    .select('result')
    .eq('user_id', opts.userId)
    .eq('clinic_id', opts.clinicId)
    .eq('action_id', opts.actionId)
    .eq('idempotency_key', opts.key)
    .maybeSingle();
  if (error || !data) return null;
  return (data.result as ActionResult) ?? null;
}

export async function storeIdempotency(opts: {
  userId: string;
  clinicId: string;
  actionId: string;
  key: string;
  result: ActionResult;
}): Promise<void> {
  const k = memKey(opts.userId, opts.actionId, opts.key);
  MEMORY.set(k, { result: opts.result, expiresAt: Date.now() + TTL_MS });

  const { error } = await supabaseAdmin.from('hub_action_idempotency_keys').upsert(
    {
      user_id: opts.userId,
      clinic_id: opts.clinicId,
      action_id: opts.actionId,
      idempotency_key: opts.key,
      result: opts.result,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,clinic_id,action_id,idempotency_key' },
  );
  if (error) {
    console.warn('[actions] idempotency store failed', error.message);
  }
}

export function clearIdempotencyForTests(): void {
  MEMORY.clear();
}
