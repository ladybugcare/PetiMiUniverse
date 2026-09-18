/**
 * Contas a pagar (`hub_payables`) — sync a partir da equipe cirúrgica e helpers compartilhados.
 * Custo interno da clínica; nunca entra na cobrança do tutor.
 */
import { supabaseAdmin } from '../../config/supabase';

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const PAYABLE_CATEGORIES = [
  'professional_fee',
  'supplies',
  'services',
  'utilities',
  'payroll',
  'rent',
  'marketing',
  'other',
] as const;

export type PayableCategory = (typeof PAYABLE_CATEGORIES)[number];

export const PAYABLE_PAYMENT_METHODS = [
  'pix',
  'cash',
  'credit_card',
  'debit_card',
  'transfer',
  'payment_link',
  'other',
] as const;

export type PayablePaymentMethod = (typeof PAYABLE_PAYMENT_METHODS)[number];

export type PayableStatus = 'pending' | 'paid' | 'cancelled';

export type HubPayableRow = {
  id: string;
  clinic_id: string;
  unit_id: string;
  amount: number;
  category: PayableCategory;
  description: string;
  notes?: string | null;
  payee_staff_member_id?: string | null;
  payee_supplier_id?: string | null;
  payee_name: string;
  source_type: 'surgery' | 'manual';
  source_id?: string | null;
  source_role?: string | null;
  status: PayableStatus;
  due_date?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type SurgeryTeamFeeInput = {
  role: string;
  staff_id: string | null;
  name: string;
  fee_amount?: number | null;
  fee_status?: 'pending' | 'paid' | null;
  fee_due_date?: string | null;
  fee_payment_method?: PayablePaymentMethod | null;
};

/** Remove campos financeiros do JSON da equipe antes de persistir no prontuário. */
export function stripTeamFinancialFields(
  team: Array<Record<string, unknown>> | null | undefined,
): Array<Record<string, unknown>> {
  if (!Array.isArray(team)) return [];
  return team.map((row) => {
    const role = typeof row.role === 'string' ? row.role.trim() : '';
    const staffId =
      typeof row.staff_id === 'string'
        ? row.staff_id
        : typeof row.hub_staff_member_id === 'string'
          ? row.hub_staff_member_id
          : null;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    return {
      role: role || null,
      staff_id: staffId || null,
      name: name || null,
    };
  });
}

function parseTeamFeeRows(team: Array<Record<string, unknown>> | null | undefined): SurgeryTeamFeeInput[] {
  if (!Array.isArray(team)) return [];
  const out: SurgeryTeamFeeInput[] = [];
  for (const row of team) {
    const role = typeof row.role === 'string' ? row.role.trim() : '';
    const staffIdRaw =
      typeof row.staff_id === 'string'
        ? row.staff_id
        : typeof row.hub_staff_member_id === 'string'
          ? row.hub_staff_member_id
          : '';
    const staff_id = staffIdRaw.trim() || null;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const feeRaw = row.fee_amount;
    let fee_amount: number | null = null;
    if (typeof feeRaw === 'number' && Number.isFinite(feeRaw) && feeRaw > 0) {
      fee_amount = round2(feeRaw);
    } else if (typeof feeRaw === 'string' && feeRaw.trim()) {
      const n = Number(feeRaw.replace(',', '.'));
      if (Number.isFinite(n) && n > 0) fee_amount = round2(n);
    }
    const fee_status =
      row.fee_status === 'pending' || row.fee_status === 'paid' ? row.fee_status : null;
    const fee_due_date =
      typeof row.fee_due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.fee_due_date)
        ? row.fee_due_date
        : null;
    const fee_payment_method =
      typeof row.fee_payment_method === 'string' &&
      (PAYABLE_PAYMENT_METHODS as readonly string[]).includes(row.fee_payment_method)
        ? (row.fee_payment_method as PayablePaymentMethod)
        : null;
    out.push({ role, staff_id, name, fee_amount, fee_status, fee_due_date, fee_payment_method });
  }
  return out;
}

function teamFeeKey(staffId: string, role: string): string {
  return `${staffId}::${role}`;
}

/**
 * Sincroniza títulos `source_type=surgery` com a equipe enviada no PATCH/POST.
 * - Cria/atualiza quando há fee_amount > 0 e staff_id + role.
 * - Cancela pendentes cujo profissional/papel saiu da equipe ou perdeu o honorário.
 * - Títulos já pagos não são cancelados automaticamente.
 */
export async function syncSurgeryTeamPayables(params: {
  clinicId: string;
  unitId: string;
  surgeryId: string;
  surgeryTitle: string;
  team: Array<Record<string, unknown>> | null | undefined;
  createdByUserId?: string | null;
}): Promise<{ payables: HubPayableRow[]; error?: string }> {
  const { clinicId, unitId, surgeryId, surgeryTitle, team, createdByUserId } = params;
  const feeRows = parseTeamFeeRows(team).filter(
    (r) => r.staff_id && r.role && r.fee_amount != null && r.fee_amount > 0,
  );

  const { data: existing, error: listErr } = await supabaseAdmin
    .from('hub_payables')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('source_type', 'surgery')
    .eq('source_id', surgeryId)
    .is('deleted_at', null)
    .neq('status', 'cancelled');

  if (listErr) {
    if (String(listErr.message || '').includes('hub_payables')) {
      return {
        payables: [],
        error: 'Tabela hub_payables não encontrada. Aplique a migração 113_create_hub_payables.sql.',
      };
    }
    return { payables: [], error: listErr.message };
  }

  const existingRows = (existing ?? []) as HubPayableRow[];
  const desiredKeys = new Set(
    feeRows.map((r) => teamFeeKey(r.staff_id as string, r.role)),
  );

  // Cancelar pendentes que saíram da equipe / sem honorário
  for (const row of existingRows) {
    if (row.status !== 'pending') continue;
    const staffId = row.payee_staff_member_id;
    const role = (row.source_role || '').trim();
    if (!staffId || !role || !desiredKeys.has(teamFeeKey(staffId, role))) {
      const { error: cancelErr } = await supabaseAdmin
        .from('hub_payables')
        .update({ status: 'cancelled' })
        .eq('id', row.id)
        .eq('clinic_id', clinicId)
        .eq('status', 'pending');
      if (cancelErr) return { payables: [], error: cancelErr.message };
    }
  }

  const nowIso = new Date().toISOString();

  for (const fee of feeRows) {
    const staffId = fee.staff_id as string;
    const role = fee.role;
    const key = teamFeeKey(staffId, role);
    const match = existingRows.find(
      (r) =>
        r.status !== 'cancelled' &&
        r.payee_staff_member_id === staffId &&
        (r.source_role || '').trim() === role,
    );

    const payeeName = fee.name || 'Profissional';
    const description = `Honorário — ${role} — ${surgeryTitle}`.slice(0, 2000);
    const status: PayableStatus = fee.fee_status === 'paid' ? 'paid' : 'pending';
    const paidAt = status === 'paid' ? nowIso : null;
    const paymentMethod = status === 'paid' ? fee.fee_payment_method ?? 'other' : null;

    if (match) {
      // Não reabrir/alterar título já pago via sync (exceto se ainda pending)
      if (match.status === 'paid') {
        // Atualiza só descrição/nome se o valor já foi liquidado; amount permanece
        const { error: updPaidErr } = await supabaseAdmin
          .from('hub_payables')
          .update({
            payee_name: payeeName,
            description,
            source_role: role,
          })
          .eq('id', match.id)
          .eq('clinic_id', clinicId);
        if (updPaidErr) return { payables: [], error: updPaidErr.message };
        continue;
      }

      const updatePayload: Record<string, unknown> = {
        amount: fee.fee_amount,
        category: 'professional_fee',
        description,
        payee_name: payeeName,
        source_role: role,
        due_date: status === 'pending' ? fee.fee_due_date ?? match.due_date ?? null : match.due_date ?? null,
      };
      if (status === 'paid' && match.status === 'pending') {
        updatePayload.status = 'paid';
        updatePayload.paid_at = paidAt;
        updatePayload.payment_method = paymentMethod;
      } else if (status === 'pending') {
        updatePayload.status = 'pending';
        updatePayload.paid_at = null;
        updatePayload.payment_method = null;
      }

      const { error: updErr } = await supabaseAdmin
        .from('hub_payables')
        .update(updatePayload)
        .eq('id', match.id)
        .eq('clinic_id', clinicId);
      if (updErr) return { payables: [], error: updErr.message };
      void key;
    } else {
      const { error: insErr } = await supabaseAdmin.from('hub_payables').insert({
        clinic_id: clinicId,
        unit_id: unitId,
        amount: fee.fee_amount,
        category: 'professional_fee',
        description,
        payee_staff_member_id: staffId,
        payee_name: payeeName,
        source_type: 'surgery',
        source_id: surgeryId,
        source_role: role,
        status,
        due_date: status === 'pending' ? fee.fee_due_date ?? null : null,
        paid_at: paidAt,
        payment_method: paymentMethod,
        created_by_user_id: createdByUserId ?? null,
      });
      if (insErr) return { payables: [], error: insErr.message };
    }
  }

  const { data: refreshed, error: refErr } = await supabaseAdmin
    .from('hub_payables')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('source_type', 'surgery')
    .eq('source_id', surgeryId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (refErr) return { payables: [], error: refErr.message };
  return { payables: (refreshed ?? []) as HubPayableRow[] };
}

export async function listPayablesForSurgery(
  clinicId: string,
  surgeryId: string,
): Promise<{ payables: HubPayableRow[]; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from('hub_payables')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('source_type', 'surgery')
    .eq('source_id', surgeryId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });
  if (error) {
    if (String(error.message || '').includes('hub_payables')) {
      return { payables: [] };
    }
    return { payables: [], error: error.message };
  }
  return { payables: (data ?? []) as HubPayableRow[] };
}

/** Soma payables pagos no período (por dia do paid_at em America/Sao_Paulo via slice ISO — UTC day). */
export async function sumPaidPayablesInPeriod(params: {
  clinicId: string;
  unitId: string;
  fromYmd: string;
  toYmd: string;
}): Promise<{ total: number; byDay: Map<string, number>; missingTable: boolean; error?: string }> {
  const fromIso = `${params.fromYmd}T00:00:00.000Z`;
  const toIso = `${params.toYmd}T23:59:59.999Z`;
  const { data, error } = await supabaseAdmin
    .from('hub_payables')
    .select('amount, paid_at')
    .eq('clinic_id', params.clinicId)
    .eq('unit_id', params.unitId)
    .eq('status', 'paid')
    .is('deleted_at', null)
    .gte('paid_at', fromIso)
    .lte('paid_at', toIso);

  if (error) {
    if (String(error.message || '').includes('hub_payables')) {
      return { total: 0, byDay: new Map(), missingTable: true };
    }
    return { total: 0, byDay: new Map(), missingTable: false, error: error.message };
  }

  const byDay = new Map<string, number>();
  let total = 0;
  for (const row of data ?? []) {
    const amt = Number(row.amount ?? 0);
    total = round2(total + amt);
    const key = String(row.paid_at ?? '').slice(0, 10);
    if (key) byDay.set(key, round2((byDay.get(key) ?? 0) + amt));
  }
  return { total, byDay, missingTable: false };
}

export async function sumPendingPayables(params: {
  clinicId: string;
  unitId: string;
}): Promise<{ total: number; count: number; missingTable: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from('hub_payables')
    .select('amount')
    .eq('clinic_id', params.clinicId)
    .eq('unit_id', params.unitId)
    .eq('status', 'pending')
    .is('deleted_at', null);

  if (error) {
    if (String(error.message || '').includes('hub_payables')) {
      return { total: 0, count: 0, missingTable: true };
    }
    return { total: 0, count: 0, missingTable: false, error: error.message };
  }
  const total = round2((data ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0));
  return { total, count: data?.length ?? 0, missingTable: false };
}
