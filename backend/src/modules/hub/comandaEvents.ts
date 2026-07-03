import { supabaseAdmin } from '../../config/supabase';

export type HubComandaEventType = 'item_added' | 'item_removed' | 'item_updated' | 'items_synced';

export type HubComandaEventRow = {
  id: string;
  clinic_id: string;
  comanda_id: string;
  event_type: HubComandaEventType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  actor_user_id: string | null;
  edit_context: 'caixa' | 'financeiro' | null;
  created_at: string;
};

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function comandaItemKindLabel(itemKind: string): string {
  if (itemKind === 'product') return 'Produto';
  if (itemKind === 'service') return 'Serviço';
  return 'Item';
}

export function comandaItemEventTitle(action: 'added' | 'removed' | 'updated', itemKind: string): string {
  const kind = comandaItemKindLabel(itemKind);
  const verb = action === 'added' ? 'adicionado' : action === 'removed' ? 'removido' : 'alterado';
  return `${kind} ${verb}`;
}

export function comandaItemEventBody(
  description: string,
  opts?: { quantity?: number; lineTotal?: number; unitAmount?: number },
): string {
  const parts = [description.trim()];
  if (opts?.quantity != null) parts.push(`${opts.quantity} un.`);
  if (opts?.unitAmount != null) parts.push(formatBrl(opts.unitAmount));
  if (opts?.lineTotal != null) parts.push(`Total ${formatBrl(opts.lineTotal)}`);
  return parts.join(' · ');
}

export function comandaItemUpdateBody(description: string, changes: string[]): string {
  return `${description.trim()}: ${changes.join(', ')}`;
}

export async function recordComandaEvent(opts: {
  clinic_id: string;
  comanda_id: string;
  event_type: HubComandaEventType;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
  actor_user_id?: string | null;
  edit_context?: 'caixa' | 'financeiro' | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('hub_comanda_events').insert({
      clinic_id: opts.clinic_id,
      comanda_id: opts.comanda_id,
      event_type: opts.event_type,
      title: opts.title,
      body: opts.body?.trim() || null,
      metadata: opts.metadata ?? {},
      actor_user_id: opts.actor_user_id ?? null,
      edit_context: opts.edit_context ?? null,
    });
    if (error) console.error('recordComandaEvent insert error:', error.message);
  } catch (err) {
    console.error('recordComandaEvent failed (non-blocking):', err);
  }
}

export async function listComandaEvents(comandaId: string, clinicId: string): Promise<HubComandaEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_comanda_events')
    .select('id, clinic_id, comanda_id, event_type, title, body, metadata, actor_user_id, edit_context, created_at')
    .eq('comanda_id', comandaId)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listComandaEvents', error.message);
    return [];
  }
  return (data ?? []) as HubComandaEventRow[];
}

export function itemSnapshotFromRow(row: Record<string, unknown>) {
  return {
    description: String(row.description ?? ''),
    item_kind: String(row.item_kind ?? 'service'),
    quantity: Number(row.quantity ?? 1),
    unit_amount: round2(Number(row.unit_amount ?? 0)),
    line_total: round2(Number(row.line_total ?? 0)),
  };
}

export async function recordComandaItemAddedEvent(opts: {
  clinic_id: string;
  comanda_id: string;
  item: { description: string; item_kind: string; quantity: number; unit_amount: number; line_total: number };
  actor_user_id?: string | null;
  edit_context?: 'caixa' | 'financeiro' | null;
  source?: string;
}): Promise<void> {
  await recordComandaEvent({
    clinic_id: opts.clinic_id,
    comanda_id: opts.comanda_id,
    event_type: 'item_added',
    title: comandaItemEventTitle('added', opts.item.item_kind),
    body: comandaItemEventBody(opts.item.description, {
      quantity: opts.item.quantity,
      unitAmount: opts.item.unit_amount,
      lineTotal: opts.item.line_total,
    }),
    metadata: { ...opts.item, source: opts.source ?? 'manual' },
    actor_user_id: opts.actor_user_id,
    edit_context: opts.edit_context,
  });
}

export async function recordComandaItemRemovedEvent(opts: {
  clinic_id: string;
  comanda_id: string;
  item: { description: string; item_kind: string; quantity: number; unit_amount: number; line_total: number };
  actor_user_id?: string | null;
  edit_context?: 'caixa' | 'financeiro' | null;
  source?: string;
}): Promise<void> {
  await recordComandaEvent({
    clinic_id: opts.clinic_id,
    comanda_id: opts.comanda_id,
    event_type: 'item_removed',
    title: comandaItemEventTitle('removed', opts.item.item_kind),
    body: comandaItemEventBody(opts.item.description, {
      quantity: opts.item.quantity,
      lineTotal: opts.item.line_total,
    }),
    metadata: { ...opts.item, source: opts.source ?? 'manual' },
    actor_user_id: opts.actor_user_id,
    edit_context: opts.edit_context,
  });
}
