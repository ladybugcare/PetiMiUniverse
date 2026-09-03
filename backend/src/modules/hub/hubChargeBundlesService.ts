import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase';

export type ChargeBundleStatus = 'open' | 'partially_paid' | 'paid' | 'cancelled';

const PAYABLE_STATUSES = new Set(['pending', 'partially_paid']);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function generateChargeBundlePublicToken(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const token = randomBytes(24).toString('base64url');
    const { data } = await supabaseAdmin
      .from('hub_charge_bundles')
      .select('id')
      .eq('public_token', token)
      .maybeSingle();
    if (!data) return token;
  }
  throw new Error('Não foi possível gerar token público único');
}

export async function receivableBalanceAmount(receivableId: string, clinicId: string): Promise<number> {
  const { data: rec, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, clinic_id, final_amount, status')
    .eq('id', receivableId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!rec) throw new Error('Recebível não encontrado');

  const status = String(rec.status ?? '');
  if (status === 'paid' || status === 'cancelled' || status === 'refunded') return 0;

  const { data: payments } = await supabaseAdmin
    .from('hub_payments')
    .select('amount')
    .eq('receivable_id', receivableId)
    .eq('clinic_id', clinicId);
  const paid = round2((payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0));
  return round2(Math.max(0, Number(rec.final_amount ?? 0) - paid));
}

export async function aggregateBundleBalance(bundleId: string, clinicId: string): Promise<{
  balance_due: number;
  paid_amount: number;
  total_amount: number;
  status: ChargeBundleStatus;
}> {
  const { data: bundle, error: bErr } = await supabaseAdmin
    .from('hub_charge_bundles')
    .select('id, clinic_id, status, total_amount, cancelled_at')
    .eq('id', bundleId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  if (!bundle) throw new Error('NOT_FOUND');

  if (bundle.cancelled_at || bundle.status === 'cancelled') {
    return {
      balance_due: 0,
      paid_amount: 0,
      total_amount: Number(bundle.total_amount ?? 0),
      status: 'cancelled',
    };
  }

  const { data: items, error: iErr } = await supabaseAdmin
    .from('hub_charge_bundle_items')
    .select('receivable_id')
    .eq('bundle_id', bundleId);
  if (iErr) throw new Error(iErr.message);

  const receivableIds = (items ?? []).map((r) => r.receivable_id as string).filter(Boolean);
  if (!receivableIds.length) {
    return {
      balance_due: 0,
      paid_amount: 0,
      total_amount: Number(bundle.total_amount ?? 0),
      status: 'paid',
    };
  }

  let balanceDue = 0;
  let paidOnBundle = 0;
  let openCount = 0;
  let partialCount = 0;
  let paidCount = 0;

  for (const rid of receivableIds) {
    const { data: rec } = await supabaseAdmin
      .from('hub_receivables')
      .select('final_amount, status')
      .eq('id', rid)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (!rec) continue;

    const finalAmt = Number(rec.final_amount ?? 0);
    const balance = await receivableBalanceAmount(rid, clinicId);
    balanceDue = round2(balanceDue + balance);
    paidOnBundle = round2(paidOnBundle + Math.max(0, finalAmt - balance));

    const st = String(rec.status ?? '');
    if (st === 'paid') paidCount += 1;
    else if (st === 'partially_paid') partialCount += 1;
    else if (PAYABLE_STATUSES.has(st)) openCount += 1;
  }

  let status: ChargeBundleStatus = 'open';
  if (balanceDue <= 0.009) status = 'paid';
  else if (partialCount > 0 || (paidCount > 0 && openCount > 0)) status = 'partially_paid';

  return {
    balance_due: balanceDue,
    paid_amount: paidOnBundle,
    total_amount: Number(bundle.total_amount ?? 0),
    status,
  };
}

/** Atualiza status agregado do lote após pagamento de um recebível vinculado. */
export async function syncChargeBundleStatusForReceivable(receivableId: string, clinicId: string): Promise<void> {
  try {
    const { data: links, error: linkErr } = await supabaseAdmin
      .from('hub_charge_bundle_items')
      .select('bundle_id')
      .eq('receivable_id', receivableId);
    if (linkErr) throw linkErr;

    const bundleIds = [...new Set((links ?? []).map((r) => r.bundle_id as string).filter(Boolean))];
    if (!bundleIds.length) return;

    const { data: bundles } = await supabaseAdmin
      .from('hub_charge_bundles')
      .select('id, cancelled_at, deleted_at')
      .in('id', bundleIds)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null);

    for (const bundle of bundles ?? []) {
      if (bundle.cancelled_at) continue;
      const agg = await aggregateBundleBalance(bundle.id as string, clinicId);
      await supabaseAdmin
        .from('hub_charge_bundles')
        .update({ status: agg.status })
        .eq('id', bundle.id as string)
        .eq('clinic_id', clinicId);
    }
  } catch (e) {
    console.error('syncChargeBundleStatusForReceivable', receivableId, e);
  }
}

export type ChargeBundleItemDetail = {
  receivable_id: string;
  sort_order: number;
  title: string;
  balance_amount: number;
  final_amount: number;
  due_date: string | null;
  status: string;
  pet_names: string[];
  pet_ids: string[];
};

export async function buildChargeBundleDetail(bundleId: string, clinicId: string): Promise<Record<string, unknown> | null> {
  const { data: bundle, error: bErr } = await supabaseAdmin
    .from('hub_charge_bundles')
    .select('*')
    .eq('id', bundleId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  if (!bundle) return null;

  const { data: itemRows, error: iErr } = await supabaseAdmin
    .from('hub_charge_bundle_items')
    .select('receivable_id, sort_order')
    .eq('bundle_id', bundleId)
    .order('sort_order', { ascending: true });
  if (iErr) throw new Error(iErr.message);

  const receivableIds = (itemRows ?? []).map((r) => r.receivable_id as string);
  const items: ChargeBundleItemDetail[] = [];

  if (receivableIds.length) {
    const { data: receivables } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, final_amount, due_date, status, notes, source_type, lines:hub_receivable_lines(description, pet_id, sort_order)')
      .in('id', receivableIds)
      .eq('clinic_id', clinicId);

    const byId = new Map((receivables ?? []).map((r) => [r.id as string, r]));
    const petIds = new Set<string>();
    for (const rec of receivables ?? []) {
      for (const ln of (rec.lines ?? []) as Array<{ pet_id?: string | null }>) {
        if (ln.pet_id) petIds.add(String(ln.pet_id));
      }
    }
    const petNameById = new Map<string, string>();
    if (petIds.size) {
      const { data: pets } = await supabaseAdmin.from('hub_pets').select('id, name').in('id', [...petIds]);
      for (const p of pets ?? []) petNameById.set(p.id as string, String(p.name ?? ''));
    }

    for (const row of itemRows ?? []) {
      const rid = row.receivable_id as string;
      const rec = byId.get(rid);
      if (!rec) continue;
      const lines = [...((rec.lines ?? []) as Array<{ description?: string; pet_id?: string | null; sort_order?: number }>)].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      const petNames = [
        ...new Set(
          lines
            .map((ln) => (ln.pet_id ? petNameById.get(String(ln.pet_id)) : null))
            .filter(Boolean) as string[],
        ),
      ];
      const petIds = [
        ...new Set(lines.map((ln) => (ln.pet_id ? String(ln.pet_id) : null)).filter(Boolean) as string[]),
      ];
      const title =
        lines.map((ln) => String(ln.description ?? '').trim()).filter(Boolean).slice(0, 2).join(', ') ||
        `Cobrança ${rid.slice(0, 8)}`;
      const balance = await receivableBalanceAmount(rid, clinicId);
      items.push({
        receivable_id: rid,
        sort_order: Number(row.sort_order ?? 0),
        title,
        balance_amount: balance,
        final_amount: Number(rec.final_amount ?? 0),
        due_date: (rec.due_date as string | null) ?? null,
        status: String(rec.status ?? ''),
        pet_names: petNames,
        pet_ids: petIds,
      });
    }
  }

  const [{ data: guardian }, { data: unit }, agg] = await Promise.all([
    supabaseAdmin
      .from('hub_guardians')
      .select('id, full_name, phone, email')
      .eq('id', bundle.guardian_id as string)
      .eq('clinic_id', clinicId)
      .maybeSingle(),
    bundle.unit_id
      ? supabaseAdmin.from('units').select('id, name, nickname').eq('id', bundle.unit_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    aggregateBundleBalance(bundleId, clinicId),
  ]);

  if (agg.status !== bundle.status && !bundle.cancelled_at) {
    await supabaseAdmin
      .from('hub_charge_bundles')
      .update({ status: agg.status })
      .eq('id', bundleId)
      .eq('clinic_id', clinicId);
  }

  return {
    ...bundle,
    status: agg.status,
    guardian,
    unit,
    items,
    balance_due: agg.balance_due,
    paid_amount: agg.paid_amount,
  };
}
