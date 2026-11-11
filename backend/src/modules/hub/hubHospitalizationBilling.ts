/** Resolução de diárias e lançamentos de internação para comanda / Caixa. */

import { supabaseAdmin } from '../../config/supabase';
import { isMissingPostgrestRelation } from '../../utils/supabaseSchemaErrors.js';

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const HOSPITALIZATION_CLOSED_STATUSES = ['discharged', 'death', 'transferred'] as const;
export type HospitalizationClosedStatus = (typeof HOSPITALIZATION_CLOSED_STATUSES)[number];

export function isHospitalizationClosed(status: string | null | undefined): boolean {
  return HOSPITALIZATION_CLOSED_STATUSES.includes(String(status ?? '') as HospitalizationClosedStatus);
}

export type HospitalizationBillingOrigin = {
  origin_type: 'encounter' | 'appointment';
  origin_id: string;
};

/** Origem cobrável da internação (comanda continua encounter/appointment). */
export function resolveHospitalizationBillingOrigin(hosp: {
  hub_encounter_id?: string | null;
  hub_appointment_id?: string | null;
}): HospitalizationBillingOrigin | null {
  const encId = (hosp.hub_encounter_id as string | null) ?? null;
  if (encId) return { origin_type: 'encounter', origin_id: encId };
  const apptId = (hosp.hub_appointment_id as string | null) ?? null;
  if (apptId) return { origin_type: 'appointment', origin_id: apptId };
  return null;
}

export type UnbilledHospitalizationInput = {
  id: string;
  status: string;
  billing_waived_at?: string | null;
  deleted_at?: string | null;
  hub_encounter_id?: string | null;
  hub_appointment_id?: string | null;
};

export type UnbilledHospitalizationContext = {
  activeReceivableKeys: Set<string>;
  comandaOpenKeys: Set<string>;
  billedViaComandaKeys: Set<string>;
  /** Chaves `encounter:id` / `appointment:id` já listadas no unbilled. */
  alreadyListedBillingOrigins: Set<string>;
};

/**
 * Inclui internação encerrada na fila sem cobrança quando ainda não há comanda/recebível
 * na origem cobrável (encounter preferencial, senão appointment).
 */
export function shouldIncludeInUnbilledHospitalization(
  hosp: UnbilledHospitalizationInput,
  ctx: UnbilledHospitalizationContext,
): boolean {
  if (!isHospitalizationClosed(hosp.status)) return false;
  if (hosp.billing_waived_at) return false;
  if (hosp.deleted_at) return false;

  const origin = resolveHospitalizationBillingOrigin(hosp);
  if (!origin) return false;

  const originKey = `${origin.origin_type}:${origin.origin_id}`;
  if (ctx.activeReceivableKeys.has(originKey)) return false;
  if (ctx.comandaOpenKeys.has(originKey)) return false;
  if (ctx.billedViaComandaKeys.has(originKey)) return false;
  if (ctx.alreadyListedBillingOrigins.has(originKey)) return false;

  // Também evita reaparecer se já houver recebível/comanda direto da internação (futuro).
  const hospKey = `hospitalization:${hosp.id}`;
  if (ctx.activeReceivableKeys.has(hospKey)) return false;
  if (ctx.comandaOpenKeys.has(hospKey)) return false;
  if (ctx.billedViaComandaKeys.has(hospKey)) return false;

  return true;
}

export type HospitalizationDailyInput = {
  id: string;
  pet_id?: string | null;
  status: string;
  admitted_at: string;
  discharged_at?: string | null;
  daily_hub_service_type_id?: string | null;
  daily_unit_amount?: number | null;
  service_name?: string | null;
};

/**
 * Número de diárias entre admissão e alta (ou agora, se ativa).
 * Conta o dia de admissão; mínimo 1 enquanto internado ou após alta no mesmo dia.
 */
export function computeHospitalizationDays(
  admittedAt: string | null | undefined,
  dischargedAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!admittedAt) return 0;
  const start = new Date(admittedAt);
  if (Number.isNaN(start.getTime())) return 0;

  const endRaw = dischargedAt ? new Date(dischargedAt) : now;
  if (Number.isNaN(endRaw.getTime())) return 0;

  // Normaliza para meia-noite local do calendário (diferença em dias civis).
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(endRaw.getFullYear(), endRaw.getMonth(), endRaw.getDate());
  const days = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
}

export type HospitalizationDailyComandaLine = {
  pet_id: string | null;
  item_kind: 'service';
  hub_service_type_id: string | null;
  hub_inventory_item_id: null;
  hub_inventory_lot_id: null;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  service_date: string | null;
  origin_type: 'hospitalization_daily';
  origin_id: string;
  sort_order: number;
};

export type HospitalizationChargeComandaLine = {
  pet_id: string | null;
  item_kind: 'service' | 'product';
  hub_service_type_id: string | null;
  hub_inventory_item_id: string | null;
  hub_inventory_lot_id: string | null;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  service_date: string | null;
  origin_type: 'hospitalization_charge';
  origin_id: string;
  sort_order: number;
};

export type HospitalizationComandaLine = HospitalizationDailyComandaLine | HospitalizationChargeComandaLine;

export function buildHospitalizationDailyDescription(
  serviceName: string | null | undefined,
  quantity: number,
): string {
  const name = (serviceName ?? 'Diária de internação').trim() || 'Diária de internação';
  return `${name} — ${quantity} ${quantity === 1 ? 'diária' : 'diárias'}`;
}

export function hospitalizationChargeDescription(
  chargeKind: string | null | undefined,
  serviceName: string | null | undefined,
): string {
  const kind = String(chargeKind ?? 'other');
  const prefix =
    kind === 'medication'
      ? 'Medicação (internação)'
      : kind === 'material'
        ? 'Material (internação)'
        : kind === 'procedure'
          ? 'Procedimento (internação)'
          : 'Internação';
  return `${prefix}: ${String(serviceName || 'Item')}`;
}

/**
 * Monta a linha de diária para a comanda.
 * Retorna null se não houver serviço de diária configurado ou valor inválido.
 * Itens `included` / cobranças extras ficam em hub_hospitalization_charges (outra origem).
 */
export function buildHospitalizationDailyItems(
  hospitalization: HospitalizationDailyInput,
  now: Date = new Date(),
): { line: HospitalizationDailyComandaLine; subtotal: number } | null {
  if (!hospitalization.daily_hub_service_type_id) return null;
  if (hospitalization.status === 'cancelled') return null;

  const unitAmount = round2(Number(hospitalization.daily_unit_amount ?? 0));
  if (unitAmount < 0) return null;

  const quantity = computeHospitalizationDays(
    hospitalization.admitted_at,
    hospitalization.discharged_at,
    now,
  );
  const lineTotal = round2(quantity * unitAmount);

  const line: HospitalizationDailyComandaLine = {
    pet_id: hospitalization.pet_id ?? null,
    item_kind: 'service',
    hub_service_type_id: hospitalization.daily_hub_service_type_id,
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    description: buildHospitalizationDailyDescription(hospitalization.service_name, quantity),
    quantity,
    unit_amount: unitAmount,
    discount_amount: 0,
    line_total: lineTotal,
    service_date: hospitalization.admitted_at
      ? hospitalization.admitted_at.slice(0, 10)
      : null,
    origin_type: 'hospitalization_daily',
    origin_id: hospitalization.id,
    sort_order: 0,
  };

  return { line, subtotal: lineTotal };
}

export type HospitalizationChargeInput = {
  id: string;
  hub_service_type_id?: string | null;
  hub_inventory_item_id?: string | null;
  hub_inventory_lot_id?: string | null;
  service_name?: string | null;
  quantity?: number | null;
  unit_amount?: number | null;
  charge_kind?: string | null;
  service_date?: string | null;
};

export function buildHospitalizationChargeLine(
  charge: HospitalizationChargeInput,
  petId: string | null,
  sortOrder = 0,
): HospitalizationChargeComandaLine {
  const qty = Number(charge.quantity ?? 1) || 1;
  const unit = round2(Number(charge.unit_amount ?? 0));
  return {
    pet_id: petId,
    item_kind: charge.hub_inventory_item_id ? 'product' : 'service',
    hub_service_type_id: charge.hub_service_type_id ?? null,
    hub_inventory_item_id: charge.hub_inventory_item_id ?? null,
    hub_inventory_lot_id: charge.hub_inventory_lot_id ?? null,
    description: hospitalizationChargeDescription(charge.charge_kind, charge.service_name),
    quantity: qty,
    unit_amount: unit,
    discount_amount: 0,
    line_total: round2(qty * unit),
    service_date: charge.service_date ?? null,
    origin_type: 'hospitalization_charge',
    origin_id: charge.id,
    sort_order: sortOrder,
  };
}

/** Estimativa rápida (diária + charges) para day board / unbilled. */
export function estimateHospitalizationBillingAmount(
  hospitalization: HospitalizationDailyInput,
  charges: HospitalizationChargeInput[] = [],
  now: Date = new Date(),
): number {
  let total = 0;
  const daily = buildHospitalizationDailyItems(hospitalization, now);
  if (daily) total += daily.subtotal;
  for (const c of charges) {
    total += buildHospitalizationChargeLine(c, hospitalization.pet_id ?? null).line_total;
  }
  return round2(total);
}

export type LoadHospitalizationComandaItemsOpts = {
  clinicId: string;
  /** Preferencial: linhas da internação ligada ao encounter. */
  encounterId?: string | null;
  /** Também inclui internações espelhadas só no appointment. */
  appointmentId?: string | null;
  /** Carrega uma internação específica (preview/waive). */
  hospitalizationId?: string | null;
  defaultPetId?: string | null;
  now?: Date;
};

/**
 * Carrega diárias + charges confirmados de internações ligadas ao encounter e/ou appointment.
 * Deduplica por id da internação.
 */
export async function loadHospitalizationComandaItems(
  opts: LoadHospitalizationComandaItemsOpts,
): Promise<{ items: HospitalizationComandaLine[]; subtotal: number }> {
  const {
    clinicId,
    encounterId,
    appointmentId,
    hospitalizationId,
    defaultPetId,
    now = new Date(),
  } = opts;
  if (!encounterId && !appointmentId && !hospitalizationId) return { items: [], subtotal: 0 };

  const byId = new Map<string, Record<string, unknown>>();

  const selectCols =
    'id, pet_id, status, admitted_at, discharged_at, daily_hub_service_type_id, daily_unit_amount, hub_encounter_id, hub_appointment_id';

  if (hospitalizationId) {
    const { data, error } = await supabaseAdmin
      .from('hub_hospitalizations')
      .select(selectCols)
      .eq('clinic_id', clinicId)
      .eq('id', hospitalizationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error && !isMissingPostgrestRelation(error)) throw new Error(error.message);
    if (data) byId.set(data.id as string, data as Record<string, unknown>);
  }

  if (encounterId) {
    const { data, error } = await supabaseAdmin
      .from('hub_hospitalizations')
      .select(selectCols)
      .eq('clinic_id', clinicId)
      .eq('hub_encounter_id', encounterId)
      .is('deleted_at', null);
    if (error && !isMissingPostgrestRelation(error)) throw new Error(error.message);
    for (const row of data ?? []) byId.set(row.id as string, row as Record<string, unknown>);
  }

  if (appointmentId) {
    const { data, error } = await supabaseAdmin
      .from('hub_hospitalizations')
      .select(selectCols)
      .eq('clinic_id', clinicId)
      .eq('hub_appointment_id', appointmentId)
      .is('deleted_at', null);
    if (error && !isMissingPostgrestRelation(error)) throw new Error(error.message);
    for (const row of data ?? []) byId.set(row.id as string, row as Record<string, unknown>);
  }

  const hospList = [...byId.values()];
  if (!hospList.length) return { items: [], subtotal: 0 };

  const dailyServiceIds = [
    ...new Set(
      hospList
        .map((h) => h.daily_hub_service_type_id as string | null | undefined)
        .filter(Boolean) as string[],
    ),
  ];
  const dailyNameById = new Map<string, string>();
  if (dailyServiceIds.length > 0) {
    const { data: dailySvcs } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, name')
      .in('id', dailyServiceIds);
    for (const s of dailySvcs ?? []) {
      dailyNameById.set(s.id as string, String(s.name));
    }
  }

  const items: HospitalizationComandaLine[] = [];
  let subtotal = 0;

  for (const hosp of hospList) {
    const petId = (hosp.pet_id as string | null) ?? defaultPetId ?? null;
    const built = buildHospitalizationDailyItems(
      {
        id: hosp.id as string,
        pet_id: petId,
        status: String(hosp.status ?? ''),
        admitted_at: String(hosp.admitted_at ?? ''),
        discharged_at: (hosp.discharged_at as string | null) ?? null,
        daily_hub_service_type_id: (hosp.daily_hub_service_type_id as string | null) ?? null,
        daily_unit_amount: hosp.daily_unit_amount == null ? null : Number(hosp.daily_unit_amount),
        service_name: hosp.daily_hub_service_type_id
          ? dailyNameById.get(hosp.daily_hub_service_type_id as string) ?? null
          : null,
      },
      now,
    );
    if (built) {
      items.push({ ...built.line, sort_order: items.length });
      subtotal += built.subtotal;
    }
  }

  const hospIds = hospList.map((h) => h.id as string);
  const { data: chargeRows, error: chargeErr } = await supabaseAdmin
    .from('hub_hospitalization_charges')
    .select(
      'id, hospitalization_id, hub_service_type_id, hub_inventory_item_id, hub_inventory_lot_id, service_name, quantity, unit_amount, billing_mode, price_status, service_date, charge_kind',
    )
    .in('hospitalization_id', hospIds)
    .eq('billing_mode', 'charge')
    .eq('price_status', 'confirmed')
    .is('deleted_at', null);
  if (chargeErr && !isMissingPostgrestRelation(chargeErr)) throw new Error(chargeErr.message);

  const petByHospId = new Map(
    hospList.map((h) => [
      h.id as string,
      (h.pet_id as string | null) ?? defaultPetId ?? null,
    ]),
  );

  for (const raw of chargeRows ?? []) {
    const row = raw as Record<string, unknown>;
    const line = buildHospitalizationChargeLine(
      {
        id: row.id as string,
        hub_service_type_id: (row.hub_service_type_id as string | null) ?? null,
        hub_inventory_item_id: (row.hub_inventory_item_id as string | null) ?? null,
        hub_inventory_lot_id: (row.hub_inventory_lot_id as string | null) ?? null,
        service_name: (row.service_name as string | null) ?? null,
        quantity: Number(row.quantity ?? 1),
        unit_amount: Number(row.unit_amount ?? 0),
        charge_kind: (row.charge_kind as string | null) ?? null,
        service_date: (row.service_date as string | null) ?? null,
      },
      petByHospId.get(row.hospitalization_id as string) ?? defaultPetId ?? null,
      items.length,
    );
    items.push(line);
    subtotal += line.line_total;
  }

  return { items, subtotal: round2(subtotal) };
}

export function mergeHospitalizationItemsIntoSnapshot<
  T extends {
    items: Array<{ origin_type?: string | null; origin_id?: string | null; line_total?: number; sort_order?: number }>;
    subtotal: number;
  },
>(
  snapshot: T,
  hospItems: HospitalizationComandaLine[],
): T {
  if (!hospItems.length) return snapshot;
  const existing = new Set(
    snapshot.items
      .filter((it) => it.origin_type && it.origin_id)
      .map((it) => `${it.origin_type}:${it.origin_id}`),
  );
  const toAdd = hospItems.filter((it) => !existing.has(`${it.origin_type}:${it.origin_id}`));
  if (!toAdd.length) return snapshot;
  const base = snapshot.items.length;
  const mapped = toAdd.map((it, i) => ({ ...it, sort_order: base + i }));
  const addTotal = round2(mapped.reduce((s, it) => s + Number(it.line_total ?? 0), 0));
  return {
    ...snapshot,
    items: [...snapshot.items, ...mapped],
    subtotal: round2(snapshot.subtotal + addTotal),
  };
}
