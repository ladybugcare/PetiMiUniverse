"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.comandaItemKindLabel = comandaItemKindLabel;
exports.comandaItemEventTitle = comandaItemEventTitle;
exports.comandaItemEventBody = comandaItemEventBody;
exports.comandaItemUpdateBody = comandaItemUpdateBody;
exports.recordComandaEvent = recordComandaEvent;
exports.listComandaEvents = listComandaEvents;
exports.itemSnapshotFromRow = itemSnapshotFromRow;
exports.recordComandaItemAddedEvent = recordComandaItemAddedEvent;
exports.recordComandaItemRemovedEvent = recordComandaItemRemovedEvent;
const supabase_1 = require("../../config/supabase");
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function formatBrl(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function comandaItemKindLabel(itemKind) {
    if (itemKind === 'product')
        return 'Produto';
    if (itemKind === 'service')
        return 'Serviço';
    return 'Item';
}
function comandaItemEventTitle(action, itemKind) {
    const kind = comandaItemKindLabel(itemKind);
    const verb = action === 'added' ? 'adicionado' : action === 'removed' ? 'removido' : 'alterado';
    return `${kind} ${verb}`;
}
function comandaItemEventBody(description, opts) {
    const parts = [description.trim()];
    if (opts?.quantity != null)
        parts.push(`${opts.quantity} un.`);
    if (opts?.unitAmount != null)
        parts.push(formatBrl(opts.unitAmount));
    if (opts?.lineTotal != null)
        parts.push(`Total ${formatBrl(opts.lineTotal)}`);
    return parts.join(' · ');
}
function comandaItemUpdateBody(description, changes) {
    return `${description.trim()}: ${changes.join(', ')}`;
}
async function recordComandaEvent(opts) {
    try {
        const { error } = await supabase_1.supabaseAdmin.from('hub_comanda_events').insert({
            clinic_id: opts.clinic_id,
            comanda_id: opts.comanda_id,
            event_type: opts.event_type,
            title: opts.title,
            body: opts.body?.trim() || null,
            metadata: opts.metadata ?? {},
            actor_user_id: opts.actor_user_id ?? null,
            edit_context: opts.edit_context ?? null,
        });
        if (error)
            console.error('recordComandaEvent insert error:', error.message);
    }
    catch (err) {
        console.error('recordComandaEvent failed (non-blocking):', err);
    }
}
async function listComandaEvents(comandaId, clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_comanda_events')
        .select('id, clinic_id, comanda_id, event_type, title, body, metadata, actor_user_id, edit_context, created_at')
        .eq('comanda_id', comandaId)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: true });
    if (error) {
        console.error('listComandaEvents', error.message);
        return [];
    }
    return (data ?? []);
}
function itemSnapshotFromRow(row) {
    return {
        description: String(row.description ?? ''),
        item_kind: String(row.item_kind ?? 'service'),
        quantity: Number(row.quantity ?? 1),
        unit_amount: round2(Number(row.unit_amount ?? 0)),
        line_total: round2(Number(row.line_total ?? 0)),
    };
}
async function recordComandaItemAddedEvent(opts) {
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
async function recordComandaItemRemovedEvent(opts) {
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
