/**
 * Faturamento periódico de séries de agendamento (ciclo mês calendário).
 */
import { supabaseAdmin } from '../../config/supabase';
import { roundMoney2 } from './hubServiceTypesPricingMatrix';

export type SeriesBillingMode = 'per_occurrence' | 'periodic_invoice';
export type InvoiceIssueRule = 'fixed_day' | 'first_business_day';
export type InvoiceDueRule = 'same_day' | 'plus_days' | 'fixed_day';

export type SeriesBillingConfig = {
  billing_mode: SeriesBillingMode;
  invoice_cycle?: 'calendar_month' | null;
  invoice_issue_rule?: InvoiceIssueRule | null;
  invoice_issue_day?: number | null;
  invoice_due_rule?: InvoiceDueRule | null;
  invoice_due_day?: number | null;
  invoice_due_plus_days?: number | null;
};

export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

export function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDaysYmd(ymd: string, delta: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Seg–sex; se cair no fim de semana, avança para segunda. */
export function firstBusinessDayOfMonth(year: number, month1to12: number): string {
  let d = 1;
  for (;;) {
    const dt = new Date(Date.UTC(year, month1to12 - 1, d));
    const dow = dt.getUTCDay(); // 0=dom … 6=sáb
    if (dow !== 0 && dow !== 6) return toYmd(year, month1to12, d);
    d += 1;
    if (d > 7) return toYmd(year, month1to12, 1);
  }
}

export function calendarMonthBounds(ymd: string): { period_start: string; period_end: string } {
  const { y, m } = parseYmd(ymd);
  const period_start = toYmd(y, m, 1);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const period_end = toYmd(y, m, last);
  return { period_start, period_end };
}

export function resolveIssueDate(periodStart: string, cfg: SeriesBillingConfig): string {
  const { y, m } = parseYmd(periodStart);
  if (cfg.invoice_issue_rule === 'first_business_day') {
    return firstBusinessDayOfMonth(y, m);
  }
  const day = Math.min(28, Math.max(1, Number(cfg.invoice_issue_day ?? 1)));
  return toYmd(y, m, day);
}

export function resolveDueDate(issueDate: string, cfg: SeriesBillingConfig): string {
  if (cfg.invoice_due_rule === 'plus_days') {
    return addDaysYmd(issueDate, Math.max(0, Number(cfg.invoice_due_plus_days ?? 0)));
  }
  if (cfg.invoice_due_rule === 'fixed_day') {
    const { y, m } = parseYmd(issueDate);
    const day = Math.min(28, Math.max(1, Number(cfg.invoice_due_day ?? 1)));
    return toYmd(y, m, day);
  }
  return issueDate;
}

export function normalizeSeriesBillingForInsert(
  input: SeriesBillingConfig | null | undefined
): Record<string, unknown> {
  const mode = input?.billing_mode ?? 'per_occurrence';
  if (mode !== 'periodic_invoice') {
    return {
      billing_mode: 'per_occurrence',
      invoice_cycle: null,
      invoice_issue_rule: null,
      invoice_issue_day: null,
      invoice_due_rule: null,
      invoice_due_day: null,
      invoice_due_plus_days: null,
    };
  }
  const issueRule = input?.invoice_issue_rule ?? 'first_business_day';
  const dueRule = input?.invoice_due_rule ?? 'same_day';
  return {
    billing_mode: 'periodic_invoice',
    invoice_cycle: 'calendar_month',
    invoice_issue_rule: issueRule,
    invoice_issue_day: issueRule === 'fixed_day' ? Math.min(28, Math.max(1, Number(input?.invoice_issue_day ?? 1))) : null,
    invoice_due_rule: dueRule,
    invoice_due_day: dueRule === 'fixed_day' ? Math.min(28, Math.max(1, Number(input?.invoice_due_day ?? 1))) : null,
    invoice_due_plus_days: dueRule === 'plus_days' ? Math.max(0, Number(input?.invoice_due_plus_days ?? 0)) : null,
  };
}

export async function seriesHasIssuedInvoice(seriesId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hub_series_invoices')
    .select('id')
    .eq('series_id', seriesId)
    .eq('status', 'issued')
    .limit(1)
    .maybeSingle();
  if (error) {
    if (String(error.message || '').includes('hub_series_invoices')) return false;
    throw new Error(error.message);
  }
  return Boolean(data);
}

export async function findSeriesInvoiceCoverageForAppointments(
  appointmentIds: string[]
): Promise<Map<string, { series_invoice_id: string; comanda_id: string | null }>> {
  const map = new Map<string, { series_invoice_id: string; comanda_id: string | null }>();
  if (!appointmentIds.length) return map;
  const { data, error } = await supabaseAdmin
    .from('hub_series_invoice_items')
    .select('appointment_id, series_invoice_id, invoice:hub_series_invoices(id, status, comanda_id)')
    .in('appointment_id', appointmentIds);
  if (error) {
    if (String(error.message || '').includes('hub_series_invoice')) return map;
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const inv = row.invoice as
      | { id?: string; status?: string; comanda_id?: string | null }
      | { id?: string; status?: string; comanda_id?: string | null }[]
      | null;
    const invoice = Array.isArray(inv) ? inv[0] : inv;
    if (!invoice || invoice.status === 'cancelled') continue;
    map.set(row.appointment_id as string, {
      series_invoice_id: String(row.series_invoice_id),
      comanda_id: (invoice.comanda_id as string | null) ?? null,
    });
  }
  return map;
}

type SeriesRow = {
  id: string;
  clinic_id: string;
  billing_mode: string;
  invoice_cycle: string | null;
  invoice_issue_rule: string | null;
  invoice_issue_day: number | null;
  invoice_due_rule: string | null;
  invoice_due_day: number | null;
  invoice_due_plus_days: number | null;
};

/**
 * Emite fatura do ciclo (mês) para a série se ainda não existir / estiver pending.
 * Cria comanda origin_type=series_invoice + itens + recebível pending.
 */
export async function issueSeriesInvoiceForPeriod(input: {
  clinicId: string;
  seriesId: string;
  /** Qualquer YMD dentro do mês-alvo (default: hoje UTC). */
  refYmd?: string;
  actorUserId?: string | null;
  /** Se true, emite mesmo que issue_date > hoje (manual). */
  force?: boolean;
}): Promise<{
  series_invoice_id: string;
  comanda_id: string;
  receivable_id: string | null;
  total_amount: number;
  occurrence_count: number;
  already_issued?: boolean;
}> {
  const ref = input.refYmd ?? new Date().toISOString().slice(0, 10);
  const { period_start, period_end } = calendarMonthBounds(ref);

  const { data: series, error: sErr } = await supabaseAdmin
    .from('hub_appointment_series')
    .select(
      'id, clinic_id, billing_mode, invoice_cycle, invoice_issue_rule, invoice_issue_day, invoice_due_rule, invoice_due_day, invoice_due_plus_days'
    )
    .eq('id', input.seriesId)
    .eq('clinic_id', input.clinicId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!series) throw new Error('SERIES_NOT_FOUND');
  const row = series as SeriesRow;
  if (row.billing_mode !== 'periodic_invoice') throw new Error('SERIES_NOT_PERIODIC');

  const cfg: SeriesBillingConfig = {
    billing_mode: 'periodic_invoice',
    invoice_cycle: 'calendar_month',
    invoice_issue_rule: (row.invoice_issue_rule as InvoiceIssueRule) ?? 'first_business_day',
    invoice_issue_day: row.invoice_issue_day,
    invoice_due_rule: (row.invoice_due_rule as InvoiceDueRule) ?? 'same_day',
    invoice_due_day: row.invoice_due_day,
    invoice_due_plus_days: row.invoice_due_plus_days,
  };
  const issue_date = resolveIssueDate(period_start, cfg);
  const due_date = resolveDueDate(issue_date, cfg);
  if (!input.force && issue_date > ref) throw new Error('ISSUE_DATE_IN_FUTURE');

  const { data: existing } = await supabaseAdmin
    .from('hub_series_invoices')
    .select('id, status, comanda_id, total_amount')
    .eq('series_id', input.seriesId)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .maybeSingle();

  if (existing && String(existing.status) === 'issued' && existing.comanda_id) {
    return {
      series_invoice_id: existing.id as string,
      comanda_id: existing.comanda_id as string,
      receivable_id: null,
      total_amount: Number(existing.total_amount ?? 0),
      occurrence_count: 0,
      already_issued: true,
    };
  }

  const dayStart = `${period_start}T00:00:00.000Z`;
  const dayEnd = `${period_end}T23:59:59.999Z`;
  const { data: appts, error: aErr } = await supabaseAdmin
    .from('hub_appointments')
    .select(
      `id, guardian_id, pet_id, unit_id, starts_at, status, title,
       appointment_services:hub_appointment_services(id, hub_service_type_id, sale_amount_applied, order_index, hub_service_types(name))`
    )
    .eq('clinic_id', input.clinicId)
    .eq('series_id', input.seriesId)
    .is('deleted_at', null)
    .not('status', 'in', '("cancelled","no_show")')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .order('starts_at', { ascending: true });
  if (aErr) throw new Error(aErr.message);

  const occurrences = appts ?? [];
  if (!occurrences.length) throw new Error('NO_OCCURRENCES');

  const guardianId = occurrences[0]?.guardian_id as string | null;
  if (!guardianId) throw new Error('NO_GUARDIAN');
  const petId = (occurrences[0]?.pet_id as string | null) ?? null;
  let unitId = (occurrences[0]?.unit_id as string | null) ?? null;
  if (!unitId) {
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('id')
      .eq('clinic_id', input.clinicId)
      .limit(1)
      .maybeSingle();
    unitId = (unit?.id as string | null) ?? null;
  }
  if (!unitId) throw new Error('NO_UNIT');

  type Line = {
    appointment_id: string;
    appointment_service_id: string | null;
    description: string;
    sale_amount: number;
    pet_id: string | null;
    hub_service_type_id: string | null;
  };
  const lines: Line[] = [];
  for (const appt of occurrences) {
    const svcs =
      (appt.appointment_services as Array<{
        id: string;
        hub_service_type_id?: string | null;
        sale_amount_applied?: number | null;
        hub_service_types?: { name?: string } | { name?: string }[] | null;
      }> | null) ?? [];
    const starts = String(appt.starts_at ?? '').slice(0, 10);
    if (!svcs.length) {
      lines.push({
        appointment_id: appt.id as string,
        appointment_service_id: null,
        description: `${String(appt.title || 'Agendamento')} (${starts})`,
        sale_amount: 0,
        pet_id: (appt.pet_id as string | null) ?? petId,
        hub_service_type_id: null,
      });
      continue;
    }
    for (const svc of svcs) {
      const st = svc.hub_service_types;
      const name = Array.isArray(st) ? st[0]?.name : st?.name;
      lines.push({
        appointment_id: appt.id as string,
        appointment_service_id: svc.id,
        description: `${name || 'Serviço'} (${starts})`,
        sale_amount: roundMoney2(Number(svc.sale_amount_applied ?? 0)),
        pet_id: (appt.pet_id as string | null) ?? petId,
        hub_service_type_id: (svc.hub_service_type_id as string | null) ?? null,
      });
    }
  }

  const total = roundMoney2(lines.reduce((s, l) => s + l.sale_amount, 0));

  let invoiceId = existing?.id as string | undefined;
  if (!invoiceId) {
    const { data: inv, error: iErr } = await supabaseAdmin
      .from('hub_series_invoices')
      .insert({
        clinic_id: input.clinicId,
        series_id: input.seriesId,
        period_start,
        period_end,
        issue_date,
        due_date,
        status: 'pending_issue',
        total_amount: total,
      })
      .select('id')
      .single();
    if (iErr || !inv) throw new Error(iErr?.message || 'INVOICE_CREATE_FAILED');
    invoiceId = inv.id as string;
  } else {
    await supabaseAdmin
      .from('hub_series_invoices')
      .update({ issue_date, due_date, total_amount: total, status: 'pending_issue' })
      .eq('id', invoiceId);
  }

  const { data: comanda, error: cErr } = await supabaseAdmin
    .from('hub_comandas')
    .insert({
      clinic_id: input.clinicId,
      unit_id: unitId,
      guardian_id: guardianId,
      pet_id: petId,
      origin_type: 'series_invoice',
      origin_id: invoiceId,
      status: 'aberta',
      financial_status: 'open',
      subtotal_amount: total,
      discount_amount: 0,
      total_amount: total,
      notes: `Fatura da série — ${period_start.slice(0, 7)}`,
    })
    .select('id')
    .single();
  if (cErr || !comanda) throw new Error(cErr?.message || 'COMANDA_CREATE_FAILED');
  const comandaId = comanda.id as string;

  const itemRows = lines.map((l, idx) => ({
    clinic_id: input.clinicId,
    comanda_id: comandaId,
    pet_id: l.pet_id,
    item_kind: 'service',
    hub_service_type_id: l.hub_service_type_id,
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    description: l.description,
    quantity: 1,
    unit_amount: l.sale_amount,
    discount_amount: 0,
    line_total: l.sale_amount,
    service_date: null,
    origin_type: 'series_invoice_line',
    origin_id: l.appointment_service_id ?? l.appointment_id,
    sort_order: idx,
  }));
  if (itemRows.length) {
    const { error: itemsErr } = await supabaseAdmin.from('hub_comanda_items').insert(itemRows);
    if (itemsErr) {
      await supabaseAdmin.from('hub_comandas').delete().eq('id', comandaId);
      throw new Error(itemsErr.message);
    }
  }

  await supabaseAdmin.from('hub_series_invoice_items').delete().eq('series_invoice_id', invoiceId);
  const linkRows = lines.map((l) => ({
    series_invoice_id: invoiceId,
    appointment_id: l.appointment_id,
    appointment_service_id: l.appointment_service_id,
    sale_amount: l.sale_amount,
    description: l.description,
  }));
  if (linkRows.length) {
    const { error: linkErr } = await supabaseAdmin.from('hub_series_invoice_items').insert(linkRows);
    if (linkErr) throw new Error(linkErr.message);
  }

  const { data: receivable, error: rErr } = await supabaseAdmin
    .from('hub_receivables')
    .insert({
      clinic_id: input.clinicId,
      unit_id: unitId,
      guardian_id: guardianId,
      comanda_id: comandaId,
      source_type: 'manual',
      source_id: invoiceId,
      original_amount: total,
      final_amount: total,
      status: 'pending',
      due_date,
      notes: `Fatura série ${period_start.slice(0, 7)}`,
    })
    .select('id')
    .single();
  if (rErr) {
    console.error('[series_invoice] receivable', rErr.message);
  } else if (receivable?.id) {
    const { data: comandaItems } = await supabaseAdmin
      .from('hub_comanda_items')
      .select('id, pet_id, origin_id, hub_service_type_id, description, quantity, unit_amount, line_total')
      .eq('comanda_id', comandaId)
      .order('sort_order', { ascending: true });
    let sort = 0;
    for (const it of comandaItems ?? []) {
      await supabaseAdmin.from('hub_receivable_lines').insert({
        clinic_id: input.clinicId,
        receivable_id: receivable.id,
        comanda_id: comandaId,
        comanda_item_id: it.id,
        pet_id: it.pet_id,
        line_kind: 'manual',
        source_line_id: it.origin_id,
        hub_service_type_id: it.hub_service_type_id,
        description: String(it.description),
        quantity: Number(it.quantity ?? 1),
        unit_sale_amount: Number(it.unit_amount ?? 0),
        line_total: Number(it.line_total ?? 0),
        sort_order: sort++,
      });
    }
  }

  await supabaseAdmin
    .from('hub_series_invoices')
    .update({
      status: 'issued',
      comanda_id: comandaId,
      total_amount: total,
    })
    .eq('id', invoiceId);

  await supabaseAdmin
    .from('hub_comandas')
    .update({
      finance_handoff_at: new Date().toISOString(),
      financial_status: 'pending',
    })
    .eq('id', comandaId);

  return {
    series_invoice_id: invoiceId,
    comanda_id: comandaId,
    receivable_id: (receivable?.id as string | null) ?? null,
    total_amount: total,
    occurrence_count: occurrences.length,
  };
}

/** Cron: emite faturas cujo issue_date = hoje para séries periodic_invoice. */
export async function runSeriesInvoiceIssuanceJob(opts?: { clinicId?: string; refYmd?: string }) {
  const ref = opts?.refYmd ?? new Date().toISOString().slice(0, 10);
  let q = supabaseAdmin
    .from('hub_appointment_series')
    .select('id, clinic_id')
    .eq('billing_mode', 'periodic_invoice');
  if (opts?.clinicId) q = q.eq('clinic_id', opts.clinicId);
  const { data: seriesList, error } = await q;
  if (error) {
    if (String(error.message || '').includes('billing_mode')) {
      return { issued: 0, skipped: 0, errors: [] as string[] };
    }
    throw new Error(error.message);
  }

  let issued = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const s of seriesList ?? []) {
    try {
      const { period_start } = calendarMonthBounds(ref);
      const cfgRow = await supabaseAdmin
        .from('hub_appointment_series')
        .select('invoice_issue_rule, invoice_issue_day, invoice_due_rule, invoice_due_day, invoice_due_plus_days')
        .eq('id', s.id as string)
        .maybeSingle();
      const cfg: SeriesBillingConfig = {
        billing_mode: 'periodic_invoice',
        invoice_issue_rule: (cfgRow.data?.invoice_issue_rule as InvoiceIssueRule) ?? 'first_business_day',
        invoice_issue_day: cfgRow.data?.invoice_issue_day as number | null,
        invoice_due_rule: (cfgRow.data?.invoice_due_rule as InvoiceDueRule) ?? 'same_day',
        invoice_due_day: cfgRow.data?.invoice_due_day as number | null,
        invoice_due_plus_days: cfgRow.data?.invoice_due_plus_days as number | null,
      };
      const issueDate = resolveIssueDate(period_start, cfg);
      if (issueDate !== ref) {
        skipped += 1;
        continue;
      }
      await issueSeriesInvoiceForPeriod({
        clinicId: s.clinic_id as string,
        seriesId: s.id as string,
        refYmd: ref,
        force: false,
      });
      issued += 1;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      if (msg === 'NO_OCCURRENCES' || msg === 'ISSUE_DATE_IN_FUTURE' || msg === 'SERIES_NOT_PERIODIC') {
        skipped += 1;
        continue;
      }
      errors.push(`${s.id}: ${msg}`);
    }
  }
  return { issued, skipped, errors };
}
