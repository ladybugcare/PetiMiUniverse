import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { computeBalances } from './hubInventoryController';
import { streamPaymentReceiptPdf } from './hubPaymentReceiptPdf';
import { fetchOpenComandaOriginKeysExported } from './hubComandasController';

const uuidStr = z.string().uuid();
const financeSourceTypeSchema = z.enum(['grooming_session', 'encounter', 'quote', 'appointment']);
const receivableSourceTypeSchema = z.enum(['grooming_session', 'encounter', 'quote', 'appointment', 'manual']);

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Retorna o ID da sessão de caixa aberta para uma unidade, ou null se não houver. */
export async function resolveOpenCashSessionId(clinicId: string, unitId: string | null): Promise<string | null> {
  if (!unitId) return null;
  const { data } = await supabaseAdmin
    .from('hub_cash_sessions')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('unit_id', unitId)
    .eq('status', 'open')
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/** Resolve unidade efetiva do recebível (recebível → comanda) e associa à sessão aberta. */
export async function resolvePaymentCashSessionId(
  clinicId: string,
  recUnitId: string | null | undefined,
  comandaUnitId?: string | null,
): Promise<string | null> {
  const unitId = recUnitId ?? comandaUnitId ?? null;
  return resolveOpenCashSessionId(clinicId, unitId);
}

function paymentYmd(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Vincula pagamentos órfãos (sem cash_session_id) à sessão aberta quando pertencem
 * à mesma unidade e ao mesmo dia da abertura — ex.: pagamento antes de abrir o caixa.
 */
export async function linkOrphanPaymentsToSession(
  clinicId: string,
  session: { id: string; unit_id: string; opened_at: string },
): Promise<void> {
  const sessionDay = paymentYmd(session.opened_at);
  const { data: orphans, error } = await supabaseAdmin
    .from('hub_payments')
    .select('id, payment_date, receivable_id')
    .eq('clinic_id', clinicId)
    .is('cash_session_id', null);
  if (error || !orphans?.length) return;

  const recIds = [...new Set(orphans.map((p) => p.receivable_id as string).filter(Boolean))];
  if (!recIds.length) return;

  const { data: recs } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, unit_id, comanda_id')
    .in('id', recIds);

  const comandaIds = [...new Set((recs ?? []).map((r) => r.comanda_id as string).filter(Boolean))];
  const comandaUnitById = new Map<string, string | null>();
  if (comandaIds.length) {
    const { data: comandas } = await supabaseAdmin
      .from('hub_comandas')
      .select('id, unit_id')
      .in('id', comandaIds);
    for (const c of comandas ?? []) {
      comandaUnitById.set(c.id as string, (c.unit_id as string | null) ?? null);
    }
  }

  const unitByRecId = new Map<string, string | null>();
  for (const r of recs ?? []) {
    const comandaId = r.comanda_id as string | null;
    const unit = (r.unit_id as string | null) ?? (comandaId ? comandaUnitById.get(comandaId) ?? null : null);
    unitByRecId.set(r.id as string, unit);
  }

  const toLink: string[] = [];
  for (const p of orphans) {
    if (paymentYmd(String(p.payment_date)) !== sessionDay) continue;
    const unit = unitByRecId.get(p.receivable_id as string);
    if (unit !== session.unit_id) continue;
    toLink.push(p.id as string);
  }

  if (toLink.length) {
    await supabaseAdmin.from('hub_payments').update({ cash_session_id: session.id }).in('id', toLink);
  }
}

/** Unidade principal da clínica, ou a primeira cadastrada (orçamentos sem unit_id herdavam null e sumiam no filtro do financeiro). */
async function resolveClinicDefaultUnitId(clinicId: string): Promise<string | null> {
  const { data: main } = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('is_main', true)
    .limit(1)
    .maybeSingle();
  if (main?.id) return main.id as string;
  const { data: first } = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first?.id as string) ?? null;
}

type ReceivableLineInsert = {
  clinic_id: string;
  receivable_id: string;
  line_kind: 'appointment_service' | 'grooming_extra' | 'quote_line' | 'manual' | 'product';
  source_line_id: string | null;
  hub_service_type_id: string | null;
  hub_inventory_item_id?: string | null;
  hub_inventory_lot_id?: string | null;
  description: string;
  quantity: number;
  unit_sale_amount: number;
  line_total: number;
  sort_order: number;
};

async function recalculateReceivableStatus(receivableId: string): Promise<string> {
  const { data: rec, error: rErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, final_amount, status')
    .eq('id', receivableId)
    .maybeSingle();
  if (rErr || !rec) throw new Error(rErr?.message || 'Recebível não encontrado');
  if (['cancelled', 'refunded'].includes(String(rec.status))) return String(rec.status);
  const { data: payments, error: pErr } = await supabaseAdmin
    .from('hub_payments')
    .select('amount')
    .eq('receivable_id', receivableId);
  if (pErr) throw new Error(pErr.message);
  const paid = round2((payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
  const finalAmount = Number(rec.final_amount ?? 0);
  const nextStatus = paid <= 0.009 ? 'pending' : paid >= finalAmount - 0.009 ? 'paid' : 'partially_paid';
  await supabaseAdmin.from('hub_receivables').update({ status: nextStatus }).eq('id', receivableId);
  return nextStatus;
}

async function fetchActiveReceivableKeys(clinicId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('source_type, source_id')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) {
    set.add(`${row.source_type as string}:${row.source_id as string}`);
  }
  return set;
}

function unitMatchesSelected(rowUnitId: string | null | undefined, selectedUnitId: string): boolean {
  return !rowUnitId || rowUnitId === selectedUnitId;
}

/** Entradas de adiantamento em dinheiro na sessão (Fase 5; tabela pode não existir). */
async function sumCreditCashInSession(clinicId: string, sessionId: string): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('hub_customer_credit_movements')
      .select('amount')
      .eq('clinic_id', clinicId)
      .eq('cash_session_id', sessionId)
      .eq('direction', 'in')
      .eq('payment_method', 'cash');
    if (error) {
      if (String(error.message || '').includes('hub_customer_credit')) return 0;
      return 0;
    }
    return round2((data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0));
  } catch {
    return 0;
  }
}

async function enrichReceivableLines(lines: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const serviceIds = [...new Set(lines.map((l) => l.hub_service_type_id as string | null).filter(Boolean) as string[])];
  const itemIds = [...new Set(lines.map((l) => l.hub_inventory_item_id as string | null).filter(Boolean) as string[])];
  const lotIds = [...new Set(lines.map((l) => l.hub_inventory_lot_id as string | null).filter(Boolean) as string[])];

  const [serviceRes, itemRes, lotRes] = await Promise.all([
    serviceIds.length
      ? supabaseAdmin.from('hub_service_types').select('id, name, code, service_group').in('id', serviceIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabaseAdmin.from('hub_inventory_items').select('id, name, store_sku, sale_amount').in('id', itemIds)
      : Promise.resolve({ data: [], error: null }),
    lotIds.length
      ? supabaseAdmin.from('hub_inventory_lots').select('id, lot_code, expiry_date').in('id', lotIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (serviceRes.error) throw new Error(serviceRes.error.message);
  if (itemRes.error) throw new Error(itemRes.error.message);
  if (lotRes.error) throw new Error(lotRes.error.message);

  const serviceById = new Map((serviceRes.data ?? []).map((s) => [s.id as string, s]));
  const itemById = new Map((itemRes.data ?? []).map((i) => [i.id as string, i]));
  const lotById = new Map((lotRes.data ?? []).map((l) => [l.id as string, l]));

  return lines.map((line) => ({
    ...line,
    service_type: line.hub_service_type_id ? serviceById.get(line.hub_service_type_id as string) ?? null : null,
    inventory_item: line.hub_inventory_item_id ? itemById.get(line.hub_inventory_item_id as string) ?? null : null,
    inventory_lot: line.hub_inventory_lot_id ? lotById.get(line.hub_inventory_lot_id as string) ?? null : null,
  }));
}

async function sumAppointmentServicesSale(appointmentId: string): Promise<{
  lines: ReceivableLineInsert[];
  subtotal: number;
}> {
  const { data: svcRows, error } = await supabaseAdmin
    .from('hub_appointment_services')
    .select(
      'id, hub_service_type_id, order_index, sale_amount_applied, hub_service_types(name)'
    )
    .eq('appointment_id', appointmentId)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  const lines: ReceivableLineInsert[] = [];
  let subtotal = 0;
  let idx = 0;
  for (const row of svcRows ?? []) {
    const sale = Number(row.sale_amount_applied ?? 0);
    const st = row.hub_service_types as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(st) ? st[0]?.name : st?.name;
    const desc = (name as string) || 'Serviço';
    subtotal += sale;
    lines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'appointment_service',
      source_line_id: row.id as string,
      hub_service_type_id: (row.hub_service_type_id as string) ?? null,
      description: desc,
      quantity: 1,
      unit_sale_amount: sale,
      line_total: sale,
      sort_order: idx++,
    });
  }
  return { lines, subtotal: round2(subtotal) };
}

async function sumGroomingExtras(sessionId: string, clinicId: string): Promise<{
  lines: ReceivableLineInsert[];
  subtotal: number;
}> {
  const { data: rows, error } = await supabaseAdmin
    .from('hub_grooming_session_extras')
    .select('id, hub_service_type_id, name_snapshot, sale_amount_snapshot')
    .eq('hub_grooming_session_id', sessionId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  const lines: ReceivableLineInsert[] = [];
  let subtotal = 0;
  let idx = 1000;
  for (const row of rows ?? []) {
    const sale = Number(row.sale_amount_snapshot ?? 0);
    subtotal += sale;
    lines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'grooming_extra',
      source_line_id: row.id as string,
      hub_service_type_id: (row.hub_service_type_id as string) ?? null,
      description: String(row.name_snapshot || 'Adicional'),
      quantity: 1,
      unit_sale_amount: sale,
      line_total: sale,
      sort_order: idx++,
    });
  }
  return { lines, subtotal: round2(subtotal) };
}

async function buildPreviewForGroomingSession(
  clinicId: string,
  sessionId: string
): Promise<{ lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null }> {
  const { data: session, error } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id, clinic_id, unit_id, guardian_id, hub_appointment_id, grooming_stage, billing_waived_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session || session.clinic_id !== clinicId) {
    throw new Error('NOT_FOUND');
  }
  const allLines: ReceivableLineInsert[] = [];
  let subtotal = 0;
  const apptId = session.hub_appointment_id as string | null;
  if (apptId) {
    const ap = await sumAppointmentServicesSale(apptId);
    allLines.push(...ap.lines);
    subtotal += ap.subtotal;
  }
  const ex = await sumGroomingExtras(sessionId, clinicId);
  allLines.push(...ex.lines);
  subtotal += ex.subtotal;
  if (allLines.length === 0) {
    allLines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'manual',
      source_line_id: null,
      hub_service_type_id: null,
      description: 'Banho e Tosa (sem linhas de serviço)',
      quantity: 1,
      unit_sale_amount: 0,
      line_total: 0,
      sort_order: 0,
    });
  }
  return {
    lines: allLines,
    subtotal: round2(subtotal),
    unit_id: (session.unit_id as string) ?? null,
    guardian_id: (session.guardian_id as string) ?? null,
  };
}

async function buildPreviewForEncounter(
  clinicId: string,
  encounterId: string
): Promise<{ lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null }> {
  const { data: enc, error } = await supabaseAdmin
    .from('hub_encounters')
    .select('id, clinic_id, unit_id, guardian_id, hub_appointment_id, status, billing_waived_at')
    .eq('id', encounterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!enc || enc.clinic_id !== clinicId) throw new Error('NOT_FOUND');
  const apptId = enc.hub_appointment_id as string | null;
  const allLines: ReceivableLineInsert[] = [];
  let subtotal = 0;
  if (apptId) {
    const ap = await sumAppointmentServicesSale(apptId);
    allLines.push(...ap.lines);
    subtotal += ap.subtotal;
  }
  if (allLines.length === 0) {
    allLines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'manual',
      source_line_id: null,
      hub_service_type_id: null,
      description: 'Consulta / atendimento clínico',
      quantity: 1,
      unit_sale_amount: 0,
      line_total: 0,
      sort_order: 0,
    });
  }
  return {
    lines: allLines,
    subtotal: round2(subtotal),
    unit_id: (enc.unit_id as string) ?? null,
    guardian_id: (enc.guardian_id as string) ?? null,
  };
}

async function buildPreviewForAppointment(
  clinicId: string,
  appointmentId: string
): Promise<{ lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null }> {
  const { data: appt, error } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, clinic_id, unit_id, guardian_id, status, title')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!appt || appt.clinic_id !== clinicId) throw new Error('NOT_FOUND');

  const built = await sumAppointmentServicesSale(appointmentId);
  if (built.lines.length === 0) {
    built.lines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'manual',
      source_line_id: null,
      hub_service_type_id: null,
      description: String(appt.title || 'Agendamento'),
      quantity: 1,
      unit_sale_amount: 0,
      line_total: 0,
      sort_order: 0,
    });
  }
  return {
    lines: built.lines,
    subtotal: built.subtotal,
    unit_id: (appt.unit_id as string) ?? null,
    guardian_id: (appt.guardian_id as string) ?? null,
  };
}

async function buildPreviewForQuote(
  clinicId: string,
  quoteId: string
): Promise<{ lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null }> {
  const { data: quote, error: qErr } = await supabaseAdmin
    .from('hub_quotes')
    .select('id, clinic_id, unit_id, guardian_id, status, total_amount, billing_state, billing_waived_at')
    .eq('id', quoteId)
    .maybeSingle();
  if (qErr) throw new Error(qErr.message);
  if (!quote || quote.clinic_id !== clinicId) throw new Error('NOT_FOUND');
  const { data: qLines, error: lErr } = await supabaseAdmin
    .from('hub_quote_lines')
    .select('id, hub_service_type_id, description, quantity, unit_price, discount_amount, line_total, sort_order')
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true });
  if (lErr) throw new Error(lErr.message);
  const serviceTypeIds = [
    ...new Set((qLines ?? []).map((row) => row.hub_service_type_id as string | null).filter(Boolean) as string[]),
  ];
  let serviceTypeNameById = new Map<string, string>();
  if (serviceTypeIds.length) {
    const { data: serviceTypes, error: svcErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, name')
      .in('id', serviceTypeIds);
    if (svcErr) throw new Error(svcErr.message);
    serviceTypeNameById = new Map((serviceTypes ?? []).map((svc) => [svc.id as string, String(svc.name || 'Serviço')]));
  }
  const lines: ReceivableLineInsert[] = [];
  let subtotal = 0;
  let idx = 0;
  for (const row of qLines ?? []) {
    const lt = Number(row.line_total ?? 0);
    const qty = Number(row.quantity ?? 1);
    const unit = qty > 0 ? round2(lt / qty) : lt;
    const serviceTypeId = (row.hub_service_type_id as string | null) ?? null;
    const description = String(row.description || '').trim() || (serviceTypeId ? serviceTypeNameById.get(serviceTypeId) : null) || 'Serviço';
    subtotal += lt;
    lines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'quote_line',
      source_line_id: row.id as string,
      hub_service_type_id: serviceTypeId,
      description,
      quantity: qty,
      unit_sale_amount: unit,
      line_total: lt,
      sort_order: idx++,
    });
  }
  if (lines.length === 0) {
    const total = Number(quote.total_amount ?? 0);
    lines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'manual',
      source_line_id: null,
      hub_service_type_id: null,
      description: 'Orçamento',
      quantity: 1,
      unit_sale_amount: total,
      line_total: total,
      sort_order: 0,
    });
    subtotal = total;
  }
  let unitId: string | null = (quote.unit_id as string | null) ?? null;
  if (!unitId) {
    unitId = await resolveClinicDefaultUnitId(clinicId);
  }
  return {
    lines,
    subtotal: round2(subtotal),
    unit_id: unitId,
    guardian_id: (quote.guardian_id as string) ?? null,
  };
}

const previewQuerySchema = z
  .object({
    clinic_id: uuidStr,
    source_type: financeSourceTypeSchema,
    source_id: uuidStr,
  })
  .strict();

export const getHubFinancePreview = async (req: Request, res: Response) => {
  try {
    const parsed = previewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id, source_type e source_id (UUID) são obrigatórios' });
    }
    const { clinic_id, source_type, source_id } = parsed.data;
    let built: { lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null };
    if (source_type === 'grooming_session') {
      built = await buildPreviewForGroomingSession(clinic_id, source_id);
    } else if (source_type === 'encounter') {
      built = await buildPreviewForEncounter(clinic_id, source_id);
    } else if (source_type === 'appointment') {
      built = await buildPreviewForAppointment(clinic_id, source_id);
    } else {
      built = await buildPreviewForQuote(clinic_id, source_id);
    }
    return res.json({
      preview: {
        source_type,
        source_id,
        estimated_amount: built.subtotal,
        unit_id: built.unit_id,
        guardian_id: built.guardian_id,
        lines: built.lines.map((l) => ({
          line_kind: l.line_kind,
          description: l.description,
          quantity: l.quantity,
          unit_sale_amount: l.unit_sale_amount,
          line_total: l.line_total,
        })),
      },
    });
  } catch (e: unknown) {
    const msg = (e as Error)?.message;
    if (msg === 'NOT_FOUND') return res.status(404).json({ error: 'Fonte não encontrada' });
    console.error('getHubFinancePreview', e);
    return res.status(500).json({ error: msg || 'Erro ao pré-visualizar' });
  }
};

const createReceivableBodySchema = z
  .object({
    clinic_id: uuidStr,
    source_type: receivableSourceTypeSchema,
    source_id: uuidStr.optional(),
    unit_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    lines: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(300),
            quantity: z.number().positive().optional(),
            unit_sale_amount: z.number().min(0),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

export const postHubFinanceReceivable = async (req: Request, res: Response) => {
  try {
    const parsed = createReceivableBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, source_type, source_id, unit_id, guardian_id, due_date, notes, lines: manualLines } = parsed.data;
    if (source_type !== 'manual' && !source_id) {
      return res.status(400).json({ error: 'source_id é obrigatório para origem operacional' });
    }
    if (source_type === 'manual' && (!unit_id || !manualLines?.length)) {
      return res.status(400).json({ error: 'unit_id e linhas são obrigatórios para recebível manual' });
    }
    const keys = await fetchActiveReceivableKeys(clinic_id);
    if (source_id && keys.has(`${source_type}:${source_id}`)) {
      return res.status(409).json({ error: 'Já existe cobrança para esta origem' });
    }

    if (source_type === 'manual') {
      const manualSourceId = randomUUID();
      const builtLines: ReceivableLineInsert[] = (manualLines ?? []).map((line, idx) => {
        const qty = Number(line.quantity ?? 1);
        const unit = round2(line.unit_sale_amount);
        return {
          clinic_id: '',
          receivable_id: '',
          line_kind: 'manual',
          source_line_id: null,
          hub_service_type_id: null,
          description: line.description.trim(),
          quantity: qty,
          unit_sale_amount: unit,
          line_total: round2(qty * unit),
          sort_order: idx,
        };
      });
      const subtotal = round2(builtLines.reduce((sum, line) => sum + Number(line.line_total ?? 0), 0));
      if (subtotal <= 0) return res.status(400).json({ error: 'Valor do recebível manual deve ser maior que zero' });

      const { data: rec, error: rErr } = await supabaseAdmin
        .from('hub_receivables')
        .insert({
          clinic_id,
          unit_id,
          guardian_id: guardian_id ?? null,
          source_type,
          source_id: manualSourceId,
          original_amount: subtotal,
          final_amount: subtotal,
          status: 'pending',
          due_date: due_date ?? null,
          notes: notes ?? null,
        })
        .select('id')
        .single();
      if (rErr || !rec) return res.status(500).json({ error: rErr?.message || 'Erro ao criar recebível manual' });
      const receivableId = rec.id as string;
      const { error: lnErr } = await supabaseAdmin.from('hub_receivable_lines').insert(
        builtLines.map((line) => ({
          ...line,
          clinic_id,
          receivable_id: receivableId,
        }))
      );
      if (lnErr) {
        await supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
        return res.status(500).json({ error: lnErr.message });
      }
      const detail = await buildReceivableDetail(receivableId, clinic_id);
      return res.status(201).json({ receivable: detail });
    }

    if (source_type === 'grooming_session') {
      const { data: s, error: sErr } = await supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id, clinic_id, grooming_stage, billing_waived_at')
        .eq('id', source_id!)
        .maybeSingle();
      if (sErr || !s || s.clinic_id !== clinic_id) return res.status(404).json({ error: 'Sessão não encontrada' });
      if (s.grooming_stage !== 'closed') {
        return res.status(409).json({ error: 'Só é possível gerar cobrança com sessão encerrada (closed)' });
      }
      if (s.billing_waived_at) return res.status(409).json({ error: 'Sessão marcada sem cobrança' });
    } else if (source_type === 'encounter') {
      const { data: e, error: eErr } = await supabaseAdmin
        .from('hub_encounters')
        .select('id, clinic_id, status, billing_waived_at')
        .eq('id', source_id!)
        .maybeSingle();
      if (eErr || !e || e.clinic_id !== clinic_id) return res.status(404).json({ error: 'Atendimento não encontrado' });
      if (e.status !== 'completed') {
        return res.status(409).json({ error: 'Só é possível gerar cobrança com encounter concluído' });
      }
      if (e.billing_waived_at) return res.status(409).json({ error: 'Atendimento marcado sem cobrança' });
    } else if (source_type === 'appointment') {
      const { data: a, error: aErr } = await supabaseAdmin
        .from('hub_appointments')
        .select('id, clinic_id, status, billing_waived_at')
        .eq('id', source_id!)
        .maybeSingle();
      if (aErr || !a || a.clinic_id !== clinic_id) return res.status(404).json({ error: 'Agendamento não encontrado' });
      if (!['done', 'paid'].includes(String(a.status))) {
        return res.status(409).json({ error: 'Só é possível gerar cobrança com agendamento concluído' });
      }
      const [{ data: enc }, { data: groom }] = await Promise.all([
        supabaseAdmin
          .from('hub_encounters')
          .select('id')
          .eq('hub_appointment_id', source_id!)
          .eq('clinic_id', clinic_id)
          .is('deleted_at', null)
          .maybeSingle(),
        supabaseAdmin
          .from('hub_grooming_sessions')
          .select('id')
          .eq('hub_appointment_id', source_id!)
          .eq('clinic_id', clinic_id)
          .is('deleted_at', null)
          .maybeSingle(),
      ]);
      if (enc || groom) {
        return res.status(409).json({
          error: 'Este agendamento possui operação vinculada; gere a cobrança pela operação.',
        });
      }
      if (a.billing_waived_at) return res.status(409).json({ error: 'Agendamento marcado sem cobrança' });
    } else {
      const { data: q, error: qErr } = await supabaseAdmin
        .from('hub_quotes')
        .select('id, clinic_id, status, billing_state, billing_waived_at')
        .eq('id', source_id!)
        .maybeSingle();
      if (qErr || !q || q.clinic_id !== clinic_id) return res.status(404).json({ error: 'Orçamento não encontrado' });
      if (q.status !== 'accepted') return res.status(409).json({ error: 'Orçamento tem de estar aceite' });
      if (q.billing_state === 'receivable_created') {
        return res.status(409).json({ error: 'Orçamento já tem cobrança criada' });
      }
      if (q.billing_waived_at) return res.status(409).json({ error: 'Orçamento marcado sem cobrança' });
    }

    let built: { lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null };
    if (source_type === 'grooming_session') {
      built = await buildPreviewForGroomingSession(clinic_id, source_id!);
    } else if (source_type === 'encounter') {
      built = await buildPreviewForEncounter(clinic_id, source_id!);
    } else if (source_type === 'appointment') {
      built = await buildPreviewForAppointment(clinic_id, source_id!);
    } else {
      built = await buildPreviewForQuote(clinic_id, source_id!);
    }

    const { data: rec, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .insert({
        clinic_id,
        unit_id: built.unit_id,
        guardian_id: built.guardian_id,
        source_type,
        source_id: source_id!,
        original_amount: built.subtotal,
        final_amount: built.subtotal,
        status: 'pending',
        notes: notes ?? null,
      })
      .select('id')
      .single();
    if (rErr || !rec) {
      console.error('postHubFinanceReceivable insert', rErr);
      return res.status(500).json({ error: rErr?.message || 'Erro ao criar recebível' });
    }
    const receivableId = rec.id as string;

    const lineRows = built.lines.map((l, i) => ({
      clinic_id,
      receivable_id: receivableId,
      line_kind: l.line_kind,
      source_line_id: l.source_line_id,
      hub_service_type_id: l.hub_service_type_id,
      hub_inventory_item_id: l.hub_inventory_item_id ?? null,
      hub_inventory_lot_id: l.hub_inventory_lot_id ?? null,
      description: l.description,
      quantity: l.quantity,
      unit_sale_amount: l.unit_sale_amount,
      line_total: l.line_total,
      sort_order: l.sort_order ?? i,
    }));
    const { error: lnErr } = await supabaseAdmin.from('hub_receivable_lines').insert(lineRows);
    if (lnErr) {
      await supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
      console.error('postHubFinanceReceivable lines', lnErr);
      return res.status(500).json({ error: lnErr.message });
    }

    if (source_type === 'quote') {
      await supabaseAdmin
        .from('hub_quotes')
        .update({ billing_state: 'receivable_created' })
        .eq('id', source_id!)
        .eq('clinic_id', clinic_id);
    }

    const { data: full } = await supabaseAdmin
      .from('hub_receivables')
      .select('*, lines:hub_receivable_lines(*)')
      .eq('id', receivableId)
      .single();

    return res.status(201).json({ receivable: full });
  } catch (e: unknown) {
    console.error('postHubFinanceReceivable', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const waiveBodySchema = z
  .object({
    clinic_id: uuidStr,
    source_type: financeSourceTypeSchema,
    source_id: uuidStr,
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();

export const postHubFinanceWaiveBilling = async (req: Request, res: Response) => {
  try {
    const parsed = waiveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, source_type, source_id, reason } = parsed.data;
    const keys = await fetchActiveReceivableKeys(clinic_id);
    if (keys.has(`${source_type}:${source_id}`)) {
      return res.status(409).json({ error: 'Já existe cobrança; não é possível fazer waive' });
    }
    const now = new Date().toISOString();
    if (source_type === 'grooming_session') {
      const { error } = await supabaseAdmin
        .from('hub_grooming_sessions')
        .update({ billing_waived_at: now, billing_waive_reason: reason })
        .eq('id', source_id)
        .eq('clinic_id', clinic_id);
      if (error) return res.status(500).json({ error: error.message });
    } else if (source_type === 'encounter') {
      const { error } = await supabaseAdmin
        .from('hub_encounters')
        .update({ billing_waived_at: now, billing_waive_reason: reason })
        .eq('id', source_id)
        .eq('clinic_id', clinic_id);
      if (error) return res.status(500).json({ error: error.message });
    } else if (source_type === 'appointment') {
      const { error } = await supabaseAdmin
        .from('hub_appointments')
        .update({ billing_waived_at: now, billing_waive_reason: reason })
        .eq('id', source_id)
        .eq('clinic_id', clinic_id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabaseAdmin
        .from('hub_quotes')
        .update({ billing_waived_at: now, billing_waive_reason: reason })
        .eq('id', source_id)
        .eq('clinic_id', clinic_id);
      if (error) return res.status(500).json({ error: error.message });
    }
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('postHubFinanceWaiveBilling', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const paymentBodySchema = z
  .object({
    clinic_id: uuidStr,
    amount: z.number().positive(),
    payment_method: z.enum([
      'pix',
      'cash',
      'credit_card',
      'debit_card',
      'transfer',
      'payment_link',
      'customer_credit',
    ]),
    installments: z.number().int().min(1).max(99).optional(),
    payment_date: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
    cash_session_id: uuidStr.optional().nullable(),
  })
  .strict();

export const postHubFinanceReceivablePayment = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const parsed = paymentBodySchema.safeParse(req.body);
    if (!idParsed.success || !parsed.success) {
      return res.status(400).json({ error: 'receivable id ou body inválidos' });
    }
    const receivableId = idParsed.data;
    const { clinic_id, amount, payment_method, installments, payment_date, notes, cash_session_id } = parsed.data;
    const userId = req.user?.id ?? null;

    const { data: rec, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, clinic_id, unit_id, comanda_id, status, final_amount')
      .eq('id', receivableId)
      .maybeSingle();
    if (rErr || !rec || rec.clinic_id !== clinic_id) return res.status(404).json({ error: 'Recebível não encontrado' });
    if (rec.status === 'cancelled' || rec.status === 'refunded') {
      return res.status(409).json({ error: 'Recebível não aceita pagamentos neste estado' });
    }

    let validatedCashSessionId: string | null = null;
    if (payment_method === 'cash') {
      if (!cash_session_id) {
        return res.status(409).json({ error: 'Abra o caixa para receber em dinheiro.' });
      }
      const { data: cashSession, error: cashErr } = await supabaseAdmin
        .from('hub_cash_sessions')
        .select('id, clinic_id, unit_id, status')
        .eq('id', cash_session_id)
        .maybeSingle();
      if (
        cashErr ||
        !cashSession ||
        cashSession.clinic_id !== clinic_id ||
        cashSession.status !== 'open' ||
        (rec.unit_id && cashSession.unit_id !== rec.unit_id)
      ) {
        return res.status(409).json({ error: 'Sessão de caixa inválida ou fechada para este recebimento em dinheiro.' });
      }
      validatedCashSessionId = cashSession.id as string;
    } else {
      let comandaUnitId: string | null = null;
      if (rec.comanda_id) {
        const { data: comanda } = await supabaseAdmin
          .from('hub_comandas')
          .select('unit_id')
          .eq('id', rec.comanda_id as string)
          .maybeSingle();
        comandaUnitId = (comanda?.unit_id as string | null) ?? null;
      }
      validatedCashSessionId = await resolvePaymentCashSessionId(
        clinic_id,
        rec.unit_id as string | null,
        comandaUnitId,
      );
    }

    const payAt = payment_date ?? new Date().toISOString();
    const { data: pay, error: pErr } = await supabaseAdmin
      .from('hub_payments')
      .insert({
        clinic_id,
        receivable_id: receivableId,
        cash_session_id: validatedCashSessionId,
        amount: round2(amount),
        payment_method,
        installments: installments ?? 1,
        payment_date: payAt,
        notes: notes ?? null,
        created_by_user_id: userId,
      })
      .select('id')
      .single();
    if (pErr || !pay) return res.status(500).json({ error: pErr?.message || 'Erro ao registar pagamento' });

    const { data: sumRows } = await supabaseAdmin
      .from('hub_payments')
      .select('amount')
      .eq('receivable_id', receivableId);
    const paid = round2((sumRows ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0));
    const finalAmt = Number(rec.final_amount ?? 0);
    let nextStatus = 'partially_paid';
    if (paid >= finalAmt - 0.009) nextStatus = 'paid';

    await supabaseAdmin.from('hub_receivables').update({ status: nextStatus }).eq('id', receivableId);

    const { data: paymentRow } = await supabaseAdmin.from('hub_payments').select('*').eq('id', pay.id).single();
    return res.status(201).json({ payment: paymentRow, receivable_status: nextStatus });
  } catch (e: unknown) {
    console.error('postHubFinanceReceivablePayment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const receivableProductLineSchema = z
  .object({
    clinic_id: uuidStr,
    item_id: uuidStr,
    lot_id: uuidStr,
    quantity: z.number().positive(),
    unit_sale_amount: z.number().min(0),
    description: z.string().trim().max(300).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const postHubFinanceReceivableProductLine = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const parsed = receivableProductLineSchema.safeParse(req.body);
    if (!idParsed.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
    }
    const receivableId = idParsed.data;
    const { clinic_id, item_id, lot_id, quantity, unit_sale_amount, description, notes } = parsed.data;
    const userId = req.user?.id ?? null;

    const { data: rec, error: recErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, clinic_id, status, original_amount, final_amount')
      .eq('id', receivableId)
      .maybeSingle();
    if (recErr || !rec || rec.clinic_id !== clinic_id) return res.status(404).json({ error: 'Recebível não encontrado' });
    if (['cancelled', 'refunded'].includes(String(rec.status))) {
      return res.status(409).json({ error: 'Recebível não aceita novos produtos neste estado' });
    }

    const { data: item, error: itemErr } = await supabaseAdmin
      .from('hub_inventory_items')
      .select('id, clinic_id, name, sale_amount, deleted_at, active')
      .eq('id', item_id)
      .maybeSingle();
    if (itemErr || !item || item.clinic_id !== clinic_id || item.deleted_at || item.active === false) {
      return res.status(404).json({ error: 'Produto não encontrado ou inativo' });
    }
    const { data: lot, error: lotErr } = await supabaseAdmin
      .from('hub_inventory_lots')
      .select('id, clinic_id, item_id')
      .eq('id', lot_id)
      .maybeSingle();
    if (lotErr || !lot || lot.clinic_id !== clinic_id || lot.item_id !== item_id) {
      return res.status(400).json({ error: 'Lote inválido para este produto' });
    }

    const { byLot } = await computeBalances(clinic_id);
    const available = Number(byLot.get(lot_id) ?? 0);
    if (available < quantity) {
      return res.status(400).json({ error: `Quantidade insuficiente no lote (disponível: ${available})` });
    }

    const unitSale = round2(unit_sale_amount || Number(item.sale_amount ?? 0));
    const lineTotal = round2(unitSale * quantity);
    const [{ data: maxRows }, { data: line, error: lineErr }] = await Promise.all([
      supabaseAdmin
        .from('hub_receivable_lines')
        .select('sort_order')
        .eq('receivable_id', receivableId)
        .order('sort_order', { ascending: false })
        .limit(1),
      supabaseAdmin
        .from('hub_receivable_lines')
        .insert({
          clinic_id,
          receivable_id: receivableId,
          line_kind: 'product',
          source_line_id: null,
          hub_service_type_id: null,
          hub_inventory_item_id: item_id,
          hub_inventory_lot_id: lot_id,
          description: description?.trim() || String(item.name || 'Produto'),
          quantity,
          unit_sale_amount: unitSale,
          line_total: lineTotal,
          sort_order: 9999,
        })
        .select('*')
        .single(),
    ]);
    if (lineErr || !line) return res.status(500).json({ error: lineErr?.message || 'Erro ao adicionar produto' });
    const nextSort = Number(maxRows?.[0]?.sort_order ?? 0) + 1;
    await supabaseAdmin.from('hub_receivable_lines').update({ sort_order: nextSort }).eq('id', line.id);

    const { error: movErr } = await supabaseAdmin.from('hub_stock_movements').insert({
      clinic_id,
      item_id,
      lot_id,
      movement_type: 'sale_out',
      qty: quantity,
      unit_cost: null,
      reference_type: 'hub_receivable',
      reference_id: receivableId,
      notes: notes ?? `Venda vinculada ao recebível ${receivableId}`,
      created_by: userId,
    });
    if (movErr) {
      await supabaseAdmin.from('hub_receivable_lines').delete().eq('id', line.id);
      return res.status(500).json({ error: movErr.message });
    }

    const original = round2(Number(rec.original_amount ?? 0) + lineTotal);
    const final = round2(Number(rec.final_amount ?? 0) + lineTotal);
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('hub_receivables')
      .update({ original_amount: original, final_amount: final })
      .eq('id', receivableId)
      .select('*, lines:hub_receivable_lines(*)')
      .single();
    if (updErr) return res.status(500).json({ error: updErr.message });
    await recalculateReceivableStatus(receivableId);
    return res.status(201).json({ receivable: updated, line: { ...line, sort_order: nextSort } });
  } catch (e: unknown) {
    console.error('postHubFinanceReceivableProductLine', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const deleteHubFinanceReceivableProductLine = async (req: Request, res: Response) => {
  try {
    const receivableId = uuidStr.safeParse(req.params.id);
    const lineId = uuidStr.safeParse(req.params.lineId);
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!receivableId.success || !lineId.success || !clinicId.success) {
      return res.status(400).json({ error: 'receivable, lineId e clinic_id são obrigatórios' });
    }
    const { data: line, error: lineErr } = await supabaseAdmin
      .from('hub_receivable_lines')
      .select('*')
      .eq('id', lineId.data)
      .eq('receivable_id', receivableId.data)
      .eq('clinic_id', clinicId.data)
      .maybeSingle();
    if (lineErr || !line) return res.status(404).json({ error: 'Linha não encontrada' });
    if (line.line_kind !== 'product') return res.status(409).json({ error: 'Apenas linhas de produto podem ser removidas aqui' });
    const qty = Number(line.quantity ?? 0);
    if (line.hub_inventory_item_id && line.hub_inventory_lot_id && qty > 0) {
      await supabaseAdmin.from('hub_stock_movements').insert({
        clinic_id: clinicId.data,
        item_id: line.hub_inventory_item_id,
        lot_id: line.hub_inventory_lot_id,
        movement_type: 'adjustment_in',
        qty,
        unit_cost: null,
        reference_type: 'hub_receivable_line_removed',
        reference_id: line.id,
        notes: 'Reversão de produto removido de recebível',
        created_by: req.user?.id ?? null,
      });
    }
    const { data: rec } = await supabaseAdmin
      .from('hub_receivables')
      .select('original_amount, final_amount')
      .eq('id', receivableId.data)
      .single();
    await supabaseAdmin.from('hub_receivable_lines').delete().eq('id', lineId.data);
    const delta = Number(line.line_total ?? 0);
    const original = round2(Math.max(0, Number(rec?.original_amount ?? 0) - delta));
    const final = round2(Math.max(0, Number(rec?.final_amount ?? 0) - delta));
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('hub_receivables')
      .update({ original_amount: original, final_amount: final })
      .eq('id', receivableId.data)
      .select('*, lines:hub_receivable_lines(*)')
      .single();
    if (updErr) return res.status(500).json({ error: updErr.message });
    await recalculateReceivableStatus(receivableId.data);
    return res.json({ receivable: updated });
  } catch (e: unknown) {
    console.error('deleteHubFinanceReceivableProductLine', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const reversePaymentBodySchema = z
  .object({
    clinic_id: uuidStr,
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();

export const postHubFinancePaymentReverse = async (req: Request, res: Response) => {
  try {
    const paymentId = uuidStr.safeParse(req.params.id);
    const parsed = reversePaymentBodySchema.safeParse(req.body);
    if (!paymentId.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { clinic_id, reason } = parsed.data;
    const { data: payment, error: pErr } = await supabaseAdmin
      .from('hub_payments')
      .select('id, clinic_id, receivable_id, amount, payment_method, cash_session_id')
      .eq('id', paymentId.data)
      .maybeSingle();
    if (pErr || !payment || payment.clinic_id !== clinic_id) return res.status(404).json({ error: 'Pagamento não encontrado' });
    let warning: string | null = null;
    if (payment.payment_method === 'cash' && payment.cash_session_id) {
      const { data: session, error: sErr } = await supabaseAdmin
        .from('hub_cash_sessions')
        .select('id, status')
        .eq('id', payment.cash_session_id as string)
        .eq('clinic_id', clinic_id)
        .maybeSingle();
      if (sErr) return res.status(500).json({ error: sErr.message });
      if (session?.status === 'closed') {
        warning = 'Pagamento em dinheiro estornado de caixa já fechado; revise a conferência da sessão.';
      }
    }
    const userId = req.user?.id ?? null;
    await supabaseAdmin.from('hub_financial_adjustments').insert({
      clinic_id,
      receivable_id: payment.receivable_id,
      adjustment_type: 'refund',
      amount: payment.amount,
      reason: warning ? `${reason} (${warning})` : reason,
      created_by_user_id: userId,
    });
    const { error: delErr } = await supabaseAdmin.from('hub_payments').delete().eq('id', paymentId.data);
    if (delErr) return res.status(500).json({ error: delErr.message });
    const status = await recalculateReceivableStatus(payment.receivable_id as string);
    return res.json({ ok: true, receivable_status: status, warning });
  } catch (e: unknown) {
    console.error('postHubFinancePaymentReverse', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const cancelReceivableBodySchema = z
  .object({
    clinic_id: uuidStr,
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();

export const postHubFinanceReceivableCancel = async (req: Request, res: Response) => {
  try {
    const receivableId = uuidStr.safeParse(req.params.id);
    const parsed = cancelReceivableBodySchema.safeParse(req.body);
    if (!receivableId.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { clinic_id, reason } = parsed.data;
    const { data: rec, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, clinic_id, status, final_amount, lines:hub_receivable_lines(*)')
      .eq('id', receivableId.data)
      .maybeSingle();
    if (rErr || !rec || rec.clinic_id !== clinic_id) return res.status(404).json({ error: 'Recebível não encontrado' });
    if (rec.status === 'cancelled') return res.json({ receivable: rec });
    const { data: payments } = await supabaseAdmin.from('hub_payments').select('id').eq('receivable_id', receivableId.data);
    if ((payments ?? []).length > 0) {
      return res.status(409).json({ error: 'Estorne os pagamentos antes de cancelar o recebível' });
    }
    for (const line of (rec.lines ?? []) as Record<string, unknown>[]) {
      if (line.line_kind !== 'product') continue;
      const qty = Number(line.quantity ?? 0);
      const itemId = line.hub_inventory_item_id as string | null;
      const lotId = line.hub_inventory_lot_id as string | null;
      if (!itemId || !lotId || qty <= 0) continue;
      await supabaseAdmin.from('hub_stock_movements').insert({
        clinic_id,
        item_id: itemId,
        lot_id: lotId,
        movement_type: 'adjustment_in',
        qty,
        unit_cost: null,
        reference_type: 'hub_receivable_cancelled',
        reference_id: receivableId.data,
        notes: 'Reversão por cancelamento de recebível',
        created_by: req.user?.id ?? null,
      });
    }
    await supabaseAdmin.from('hub_financial_adjustments').insert({
      clinic_id,
      receivable_id: receivableId.data,
      adjustment_type: 'write_off',
      amount: Number(rec.final_amount ?? 0),
      reason,
      created_by_user_id: req.user?.id ?? null,
    });
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('hub_receivables')
      .update({ status: 'cancelled' })
      .eq('id', receivableId.data)
      .select('*, lines:hub_receivable_lines(*)')
      .single();
    if (updErr) return res.status(500).json({ error: updErr.message });
    return res.json({ receivable: updated });
  } catch (e: unknown) {
    console.error('postHubFinanceReceivableCancel', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

async function loadReceivableSourceDetails(receivable: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const sourceType = String(receivable.source_type || '');
  const sourceId = receivable.source_id as string | null;
  const clinicId = receivable.clinic_id as string;
  if (!sourceId || sourceType === 'manual') {
    return sourceType === 'manual'
      ? { type: 'manual', id: sourceId, label: 'Lançamento manual', notes: receivable.notes ?? null }
      : null;
  }

  if (sourceType === 'appointment') {
    const { data, error } = await supabaseAdmin
      .from('hub_appointments')
      .select(
        `
        id, title, starts_at, ends_at, status, unit_id, guardian_id, pet_id, hub_staff_member_id,
        pet:hub_pets(id, name, species, breed),
        guardian:hub_guardians(id, full_name, phone, email),
        staff:hub_staff_members(id, full_name)
      `
      )
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { type: sourceType, label: 'Agendamento', ...data } : null;
  }

  if (sourceType === 'encounter') {
    const { data, error } = await supabaseAdmin
      .from('hub_encounters')
      .select(
        `
        id, status, started_at, completed_at, unit_id, guardian_id, pet_id, hub_staff_member_id, hub_appointment_id,
        chief_complaint, summary_notes,
        pet:hub_pets(id, name, species, breed),
        guardian:hub_guardians(id, full_name, phone, email),
        staff:hub_staff_members(id, full_name)
      `
      )
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { type: sourceType, label: 'Atendimento', ...data } : null;
  }

  if (sourceType === 'grooming_session') {
    const { data, error } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select(
        `
        id, grooming_stage, opened_at, closed_at, delivered_at, unit_id, guardian_id, pet_id, hub_staff_member_id, hub_appointment_id,
        pet:hub_pets(id, name, species, breed),
        guardian:hub_guardians(id, full_name, phone, email),
        staff:hub_staff_members(id, full_name)
      `
      )
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { type: sourceType, label: 'Banho e tosa', ...data } : null;
  }

  if (sourceType === 'quote') {
    const { data, error } = await supabaseAdmin
      .from('hub_quotes')
      .select(
        `
        id, status, total_amount, subtotal_amount, discount_kind, discount_value, sent_at, converted_at, created_at,
        unit_id, guardian_id, prospect_id,
        prospect:hub_prospects(id, full_name, phone, email),
        guardian:hub_guardians(id, full_name, phone, email)
      `
      )
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: quotePets } = await supabaseAdmin
      .from('hub_quote_pets')
      .select('id, display_name, species, breed, size_tier, coat_type, sort_order')
      .eq('quote_id', sourceId)
      .order('sort_order', { ascending: true });
    return data ? { type: sourceType, label: 'Orçamento', ...data, pets: quotePets ?? [] } : null;
  }

  return null;
}

async function buildReceivableDetail(receivableId: string, clinicId: string): Promise<Record<string, unknown> | null> {
  const { data: rec, error: recErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('*, lines:hub_receivable_lines(*)')
    .eq('id', receivableId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (recErr) throw new Error(recErr.message);
  if (!rec) return null;

  const lines = await enrichReceivableLines((rec.lines ?? []) as Record<string, unknown>[]);
  const [{ data: guardian }, { data: unit }, { data: payments }, { data: adjustments }, source] = await Promise.all([
    rec.guardian_id
      ? supabaseAdmin
          .from('hub_guardians')
          .select('id, full_name, phone, email')
          .eq('id', rec.guardian_id as string)
          .eq('clinic_id', clinicId)
          .maybeSingle()
          .then((r) => {
            if (r.error) throw new Error(r.error.message);
            return r;
          })
      : Promise.resolve({ data: null }),
    rec.unit_id
      ? supabaseAdmin
          .from('units')
          .select('id, name, nickname, phone, address, city, state')
          .eq('id', rec.unit_id as string)
          .maybeSingle()
          .then((r) => {
            if (r.error) throw new Error(r.error.message);
            return r;
          })
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from('hub_payments')
      .select('*')
      .eq('receivable_id', receivableId)
      .eq('clinic_id', clinicId)
      .order('payment_date', { ascending: false }),
    supabaseAdmin
      .from('hub_financial_adjustments')
      .select('*')
      .eq('receivable_id', receivableId)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false }),
    loadReceivableSourceDetails(rec as Record<string, unknown>),
  ]);

  const paymentRows = payments ?? [];
  const paidAmount = round2(paymentRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
  const finalAmount = Number(rec.final_amount ?? 0);
  return {
    ...rec,
    lines,
    guardian,
    unit,
    source,
    payments: paymentRows,
    adjustments: adjustments ?? [],
    paid_amount: paidAmount,
    balance_amount: round2(Math.max(0, finalAmount - paidAmount)),
  };
}

export const getHubFinanceReceivableDetail = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic.success) {
      return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    }
    const detail = await buildReceivableDetail(id.data, clinic.data);
    if (!detail) return res.status(404).json({ error: 'Recebível não encontrado' });
    return res.json({ receivable: detail });
  } catch (e: unknown) {
    console.error('getHubFinanceReceivableDetail', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinancePaymentReceipt = async (req: Request, res: Response) => {
  try {
    const paymentId = uuidStr.safeParse(req.params.id);
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!paymentId.success || !clinicId.success) {
      return res.status(400).json({ error: 'payment id e clinic_id são obrigatórios' });
    }
    const { data: payment, error: pErr } = await supabaseAdmin
      .from('hub_payments')
      .select('*')
      .eq('id', paymentId.data)
      .eq('clinic_id', clinicId.data)
      .maybeSingle();
    if (pErr) return res.status(500).json({ error: pErr.message });
    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

    const receivable = await buildReceivableDetail(payment.receivable_id as string, clinicId.data);
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('id, name, photo_url')
      .eq('id', clinicId.data)
      .maybeSingle();

    streamPaymentReceiptPdf(res, {
      ...(payment as Record<string, unknown>),
      amount: Number(payment.amount ?? 0),
      receivable,
      clinic,
    } as Parameters<typeof streamPaymentReceiptPdf>[1]);
  } catch (e: unknown) {
    console.error('getHubFinancePaymentReceipt', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const listReceivablesQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    status: z.enum(['pending', 'partially_paid', 'paid', 'cancelled', 'refunded']).optional(),
  })
  .strict();

export const listHubFinanceReceivables = async (req: Request, res: Response) => {
  try {
    const parsed = listReceivablesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
    }
    const { clinic_id, unit_id, status } = parsed.data;
    let q = supabaseAdmin
      .from('hub_receivables')
      .select('*, lines:hub_receivable_lines(*, pet:hub_pets(name)), guardian:hub_guardians(id,full_name)')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    // Inclui recebíveis com unit_id null (legado / orçamento sem unidade) para não “sumirem” ao filtrar pela unidade do hub.
    if (unit_id) q = q.or(`unit_id.eq.${unit_id},unit_id.is.null`);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ receivables: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubFinanceReceivables', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const cashOpenSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    opening_balance: z.number().min(0),
    opened_by_staff_id: uuidStr.optional().nullable(),
  })
  .strict();

export const postHubFinanceCashSessionOpen = async (req: Request, res: Response) => {
  try {
    const parsed = cashOpenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, unit_id, opening_balance, opened_by_staff_id } = parsed.data;
    const { data: existing } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id')
      .eq('unit_id', unit_id)
      .eq('status', 'open')
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'Já existe caixa aberto nesta unidade' });

    const { data, error } = await supabaseAdmin
      .from('hub_cash_sessions')
      .insert({
        clinic_id,
        unit_id,
        opening_balance: round2(opening_balance),
        opened_by_staff_id: opened_by_staff_id ?? null,
        status: 'open',
      })
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (data) {
      await linkOrphanPaymentsToSession(clinic_id, {
        id: data.id as string,
        unit_id: data.unit_id as string,
        opened_at: data.opened_at as string,
      });
    }
    return res.status(201).json({ cash_session: data });
  } catch (e: unknown) {
    console.error('postHubFinanceCashSessionOpen', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const cashCloseSchema = z
  .object({
    clinic_id: uuidStr,
    closing_balance: z.number().min(0),
    notes: z.string().trim().max(4000).optional().nullable(),
  })
  .strict();

export const postHubFinanceCashSessionClose = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const parsed = cashCloseSchema.safeParse(req.body);
    if (!idParsed.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    const { clinic_id, closing_balance, notes } = parsed.data;
    const { data: sess, error: sErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id, clinic_id, unit_id, opening_balance, status')
      .eq('id', idParsed.data)
      .maybeSingle();
    if (sErr || !sess || sess.clinic_id !== clinic_id) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (sess.status !== 'open') return res.status(409).json({ error: 'Caixa já fechado' });

    const openBal = Number(sess.opening_balance ?? 0);
    const [{ data: cashPayments, error: payErr }, { data: cashMovements, error: movErr }] = await Promise.all([
      supabaseAdmin
        .from('hub_payments')
        .select('amount')
        .eq('clinic_id', clinic_id)
        .eq('cash_session_id', sess.id as string)
        .eq('payment_method', 'cash'),
      supabaseAdmin
        .from('hub_cash_movements')
        .select('amount, movement_type')
        .eq('clinic_id', clinic_id)
        .eq('cash_session_id', sess.id as string),
    ]);
    if (payErr) return res.status(500).json({ error: payErr.message });
    if (movErr) return res.status(500).json({ error: movErr.message });
    const cashInBase = round2((cashPayments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const creditCashIn = await sumCreditCashInSession(clinic_id, sess.id as string);
    const cashIn = round2(cashInBase + creditCashIn);
    const deposits = round2(
      (cashMovements ?? [])
        .filter((row) => row.movement_type === 'deposit')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    );
    const withdrawals = round2(
      (cashMovements ?? [])
        .filter((row) => row.movement_type === 'withdrawal')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    );
    const expected = round2(openBal + cashIn + deposits - withdrawals);
    const diff = round2(round2(closing_balance) - expected);
    const now = new Date().toISOString();
    const { data: updated, error: uErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .update({
        status: 'closed',
        closed_at: now,
        closing_balance: round2(closing_balance),
        expected_balance: expected,
        difference_amount: diff,
        notes: notes ?? null,
      })
      .eq('id', sess.id as string)
      .select('*')
      .single();
    if (uErr) return res.status(500).json({ error: uErr.message });
    return res.json({ cash_session: updated });
  } catch (e: unknown) {
    console.error('postHubFinanceCashSessionClose', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const listHubFinanceCashSessionsClosed = async (req: Request, res: Response) => {
  try {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    const unitParsed = uuidStr.safeParse(req.query.unit_id);
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 20;
    if (!clinicParsed.success || !unitParsed.success) {
      return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
    }
    const { data, error } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select(
        'id, opened_at, closed_at, opening_balance, closing_balance, expected_balance, difference_amount, status'
      )
      .eq('clinic_id', clinicParsed.data)
      .eq('unit_id', unitParsed.data)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ sessions: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubFinanceCashSessionsClosed', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinanceCashSessionOpen = async (req: Request, res: Response) => {
  try {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    const unitParsed = uuidStr.safeParse(req.query.unit_id);
    if (!clinicParsed.success || !unitParsed.success) {
      return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
    }
    const { data, error } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('*')
      .eq('clinic_id', clinicParsed.data)
      .eq('unit_id', unitParsed.data)
      .eq('status', 'open')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ cash_session: data });
  } catch (e: unknown) {
    console.error('getHubFinanceCashSessionOpen', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinanceCashSessionSummary = async (req: Request, res: Response) => {
  try {
    const sessionId = uuidStr.safeParse(req.params.id);
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!sessionId.success || !clinicId.success) {
      return res.status(400).json({ error: 'session id e clinic_id são obrigatórios' });
    }
    const { data: session, error: sErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('*')
      .eq('id', sessionId.data)
      .eq('clinic_id', clinicId.data)
      .maybeSingle();
    if (sErr) return res.status(500).json({ error: sErr.message });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    await linkOrphanPaymentsToSession(clinicId.data, {
      id: session.id as string,
      unit_id: session.unit_id as string,
      opened_at: session.opened_at as string,
    });

    const [{ data: payments, error: pErr }, { data: allPayments, error: allPErr }, { data: allPaymentsDetailed, error: allDetErr }, { data: movements, error: mErr }] = await Promise.all([
      supabaseAdmin
        .from('hub_payments')
        .select('*, receivable:hub_receivables(id, source_type, source_id, guardian_id, final_amount)')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .eq('payment_method', 'cash')
        .order('payment_date', { ascending: false }),
      supabaseAdmin
        .from('hub_payments')
        .select('payment_method, amount')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data),
      supabaseAdmin
        .from('hub_payments')
        .select('*, receivable:hub_receivables(id, source_type, source_id, guardian_id, final_amount)')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .order('payment_date', { ascending: false }),
      supabaseAdmin
        .from('hub_cash_movements')
        .select('*')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .order('created_at', { ascending: false }),
    ]);
    if (pErr) return res.status(500).json({ error: pErr.message });
    if (allPErr) return res.status(500).json({ error: allPErr.message });
    if (allDetErr) return res.status(500).json({ error: allDetErr.message });
    if (mErr) return res.status(500).json({ error: mErr.message });

    const cashInBase = round2((payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const creditCashIn = await sumCreditCashInSession(clinicId.data, sessionId.data);
    const cashIn = round2(cashInBase + creditCashIn);
    const deposits = round2(
      (movements ?? [])
        .filter((row) => row.movement_type === 'deposit')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    );
    const withdrawals = round2(
      (movements ?? [])
        .filter((row) => row.movement_type === 'withdrawal')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    );
    const openingBalance = Number(session.opening_balance ?? 0);
    const expectedBalance = round2(openingBalance + cashIn + deposits - withdrawals);

    // Totais por método de pagamento (informativo, não afeta o saldo da gaveta)
    const totalsMap = new Map<string, number>();
    for (const p of allPayments ?? []) {
      const method = String(p.payment_method ?? 'outros');
      totalsMap.set(method, round2((totalsMap.get(method) ?? 0) + Number(p.amount ?? 0)));
    }
    const totals_by_method = Object.fromEntries(totalsMap.entries());

    return res.json({
      cash_session: session,
      payments: payments ?? [],
      all_payments: allPaymentsDetailed ?? [],
      movements: movements ?? [],
      summary: {
        opening_balance: round2(openingBalance),
        cash_payments_total: cashIn,
        cash_payments_from_receivables: cashInBase,
        credit_cash_in_total: creditCashIn,
        deposits_total: deposits,
        withdrawals_total: withdrawals,
        expected_balance: expectedBalance,
        totals_by_method,
      },
    });
  } catch (e: unknown) {
    console.error('getHubFinanceCashSessionSummary', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

type UnbilledItem = {
  source_type: string;
  source_id: string;
  origin_label: string;
  completed_at: string | null;
  unit_id: string | null;
  guardian: { id: string; full_name: string } | null;
  pet: { id: string; name: string } | null;
  staff: { id: string; full_name: string } | null;
  estimated_amount: number;
  operational_status: string;
};

async function collectUnbilledItems(
  clinicId: string,
  unitId: string | undefined,
  keys: Set<string>
): Promise<UnbilledItem[]> {
  const items: UnbilledItem[] = [];
  let comandaOpenKeys: Set<string>;
  try {
    comandaOpenKeys = await fetchOpenComandaOriginKeysExported(clinicId);
  } catch {
    comandaOpenKeys = new Set();
  }

  let gq = supabaseAdmin
    .from('hub_grooming_sessions')
    .select(
      `
      id, unit_id, closed_at, guardian_id, hub_staff_member_id, grooming_stage, billing_waived_at, hub_appointment_id,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `
    )
    .eq('clinic_id', clinicId)
    .eq('grooming_stage', 'closed')
    .is('deleted_at', null)
    .is('billing_waived_at', null)
    .order('closed_at', { ascending: false })
    .limit(200);
  if (unitId) gq = gq.eq('unit_id', unitId);
  const { data: groomRows, error: gErr } = await gq;
  if (gErr) throw new Error(gErr.message);
  for (const row of groomRows ?? []) {
    if (keys.has(`grooming_session:${row.id}`)) continue;
    if (comandaOpenKeys.has(`grooming_session:${row.id}`)) continue;
    const apptId = row.hub_appointment_id as string | null | undefined;
    if (apptId && comandaOpenKeys.has(`appointment:${apptId}`)) continue;
    const pv = await buildPreviewForGroomingSession(clinicId, row.id as string);
    const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
    const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
    items.push({
      source_type: 'grooming_session',
      source_id: row.id as string,
      origin_label: 'Banho e Tosa',
      completed_at: (row.closed_at as string) ?? null,
      unit_id: (row.unit_id as string) ?? null,
      guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
      pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
      staff: null,
      estimated_amount: pv.subtotal,
      operational_status: String(row.grooming_stage),
    });
  }

  let eq = supabaseAdmin
    .from('hub_encounters')
    .select(
      `
      id, unit_id, completed_at, guardian_id, hub_staff_member_id, status, billing_waived_at, hub_appointment_id,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `
    )
    .eq('clinic_id', clinicId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .is('billing_waived_at', null)
    .order('completed_at', { ascending: false })
    .limit(200);
  if (unitId) eq = eq.eq('unit_id', unitId);
  const { data: encRows, error: eErr } = await eq;
  if (eErr) throw new Error(eErr.message);
  for (const row of encRows ?? []) {
    if (keys.has(`encounter:${row.id}`)) continue;
    if (comandaOpenKeys.has(`encounter:${row.id}`)) continue;
    const apptIdEnc = row.hub_appointment_id as string | null | undefined;
    if (apptIdEnc && comandaOpenKeys.has(`appointment:${apptIdEnc}`)) continue;
    const pv = await buildPreviewForEncounter(clinicId, row.id as string);
    const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
    const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
    items.push({
      source_type: 'encounter',
      source_id: row.id as string,
      origin_label: 'Clínica',
      completed_at: (row.completed_at as string) ?? null,
      unit_id: (row.unit_id as string) ?? null,
      guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
      pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
      staff: null,
      estimated_amount: pv.subtotal,
      operational_status: String(row.status),
    });
  }

  let qq = supabaseAdmin
    .from('hub_quotes')
    .select(
      `
      id, unit_id, status, converted_at, updated_at, billing_state, billing_waived_at, total_amount, guardian_id,
      prospect:hub_prospects(id, full_name),
      guardian:hub_guardians(id, full_name)
    `
    )
    .eq('clinic_id', clinicId)
    .eq('status', 'accepted')
    .is('billing_waived_at', null)
    .in('billing_state', ['awaiting_billing', 'none'])
    .order('converted_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (unitId) qq = qq.eq('unit_id', unitId);
  const { data: quoteRows, error: qErr } = await qq;
  if (qErr) throw new Error(qErr.message);
  for (const row of quoteRows ?? []) {
    if (keys.has(`quote:${row.id}`)) continue;
    if (comandaOpenKeys.has(`quote:${row.id}`)) continue;
    const pv = await buildPreviewForQuote(clinicId, row.id as string);
    const prospect = row.prospect as { full_name?: string } | { full_name?: string }[] | null;
    const prospectName = prospect
      ? Array.isArray(prospect)
        ? prospect[0]?.full_name
        : prospect.full_name
      : null;
    const gEmbed = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
    const guardianResolved = row.guardian_id
      ? gEmbed
        ? Array.isArray(gEmbed)
          ? gEmbed[0]
          : gEmbed
        : { id: row.guardian_id as string, full_name: '—' }
      : prospectName
        ? { id: '', full_name: String(prospectName) }
        : null;
    items.push({
      source_type: 'quote',
      source_id: row.id as string,
      origin_label: 'Orçamento',
      completed_at: (row.converted_at as string) ?? (row.updated_at as string) ?? null,
      unit_id: (row.unit_id as string) ?? null,
      guardian: guardianResolved,
      pet: null,
      staff: null,
      estimated_amount: pv.subtotal,
      operational_status: String(row.billing_state ?? 'awaiting_billing'),
    });
  }

  let aq = supabaseAdmin
    .from('hub_appointments')
    .select(
      `
      id, unit_id, starts_at, ends_at, status, guardian_id, pet_id, hub_staff_member_id, billing_waived_at,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `
    )
    .eq('clinic_id', clinicId)
    .in('status', ['done', 'paid'])
    .is('deleted_at', null)
    .is('billing_waived_at', null)
    .order('ends_at', { ascending: false })
    .limit(200);
  if (unitId) aq = aq.eq('unit_id', unitId);
  const { data: apptRows, error: aErr } = await aq;
  if (aErr) throw new Error(aErr.message);
  const apptIds = (apptRows ?? []).map((row) => row.id as string);
  const apptIdsWithOperation = new Set<string>();
  if (apptIds.length > 0) {
    const [{ data: encOps }, { data: groomOps }] = await Promise.all([
      supabaseAdmin
        .from('hub_encounters')
        .select('hub_appointment_id')
        .in('hub_appointment_id', apptIds)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null),
      supabaseAdmin
        .from('hub_grooming_sessions')
        .select('hub_appointment_id')
        .in('hub_appointment_id', apptIds)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null),
    ]);
    for (const row of encOps ?? []) {
      if (row.hub_appointment_id) apptIdsWithOperation.add(row.hub_appointment_id as string);
    }
    for (const row of groomOps ?? []) {
      if (row.hub_appointment_id) apptIdsWithOperation.add(row.hub_appointment_id as string);
    }
  }
  for (const row of apptRows ?? []) {
    const id = row.id as string;
    if (keys.has(`appointment:${id}`)) continue;
    if (comandaOpenKeys.has(`appointment:${id}`)) continue;
    if (apptIdsWithOperation.has(id)) continue;
    const pv = await buildPreviewForAppointment(clinicId, id);
    const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
    const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
    items.push({
      source_type: 'appointment',
      source_id: id,
      origin_label: 'Agendamento',
      completed_at: (row.ends_at as string) ?? (row.starts_at as string) ?? null,
      unit_id: (row.unit_id as string) ?? null,
      guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
      pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
      staff: null,
      estimated_amount: pv.subtotal,
      operational_status: String(row.status),
    });
  }

  // Reservas de Hotel & Creche com check-out realizado e sem cobrança
  let bq = supabaseAdmin
    .from('hub_boarding_reservations')
    .select(
      `
      id, unit_id, checked_out_at, expected_check_out, guardian_id, pet_id, mode, daily_rate_cents,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `
    )
    .eq('clinic_id', clinicId)
    .eq('status', 'checked_out')
    .order('checked_out_at', { ascending: false })
    .limit(200);
  if (unitId) bq = bq.eq('unit_id', unitId);
  const { data: boardingRows, error: bErr } = await bq;
  if (bErr) throw new Error(bErr.message);
  for (const row of boardingRows ?? []) {
    if (keys.has(`boarding_reservation:${row.id}`)) continue;
    if (comandaOpenKeys.has(`boarding_reservation:${row.id}`)) continue;
    const modeLabel = row.mode === 'hotel' ? 'Hotel' : 'Creche';
    const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
    const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
    const dailyRateCents = (row.daily_rate_cents as number | null) ?? 0;
    const checkIn = null as string | null;
    const checkOut = (row.checked_out_at as string | null) ?? (row.expected_check_out as string | null);
    let nights = 0;
    if (checkIn && checkOut) {
      const d1 = new Date(checkIn);
      const d2 = new Date(checkOut);
      nights = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
    }
    const qty = row.mode === 'hotel' ? Math.max(1, nights) : 1;
    const estimated = Math.round(qty * dailyRateCents) / 100;
    items.push({
      source_type: 'boarding_reservation' as string,
      source_id: row.id as string,
      origin_label: `Hotel & Creche (${modeLabel})`,
      completed_at: checkOut,
      unit_id: (row.unit_id as string) ?? null,
      guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
      pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
      staff: null,
      estimated_amount: estimated,
      operational_status: 'checked_out',
    });
  }

  items.sort((a, b) => {
    const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return tb - ta;
  });
  return items;
}

const unbilledQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
  })
  .strict();

export const getHubFinanceUnbilledCompleted = async (req: Request, res: Response) => {
  try {
    const parsed = unbilledQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
    }
    const { clinic_id, unit_id } = parsed.data;
    const keys = await fetchActiveReceivableKeys(clinic_id);
    const items = await collectUnbilledItems(clinic_id, unit_id, keys);
    return res.json({ items, count: items.length });
  } catch (e: unknown) {
    console.error('getHubFinanceUnbilledCompleted', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinancePendingBillingCount = async (req: Request, res: Response) => {
  try {
    const parsed = unbilledQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
    }
    const { clinic_id, unit_id } = parsed.data;
    const keys = await fetchActiveReceivableKeys(clinic_id);
    const items = await collectUnbilledItems(clinic_id, unit_id, keys);
    return res.json({ pending_billing_count: items.length });
  } catch (e: unknown) {
    console.error('getHubFinancePendingBillingCount', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

// ─── DAY BOARD (Caixa: todos os atendimentos do dia) ────────────────────────

type DayBoardBilling = {
  comanda_id: string | null;
  comanda_status: string | null;
  has_receivable: boolean;
  receivable_status: 'pending' | 'partially_paid' | 'paid' | null;
  finance_handoff_at: string | null;
  active_receivable_id: string | null;
};

function isDayBoardOperationallyComplete(originType: string, operationalStatus: string): boolean {
  switch (originType) {
    case 'appointment':
      return operationalStatus === 'done' || operationalStatus === 'paid';
    case 'grooming_session':
      return operationalStatus === 'closed';
    case 'encounter':
      return operationalStatus === 'completed';
    case 'quote':
    case 'manual':
    case 'boarding_reservation':
      return true;
    default:
      return true;
  }
}

function isDayBoardPaidAndComplete(
  originType: string,
  operationalStatus: string,
  receivableStatus: DayBoardBilling['receivable_status']
): boolean {
  return receivableStatus === 'paid' && isDayBoardOperationallyComplete(originType, operationalStatus);
}

function pickActiveReceivableId(statusesWithIds: Array<{ id: string; status: string }>): string | null {
  const pending = statusesWithIds.find((r) => r.status === 'pending');
  if (pending) return pending.id;
  const partial = statusesWithIds.find((r) => r.status === 'partially_paid');
  if (partial) return partial.id;
  const paid = statusesWithIds.find((r) => r.status === 'paid');
  return paid?.id ?? null;
}

function matchesFinanceiroDayBoardScope(billing: DayBoardBilling): boolean {
  if (billing.finance_handoff_at) return true;
  if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid') return true;
  return false;
}

function aggregateReceivableStatus(statuses: string[]): 'pending' | 'partially_paid' | 'paid' | null {
  if (statuses.length === 0) return null;
  if (statuses.some((s) => s === 'pending')) return 'pending';
  if (statuses.some((s) => s === 'partially_paid')) return 'partially_paid';
  if (statuses.every((s) => s === 'paid')) return 'paid';
  return null;
}

/** Carrega comanda e status de recebível para um conjunto de origens em batch. */
async function fetchBillingStatusBatch(
  clinicId: string,
  originKeys: Array<{ origin_type: string; origin_id: string }>
): Promise<Map<string, DayBoardBilling>> {
  const result = new Map<string, DayBoardBilling>();
  if (!originKeys.length) return result;

  // Carrega todas as comandas não canceladas para as origens
  const { data: comandas } = await supabaseAdmin
    .from('hub_comandas')
    .select('id, origin_type, origin_id, status, finance_handoff_at')
    .eq('clinic_id', clinicId)
    .neq('status', 'cancelada')
    .is('deleted_at', null)
    .not('origin_id', 'is', null);

  const comandaByKey = new Map<string, { id: string; status: string; finance_handoff_at: string | null }>();
  for (const c of comandas ?? []) {
    const key = `${c.origin_type as string}:${c.origin_id as string}`;
    comandaByKey.set(key, {
      id: c.id as string,
      status: c.status as string,
      finance_handoff_at: (c.finance_handoff_at as string | null) ?? null,
    });
  }

  // Carrega recebíveis ativos por source_key e comanda_id
  const { data: receivables } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, source_type, source_id, comanda_id, status')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .neq('status', 'cancelled');

  const receivableRowsBySourceKey = new Map<string, Array<{ id: string; status: string }>>();
  const receivableRowsByComandaId = new Map<string, Array<{ id: string; status: string }>>();

  const pushReceivable = (map: Map<string, Array<{ id: string; status: string }>>, mapKey: string, row: { id: string; status: string }) => {
    const list = map.get(mapKey) ?? [];
    list.push(row);
    map.set(mapKey, list);
  };

  for (const r of receivables ?? []) {
    const row = { id: r.id as string, status: String(r.status) };
    pushReceivable(receivableRowsBySourceKey, `${r.source_type as string}:${r.source_id as string}`, row);
    if (r.comanda_id) {
      pushReceivable(receivableRowsByComandaId, r.comanda_id as string, row);
    }
  }

  for (const { origin_type, origin_id } of originKeys) {
    const key = `${origin_type}:${origin_id}`;
    const comanda = comandaByKey.get(key) ?? null;
    const rowsById = new Map<string, { id: string; status: string }>();
    for (const row of receivableRowsBySourceKey.get(key) ?? []) rowsById.set(row.id, row);
    if (comanda) {
      for (const row of receivableRowsByComandaId.get(comanda.id) ?? []) rowsById.set(row.id, row);
    }
    const receivableRows = [...rowsById.values()];
    const statuses = receivableRows.map((r) => r.status);
    const receivable_status = aggregateReceivableStatus(statuses);
    const has_receivable = statuses.length > 0;
    result.set(key, {
      comanda_id: comanda?.id ?? null,
      comanda_status: comanda?.status ?? null,
      has_receivable,
      receivable_status,
      finance_handoff_at: comanda?.finance_handoff_at ?? null,
      active_receivable_id: pickActiveReceivableId(receivableRows),
    });
  }
  return result;
}

type DayBoardItem = {
  origin_type: string;
  origin_id: string;
  origin_label: string;
  starts_at: string | null;
  guardian_id: string | null;
  guardian: { id: string; full_name: string } | null;
  pet_id: string | null;
  pet: { id: string; name: string } | null;
  operational_status: string;
  estimated_amount: number;
  services: { name: string; amount: number }[];
  billing: DayBoardBilling;
};

const dayBoardQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    billing_scope: z.enum(['financeiro']).optional(),
  })
  .strict();

export const getHubFinanceDayBoard = async (req: Request, res: Response) => {
  try {
    const parsed = dayBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
    }
    const { clinic_id, unit_id, billing_scope } = parsed.data;
    const dateYmd = parsed.data.date ?? ymdTodayUtc();
    const dayStart = utcDayStartIso(dateYmd);
    const dayEnd = utcDayEndIso(dateYmd);

    const items: DayBoardItem[] = [];
    const originKeys: Array<{ origin_type: string; origin_id: string }> = [];

    // ── 1. Agendamentos do dia (qualquer status exceto cancelled e waived) ──
    let aq = supabaseAdmin
      .from('hub_appointments')
      .select(
        `id, unit_id, starts_at, ends_at, status, guardian_id, pet_id, billing_waived_at, title,
        pet:hub_pets(id, name),
        guardian:hub_guardians(id, full_name),
        appointment_services:hub_appointment_services(id, hub_service_type_id, sale_amount_applied, service_type:hub_service_types(name))`
      )
      .eq('clinic_id', clinic_id)
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null)
      .gte('starts_at', dayStart)
      .lte('starts_at', dayEnd)
      .order('starts_at', { ascending: true });
    if (unit_id) aq = aq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
    const { data: apptRows, error: aErr } = await aq;
    if (aErr) throw new Error(aErr.message);

    for (const row of apptRows ?? []) {
      if (row.billing_waived_at) continue;
      const id = row.id as string;
      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      const services = (row.appointment_services as Array<{ sale_amount_applied?: number | null; service_type?: { name?: string } | null }>) ?? [];
      const estimated = round2(services.reduce((s, sv) => s + Number(sv.sale_amount_applied ?? 0), 0));
      originKeys.push({ origin_type: 'appointment', origin_id: id });
      items.push({
        origin_type: 'appointment',
        origin_id: id,
        origin_label: String(row.title || 'Agendamento'),
        starts_at: (row.starts_at as string) ?? null,
        guardian_id: (row.guardian_id as string) ?? null,
        guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
        pet_id: (row.pet_id as string) ?? null,
        pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
        operational_status: String(row.status),
        estimated_amount: estimated,
        services: services.map((sv) => ({
          name: String(sv.service_type?.name ?? 'Serviço'),
          amount: round2(Number(sv.sale_amount_applied ?? 0)),
        })),
        billing: {
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
        },
      });
    }

    // ── 2. Sessões B&T do dia (walk-ins sem appointment, ou com appointment fora do intervalo) ──
    let gq = supabaseAdmin
      .from('hub_grooming_sessions')
      .select(
        `id, unit_id, created_at, grooming_stage, guardian_id, billing_waived_at, hub_appointment_id,
        pet:hub_pets(id, name),
        guardian:hub_guardians(id, full_name)`
      )
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .is('hub_appointment_id', null)
      .neq('grooming_stage', 'cancelled')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: true });
    if (unit_id) gq = gq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
    const { data: groomRows, error: gErr } = await gq;
    if (gErr) throw new Error(gErr.message);

    for (const row of groomRows ?? []) {
      if (row.billing_waived_at) continue;
      const id = row.id as string;
      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      originKeys.push({ origin_type: 'grooming_session', origin_id: id });
      items.push({
        origin_type: 'grooming_session',
        origin_id: id,
        origin_label: 'Banho & Tosa (walk-in)',
        starts_at: (row.created_at as string) ?? null,
        guardian_id: (row.guardian_id as string) ?? null,
        guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
        pet_id: null,
        pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
        operational_status: String(row.grooming_stage),
        estimated_amount: 0,
        services: [],
        billing: {
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
        },
      });
    }

    // ── 3. Encounters walk-in do dia ──
    let eq = supabaseAdmin
      .from('hub_encounters')
      .select(
        `id, unit_id, created_at, status, guardian_id, billing_waived_at, hub_appointment_id,
        pet:hub_pets(id, name),
        guardian:hub_guardians(id, full_name)`
      )
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .is('hub_appointment_id', null)
      .not('status', 'in', '("cancelled")')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: true });
    if (unit_id) eq = eq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
    const { data: encRows, error: eErr } = await eq;
    if (eErr) throw new Error(eErr.message);

    for (const row of encRows ?? []) {
      if (row.billing_waived_at) continue;
      const id = row.id as string;
      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      originKeys.push({ origin_type: 'encounter', origin_id: id });
      items.push({
        origin_type: 'encounter',
        origin_id: id,
        origin_label: 'Clínica (walk-in)',
        starts_at: (row.created_at as string) ?? null,
        guardian_id: (row.guardian_id as string) ?? null,
        guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
        pet_id: null,
        pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
        operational_status: String(row.status),
        estimated_amount: 0,
        services: [],
        billing: {
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
        },
      });
    }

    // ── 4. Boarding: reservas com expected_check_out no dia (independente do status) ──
    let bq = supabaseAdmin
      .from('hub_boarding_reservations')
      .select(
        `id, unit_id, expected_check_out, checked_out_at, status, guardian_id, pet_id, mode, daily_rate_cents,
        pet:hub_pets(id, name),
        guardian:hub_guardians(id, full_name)`
      )
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .not('status', 'in', '("cancelled")')
      .gte('expected_check_out', dayStart)
      .lte('expected_check_out', dayEnd)
      .order('expected_check_out', { ascending: true });
    if (unit_id) bq = bq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
    const { data: boardingRows, error: bErr } = await bq;
    if (bErr) throw new Error(bErr.message);

    for (const row of boardingRows ?? []) {
      const id = row.id as string;
      const modeLabel = row.mode === 'hotel' ? 'Hotel' : 'Creche';
      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      const dailyRateCents = (row.daily_rate_cents as number | null) ?? 0;
      const estimated = Math.round(dailyRateCents) / 100; // estimativa simplificada
      originKeys.push({ origin_type: 'boarding_reservation', origin_id: id });
      items.push({
        origin_type: 'boarding_reservation',
        origin_id: id,
        origin_label: `Hotel & Creche (${modeLabel})`,
        starts_at: (row.expected_check_out as string) ?? null,
        guardian_id: (row.guardian_id as string) ?? null,
        guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
        pet_id: (row.pet_id as string) ?? null,
        pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
        operational_status: String(row.status),
        estimated_amount: estimated,
        services: [],
        billing: {
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
        },
      });
    }

    // ── 5. Enriquecer billing em batch ──
    const billingMap = await fetchBillingStatusBatch(clinic_id, originKeys);
    for (const item of items) {
      const key = `${item.origin_type}:${item.origin_id}`;
      const billing = billingMap.get(key);
      if (billing) item.billing = billing;
    }

    let filteredItems = items;
    if (billing_scope === 'financeiro') {
      filteredItems = items.filter((item) => {
        const { billing } = item;
        if (isDayBoardPaidAndComplete(item.origin_type, item.operational_status, billing.receivable_status)) {
          return false;
        }
        return matchesFinanceiroDayBoardScope(billing);
      });
    }

    filteredItems.sort((a, b) => {
      const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      return ta - tb;
    });

    return res.json({ items: filteredItems, date: dateYmd, count: filteredItems.length });
  } catch (e: unknown) {
    console.error('getHubFinanceDayBoard', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** Início do dia UTC (YYYY-MM-DD) → ISO start */
function utcDayStartIso(dateYmd: string): string {
  return `${dateYmd}T00:00:00.000Z`;
}

/** Fim do dia UTC */
function utcDayEndIso(dateYmd: string): string {
  return `${dateYmd}T23:59:59.999Z`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function ymdTodayUtc(): string {
  const dt = new Date();
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function parsePeriodQuery(q: {
  clinic_id?: unknown;
  unit_id?: unknown;
  days?: unknown;
  from?: unknown;
  to?: unknown;
}): { ok: true; clinic_id: string; unit_id: string; fromYmd: string; toYmd: string } | { ok: false; error: string } {
  const clinic = uuidStr.safeParse(q.clinic_id);
  const unit = uuidStr.safeParse(q.unit_id);
  if (!clinic.success || !unit.success) {
    return { ok: false, error: 'clinic_id e unit_id são obrigatórios (UUID)' };
  }
  const fromRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.from);
  const toRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.to);
  if (fromRaw.success && toRaw.success) {
    if (fromRaw.data > toRaw.data) return { ok: false, error: 'from não pode ser maior que to' };
    return { ok: true, clinic_id: clinic.data, unit_id: unit.data, fromYmd: fromRaw.data, toYmd: toRaw.data };
  }
  const days = z.coerce.number().int().min(1).max(366).safeParse(q.days);
  const n = days.success ? days.data : 30;
  const toYmd = ymdTodayUtc();
  const fromYmd = addDaysYmd(toYmd, -(n - 1));
  return { ok: true, clinic_id: clinic.data, unit_id: unit.data, fromYmd, toYmd };
}

const expenseCategorySchema = z.enum([
  'supplies',
  'services',
  'utilities',
  'payroll',
  'rent',
  'marketing',
  'other',
]);

const expensePaymentMethodSchema = z
  .enum(['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'other'])
  .optional()
  .nullable();

export const getHubFinanceDashboardSummary = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);

    const keys = await fetchActiveReceivableKeys(clinic_id);
    const unbilled = await collectUnbilledItems(clinic_id, unit_id, keys);

    const { data: openRecs, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, final_amount')
      .eq('clinic_id', clinic_id)
      .or(`unit_id.eq.${unit_id},unit_id.is.null`)
      .is('deleted_at', null)
      .in('status', ['pending', 'partially_paid']);
    if (rErr) return res.status(500).json({ error: rErr.message });
    const recIds = (openRecs ?? []).map((r) => r.id as string);
    let receivables_outstanding = 0;
    if (recIds.length > 0) {
      const { data: payRows, error: pErr } = await supabaseAdmin
        .from('hub_payments')
        .select('receivable_id, amount')
        .in('receivable_id', recIds);
      if (pErr) return res.status(500).json({ error: pErr.message });
      const paidByRec = new Map<string, number>();
      for (const row of payRows ?? []) {
        const id = row.receivable_id as string;
        paidByRec.set(id, round2((paidByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
      }
      for (const r of openRecs ?? []) {
        const fin = Number(r.final_amount ?? 0);
        const paid = paidByRec.get(r.id as string) ?? 0;
        receivables_outstanding = round2(receivables_outstanding + round2(fin - paid));
      }
    }

    const { data: payPeriod, error: ppErr } = await supabaseAdmin
      .from('hub_payments')
      .select('amount, payment_date, receivable_id')
      .eq('clinic_id', clinic_id)
      .gte('payment_date', fromIso)
      .lte('payment_date', toIso);
    if (ppErr) return res.status(500).json({ error: ppErr.message });
    const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id as string))];
    const unitByRec = new Map<string, string | null>();
    if (recIdsPeriod.length > 0) {
      const { data: rrows, error: rrErr } = await supabaseAdmin
        .from('hub_receivables')
        .select('id, unit_id')
        .in('id', recIdsPeriod);
      if (rrErr) return res.status(500).json({ error: rrErr.message });
      for (const row of rrows ?? []) unitByRec.set(row.id as string, (row.unit_id as string) ?? null);
    }
    let payments_total_period = 0;
    for (const p of payPeriod ?? []) {
      if (unitMatchesSelected(unitByRec.get(p.receivable_id as string), unit_id)) {
        payments_total_period = round2(payments_total_period + Number(p.amount ?? 0));
      }
    }

    const { data: expRows, error: eErr } = await supabaseAdmin
      .from('hub_expenses')
      .select('amount')
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id)
      .gte('expense_date', fromYmd)
      .lte('expense_date', toYmd);
    if (eErr) {
      if (String(eErr.message || '').includes('hub_expenses')) {
        return res.status(503).json({
          error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: eErr.message });
    }
    const expenses_total_period = round2(
      (expRows ?? []).reduce((a, row) => a + Number(row.amount ?? 0), 0)
    );

    let pets_attended_distinct = 0;
    const { data: apptPetRows, error: apptErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('pet_id')
      .eq('clinic_id', clinic_id)
      .or(`unit_id.eq.${unit_id},unit_id.is.null`)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('starts_at', fromIso)
      .lte('starts_at', toIso);
    if (!apptErr && apptPetRows) {
      const seen = new Set<string>();
      for (const row of apptPetRows) {
        const pid = row.pet_id as string | null;
        if (pid) seen.add(pid);
      }
      pets_attended_distinct = seen.size;
    }

    return res.json({
      period: { from: fromYmd, to: toYmd },
      pending_billing_count: unbilled.length,
      receivables_pending_count: openRecs?.length ?? 0,
      receivables_open_count: openRecs?.length ?? 0,
      receivables_outstanding,
      payments_total_period,
      expenses_total_period,
      net_operational_period: round2(payments_total_period - expenses_total_period),
      pets_attended_distinct,
    });
  } catch (e: unknown) {
    console.error('getHubFinanceDashboardSummary', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

type CashFlowDay = {
  date: string;
  payments_in: number;
  expenses_out: number;
  withdrawals_out: number;
  deposits_in: number;
  net: number;
};

export const getHubFinanceCashFlow = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);

    const { data: sessions, error: sErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id')
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id);
    if (sErr) return res.status(500).json({ error: sErr.message });
    const sessionIds = (sessions ?? []).map((s) => s.id as string);

    const { data: payPeriod, error: ppErr } = await supabaseAdmin
      .from('hub_payments')
      .select('amount, payment_date, receivable_id')
      .eq('clinic_id', clinic_id)
      .gte('payment_date', fromIso)
      .lte('payment_date', toIso);
    if (ppErr) return res.status(500).json({ error: ppErr.message });
    const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id as string))];
    const unitByRec = new Map<string, string | null>();
    if (recIdsPeriod.length > 0) {
      const { data: rrows, error: rrErr } = await supabaseAdmin
        .from('hub_receivables')
        .select('id, unit_id')
        .in('id', recIdsPeriod);
      if (rrErr) return res.status(500).json({ error: rrErr.message });
      for (const row of rrows ?? []) unitByRec.set(row.id as string, (row.unit_id as string) ?? null);
    }

    let expRows: { amount: number | string; expense_date: string }[] = [];
    const { data: ex, error: eErr } = await supabaseAdmin
      .from('hub_expenses')
      .select('amount, expense_date')
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id)
      .gte('expense_date', fromYmd)
      .lte('expense_date', toYmd);
    if (eErr) {
      if (String(eErr.message || '').includes('hub_expenses')) {
        return res.status(503).json({
          error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: eErr.message });
    }
    expRows = (ex ?? []) as { amount: number | string; expense_date: string }[];

    let movRows: { amount: number | string; movement_type: string; created_at: string }[] = [];
    if (sessionIds.length > 0) {
      const { data: mv, error: mErr } = await supabaseAdmin
        .from('hub_cash_movements')
        .select('amount, movement_type, created_at')
        .in('cash_session_id', sessionIds)
        .gte('created_at', fromIso)
        .lte('created_at', toIso);
      if (mErr) return res.status(500).json({ error: mErr.message });
      movRows = (mv ?? []) as { amount: number | string; movement_type: string; created_at: string }[];
    }

    const dayKeys: string[] = [];
    for (let d = fromYmd; d <= toYmd; d = addDaysYmd(d, 1)) {
      dayKeys.push(d);
      if (d === toYmd) break;
    }

    const payByDay = new Map<string, number>();
    for (const p of payPeriod ?? []) {
      if (!unitMatchesSelected(unitByRec.get(p.receivable_id as string), unit_id)) continue;
      const key = (p.payment_date as string).slice(0, 10);
      payByDay.set(key, round2((payByDay.get(key) ?? 0) + Number(p.amount ?? 0)));
    }

    const expByDay = new Map<string, number>();
    for (const row of expRows) {
      const key = row.expense_date.slice(0, 10);
      expByDay.set(key, round2((expByDay.get(key) ?? 0) + Number(row.amount ?? 0)));
    }

    const witByDay = new Map<string, number>();
    const depByDay = new Map<string, number>();
    for (const row of movRows) {
      const key = (row.created_at as string).slice(0, 10);
      const amt = Number(row.amount ?? 0);
      if (row.movement_type === 'withdrawal') {
        witByDay.set(key, round2((witByDay.get(key) ?? 0) + amt));
      } else if (row.movement_type === 'deposit') {
        depByDay.set(key, round2((depByDay.get(key) ?? 0) + amt));
      }
    }

    const days: CashFlowDay[] = dayKeys.map((date) => {
      const payments_in = payByDay.get(date) ?? 0;
      const expenses_out = expByDay.get(date) ?? 0;
      const withdrawals_out = witByDay.get(date) ?? 0;
      const deposits_in = depByDay.get(date) ?? 0;
      const net = round2(payments_in + deposits_in - expenses_out - withdrawals_out);
      return { date, payments_in, expenses_out, withdrawals_out, deposits_in, net };
    });

    return res.json({ period: { from: fromYmd, to: toYmd }, days });
  } catch (e: unknown) {
    console.error('getHubFinanceCashFlow', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinanceRevenueReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    const { data: payments, error } = await supabaseAdmin
      .from('hub_payments')
      .select('amount, payment_method, payment_date, receivable_id')
      .eq('clinic_id', clinic_id)
      .gte('payment_date', fromIso)
      .lte('payment_date', toIso);
    if (error) return res.status(500).json({ error: error.message });
    const recIds = [...new Set((payments ?? []).map((p) => p.receivable_id as string))];
    const unitByRec = new Map<string, string | null>();
    if (recIds.length > 0) {
      const { data: recs, error: recErr } = await supabaseAdmin
        .from('hub_receivables')
        .select('id, unit_id')
        .in('id', recIds);
      if (recErr) return res.status(500).json({ error: recErr.message });
      for (const rec of recs ?? []) unitByRec.set(rec.id as string, (rec.unit_id as string) ?? null);
    }
    const by_method: Record<string, number> = {};
    let total = 0;
    for (const p of payments ?? []) {
      if (!unitMatchesSelected(unitByRec.get(p.receivable_id as string), unit_id)) continue;
      const amount = Number(p.amount ?? 0);
      const method = String(p.payment_method ?? 'unknown');
      by_method[method] = round2((by_method[method] ?? 0) + amount);
      total = round2(total + amount);
    }
    return res.json({ period: { from: fromYmd, to: toYmd }, total, by_method });
  } catch (e: unknown) {
    console.error('getHubFinanceRevenueReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

function utcDateToYmd(dt: Date): string {
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Segunda-feira (UTC) da semana que contém `ymd` (YYYY-MM-DD). */
function utcMondayOfWeekYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const offset = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - offset);
  return utcDateToYmd(dt);
}

const revenueSeriesBucketSchema = z.enum(['day', 'week', 'month']);

/** Pagamentos no período agregados por dia/semana/mês (mesma regra de unidade do fluxo de caixa). */
export const getHubFinanceRevenueSeries = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    const bucketParsed = revenueSeriesBucketSchema.safeParse(
      typeof req.query.bucket === 'string' ? req.query.bucket : 'day'
    );
    const bucket = bucketParsed.success ? bucketParsed.data : 'day';

    const { data: payPeriod, error: ppErr } = await supabaseAdmin
      .from('hub_payments')
      .select('amount, payment_date, receivable_id')
      .eq('clinic_id', clinic_id)
      .gte('payment_date', fromIso)
      .lte('payment_date', toIso);
    if (ppErr) return res.status(500).json({ error: ppErr.message });
    const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id as string))];
    const unitByRec = new Map<string, string | null>();
    if (recIdsPeriod.length > 0) {
      const { data: rrows, error: rrErr } = await supabaseAdmin
        .from('hub_receivables')
        .select('id, unit_id')
        .in('id', recIdsPeriod);
      if (rrErr) return res.status(500).json({ error: rrErr.message });
      for (const row of rrows ?? []) unitByRec.set(row.id as string, (row.unit_id as string) ?? null);
    }
    const payByDay = new Map<string, number>();
    for (const p of payPeriod ?? []) {
      if (!unitMatchesSelected(unitByRec.get(p.receivable_id as string), unit_id)) continue;
      const key = (p.payment_date as string).slice(0, 10);
      payByDay.set(key, round2((payByDay.get(key) ?? 0) + Number(p.amount ?? 0)));
    }

    const dayKeys: string[] = [];
    for (let d = fromYmd; d <= toYmd; d = addDaysYmd(d, 1)) {
      dayKeys.push(d);
      if (d === toYmd) break;
    }

    if (bucket === 'day') {
      const points = dayKeys.map((date) => ({
        key: date,
        label: date.slice(5),
        amount: payByDay.get(date) ?? 0,
      }));
      return res.json({ period: { from: fromYmd, to: toYmd }, bucket, points });
    }

    const merged = new Map<string, { key: string; label: string; amount: number }>();
    for (const date of dayKeys) {
      const amt = payByDay.get(date) ?? 0;
      let gkey: string;
      let label: string;
      if (bucket === 'week') {
        gkey = utcMondayOfWeekYmd(date);
        const endW = addDaysYmd(gkey, 6);
        label = `${gkey.slice(8, 10)}/${gkey.slice(5, 7)}–${endW.slice(8, 10)}/${endW.slice(5, 7)}`;
      } else {
        gkey = date.slice(0, 7);
        const [yy, mm] = gkey.split('-');
        label = `${mm}/${yy}`;
      }
      const cur = merged.get(gkey) ?? { key: gkey, label, amount: 0 };
      cur.amount = round2(cur.amount + amt);
      merged.set(gkey, cur);
    }
    const points = [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
    return res.json({ period: { from: fromYmd, to: toYmd }, bucket, points });
  } catch (e: unknown) {
    console.error('getHubFinanceRevenueSeries', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinanceTicketAverageReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    const { data: recs, error } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, final_amount, created_at')
      .eq('clinic_id', clinic_id)
      .or(`unit_id.eq.${unit_id},unit_id.is.null`)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    if (error) return res.status(500).json({ error: error.message });
    const count = recs?.length ?? 0;
    const total = round2((recs ?? []).reduce((sum, row) => sum + Number(row.final_amount ?? 0), 0));
    return res.json({
      period: { from: fromYmd, to: toYmd },
      receivables_count: count,
      total,
      ticket_average: count ? round2(total / count) : 0,
    });
  } catch (e: unknown) {
    console.error('getHubFinanceTicketAverageReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinanceTopServicesReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    const { data: recs, error: recErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id')
      .eq('clinic_id', clinic_id)
      .or(`unit_id.eq.${unit_id},unit_id.is.null`)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    if (recErr) return res.status(500).json({ error: recErr.message });
    const ids = (recs ?? []).map((r) => r.id as string);
    if (ids.length === 0) return res.json({ period: { from: fromYmd, to: toYmd }, items: [] });
    const { data: lines, error: lineErr } = await supabaseAdmin
      .from('hub_receivable_lines')
      .select('hub_service_type_id, description, quantity, line_total')
      .eq('clinic_id', clinic_id)
      .in('receivable_id', ids)
      .not('hub_service_type_id', 'is', null);
    if (lineErr) return res.status(500).json({ error: lineErr.message });
    const serviceIds = [...new Set((lines ?? []).map((l) => l.hub_service_type_id as string).filter(Boolean))];
    const labels = new Map<string, string>();
    if (serviceIds.length > 0) {
      const { data: services } = await supabaseAdmin
        .from('hub_service_types')
        .select('id, name')
        .in('id', serviceIds);
      for (const svc of services ?? []) labels.set(svc.id as string, String(svc.name || svc.id));
    }
    const byService = new Map<string, { service_id: string; name: string; quantity: number; total: number }>();
    for (const line of lines ?? []) {
      const serviceId = line.hub_service_type_id as string | null;
      if (!serviceId) continue;
      const cur = byService.get(serviceId) ?? { service_id: serviceId, name: labels.get(serviceId) ?? String(line.description || 'Serviço'), quantity: 0, total: 0 };
      cur.quantity = round2(cur.quantity + Number(line.quantity ?? 0));
      cur.total = round2(cur.total + Number(line.line_total ?? 0));
      byService.set(serviceId, cur);
    }
    const items = [...byService.values()].sort((a, b) => b.total - a.total).slice(0, 20);
    return res.json({ period: { from: fromYmd, to: toYmd }, items });
  } catch (e: unknown) {
    console.error('getHubFinanceTopServicesReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinanceAgingReport = async (req: Request, res: Response) => {
  try {
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    const unit = uuidStr.safeParse(req.query.unit_id);
    if (!clinic.success || !unit.success) return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
    const asOfRaw = typeof req.query.as_of === 'string' ? req.query.as_of.trim() : '';
    const asOf =
      /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) && !Number.isNaN(Date.parse(`${asOfRaw}T00:00:00Z`)) ? asOfRaw : ymdTodayUtc();
    const { data: recs, error } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, final_amount, due_date')
      .eq('clinic_id', clinic.data)
      .eq('unit_id', unit.data)
      .is('deleted_at', null)
      .in('status', ['pending', 'partially_paid']);
    if (error) return res.status(500).json({ error: error.message });
    const buckets = {
      no_due_date: { count: 0, total: 0 },
      not_due: { count: 0, total: 0 },
      overdue_1_30: { count: 0, total: 0 },
      overdue_31_60: { count: 0, total: 0 },
      overdue_61_plus: { count: 0, total: 0 },
    };
    for (const rec of recs ?? []) {
      const amount = Number(rec.final_amount ?? 0);
      let key: keyof typeof buckets = 'no_due_date';
      if (rec.due_date) {
        if (String(rec.due_date) >= asOf) {
          key = 'not_due';
        } else {
          const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${rec.due_date}T00:00:00Z`)) / 86_400_000);
          if (days <= 30) key = 'overdue_1_30';
          else if (days <= 60) key = 'overdue_31_60';
          else key = 'overdue_61_plus';
        }
      }
      buckets[key].count += 1;
      buckets[key].total = round2(buckets[key].total + amount);
    }
    return res.json({ as_of: asOf, buckets });
  } catch (e: unknown) {
    console.error('getHubFinanceAgingReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const listExpensesQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const listHubFinanceExpenses = async (req: Request, res: Response) => {
  try {
    const parsed = listExpensesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
    }
    const { clinic_id, unit_id, from, to } = parsed.data;
    let q = supabaseAdmin
      .from('hub_expenses')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (from) q = q.gte('expense_date', from);
    if (to) q = q.lte('expense_date', to);
    const { data, error } = await q;
    if (error) {
      if (String(error.message || '').includes('hub_expenses')) {
        return res.status(503).json({
          error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.json({ expenses: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubFinanceExpenses', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const postExpenseBodySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    amount: z.number().positive(),
    category: expenseCategorySchema,
    description: z.string().trim().min(1).max(2000),
    expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    payment_method: expensePaymentMethodSchema,
    notes: z.string().trim().max(4000).optional().nullable(),
  })
  .strict();

export const postHubFinanceExpense = async (req: Request, res: Response) => {
  try {
    const parsed = postExpenseBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, unit_id, amount, category, description, expense_date, payment_method, notes } = parsed.data;
    const userId = req.user?.id ?? null;
    const { data, error } = await supabaseAdmin
      .from('hub_expenses')
      .insert({
        clinic_id,
        unit_id,
        amount: round2(amount),
        category,
        description,
        expense_date: expense_date ?? ymdTodayUtc(),
        payment_method: payment_method ?? null,
        notes: notes ?? null,
        created_by_user_id: userId,
      })
      .select('*')
      .single();
    if (error) {
      if (String(error.message || '').includes('hub_expenses')) {
        return res.status(503).json({
          error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ expense: data });
  } catch (e: unknown) {
    console.error('postHubFinanceExpense', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const postCashMovementBodySchema = z
  .object({
    clinic_id: uuidStr,
    movement_type: z.enum(['withdrawal', 'deposit']),
    amount: z.number().positive(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const postHubFinanceCashMovement = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const parsed = postCashMovementBodySchema.safeParse(req.body);
    if (!idParsed.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    const sessionId = idParsed.data;
    const { clinic_id, movement_type, amount, notes } = parsed.data;
    const userId = req.user?.id ?? null;

    const { data: sess, error: sErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id, clinic_id, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (sErr || !sess || sess.clinic_id !== clinic_id) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (sess.status !== 'open') return res.status(409).json({ error: 'Só é possível movimentar caixa aberto' });

    const { data: row, error: iErr } = await supabaseAdmin
      .from('hub_cash_movements')
      .insert({
        clinic_id,
        cash_session_id: sessionId,
        movement_type,
        amount: round2(amount),
        notes: notes ?? null,
        created_by_user_id: userId,
      })
      .select('*')
      .single();
    if (iErr) return res.status(500).json({ error: iErr.message });
    return res.status(201).json({ movement: row });
  } catch (e: unknown) {
    console.error('postHubFinanceCashMovement', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
