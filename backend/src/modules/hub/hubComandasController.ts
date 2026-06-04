import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const comandaOriginSchema = z.enum(['appointment', 'grooming_session', 'quote', 'encounter']);

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

async function fetchOpenComandaOriginKeys(clinicId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('hub_comandas')
    .select('origin_type, origin_id')
    .eq('clinic_id', clinicId)
    .eq('status', 'aberta')
    .is('deleted_at', null)
    .not('origin_id', 'is', null);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) {
    const oid = row.origin_id as string | null;
    if (oid) set.add(`${row.origin_type as string}:${oid}`);
  }
  return set;
}

type ComandaItemInsert = {
  clinic_id: string;
  comanda_id: string;
  pet_id: string | null;
  item_kind: 'service' | 'product' | 'fee';
  hub_service_type_id: string | null;
  hub_inventory_item_id: string | null;
  hub_inventory_lot_id: string | null;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  service_date: string | null;
  origin_type: string | null;
  origin_id: string | null;
  sort_order: number;
};

async function sumAppointmentServicesSaleForComanda(
  appointmentId: string,
  defaultPetId: string | null
): Promise<{ items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[]; subtotal: number }> {
  const { data: svcRows, error } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('id, hub_service_type_id, order_index, sale_amount_applied, hub_service_types(name)')
    .eq('appointment_id', appointmentId)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  const items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[] = [];
  let subtotal = 0;
  let idx = 0;
  for (const row of svcRows ?? []) {
    const sale = Number(row.sale_amount_applied ?? 0);
    const st = row.hub_service_types as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(st) ? st[0]?.name : st?.name;
    const desc = (name as string) || 'Serviço';
    subtotal += sale;
    items.push({
      pet_id: defaultPetId,
      item_kind: 'service',
      hub_service_type_id: (row.hub_service_type_id as string) ?? null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: desc,
      quantity: 1,
      unit_amount: sale,
      discount_amount: 0,
      line_total: sale,
      service_date: null,
      origin_type: 'appointment_service',
      origin_id: row.id as string,
      sort_order: idx++,
    });
  }
  return { items, subtotal: round2(subtotal) };
}

async function sumGroomingExtrasForComanda(
  sessionId: string,
  clinicId: string,
  defaultPetId: string | null
): Promise<{ items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[]; subtotal: number }> {
  const { data: rows, error } = await supabaseAdmin
    .from('hub_grooming_session_extras')
    .select('id, hub_service_type_id, name_snapshot, sale_amount_snapshot')
    .eq('hub_grooming_session_id', sessionId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  const items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[] = [];
  let subtotal = 0;
  let idx = 1000;
  for (const row of rows ?? []) {
    const sale = Number(row.sale_amount_snapshot ?? 0);
    subtotal += sale;
    items.push({
      pet_id: defaultPetId,
      item_kind: 'service',
      hub_service_type_id: (row.hub_service_type_id as string) ?? null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: String(row.name_snapshot || 'Adicional'),
      quantity: 1,
      unit_amount: sale,
      discount_amount: 0,
      line_total: sale,
      service_date: null,
      origin_type: 'grooming_extra',
      origin_id: row.id as string,
      sort_order: idx++,
    });
  }
  return { items, subtotal: round2(subtotal) };
}

async function buildComandaItemsFromAppointment(
  clinicId: string,
  appointmentId: string
): Promise<{
  items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[];
  subtotal: number;
  unit_id: string | null;
  guardian_id: string;
  pet_id: string | null;
}> {
  const { data: appt, error } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, clinic_id, unit_id, guardian_id, pet_id, status, title')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!appt || appt.clinic_id !== clinicId) throw new Error('NOT_FOUND');
  if (!['done', 'paid'].includes(String(appt.status))) throw new Error('NOT_READY');
  const guardianId = appt.guardian_id as string | null;
  if (!guardianId) throw new Error('NO_GUARDIAN');
  const petId = (appt.pet_id as string | null) ?? null;

  const built = await sumAppointmentServicesSaleForComanda(appointmentId, petId);
  if (built.items.length === 0) {
    built.items.push({
      pet_id: petId,
      item_kind: 'fee',
      hub_service_type_id: null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: String(appt.title || 'Agendamento'),
      quantity: 1,
      unit_amount: 0,
      discount_amount: 0,
      line_total: 0,
      service_date: null,
      origin_type: 'appointment_service',
      origin_id: null,
      sort_order: 0,
    });
  }
  return {
    items: built.items,
    subtotal: built.subtotal,
    unit_id: (appt.unit_id as string) ?? null,
    guardian_id: guardianId,
    pet_id: petId,
  };
}

async function buildComandaItemsFromGroomingSession(
  clinicId: string,
  sessionId: string
): Promise<{
  items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[];
  subtotal: number;
  unit_id: string | null;
  guardian_id: string;
  pet_id: string | null;
}> {
  const { data: session, error } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select(
      `
      id, clinic_id, unit_id, guardian_id, hub_appointment_id, grooming_stage, billing_waived_at
    `
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session || session.clinic_id !== clinicId) throw new Error('NOT_FOUND');
  if (session.grooming_stage !== 'closed') throw new Error('NOT_READY');
  if (session.billing_waived_at) throw new Error('WAIVED');
  const guardianId = session.guardian_id as string | null;
  if (!guardianId) throw new Error('NO_GUARDIAN');

  let petId: string | null = null;
  const apptId = session.hub_appointment_id as string | null;
  if (apptId) {
    const { data: appt } = await supabaseAdmin.from('hub_appointments').select('pet_id').eq('id', apptId).maybeSingle();
    petId = (appt?.pet_id as string) ?? null;
  }

  const svc = apptId
    ? await sumAppointmentServicesSaleForComanda(apptId, petId)
    : { items: [] as Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[], subtotal: 0 };
  const extras = await sumGroomingExtrasForComanda(sessionId, clinicId, petId);
  const allItems = [...svc.items, ...extras.items];
  let subtotal = round2(svc.subtotal + extras.subtotal);
  if (allItems.length === 0) {
    allItems.push({
      pet_id: petId,
      item_kind: 'fee',
      hub_service_type_id: null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: 'Banho e Tosa',
      quantity: 1,
      unit_amount: 0,
      discount_amount: 0,
      line_total: 0,
      service_date: null,
      origin_type: null,
      origin_id: null,
      sort_order: 0,
    });
  }
  return {
    items: allItems,
    subtotal,
    unit_id: (session.unit_id as string) ?? null,
    guardian_id: guardianId,
    pet_id: petId,
  };
}

async function buildComandaItemsFromQuote(
  clinicId: string,
  quoteId: string
): Promise<{
  items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[];
  subtotal: number;
  unit_id: string | null;
  guardian_id: string;
}> {
  const { data: quote, error: qErr } = await supabaseAdmin
    .from('hub_quotes')
    .select('id, clinic_id, unit_id, guardian_id, status, billing_state, billing_waived_at')
    .eq('id', quoteId)
    .maybeSingle();
  if (qErr) throw new Error(qErr.message);
  if (!quote || quote.clinic_id !== clinicId) throw new Error('NOT_FOUND');
  if (quote.status !== 'accepted') throw new Error('NOT_READY');
  if (quote.billing_state === 'receivable_created') throw new Error('ALREADY_BILLED');
  if (quote.billing_waived_at) throw new Error('WAIVED');
  const guardianId = quote.guardian_id as string | null;
  if (!guardianId) throw new Error('NO_GUARDIAN');

  const { data: qLines, error: lErr } = await supabaseAdmin
    .from('hub_quote_lines')
    .select(
      `
      id, hub_service_type_id, description, quantity, unit_price, discount_amount, line_total, sort_order,
      line_pets:hub_quote_line_pets(id, quote_pet_id, unit_price, sort_order, quote_pet:hub_quote_pets(id, hub_pet_id))
    `
    )
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true });
  if (lErr) throw new Error(lErr.message);

  const items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[] = [];
  let subtotal = 0;
  let sort = 0;

  for (const row of qLines ?? []) {
    const linePets = (row as { line_pets?: unknown[] }).line_pets ?? [];
    const lineTotal = Number(row.line_total ?? 0);
    const qty = Number(row.quantity ?? 1);
    const serviceTypeId = (row.hub_service_type_id as string | null) ?? null;
    const baseDesc = String(row.description || '').trim() || 'Serviço';

    if (Array.isArray(linePets) && linePets.length > 0) {
      for (const lp of linePets) {
        const lpRow = lp as {
          unit_price?: number;
          quote_pet?: { hub_pet_id?: string | null } | { hub_pet_id?: string | null }[];
        };
        const qp = lpRow.quote_pet;
        const hubPetId = Array.isArray(qp) ? qp[0]?.hub_pet_id : qp?.hub_pet_id;
        const up = Number(lpRow.unit_price ?? 0);
        subtotal += up;
        items.push({
          pet_id: hubPetId ?? null,
          item_kind: 'service',
          hub_service_type_id: serviceTypeId,
          hub_inventory_item_id: null,
          hub_inventory_lot_id: null,
          description: baseDesc,
          quantity: 1,
          unit_amount: up,
          discount_amount: 0,
          line_total: up,
          service_date: null,
          origin_type: 'quote_line',
          origin_id: row.id as string,
          sort_order: sort++,
        });
      }
    } else {
      subtotal += lineTotal;
      const unit = qty > 0 ? round2(lineTotal / qty) : lineTotal;
      const { data: firstPet } = await supabaseAdmin
        .from('hub_quote_pets')
        .select('hub_pet_id')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle();
      items.push({
        pet_id: (firstPet?.hub_pet_id as string) ?? null,
        item_kind: 'service',
        hub_service_type_id: serviceTypeId,
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: baseDesc,
        quantity: qty,
        unit_amount: unit,
        discount_amount: Number(row.discount_amount ?? 0),
        line_total: lineTotal,
        service_date: null,
        origin_type: 'quote_line',
        origin_id: row.id as string,
        sort_order: sort++,
      });
    }
  }

  if (items.length === 0) {
    const { data: qFull } = await supabaseAdmin.from('hub_quotes').select('total_amount').eq('id', quoteId).single();
    const total = Number(qFull?.total_amount ?? 0);
    const { data: firstPet } = await supabaseAdmin
      .from('hub_quote_pets')
      .select('hub_pet_id')
      .eq('quote_id', quoteId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    items.push({
      pet_id: (firstPet?.hub_pet_id as string) ?? null,
      item_kind: 'fee',
      hub_service_type_id: null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: 'Orçamento',
      quantity: 1,
      unit_amount: total,
      discount_amount: 0,
      line_total: total,
      service_date: null,
      origin_type: 'quote_line',
      origin_id: null,
      sort_order: 0,
    });
    subtotal = total;
  }

  let unitId: string | null = (quote.unit_id as string | null) ?? null;
  if (!unitId) unitId = await resolveClinicDefaultUnitId(clinicId);

  return {
    items,
    subtotal: round2(subtotal),
    unit_id: unitId,
    guardian_id: guardianId,
  };
}

async function buildComandaItemsFromEncounter(
  clinicId: string,
  encounterId: string
): Promise<{
  items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[];
  subtotal: number;
  unit_id: string | null;
  guardian_id: string;
  pet_id: string | null;
}> {
  const { data: enc, error } = await supabaseAdmin
    .from('hub_encounters')
    .select('id, clinic_id, unit_id, guardian_id, pet_id, status, billing_waived_at, hub_appointment_id, hub_case_id')
    .eq('id', encounterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!enc || enc.clinic_id !== clinicId) throw new Error('NOT_FOUND');
  if (enc.status !== 'completed') throw new Error('NOT_READY');
  if (enc.billing_waived_at) throw new Error('WAIVED');
  const guardianId = enc.guardian_id as string | null;
  if (!guardianId) throw new Error('NO_GUARDIAN');
  const petId = (enc.pet_id as string | null) ?? null;
  const apptId = enc.hub_appointment_id as string | null;

  const allItems: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[] = [];
  let subtotal = 0;

  // 1. Appointment service items (existing behaviour)
  if (apptId) {
    const ap = await sumAppointmentServicesSaleForComanda(apptId, petId);
    allItems.push(...ap.items);
    subtotal += ap.subtotal;
  }

  // 2. Vaccinations applied in-clinic during this encounter
  const { data: vaxRows } = await supabaseAdmin
    .from('hub_vaccination_records')
    .select('id, vaccine_name, hub_inventory_item_id, price')
    .eq('hub_encounter_id', encounterId)
    .eq('source', 'in_clinic')
    .is('deleted_at', null);
  for (const vax of vaxRows ?? []) {
    const vaxRow = vax as Record<string, unknown>;
    const amount = typeof vaxRow.price === 'number' ? vaxRow.price : 0;
    allItems.push({
      pet_id: petId,
      item_kind: 'service',
      hub_service_type_id: null,
      hub_inventory_item_id: vaxRow.hub_inventory_item_id as string | null,
      hub_inventory_lot_id: null,
      description: `Vacina: ${String(vaxRow.vaccine_name || 'Vacina')}`,
      quantity: 1,
      unit_amount: amount,
      discount_amount: 0,
      line_total: amount,
      service_date: null,
      origin_type: 'vaccination',
      origin_id: vaxRow.id as string,
      sort_order: allItems.length,
    });
    subtotal += amount;
  }

  // 3. Prescription items administered in clinic (NOT home_use)
  // These are items where the patient received medication at the clinic.
  const { data: rxRows } = await supabaseAdmin
    .from('hub_prescriptions')
    .select('id, hub_prescription_items(id, product_name, quantity, unit, hub_inventory_item_id, administration, price)')
    .eq('hub_encounter_id', encounterId)
    .is('deleted_at', null);
  for (const rx of rxRows ?? []) {
    const rxRow = rx as Record<string, unknown>;
    const rxItems = (rxRow.hub_prescription_items as Record<string, unknown>[] | null) ?? [];
    for (const item of rxItems) {
      // Only include items that are NOT for home use (clinic_administration or undefined administration)
      const administration = item.administration as string | null;
      if (administration === 'home_use') continue;
      const amount = typeof item.price === 'number' ? item.price : 0;
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      allItems.push({
        pet_id: petId,
        item_kind: 'product',
        hub_service_type_id: null,
        hub_inventory_item_id: item.hub_inventory_item_id as string | null,
        hub_inventory_lot_id: null,
        description: `Medicamento (clinic): ${String(item.product_name || 'Medicamento')} ${qty} ${String(item.unit || 'un')}`,
        quantity: qty,
        unit_amount: amount,
        discount_amount: 0,
        line_total: round2(amount * qty),
        service_date: null,
        origin_type: 'prescription_item',
        origin_id: item.id as string,
        sort_order: allItems.length,
      });
      subtotal += round2(amount * qty);
    }
  }

  // 4. Clinical exams requested in this encounter
  const { data: examRows } = await supabaseAdmin
    .from('hub_clinical_exams')
    .select('id, exam_type, lab_kind, lab_name, external_lab_name, price')
    .eq('hub_encounter_id', encounterId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  for (const exam of examRows ?? []) {
    const examRow = exam as Record<string, unknown>;
    const amount = typeof examRow.price === 'number' ? examRow.price : 0;
    const labLabel =
      examRow.lab_kind === 'external'
        ? examRow.external_lab_name
          ? ` — ${String(examRow.external_lab_name)}`
          : ' (externo)'
        : examRow.lab_name
          ? ` — ${String(examRow.lab_name)}`
          : '';
    allItems.push({
      pet_id: petId,
      item_kind: 'service',
      hub_service_type_id: null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: `Exame: ${String(examRow.exam_type || 'Exame')}${labLabel}`,
      quantity: 1,
      unit_amount: amount,
      discount_amount: 0,
      line_total: amount,
      service_date: null,
      origin_type: 'clinical_exam',
      origin_id: examRow.id as string,
      sort_order: allItems.length,
    });
    subtotal += amount;
  }

  // Fallback: generic consultation fee if nothing was found
  if (allItems.length === 0) {
    allItems.push({
      pet_id: petId,
      item_kind: 'fee',
      hub_service_type_id: null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: 'Consulta / atendimento clínico',
      quantity: 1,
      unit_amount: 0,
      discount_amount: 0,
      line_total: 0,
      service_date: null,
      origin_type: null,
      origin_id: null,
      sort_order: 0,
    });
  }

  return {
    items: allItems,
    subtotal: round2(subtotal),
    unit_id: (enc.unit_id as string) ?? null,
    guardian_id: guardianId,
    pet_id: petId,
  };
}

function mapItemToReceivableLineKind(originType: string | null): 'appointment_service' | 'grooming_extra' | 'quote_line' | 'manual' {
  if (originType === 'appointment_service') return 'appointment_service';
  if (originType === 'grooming_extra') return 'grooming_extra';
  if (originType === 'quote_line') return 'quote_line';
  return 'manual';
}

const openComandaBodySchema = z.object({
  clinic_id: uuidStr,
  origin_type: comandaOriginSchema,
  origin_id: uuidStr,
  hub_case_id: uuidStr.optional().nullable(),
  hub_encounter_id: uuidStr.optional().nullable(),
});

export const postHubComandaOpen = async (req: Request, res: Response) => {
  try {
    const parsed = openComandaBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, origin_type, origin_id, hub_case_id, hub_encounter_id } = parsed.data;

    const keys = await fetchActiveReceivableKeys(clinic_id);
    if (keys.has(`${origin_type}:${origin_id}`)) {
      return res.status(409).json({ error: 'Já existe cobrança para esta origem' });
    }
    const comandaKeys = await fetchOpenComandaOriginKeys(clinic_id);
    if (comandaKeys.has(`${origin_type}:${origin_id}`)) {
      const { data: existing } = await supabaseAdmin
        .from('hub_comandas')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('origin_type', origin_type)
        .eq('origin_id', origin_id)
        .eq('status', 'aberta')
        .is('deleted_at', null)
        .maybeSingle();
      return res.status(409).json({
        error: 'Já existe comanda aberta para esta origem',
        comanda_id: existing?.id ?? null,
      });
    }

    let built: {
      items: Omit<ComandaItemInsert, 'clinic_id' | 'comanda_id'>[];
      subtotal: number;
      unit_id: string | null;
      guardian_id: string;
    };

    if (origin_type === 'appointment') {
      const [{ data: enc }, { data: groom }] = await Promise.all([
        supabaseAdmin.from('hub_encounters').select('id').eq('hub_appointment_id', origin_id).eq('clinic_id', clinic_id).is('deleted_at', null).maybeSingle(),
        supabaseAdmin.from('hub_grooming_sessions').select('id').eq('hub_appointment_id', origin_id).eq('clinic_id', clinic_id).is('deleted_at', null).maybeSingle(),
      ]);
      if (enc || groom) {
        return res.status(409).json({ error: 'Este agendamento possui operação vinculada; abra a comanda pela operação.' });
      }
      const a = await buildComandaItemsFromAppointment(clinic_id, origin_id);
      built = a;
    } else if (origin_type === 'grooming_session') {
      built = await buildComandaItemsFromGroomingSession(clinic_id, origin_id);
    } else if (origin_type === 'quote') {
      built = await buildComandaItemsFromQuote(clinic_id, origin_id);
    } else {
      built = await buildComandaItemsFromEncounter(clinic_id, origin_id);
    }

    const discount = 0;
    const total = round2(Math.max(0, built.subtotal - discount));

    // Derive hub_encounter_id from encounter origin when not explicitly provided
    const resolvedEncounterId =
      hub_encounter_id ?? (origin_type === 'encounter' ? origin_id : null);
    // Derive hub_case_id from encounter when not explicitly provided
    let resolvedCaseId = hub_case_id ?? null;
    if (!resolvedCaseId && resolvedEncounterId) {
      const { data: encCase } = await supabaseAdmin
        .from('hub_encounters')
        .select('hub_case_id')
        .eq('id', resolvedEncounterId)
        .maybeSingle();
      resolvedCaseId = (encCase?.hub_case_id as string | null) ?? null;
    }

    const { data: comanda, error: cErr } = await supabaseAdmin
      .from('hub_comandas')
      .insert({
        clinic_id,
        unit_id: built.unit_id,
        guardian_id: built.guardian_id,
        origin_type,
        origin_id,
        hub_case_id: resolvedCaseId,
        hub_encounter_id: resolvedEncounterId,
        status: 'aberta',
        subtotal_amount: built.subtotal,
        discount_amount: discount,
        total_amount: total,
        notes: null,
      })
      .select('id')
      .single();
    if (cErr || !comanda) {
      console.error('postHubComandaOpen', cErr);
      return res.status(500).json({ error: cErr?.message || 'Erro ao criar comanda' });
    }
    const comandaId = comanda.id as string;

    const rows = built.items.map((it) => ({
      clinic_id,
      comanda_id: comandaId,
      pet_id: it.pet_id,
      item_kind: it.item_kind,
      hub_service_type_id: it.hub_service_type_id,
      hub_inventory_item_id: it.hub_inventory_item_id,
      hub_inventory_lot_id: it.hub_inventory_lot_id,
      description: it.description,
      quantity: it.quantity,
      unit_amount: it.unit_amount,
      discount_amount: it.discount_amount,
      line_total: it.line_total,
      service_date: it.service_date,
      origin_type: it.origin_type,
      origin_id: it.origin_id,
      sort_order: it.sort_order,
    }));

    const { error: iErr } = await supabaseAdmin.from('hub_comanda_items').insert(rows);
    if (iErr) {
      await supabaseAdmin.from('hub_comandas').delete().eq('id', comandaId);
      return res.status(500).json({ error: iErr.message });
    }

    const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
    return res.status(201).json(detail);
  } catch (e: unknown) {
    const msg = (e as Error)?.message;
    if (msg === 'NOT_FOUND') return res.status(404).json({ error: 'Origem não encontrada' });
    if (msg === 'NOT_READY') return res.status(409).json({ error: 'Origem não está pronta para comanda' });
    if (msg === 'WAIVED') return res.status(409).json({ error: 'Marcado sem cobrança' });
    if (msg === 'NO_GUARDIAN') return res.status(409).json({ error: 'Tutor obrigatório' });
    if (msg === 'ALREADY_BILLED') return res.status(409).json({ error: 'Orçamento já faturado' });
    console.error('postHubComandaOpen', e);
    return res.status(500).json({ error: msg || 'Erro interno' });
  }
};

async function getHubComandaDetailPayload(comandaId: string, clinicId: string) {
  const { data: comanda, error: cErr } = await supabaseAdmin
    .from('hub_comandas')
    .select('*')
    .eq('id', comandaId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (cErr || !comanda) throw new Error('NOT_FOUND');

  const { data: items, error: iErr } = await supabaseAdmin
    .from('hub_comanda_items')
    .select('*')
    .eq('comanda_id', comandaId)
    .order('sort_order', { ascending: true });
  if (iErr) throw new Error(iErr.message);

  const { data: lineRows } = await supabaseAdmin
    .from('hub_receivable_lines')
    .select('comanda_item_id, receivable_id')
    .eq('comanda_id', comandaId)
    .not('comanda_item_id', 'is', null);

  const recIds = [...new Set((lineRows ?? []).map((r) => r.receivable_id as string))];
  let activeRecById = new Map<string, boolean>();
  if (recIds.length) {
    const { data: recs } = await supabaseAdmin.from('hub_receivables').select('id, status').in('id', recIds);
    activeRecById = new Map((recs ?? []).map((r) => [r.id as string, String(r.status) !== 'cancelled']));
  }

  const invoicedItemIds = new Set<string>();
  for (const row of lineRows ?? []) {
    const cid = row.comanda_item_id as string;
    const rid = row.receivable_id as string;
    if (cid && activeRecById.get(rid)) invoicedItemIds.add(cid);
  }

  const openItemIds = (items ?? []).map((it) => it.id as string).filter((id) => !invoicedItemIds.has(id));

  return {
    comanda,
    items: items ?? [],
    open_item_ids: openItemIds,
    invoiced_item_ids: [...invoicedItemIds],
  };
}

export const getHubComandaDetail = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!idParsed.success || !clinicParsed.success) {
      return res.status(400).json({ error: 'id e clinic_id (UUID) obrigatórios' });
    }
    const detail = await getHubComandaDetailPayload(idParsed.data, clinicParsed.data);
    return res.json(detail);
  } catch (e: unknown) {
    if ((e as Error)?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Comanda não encontrada' });
    console.error('getHubComandaDetail', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const checkoutBodySchema = z
  .object({
    clinic_id: uuidStr,
    grouping: z.enum(['all', 'by_pet', 'manual']),
    manual_groups: z.array(z.object({ item_ids: z.array(uuidStr) })).optional(),
    /** Índice do grupo (0-based) que recebe itens sem pet em modo by_pet */
    tutor_items_group_index: z.number().int().min(0).optional().nullable(),
    action: z.enum(['receive_now', 'leave_pending', 'cancel']),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    payments: z
      .array(
        z
          .object({
            group_index: z.number().int().min(0),
            amount: z.number().positive(),
            payment_method: z.enum(['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'customer_credit']),
            cash_session_id: uuidStr.optional().nullable(),
            installments: z.number().int().min(1).max(99).optional(),
          })
          .strict()
      )
      .optional(),
    waive_reason: z.string().trim().min(3).max(2000).optional(),
  })
  .strict();

export const postHubComandaCheckout = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const parsed = checkoutBodySchema.safeParse(req.body);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'id inválido', details: idParsed.error.flatten() });
    }
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const comandaId = idParsed.data;
    const { clinic_id, grouping, manual_groups, tutor_items_group_index, action, due_date, payments, waive_reason } =
      parsed.data;

    const detail = await getHubComandaDetailPayload(comandaId, clinic_id);
    const comanda = detail.comanda as Record<string, unknown>;
    if (String(comanda.status) !== 'aberta') {
      return res.status(409).json({ error: 'Comanda não está aberta' });
    }

    const items = (detail.items as Record<string, unknown>[]).filter((it) =>
      (detail.open_item_ids as string[]).includes(it.id as string)
    );
    if (items.length === 0 && action !== 'cancel') {
      return res.status(409).json({ error: 'Não há itens em aberto para faturar' });
    }

    const userId = req.user?.id ?? null;

    if (action === 'cancel') {
      if (!waive_reason) {
        return res.status(400).json({ error: 'Informe waive_reason (motivo) para cancelar' });
      }
      const originType = String(comanda.origin_type);
      const originId = comanda.origin_id as string;
      const keys = await fetchActiveReceivableKeys(clinic_id);
      if (keys.has(`${originType}:${originId}`)) {
        return res.status(409).json({ error: 'Já existe cobrança; não é possível cancelar comanda desta forma' });
      }
      const now = new Date().toISOString();
      if (originType === 'grooming_session') {
        await supabaseAdmin
          .from('hub_grooming_sessions')
          .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
          .eq('id', originId)
          .eq('clinic_id', clinic_id);
      } else if (originType === 'encounter') {
        await supabaseAdmin
          .from('hub_encounters')
          .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
          .eq('id', originId)
          .eq('clinic_id', clinic_id);
      } else if (originType === 'appointment') {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
          .eq('id', originId)
          .eq('clinic_id', clinic_id);
      } else if (originType === 'quote') {
        await supabaseAdmin
          .from('hub_quotes')
          .update({ billing_waived_at: now, billing_waive_reason: waive_reason })
          .eq('id', originId)
          .eq('clinic_id', clinic_id);
      }
      await supabaseAdmin.from('hub_comandas').update({ status: 'cancelada', closed_at: now }).eq('id', comandaId);
      return res.json({ ok: true, comanda: { ...comanda, status: 'cancelada' } });
    }

    if (action === 'leave_pending' && !due_date) {
      return res.status(400).json({ error: 'due_date obrigatório para deixar pendente' });
    }

    const itemById = new Map(items.map((it) => [it.id as string, it]));

    let groups: string[][] = [];
    if (grouping === 'all') {
      groups = [items.map((it) => it.id as string)];
    } else if (grouping === 'by_pet') {
      const byPet = new Map<string | null, string[]>();
      for (const it of items) {
        const pid = (it.pet_id as string | null) ?? null;
        if (!byPet.has(pid)) byPet.set(pid, []);
        byPet.get(pid)!.push(it.id as string);
      }
      const nullItems = byPet.get(null) ?? [];
      byPet.delete(null);
      for (const [, ids] of byPet) {
        groups.push(ids);
      }
      if (nullItems.length > 0) {
        const ti = tutor_items_group_index ?? 0;
        if (groups.length === 0) groups.push([]);
        while (groups.length <= ti) groups.push([]);
        groups[ti] = [...(groups[ti] ?? []), ...nullItems];
      }
    } else {
      if (!manual_groups?.length) {
        return res.status(400).json({ error: 'manual_groups obrigatório para agrupamento manual' });
      }
      groups = manual_groups.map((g) => g.item_ids);
    }

    const allGrouped = new Set<string>();
    for (const g of groups) {
      for (const id of g) {
        if (allGrouped.has(id)) return res.status(400).json({ error: 'Item repetido entre grupos' });
        allGrouped.add(id);
        if (!itemById.has(id)) return res.status(400).json({ error: `Item inválido: ${id}` });
      }
    }
    for (const it of items) {
      if (!allGrouped.has(it.id as string)) {
        return res.status(400).json({ error: 'Todos os itens em aberto devem estar em algum grupo' });
      }
    }

    const receivableIds: string[] = [];
    const nonEmptyGroupIndices: number[] = [];
    const unitId = (comanda.unit_id as string | null) ?? null;
    const guardianId = comanda.guardian_id as string;

    const rollbackReceivables = async () => {
      for (const rid of receivableIds) {
        await supabaseAdmin.from('hub_payments').delete().eq('receivable_id', rid);
        await supabaseAdmin.from('hub_receivable_lines').delete().eq('receivable_id', rid);
        await supabaseAdmin.from('hub_receivables').delete().eq('id', rid);
      }
      if (String(comanda.origin_type) === 'quote' && comanda.origin_id) {
        await supabaseAdmin.from('hub_quotes').update({ billing_state: 'awaiting_billing' }).eq('id', comanda.origin_id as string);
      }
    };

    for (let gi = 0; gi < groups.length; gi++) {
      const gids = groups[gi];
      const groupItems = gids.map((id) => itemById.get(id)!);
      const subtotal = round2(groupItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
      if (subtotal <= 0.009) continue;

      const manualSourceId = randomUUID();
      const { data: rec, error: rErr } = await supabaseAdmin
        .from('hub_receivables')
        .insert({
          clinic_id,
          unit_id: unitId,
          guardian_id: guardianId,
          source_type: 'manual',
          source_id: manualSourceId,
          comanda_id: comandaId,
          original_amount: subtotal,
          final_amount: subtotal,
          status: 'pending',
          due_date: action === 'leave_pending' ? due_date : null,
          notes: null,
        })
        .select('id')
        .single();
      if (rErr || !rec) {
        console.error('checkout receivable', rErr);
        await rollbackReceivables();
        return res.status(500).json({ error: rErr?.message || 'Erro ao criar recebível' });
      }
      const receivableId = rec.id as string;
      receivableIds.push(receivableId);
      nonEmptyGroupIndices.push(gi);

      let sort = 0;
      for (const it of groupItems) {
        const lineKind = mapItemToReceivableLineKind((it.origin_type as string | null) ?? null);
        const { error: lnErr } = await supabaseAdmin.from('hub_receivable_lines').insert({
          clinic_id,
          receivable_id: receivableId,
          comanda_id: comandaId,
          comanda_item_id: it.id as string,
          pet_id: (it.pet_id as string | null) ?? null,
          line_kind: lineKind,
          source_line_id: (it.origin_id as string | null) ?? null,
          hub_service_type_id: (it.hub_service_type_id as string | null) ?? null,
          hub_inventory_item_id: (it.hub_inventory_item_id as string | null) ?? null,
          hub_inventory_lot_id: (it.hub_inventory_lot_id as string | null) ?? null,
          description: String(it.description),
          quantity: Number(it.quantity ?? 1),
          unit_sale_amount: Number(it.unit_amount ?? 0),
          line_total: Number(it.line_total ?? 0),
          sort_order: sort++,
        });
        if (lnErr) {
          await rollbackReceivables();
          return res.status(500).json({ error: lnErr.message });
        }
      }
    }

    if (receivableIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum recebível gerado (valores zerados)' });
    }

    const receivableIdForGroupIndex = (groupIndex: number): string | undefined => {
      const pos = nonEmptyGroupIndices.indexOf(groupIndex);
      return pos >= 0 ? receivableIds[pos] : undefined;
    };

    if (String(comanda.origin_type) === 'quote' && comanda.origin_id) {
      await supabaseAdmin
        .from('hub_quotes')
        .update({ billing_state: 'receivable_created' })
        .eq('id', comanda.origin_id as string)
        .eq('clinic_id', clinic_id);
    }

    if (action === 'receive_now') {
      if (!payments?.length) {
        await rollbackReceivables();
        return res.status(400).json({ error: 'payments obrigatório para receber agora' });
      }

      const expectedByGroup = new Map<number, number>();
      for (let gi = 0; gi < groups.length; gi++) {
        const sub = round2(groups[gi].map((id) => itemById.get(id)!).reduce((s, it) => s + Number(it.line_total ?? 0), 0));
        if (sub > 0.009) expectedByGroup.set(gi, sub);
      }
      const paidByGroup = new Map<number, number>();
      for (const pay of payments) {
        if (!receivableIdForGroupIndex(pay.group_index)) {
          await rollbackReceivables();
          return res.status(400).json({ error: `group_index inválido: ${pay.group_index}` });
        }
        paidByGroup.set(pay.group_index, round2((paidByGroup.get(pay.group_index) ?? 0) + pay.amount));
      }
      for (const [gi, expected] of expectedByGroup) {
        const got = paidByGroup.get(gi) ?? 0;
        if (Math.abs(got - expected) > 0.02) {
          await rollbackReceivables();
          return res.status(400).json({
            error: `Valor pago do grupo ${gi} deve ser ${expected.toFixed(2)} (recebido ${got.toFixed(2)})`,
          });
        }
      }

      for (const pay of payments) {
        const rid = receivableIdForGroupIndex(pay.group_index)!;

        const { data: recRow } = await supabaseAdmin.from('hub_receivables').select('final_amount, unit_id').eq('id', rid).single();
        const finalAmt = Number(recRow?.final_amount ?? 0);

        let validatedCashSessionId: string | null = null;
        if (pay.payment_method === 'cash') {
          if (!pay.cash_session_id) {
            await rollbackReceivables();
            return res.status(409).json({ error: 'Abra o caixa para receber em dinheiro.' });
          }
          const { data: cashSession, error: cashErr } = await supabaseAdmin
            .from('hub_cash_sessions')
            .select('id, clinic_id, unit_id, status')
            .eq('id', pay.cash_session_id)
            .maybeSingle();
          const recUnit = recRow?.unit_id as string | null;
          if (
            cashErr ||
            !cashSession ||
            cashSession.clinic_id !== clinic_id ||
            cashSession.status !== 'open' ||
            (recUnit && cashSession.unit_id !== recUnit)
          ) {
            await rollbackReceivables();
            return res.status(409).json({ error: 'Sessão de caixa inválida ou fechada.' });
          }
          validatedCashSessionId = cashSession.id as string;
        }

        const { error: pErr } = await supabaseAdmin.from('hub_payments').insert({
          clinic_id,
          receivable_id: rid,
          cash_session_id: validatedCashSessionId,
          amount: round2(pay.amount),
          payment_method: pay.payment_method,
          installments: pay.installments ?? 1,
          payment_date: new Date().toISOString(),
          notes: null,
          created_by_user_id: userId,
        });
        if (pErr) {
          await rollbackReceivables();
          return res.status(500).json({ error: pErr.message });
        }

        const { data: sumRows } = await supabaseAdmin.from('hub_payments').select('amount').eq('receivable_id', rid);
        const paid = round2((sumRows ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0));
        let nextStatus = 'partially_paid';
        if (paid >= finalAmt - 0.009) nextStatus = 'paid';
        await supabaseAdmin.from('hub_receivables').update({ status: nextStatus }).eq('id', rid);
      }
    }

    const after = await getHubComandaDetailPayload(comandaId, clinic_id);
    const stillOpen = (after.open_item_ids as string[]).length > 0;
    if (!stillOpen) {
      await supabaseAdmin.from('hub_comandas').update({ status: 'fechada', closed_at: new Date().toISOString() }).eq('id', comandaId);
    }

    const { data: comandaFinal } = await supabaseAdmin.from('hub_comandas').select('*').eq('id', comandaId).single();

    return res.status(201).json({
      comanda: comandaFinal,
      receivable_ids: receivableIds,
      detail: await getHubComandaDetailPayload(comandaId, clinic_id),
    });
  } catch (e: unknown) {
    console.error('postHubComandaCheckout', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const listComandasQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    status: z.enum(['aberta', 'fechada', 'cancelada']).optional(),
  })
  .strict();

export const getHubComandaByOrigin = async (req: Request, res: Response) => {
  try {
    const q = z
      .object({
        clinic_id: uuidStr,
        origin_type: comandaOriginSchema,
        origin_id: uuidStr,
      })
      .strict()
      .safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ error: 'clinic_id, origin_type e origin_id obrigatórios' });
    }
    const { clinic_id, origin_type, origin_id } = q.data;
    const { data: row, error } = await supabaseAdmin
      .from('hub_comandas')
      .select('id')
      .eq('clinic_id', clinic_id)
      .eq('origin_type', origin_type)
      .eq('origin_id', origin_id)
      .eq('status', 'aberta')
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: 'Comanda aberta não encontrada' });
    const detail = await getHubComandaDetailPayload(row.id as string, clinic_id);
    return res.json(detail);
  } catch (e: unknown) {
    console.error('getHubComandaByOrigin', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const listHubComandas = async (req: Request, res: Response) => {
  try {
    const parsed = listComandasQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id obrigatório', details: parsed.error.flatten() });
    }
    const { clinic_id, unit_id, status } = parsed.data;
    let q = supabaseAdmin
      .from('hub_comandas')
      .select('id, clinic_id, unit_id, guardian_id, origin_type, origin_id, status, total_amount, opened_at, closed_at')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('opened_at', { ascending: false })
      .limit(100);
    if (unit_id) q = q.or(`unit_id.eq.${unit_id},unit_id.is.null`);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ comandas: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubComandas', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** Exportado para uso em hubFinancialController (fila sem cobrança). */
export async function fetchOpenComandaOriginKeysExported(clinicId: string): Promise<Set<string>> {
  return fetchOpenComandaOriginKeys(clinicId);
}
