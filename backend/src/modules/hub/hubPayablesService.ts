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
  source_type: 'surgery' | 'manual' | 'recurrence';
  source_id?: string | null;
  source_role?: string | null;
  recurrence_detached?: boolean;
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

export const PAYABLE_SCHEDULE_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;
export type PayableScheduleFrequency = (typeof PAYABLE_SCHEDULE_FREQUENCIES)[number];
export type PayableScheduleStatus = 'active' | 'paused' | 'ended';

export type HubPayableScheduleRow = {
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
  frequency: PayableScheduleFrequency;
  anchor_date: string;
  until_date?: string | null;
  status: PayableScheduleStatus;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayYmdSaoPaulo(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function utcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(ymd: string, days: number): string {
  const d = ymdToUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToYmd(d);
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  return Math.round((ymdToUtc(toYmd).getTime() - ymdToUtc(fromYmd).getTime()) / 86_400_000);
}

/** Primeiro dia do mês de `todayYmd` até o último dia do mês seguinte. */
export function payableHorizonBounds(todayYmd: string): { fromYmd: string; toYmd: string } {
  const y = Number(todayYmd.slice(0, 4));
  const m = Number(todayYmd.slice(5, 7));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m + 1, 0));
  return { fromYmd: utcToYmd(from), toYmd: utcToYmd(to) };
}

/**
 * Vencimentos do contrato que caem no mês atual ou no próximo.
 * Não recria meses anteriores. Mensal usa o dia da âncora e encurta no fim do mês
 * (o mesmo critério de `generateOccurrenceDates`).
 */
export function payableScheduleDueDates(params: {
  frequency: PayableScheduleFrequency;
  anchorDate: string;
  untilDate?: string | null;
  todayYmd: string;
}): string[] {
  const anchor = params.anchorDate.slice(0, 10);
  if (!YMD_RE.test(anchor) || !YMD_RE.test(params.todayYmd)) return [];
  const { fromYmd, toYmd } = payableHorizonBounds(params.todayYmd);
  const until =
    params.untilDate && YMD_RE.test(params.untilDate.slice(0, 10))
      ? params.untilDate.slice(0, 10)
      : null;
  const horizonEnd = until && until < toYmd ? until : toYmd;
  if (horizonEnd < fromYmd || anchor > horizonEnd) return [];

  if (params.frequency === 'monthly') {
    const anchorDay = Number(anchor.slice(8, 10));
    const dates: string[] = [];
    let year = Number(anchor.slice(0, 4));
    let month = Number(anchor.slice(5, 7));
    for (let i = 0; i < 36; i += 1) {
      let ymd: string;
      if (i === 0) {
        ymd = anchor;
      } else {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const day = Math.min(anchorDay, lastDay);
        ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      if (ymd > horizonEnd) break;
      if (ymd >= fromYmd) dates.push(ymd);
    }
    return dates;
  }

  const stepDays = params.frequency === 'biweekly' ? 14 : 7;
  let cursor = anchor;
  if (cursor < fromYmd) {
    const steps = Math.floor(daysBetweenYmd(anchor, fromYmd) / stepDays);
    cursor = addUtcDays(anchor, steps * stepDays);
    if (cursor < fromYmd) cursor = addUtcDays(cursor, stepDays);
  }
  const dates: string[] = [];
  for (let i = 0; i < 16 && cursor <= horizonEnd; i += 1) {
    if (cursor >= fromYmd && cursor >= anchor) dates.push(cursor);
    cursor = addUtcDays(cursor, stepDays);
  }
  return dates;
}

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function payableOccurrenceDescription(
  base: string,
  frequency: PayableScheduleFrequency,
  dueYmd: string,
): string {
  const trimmed = base.trim();
  const month = Number(dueYmd.slice(5, 7));
  const suffix =
    frequency === 'monthly'
      ? `${MONTH_LABELS[month - 1] ?? dueYmd.slice(5, 7)}/${dueYmd.slice(0, 4)}`
      : `${dueYmd.slice(8, 10)}/${dueYmd.slice(5, 7)}/${dueYmd.slice(0, 4)}`;
  return `${trimmed} · ${suffix}`.slice(0, 2000);
}

export function nextPayableScheduleDueDate(
  schedule: Pick<HubPayableScheduleRow, 'frequency' | 'anchor_date' | 'until_date'>,
  todayYmd: string,
): string | null {
  const dates = payableScheduleDueDates({
    frequency: schedule.frequency,
    anchorDate: String(schedule.anchor_date).slice(0, 10),
    untilDate: schedule.until_date ? String(schedule.until_date).slice(0, 10) : null,
    todayYmd,
  });
  return dates.find((d) => d >= todayYmd) ?? null;
}

function isMissingScheduleTable(message: string): boolean {
  const msg = String(message || '');
  return msg.includes('hub_payable_schedules') || msg.includes('recurrence_detached');
}

function scheduleDueKey(sourceId: string, due: string | null | undefined): string {
  return `${sourceId}|${String(due ?? '').slice(0, 10)}`;
}

export async function listPayableSchedules(params: {
  clinicId: string;
  unitId: string;
  todayYmd?: string;
}): Promise<{ schedules: Array<HubPayableScheduleRow & { next_due_date: string | null }>; missingTable: boolean; error?: string }> {
  const todayYmd = params.todayYmd ?? todayYmdSaoPaulo();
  const { data, error } = await supabaseAdmin
    .from('hub_payable_schedules')
    .select('*')
    .eq('clinic_id', params.clinicId)
    .eq('unit_id', params.unitId)
    .is('deleted_at', null)
    .in('status', ['active', 'paused'])
    .order('payee_name', { ascending: true });
  if (error) {
    if (isMissingScheduleTable(error.message)) {
      return { schedules: [], missingTable: true };
    }
    return { schedules: [], missingTable: false, error: error.message };
  }
  const schedules = ((data ?? []) as HubPayableScheduleRow[]).map((row) => ({
    ...row,
    anchor_date: String(row.anchor_date).slice(0, 10),
    until_date: row.until_date ? String(row.until_date).slice(0, 10) : null,
    next_due_date: nextPayableScheduleDueDate(row, todayYmd),
  }));
  return { schedules, missingTable: false };
}

async function insertOccurrence(
  schedule: HubPayableScheduleRow,
  dueYmd: string,
): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin.from('hub_payables').insert({
    clinic_id: schedule.clinic_id,
    unit_id: schedule.unit_id,
    amount: round2(Number(schedule.amount)),
    category: schedule.category,
    description: payableOccurrenceDescription(schedule.description, schedule.frequency, dueYmd),
    notes: schedule.notes ?? null,
    payee_staff_member_id: schedule.payee_staff_member_id ?? null,
    payee_supplier_id: schedule.payee_supplier_id ?? null,
    payee_name: schedule.payee_name,
    source_type: 'recurrence',
    source_id: schedule.id,
    source_role: null,
    recurrence_detached: false,
    status: 'pending',
    due_date: dueYmd,
    paid_at: null,
    payment_method: null,
    created_by_user_id: schedule.created_by_user_id ?? null,
  });
  if (!error) return {};
  if (error.code === '23505' || String(error.message || '').includes('uniq_hub_payables_recurrence_due')) {
    return {};
  }
  return { error: error.message };
}

/**
 * Cria competências que ainda não existem no mês atual e no próximo.
 * Não altera pagos, cancelados nem títulos desligados do contrato.
 */
export async function ensurePayableScheduleHorizon(params: {
  clinicId: string;
  unitId: string;
  todayYmd?: string;
}): Promise<{ created: number; missingTable: boolean; error?: string }> {
  const todayYmd = params.todayYmd ?? todayYmdSaoPaulo();
  const { data, error } = await supabaseAdmin
    .from('hub_payable_schedules')
    .select('*')
    .eq('clinic_id', params.clinicId)
    .eq('unit_id', params.unitId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (error) {
    if (isMissingScheduleTable(error.message)) return { created: 0, missingTable: true };
    return { created: 0, missingTable: false, error: error.message };
  }
  const schedules = (data ?? []) as HubPayableScheduleRow[];
  if (schedules.length === 0) return { created: 0, missingTable: false };

  const ids = schedules.map((s) => s.id);
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('hub_payables')
    .select('source_id, due_date, status')
    .eq('clinic_id', params.clinicId)
    .eq('source_type', 'recurrence')
    .in('source_id', ids)
    .is('deleted_at', null);
  if (exErr) {
    if (isMissingScheduleTable(exErr.message) || String(exErr.message || '').includes('hub_payables')) {
      return { created: 0, missingTable: true };
    }
    return { created: 0, missingTable: false, error: exErr.message };
  }
  const taken = new Set(
    (existing ?? []).map((row) =>
      scheduleDueKey(String(row.source_id), row.due_date as string | null),
    ),
  );

  let created = 0;
  for (const schedule of schedules) {
    const dates = payableScheduleDueDates({
      frequency: schedule.frequency,
      anchorDate: String(schedule.anchor_date).slice(0, 10),
      untilDate: schedule.until_date ? String(schedule.until_date).slice(0, 10) : null,
      todayYmd,
    });
    for (const due of dates) {
      if (taken.has(scheduleDueKey(schedule.id, due))) continue;
      const inserted = await insertOccurrence(schedule, due);
      if (inserted.error) return { created, missingTable: false, error: inserted.error };
      taken.add(scheduleDueKey(schedule.id, due));
      created += 1;
    }
  }
  return { created, missingTable: false };
}

/** Atualiza pendentes ainda ligados ao contrato e cancela os que passaram de `until_date`. */
export async function propagatePayableSchedule(
  schedule: HubPayableScheduleRow,
): Promise<{ error?: string }> {
  const { data, error } = await supabaseAdmin
    .from('hub_payables')
    .select('id, due_date')
    .eq('clinic_id', schedule.clinic_id)
    .eq('source_type', 'recurrence')
    .eq('source_id', schedule.id)
    .eq('status', 'pending')
    .eq('recurrence_detached', false)
    .is('deleted_at', null);
  if (error) return { error: error.message };

  const until = schedule.until_date ? String(schedule.until_date).slice(0, 10) : null;
  for (const row of data ?? []) {
    const due = String(row.due_date ?? '').slice(0, 10);
    if (until && due && due > until) {
      const { error: cancelErr } = await supabaseAdmin
        .from('hub_payables')
        .update({ status: 'cancelled' })
        .eq('id', row.id)
        .eq('status', 'pending');
      if (cancelErr) return { error: cancelErr.message };
      continue;
    }
    const { error: updErr } = await supabaseAdmin
      .from('hub_payables')
      .update({
        amount: round2(Number(schedule.amount)),
        category: schedule.category,
        description: due
          ? payableOccurrenceDescription(schedule.description, schedule.frequency, due)
          : schedule.description,
        notes: schedule.notes ?? null,
        payee_staff_member_id: schedule.payee_staff_member_id ?? null,
        payee_supplier_id: schedule.payee_supplier_id ?? null,
        payee_name: schedule.payee_name,
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .eq('recurrence_detached', false);
    if (updErr) return { error: updErr.message };
  }
  return {};
}

/** Encerra o contrato e cancela pendentes com vencimento depois de hoje. */
export async function endPayableSchedule(params: {
  schedule: HubPayableScheduleRow;
  todayYmd?: string;
}): Promise<{ error?: string }> {
  const todayYmd = params.todayYmd ?? todayYmdSaoPaulo();
  const { error } = await supabaseAdmin
    .from('hub_payable_schedules')
    .update({ status: 'ended' })
    .eq('id', params.schedule.id)
    .eq('clinic_id', params.schedule.clinic_id);
  if (error) return { error: error.message };

  const { error: cancelErr } = await supabaseAdmin
    .from('hub_payables')
    .update({ status: 'cancelled' })
    .eq('clinic_id', params.schedule.clinic_id)
    .eq('source_type', 'recurrence')
    .eq('source_id', params.schedule.id)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .gt('due_date', todayYmd);
  if (cancelErr) return { error: cancelErr.message };
  return {};
}
