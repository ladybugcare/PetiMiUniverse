import { supabaseAdmin } from '../../config/supabase';

export type OpenDayBoardOriginKey = { origin_type: string; origin_id: string };

const MIN_CHARGEABLE = 0.009;

/** Origens com cobrança em aberto ou enviadas ao financeiro (handoff), sem filtro de data. */
export async function collectOpenFinanceiroOriginKeys(
  clinicId: string,
  unitId?: string
): Promise<OpenDayBoardOriginKey[]> {
  const keys = new Map<string, OpenDayBoardOriginKey>();

  let recQ = supabaseAdmin
    .from('hub_receivables')
    .select('source_type, source_id, comanda_id, final_amount')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .in('status', ['pending', 'partially_paid']);
  if (unitId) recQ = recQ.or(`unit_id.eq.${unitId},unit_id.is.null`);
  const { data: recs, error: recErr } = await recQ;
  if (recErr) throw new Error(recErr.message);

  const comandaIds = new Set<string>();
  for (const r of recs ?? []) {
    if (Number(r.final_amount ?? 0) <= MIN_CHARGEABLE) continue;
    const sourceType = r.source_type as string | null;
    const sourceId = r.source_id as string | null;
    if (sourceType && sourceId) {
      keys.set(`${sourceType}:${sourceId}`, { origin_type: sourceType, origin_id: sourceId });
    }
    if (r.comanda_id) comandaIds.add(r.comanda_id as string);
  }

  let handoffQ = supabaseAdmin
    .from('hub_comandas')
    .select('id, origin_type, origin_id, total_amount')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .neq('status', 'cancelada')
    .not('finance_handoff_at', 'is', null);
  if (unitId) handoffQ = handoffQ.or(`unit_id.eq.${unitId},unit_id.is.null`);
  const { data: handoffs, error: handoffErr } = await handoffQ;
  if (handoffErr) throw new Error(handoffErr.message);

  for (const c of handoffs ?? []) {
    const originType = c.origin_type as string | null;
    const originId = c.origin_id as string | null;
    if (!originType || !originId) continue;
    const key = `${originType}:${originId}`;
    // Já entrou por recebível com valor: mantém. Handoff zerado sozinho: ignora.
    if (keys.has(key)) continue;
    if (Number(c.total_amount ?? 0) <= MIN_CHARGEABLE) continue;
    keys.set(key, { origin_type: originType, origin_id: originId });
  }

  if (comandaIds.size > 0) {
    const { data: more, error: moreErr } = await supabaseAdmin
      .from('hub_comandas')
      .select('id, origin_type, origin_id')
      .in('id', [...comandaIds]);
    if (moreErr) throw new Error(moreErr.message);
    for (const c of more ?? []) {
      const originType = c.origin_type as string | null;
      const originId = c.origin_id as string | null;
      if (originType && originId) {
        keys.set(`${originType}:${originId}`, { origin_type: originType, origin_id: originId });
      }
    }
  }

  return [...keys.values()];
}
