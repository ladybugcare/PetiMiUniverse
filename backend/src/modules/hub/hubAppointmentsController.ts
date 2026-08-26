import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { ensureDefaultHubServiceGroups } from './hubServiceGroupsController';
import { getOrCreateHubClinicSettings } from './hubClinicSettingsController';
import { COAT_TYPE_VALUES, PORTE_VALUES, parsePricingMatrixJson, roundMoney2 } from './hubServiceTypesPricingMatrix';
import {
  normalizePickupPriceScope,
  resolvePickupLegAmounts,
  type PickupPriceScope,
} from './hubPickupPricing';
import {
  PET_BODY_SIZE_TIERS,
  requiresCoatPricing,
  resolveServiceLinePricing,
  validateCoatOverrideForServiceTypes,
  validatePorteOverrideForServiceTypes,
  type HubQuotePricingVariantInput,
  type PetPricingFields,
  type ServiceTypePricingRow,
} from './hubPricingResolve';
import {
  maybeFlagComandaCancellationPending,
  financialAdjustmentFlagsForAppointments,
  syncOpenComandasAfterAppointmentOperationalComplete,
} from './hubComandasController';
import { hasPackageBalanceForServices, listActivePackageBalances } from './hubPackagesService';
import {
  careLocationBodyFields,
  careLocationKindSchema,
  loadPartnerClinicMap,
  resolveCareLocation,
} from './hubCareLocation';

function validateLevaTrazServiceType(st: ServiceTypePricingRow | undefined): string | null {
  if (!st) return 'Tipo de serviço de Leva e Traz inválido.';
  const g = String(st.service_group ?? '').trim();
  if (g !== 'leva_traz') return 'O serviço de transporte deve pertencer ao grupo Leva e Traz.';
  return null;
}

function pickupLegMinutes(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  const m = Math.round(ms / 60_000);
  return Math.max(1, Number.isFinite(m) ? m : 1);
}

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

const uuidStr = z.string().uuid();

const optionalTrim = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === undefined || v === null ? undefined : String(v).trim()))
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || v === undefined || v.length <= max, { message: 'Texto muito longo' });

const appointmentStatusSchema = z.enum([
  'pending_confirm',
  'confirmed',
  'checked_in',
  'in_progress',
  'done',
  'cancelled',
  'paid',
]);

const appointmentKindSchema = z.enum([
  'standard',
  'hotel_stay',
  'daycare_block',
  'pickup_route',
  'clinical_walk_in',
  'clinical_emergency',
  'walk_in',
]);

type AppointmentKind = z.infer<typeof appointmentKindSchema>;

function isLevaTrazServiceGroup(st: ServiceTypePricingRow | undefined): boolean {
  return String(st?.service_group ?? '').trim().toLowerCase() === 'leva_traz';
}

/**
 * Serviço principal do grupo Leva e Traz vira parada operacional (`pickup_route`),
 * a menos que o cliente tenha pedido explicitamente outro kind (ex.: walk-in).
 */
function resolveAppointmentKindForCreate(
  explicitKind: AppointmentKind | undefined,
  primaryService: ServiceTypePricingRow | undefined,
): AppointmentKind {
  if (explicitKind && explicitKind !== 'standard') return explicitKind;
  if (isLevaTrazServiceGroup(primaryService)) return 'pickup_route';
  return explicitKind ?? 'standard';
}

const WALK_IN_APPOINTMENT_KINDS = new Set([
  'walk_in',
  'clinical_walk_in',
  'clinical_emergency',
]);

function isWalkInAppointmentKind(kind: string | null | undefined): boolean {
  return !!kind && WALK_IN_APPOINTMENT_KINDS.has(kind);
}

type OverlapRow = {
  id: string;
  hub_staff_member_id: string | null;
  resource_label: string | null;
  unit_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

function isStaffConflict(staffId: string | null, other: OverlapRow): boolean {
  if (!staffId || !other.hub_staff_member_id) return false;
  return staffId === other.hub_staff_member_id;
}

function isResourceConflict(resourceLabel: string | null, unitId: string | null, other: OverlapRow): boolean {
  const r1 = resourceLabel?.trim();
  const r2 = other.resource_label?.trim();
  if (!r1 || !r2) return false;
  if (r1 !== r2) return false;
  return String(unitId ?? '') === String(other.unit_id ?? '');
}

function rowConflictsWith(
  row: OverlapRow,
  staffId: string | null,
  resourceLabel: string | null,
  unitId: string | null,
  startsAt: string,
  endsAt: string,
): boolean {
  if (row.status === 'cancelled') return false;
  if (!intervalsOverlap(startsAt, endsAt, row.starts_at, row.ends_at)) return false;
  return isStaffConflict(staffId, row) || isResourceConflict(resourceLabel, unitId, row);
}

async function loadOverlappingRows(
  clinicId: string,
  startsAt: string,
  endsAt: string,
  excludeIds: string[],
): Promise<OverlapRow[]> {
  let q = supabaseAdmin
    .from('hub_appointments')
    .select('id, hub_staff_member_id, resource_label, unit_id, starts_at, ends_at, status')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt);
  if (excludeIds.length === 1) q = q.neq('id', excludeIds[0]!);
  else if (excludeIds.length > 1) q = q.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OverlapRow[];
}

async function assertNoScheduleConflict(
  clinicId: string,
  excludeIds: string[],
  staffId: string | null,
  resourceLabel: string | null,
  unitId: string | null,
  startsAt: string,
  endsAt: string,
): Promise<{ conflict: boolean; reason: string; conflictingId?: string }> {
  const rows = await loadOverlappingRows(clinicId, startsAt, endsAt, excludeIds);
  for (const row of rows) {
    if (rowConflictsWith(row, staffId, resourceLabel, unitId, startsAt, endsAt)) {
      const reason =
        isStaffConflict(staffId, row) && staffId
          ? 'Horário em conflito com outro atendimento do mesmo profissional.'
          : 'Horário em conflito com outro atendimento no mesmo recurso/sala.';
      return { conflict: true, reason, conflictingId: row.id };
    }
  }
  return { conflict: false, reason: '' };
}

async function assertServiceTypeInClinic(clinicId: string, serviceTypeId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('id', serviceTypeId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function assertStaffInClinicOptional(clinicId: string, staffId: string | null): Promise<boolean> {
  if (!staffId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('id', staffId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

async function assertPetInClinic(clinicId: string, petId: string | null): Promise<boolean> {
  if (!petId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_pets')
    .select('id')
    .eq('id', petId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

async function assertGuardianInClinic(clinicId: string, guardianId: string | null): Promise<boolean> {
  if (!guardianId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_guardians')
    .select('id')
    .eq('id', guardianId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

async function assertUnitInClinic(clinicId: string, unitId: string | null): Promise<boolean> {
  if (!unitId) return true;
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('id, clinic_id')
    .eq('id', unitId)
    .maybeSingle();
  if (error || !data || (data as { clinic_id: string }).clinic_id !== clinicId) return false;
  return true;
}

const PRICING_TIER_SET = new Set<string>(PORTE_VALUES as unknown as string[]);
const PRICING_COAT_SET = new Set<string>(COAT_TYPE_VALUES as unknown as string[]);
const PET_BODY_SET = new Set<string>(PET_BODY_SIZE_TIERS as unknown as string[]);

const optionalPricingPorte = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim()));

const optionalPricingCoat = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim()));

async function fetchServiceTypesMap(clinicId: string, ids: string[]): Promise<Map<string, ServiceTypePricingRow>> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return new Map();
  let rows: Array<Record<string, unknown>> = [];
  {
    const first = await supabaseAdmin
      .from('hub_service_types')
      .select('id, service_group, pricing_matrix, cost_amount, sale_amount, pickup_price_scope')
      .eq('clinic_id', clinicId)
      .in('id', uniq)
      .is('deleted_at', null);
    if (first.error && String(first.error.message ?? '').includes('pickup_price_scope')) {
      const legacy = await supabaseAdmin
        .from('hub_service_types')
        .select('id, service_group, pricing_matrix, cost_amount, sale_amount')
        .eq('clinic_id', clinicId)
        .in('id', uniq)
        .is('deleted_at', null);
      if (legacy.error) throw new Error(legacy.error.message);
      rows = (legacy.data ?? []) as Array<Record<string, unknown>>;
    } else if (first.error) {
      throw new Error(first.error.message);
    } else {
      rows = (first.data ?? []) as Array<Record<string, unknown>>;
    }
  }
  const m = new Map<string, ServiceTypePricingRow>();
  for (const r of rows) {
    m.set(String(r.id), {
      id: String(r.id),
      service_group: String(r.service_group ?? ''),
      pricing_matrix: r.pricing_matrix,
      cost_amount: Number(r.cost_amount) || 0,
      sale_amount: Number(r.sale_amount) || 0,
      pickup_price_scope: normalizePickupPriceScope(r.pickup_price_scope),
    });
  }
  return m;
}

async function fetchPetPricingFields(
  clinicId: string,
  petId: string | null,
): Promise<PetPricingFields> {
  if (!petId) return { size_tier: 'medio', birth_date: null, coat_type: null };
  const { data, error } = await supabaseAdmin
    .from('hub_pets')
    .select('size_tier, birth_date, coat_type')
    .eq('id', petId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return { size_tier: 'medio', birth_date: null, coat_type: null };
  const d = data as { size_tier?: string | null; birth_date?: string | null; coat_type?: string | null };
  const st = d.size_tier && PET_BODY_SET.has(String(d.size_tier)) ? String(d.size_tier) : 'medio';
  const bd = d.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(String(d.birth_date)) ? String(d.birth_date) : null;
  const ct = d.coat_type && PRICING_COAT_SET.has(String(d.coat_type)) ? String(d.coat_type) : null;
  return { size_tier: st, birth_date: bd, coat_type: ct };
}

function validatePricingPorteInputs(params: {
  appointmentOverride: string | null;
  appointmentCoatOverride: string | null;
  pet: PetPricingFields;
  lines: Array<{ hub_service_type_id: string; pricing_porte_tier?: string | null; pricing_coat_type?: string | null }>;
  stMap: Map<string, ServiceTypePricingRow>;
}): { error?: string } {
  const { appointmentOverride, appointmentCoatOverride, pet, lines, stMap } = params;
  const checkTier = (t: string | null): string | undefined => {
    if (!t) return undefined;
    if (!PRICING_TIER_SET.has(t)) return `Porte de preço inválido: ${t}`;
    return undefined;
  };
  const checkCoat = (t: string | null): string | undefined => {
    if (!t) return undefined;
    if (!PRICING_COAT_SET.has(t)) return `Pelagem inválida: ${t}`;
    return undefined;
  };
  const e0 = checkTier(appointmentOverride);
  if (e0) return { error: e0 };
  const c0 = checkCoat(appointmentCoatOverride);
  if (c0) return { error: c0 };
  for (const line of lines) {
    const te = checkTier(line.pricing_porte_tier ?? null);
    if (te) return { error: te };
    const ce = checkCoat(line.pricing_coat_type ?? null);
    if (ce) return { error: ce };
  }
  const stListForAppt = [...new Set(lines.map((l) => l.hub_service_type_id))]
    .map((id) => stMap.get(id))
    .filter(Boolean) as ServiceTypePricingRow[];
  const v = validatePorteOverrideForServiceTypes(stListForAppt, appointmentOverride);
  if (v !== true) return { error: v.error };
  const cv = validateCoatOverrideForServiceTypes(stListForAppt, appointmentCoatOverride);
  if (cv !== true) return { error: cv.error };
  for (const st of stListForAppt) {
    if (requiresCoatPricing(st) && !(appointmentCoatOverride || pet.coat_type)) {
      return { error: 'Selecione a pelagem do pet para precificar serviços de Banho & Tosa por pelagem.' };
    }
  }
  for (const line of lines) {
    const t = line.pricing_porte_tier?.trim() || null;
    if (!t) continue;
    const st = stMap.get(line.hub_service_type_id);
    if (!st) continue;
    const vv = validatePorteOverrideForServiceTypes([st], t);
    if (vv !== true) return { error: vv.error };
  }
  for (const line of lines) {
    const t = line.pricing_coat_type?.trim() || null;
    if (!t) continue;
    const st = stMap.get(line.hub_service_type_id);
    if (!st) continue;
    const vv = validateCoatOverrideForServiceTypes([st], t);
    if (vv !== true) return { error: vv.error };
  }
  return {};
}

function normalizeCreateServiceLines(b: {
  hub_service_type_id: string;
  services?: Array<{
    hub_service_type_id: string;
    duration_minutes: number;
    pricing_porte_tier?: string | null;
    pricing_coat_type?: string | null;
    pricing_variant?: HubQuotePricingVariantInput | null;
  }>;
}): Array<{
  hub_service_type_id: string;
  duration_minutes: number;
  pricing_porte_tier?: string | null;
  pricing_coat_type?: string | null;
  pricing_variant?: HubQuotePricingVariantInput | null;
}> {
  if (b.services && b.services.length > 0) {
    return b.services.map((s) => ({
      hub_service_type_id: s.hub_service_type_id,
      duration_minutes: s.duration_minutes,
      pricing_porte_tier: s.pricing_porte_tier ?? null,
      pricing_coat_type: s.pricing_coat_type ?? null,
      pricing_variant: s.pricing_variant ?? null,
    }));
  }
  return [
    {
      hub_service_type_id: b.hub_service_type_id,
      duration_minutes: 60,
      pricing_porte_tier: null,
      pricing_coat_type: null,
      pricing_variant: null,
    },
  ];
}

function buildServiceLineSnapshots(params: {
  lines: Array<{
    hub_service_type_id: string;
    duration_minutes: number;
    pricing_porte_tier?: string | null;
    pricing_coat_type?: string | null;
    pricing_variant?: HubQuotePricingVariantInput | null;
    sale_amount_override?: number | null;
    cost_amount_override?: number | null;
  }>;
  stMap: Map<string, ServiceTypePricingRow>;
  pet: PetPricingFields;
  appointmentYmd: string;
  puppyMaxMonths: number;
  appointmentOverride: string | null;
  appointmentCoatOverride: string | null;
}): Array<{
  hub_service_type_id: string;
  duration_minutes: number;
  order_index: number;
  pricing_porte_tier_applied: string | null;
  pricing_coat_type_applied: string | null;
  cost_amount_applied: number;
  sale_amount_applied: number;
  pricing_variant: HubQuotePricingVariantInput | null;
}> {
  const { lines, stMap, pet, appointmentYmd, puppyMaxMonths, appointmentOverride, appointmentCoatOverride } = params;
  return lines.map((line, idx) => {
    const st = stMap.get(line.hub_service_type_id);
    if (!st) {
      throw new Error(`Tipo de serviço não encontrado: ${line.hub_service_type_id}`);
    }
    const lineOverride = line.pricing_porte_tier?.trim() || null;
    const lineCoatOverride = line.pricing_coat_type?.trim() || null;
    const effPorte = lineOverride ?? appointmentOverride;
    const effCoat = lineCoatOverride ?? appointmentCoatOverride;
    const r = resolveServiceLinePricing({
      serviceType: st,
      pet,
      appointmentDateYmd: appointmentYmd,
      puppyMaxMonths,
      overrideTier: effPorte,
      overrideCoatType: effCoat,
      pricing_variant: line.pricing_variant ?? undefined,
    });
    const sale =
      line.sale_amount_override != null && Number.isFinite(line.sale_amount_override)
        ? roundMoney2(line.sale_amount_override)
        : r.sale;
    const cost =
      line.cost_amount_override != null && Number.isFinite(line.cost_amount_override)
        ? roundMoney2(line.cost_amount_override)
        : r.cost;
    return {
      hub_service_type_id: line.hub_service_type_id,
      duration_minutes: line.duration_minutes,
      order_index: idx,
      pricing_porte_tier_applied: r.porteTierApplied,
      pricing_coat_type_applied: r.coatTypeApplied,
      cost_amount_applied: cost,
      sale_amount_applied: sale,
      pricing_variant: r.pricing_variant,
    };
  });
}

async function refreshSnapshotsForAppointment(
  clinicId: string,
  appointmentId: string,
  startsAt: string,
  petId: string | null,
  pricingPorteTier: string | null,
  pricingCoatType: string | null,
): Promise<void> {
  const { data: lines, error: le } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('id, hub_service_type_id, duration_minutes, order_index, pricing_variant')
    .eq('appointment_id', appointmentId)
    .order('order_index');
  if (le || !lines?.length) return;
  const ids = [...new Set((lines as { hub_service_type_id: string }[]).map((l) => l.hub_service_type_id))];
  const stMap = await fetchServiceTypesMap(clinicId, ids);
  const pet = await fetchPetPricingFields(clinicId, petId);
  const { pet_puppy_max_months } = await getOrCreateHubClinicSettings(clinicId);
  const ymd = startsAt.slice(0, 10);
  const normLines = (lines as { hub_service_type_id: string; duration_minutes: number; pricing_variant?: unknown }[]).map((l) => ({
    hub_service_type_id: l.hub_service_type_id,
    duration_minutes: l.duration_minutes,
    pricing_porte_tier: null as string | null,
    pricing_coat_type: null as string | null,
    pricing_variant: (l.pricing_variant as HubQuotePricingVariantInput | null) ?? null,
  }));
  const snaps = buildServiceLineSnapshots({
    lines: normLines,
    stMap,
    pet,
    appointmentYmd: ymd,
    puppyMaxMonths: pet_puppy_max_months,
    appointmentOverride: pricingPorteTier,
    appointmentCoatOverride: pricingCoatType,
  });
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i] as { id: string };
    const s = snaps[i];
    if (!s) continue;
    await supabaseAdmin
      .from('hub_appointment_services')
      .update({
        pricing_porte_tier_applied: s.pricing_porte_tier_applied,
        pricing_coat_type_applied: s.pricing_coat_type_applied,
        cost_amount_applied: s.cost_amount_applied,
        sale_amount_applied: s.sale_amount_applied,
        pricing_variant: s.pricing_variant as unknown as Record<string, unknown> | null,
      })
      .eq('id', row.id);
  }
}

// ── Recurrence helpers ──────────────────────────────────────────────────────

const MAX_OCCURRENCES = 52;

type RecurrenceRule = {
  kind: 'daily' | 'weekly' | 'monthly';
  interval_value: number;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  until_date?: string | null;
  occurrences?: number | null;
};

function generateOccurrenceDates(startDate: string, rule: RecurrenceRule): string[] {
  const dates: string[] = [];
  let current = new Date(startDate + 'T00:00:00Z');
  const cap = Math.min(rule.occurrences ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const until = rule.until_date ? new Date(rule.until_date + 'T23:59:59Z') : null;

  while (dates.length < cap) {
    if (until && current > until) break;

    if (rule.kind === 'daily') {
      dates.push(current.toISOString().slice(0, 10));
      current = new Date(current);
      current.setUTCDate(current.getUTCDate() + rule.interval_value);
    } else if (rule.kind === 'weekly') {
      const targetDays = rule.days_of_week && rule.days_of_week.length > 0 ? rule.days_of_week : [1];
      // iso weekday: 1=mon..7=sun
      const dow = ((current.getUTCDay() + 6) % 7) + 1;
      if (targetDays.includes(dow)) {
        dates.push(current.toISOString().slice(0, 10));
      }
      current = new Date(current);
      current.setUTCDate(current.getUTCDate() + 1);
      // skip to next week start if past all target days this week
      if (dates.length > 0 && rule.interval_value > 1) {
        const curDow = ((current.getUTCDay() + 6) % 7) + 1;
        const maxTarget = Math.max(...targetDays);
        if (curDow > maxTarget) {
          // jump to monday of next Nth week
          const daysUntilMon = (8 - current.getUTCDay()) % 7 || 7;
          current.setUTCDate(current.getUTCDate() + daysUntilMon + (rule.interval_value - 1) * 7);
        }
      }
      if (dates.length >= cap) break;
      continue;
    } else {
      // monthly
      dates.push(current.toISOString().slice(0, 10));
      current = new Date(current);
      current.setUTCMonth(current.getUTCMonth() + rule.interval_value);
      if (rule.day_of_month) {
        const maxDay = new Date(current.getUTCFullYear(), current.getUTCMonth() + 1, 0).getUTCDate();
        current.setUTCDate(Math.min(rule.day_of_month, maxDay));
      }
    }
  }
  return dates;
}

function shiftTimestampToDate(originalTs: string, newDate: string): string {
  // keep time portion from originalTs, apply to newDate
  const orig = new Date(originalTs);
  const [y, m, d] = newDate.split('-').map(Number);
  orig.setUTCFullYear(y!, m! - 1, d!);
  return orig.toISOString();
}

/** UUID determinístico por data — agrupa irmãos multi-pet na mesma visita recorrente. */
function visitGroupIdForOccurrence(baseGroupId: string, occDate: string): string {
  const hash = createHash('sha256').update(`${baseGroupId}:${occDate}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x40;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ── Enrichment ───────────────────────────────────────────────────────────────

type EnrichedAppointment = Record<string, unknown>;

async function enrichAppointments(rows: Record<string, unknown>[]): Promise<EnrichedAppointment[]> {
  if (rows.length === 0) return [];
  const staffIds = [...new Set(rows.map((r) => r.hub_staff_member_id).filter(Boolean))] as string[];
  const petIds = [...new Set(rows.map((r) => r.pet_id).filter(Boolean))] as string[];
  const guIds = [...new Set(rows.map((r) => r.guardian_id).filter(Boolean))] as string[];
  const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))] as string[];
  const partnerIds = [...new Set(rows.map((r) => r.hub_partner_clinic_id).filter(Boolean))] as string[];
  const apptIds = rows.map((r) => r.id as string);
  const enrichClinicId = (rows[0]?.clinic_id as string | undefined) ?? null;

  const svcLinesRes = apptIds.length
    ? await supabaseAdmin
        .from('hub_appointment_services')
        .select(
          'id, appointment_id, hub_service_type_id, duration_minutes, order_index, pricing_porte_tier_applied, pricing_coat_type_applied, cost_amount_applied, sale_amount_applied, pricing_variant',
        )
        .in('appointment_id', apptIds)
        .order('order_index')
    : { data: [] as Record<string, unknown>[], error: null };

  const stIds = [
    ...new Set([
      ...rows.map((r) => r.hub_service_type_id as string),
      ...((svcLinesRes.data ?? []) as { hub_service_type_id: string }[]).map((l) => l.hub_service_type_id),
    ]),
  ];

  const [stRes, staffRes, petsRes, guRes, unitsRes, encRes, partnerMap] = await Promise.all([
    stIds.length
      ? supabaseAdmin
          .from('hub_service_types')
          .select('id, name, code, service_group, agenda_color, default_duration_minutes, is_addon')
          .in('id', stIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    staffIds.length
      ? supabaseAdmin.from('hub_staff_members').select('id, full_name, agenda_color').in('id', staffIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    petIds.length
      ? supabaseAdmin.from('hub_pets').select('id, name, size_tier, coat_type, birth_date').in('id', petIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    guIds.length
      ? supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', guIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    unitIds.length
      ? supabaseAdmin.from('units').select('id, name').in('id', unitIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    apptIds.length
      ? supabaseAdmin
          .from('hub_encounters')
          .select('id, hub_appointment_id, status')
          .in('hub_appointment_id', apptIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    enrichClinicId
      ? loadPartnerClinicMap(enrichClinicId, partnerIds)
      : Promise.resolve(new Map<string, { id: string; name: string }>()),
  ]);

  const clinicId = (rows[0]?.clinic_id as string) || '';
  const groupColorBySlug = new Map<string, string>();
  if (clinicId) {
    await ensureDefaultHubServiceGroups(clinicId);
    const { data: grpRows } = await supabaseAdmin
      .from('hub_service_groups')
      .select('slug, color')
      .eq('clinic_id', clinicId);
    for (const g of grpRows ?? []) {
      const gr = g as { slug: string; color: string };
      if (gr.slug && gr.color && /^#[0-9A-Fa-f]{6}$/.test(gr.color)) {
        groupColorBySlug.set(gr.slug, gr.color);
      }
    }
  }

  const stMap = new Map(
    (stRes.data ?? []).map((x: Record<string, unknown>) => {
      const sg = String(x.service_group || 'outros').trim();
      return [x.id as string, { ...x, group_color: groupColorBySlug.get(sg) ?? null }];
    })
  );
  const staffMap = new Map((staffRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const petMap = new Map((petsRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const guMap = new Map((guRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const unitMap = new Map((unitsRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const encByAppt = new Map<string, { id: string; status: string }>();
  for (const enc of (encRes.data ?? []) as Record<string, unknown>[]) {
    const apptId = enc.hub_appointment_id as string | null;
    if (apptId) encByAppt.set(apptId, { id: enc.id as string, status: String(enc.status) });
  }

  // group service lines by appointment
  const svcByAppt = new Map<string, Record<string, unknown>[]>();
  for (const line of (svcLinesRes.data ?? []) as Record<string, unknown>[]) {
    const apptId = line.appointment_id as string;
    const arr = svcByAppt.get(apptId) ?? [];
    arr.push(line);
    svcByAppt.set(apptId, arr);
  }

  const adjustmentFlags = clinicId
    ? await financialAdjustmentFlagsForAppointments(clinicId, apptIds)
    : new Map<string, { financial_adjustment_pending: boolean; comanda_id: string | null }>();

  const clinicBalances = clinicId ? await listActivePackageBalances({ clinicId }) : [];

  return rows.map((r) => {
    const st = stMap.get(r.hub_service_type_id as string);
    const sm = r.hub_staff_member_id ? staffMap.get(r.hub_staff_member_id as string) : null;
    const pet = r.pet_id ? petMap.get(r.pet_id as string) : null;
    const gu = r.guardian_id ? guMap.get(r.guardian_id as string) : null;
    const un = r.unit_id ? unitMap.get(r.unit_id as string) : null;
    const partner = r.hub_partner_clinic_id
      ? partnerMap.get(r.hub_partner_clinic_id as string) ?? null
      : null;
    const rawLines = svcByAppt.get(r.id as string) ?? [];
    const services = rawLines.map((l) => ({
      id: l.id as string,
      hub_service_type_id: l.hub_service_type_id as string,
      duration_minutes: l.duration_minutes as number,
      order_index: l.order_index as number,
      pricing_porte_tier_applied: (l.pricing_porte_tier_applied as string | null) ?? null,
      pricing_coat_type_applied: (l.pricing_coat_type_applied as string | null) ?? null,
      cost_amount_applied:
        l.cost_amount_applied != null && l.cost_amount_applied !== ''
          ? Number(l.cost_amount_applied)
          : null,
      sale_amount_applied:
        l.sale_amount_applied != null && l.sale_amount_applied !== ''
          ? Number(l.sale_amount_applied)
          : null,
      pricing_variant: (l.pricing_variant as Record<string, unknown> | null) ?? null,
      service_type: stMap.get(l.hub_service_type_id as string) ?? null,
    }));
    const linked = encByAppt.get(r.id as string);
    const adj = adjustmentFlags.get(r.id as string);
    const serviceTypeIds = services.map((s) => s.hub_service_type_id);
    const hasPackageBalance = hasPackageBalanceForServices(
      clinicBalances,
      (r.guardian_id as string | null) ?? null,
      (r.pet_id as string | null) ?? null,
      serviceTypeIds
    );
    return {
      ...r,
      service_type: st ?? null,
      staff_member: sm ?? null,
      pet: pet ?? null,
      guardian: gu ?? null,
      unit: un ?? null,
      partner_clinic: partner,
      services,
      hub_encounter_id: linked?.id ?? null,
      hub_encounter_status: linked?.status ?? null,
      financial_adjustment_pending: adj?.financial_adjustment_pending ?? false,
      comanda_id: adj?.comanda_id ?? null,
      has_package_balance: hasPackageBalance,
    };
  });
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  clinic_id: uuidStr,
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  unit_id: uuidStr.optional(),
  care_location_kind: careLocationKindSchema.optional(),
  hub_partner_clinic_id: uuidStr.optional(),
  hub_staff_member_id: z.union([uuidStr, z.literal('__na__')]).optional(),
  hub_service_type_id: uuidStr.optional(),
  service_group: z.string().trim().min(1).max(64).optional(),
  status: appointmentStatusSchema.optional(),
  resource_label: z.string().trim().max(120).optional(),
});

const statsByServiceGroupQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hub_staff_member_id: z.union([uuidStr, z.literal('__na__')]).optional(),
    hub_service_type_id: uuidStr.optional(),
  })
  .strict();

const linePricingVariantSchema = z
  .object({
    km_tier_index: z.number().int().min(0).optional(),
    custom_tier_index: z.number().int().min(0).optional(),
    period: z.enum(['full_day', 'half_day']).optional(),
    consult_type: z.enum(['padrao', 'retorno']).optional(),
  })
  .strict()
  .optional()
  .nullable();

const serviceLineSchema = z.object({
  hub_service_type_id: uuidStr,
  duration_minutes: z.number().int().positive(),
  pricing_porte_tier: optionalPricingPorte.optional(),
  pricing_coat_type: optionalPricingCoat.optional(),
  pricing_variant: linePricingVariantSchema,
});

const pickupBlockSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  resource_label: optionalTrim(120).optional(),
  hub_staff_member_id: uuidStr.optional().nullable(),
});

const extraBlockSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  services: z.array(serviceLineSchema).min(1),
  hub_staff_member_id: uuidStr.optional().nullable(),
  resource_label: optionalTrim(120).optional(),
  status: appointmentStatusSchema.optional(),
  notes: optionalTrim(8000).optional(),
  title: optionalTrim(200).optional(),
});

const patchExtraBlockSchema = extraBlockSchema.extend({
  id: uuidStr.optional(),
});

const pickupRoutePricingSchema = z
  .object({
    hub_service_type_id: uuidStr,
    pricing_variant: z
      .object({
        km_tier_index: z.number().int().min(0).optional(),
        custom_tier_index: z.number().int().min(0).optional(),
      })
      .strict(),
  })
  .strict();

const recurrenceSchema = z.object({
  kind: z.enum(['daily', 'weekly', 'monthly']),
  interval_value: z.number().int().positive().default(1),
  days_of_week: z.array(z.number().int().min(1).max(7)).optional().nullable(),
  day_of_month: z.number().int().min(1).max(31).optional().nullable(),
  until_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  occurrences: z.number().int().positive().max(MAX_OCCURRENCES).optional().nullable(),
});

const createAppointmentSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    hub_service_type_id: uuidStr,
    hub_staff_member_id: uuidStr.optional().nullable(),
    pet_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    status: appointmentStatusSchema.optional(),
    resource_label: optionalTrim(120).optional(),
    notes: optionalTrim(8000).optional(),
    appointment_kind: appointmentKindSchema.optional(),
    title: optionalTrim(200).optional(),
    description: optionalTrim(8000).optional(),
    financial_notes: optionalTrim(8000).optional(),
    services: z.array(serviceLineSchema).optional(),
    pricing_porte_tier: optionalPricingPorte.optional(),
    pricing_coat_type: optionalPricingCoat.optional(),
    with_pickup_route_before: pickupBlockSchema.optional().nullable(),
    with_pickup_route_after: pickupBlockSchema.optional().nullable(),
    pickup_route_pricing: pickupRoutePricingSchema.optional().nullable(),
    /**
     * L&T como serviço principal: modo operacional (1 ou 2 paradas).
     * Ignorado quando há with_pickup_route_* (anexo a banho/clínica).
     */
    standalone_pickup_mode: z.enum(['round_trip', 'pickup_only', 'delivery_only']).optional(),
    /** Segunda perna (retorno) quando standalone_pickup_mode = round_trip. */
    standalone_pickup_return: pickupBlockSchema.optional().nullable(),
    extra_blocks: z.array(extraBlockSchema).optional(),
    recurrence: recurrenceSchema.optional().nullable(),
    /** Preferência de caso ao abrir atendimento (fluxo agenda consulta de rotina). */
    intake_hub_case_id: uuidStr.optional().nullable(),
    intake_create_new_case: z.boolean().optional(),
    intake_new_case_title: optionalTrim(500).optional().nullable(),
    /** Permite sobrepor outro slot (somente kinds walk-in). */
    allow_schedule_overlap: z.boolean().optional(),
    /** Agrupa vários agendamentos da mesma visita multi-pet. */
    visit_group_id: uuidStr.optional().nullable(),
    ...careLocationBodyFields,
  })
  .strict();

const batchPetEntrySchema = z
  .object({
    pet_id: uuidStr,
    pricing_porte_tier: optionalPricingPorte.optional(),
    pricing_coat_type: optionalPricingCoat.optional(),
    services: z.array(serviceLineSchema).optional(),
    starts_at: z.string().datetime({ offset: true }).optional(),
    ends_at: z.string().datetime({ offset: true }).optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    resource_label: optionalTrim(120).optional(),
    extra_blocks: z.array(extraBlockSchema).optional(),
  })
  .strict();

const createAppointmentBatchSchema = z
  .object({
    clinic_id: uuidStr,
    visit_group_id: uuidStr.optional().nullable(),
    shared: createAppointmentSchema,
    pets: z.array(batchPetEntrySchema).min(2).max(20),
  })
  .strict();

const patchAppointmentSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    hub_service_type_id: uuidStr.optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    pet_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    starts_at: z.string().datetime({ offset: true }).optional(),
    ends_at: z.string().datetime({ offset: true }).optional(),
    status: appointmentStatusSchema.optional(),
    resource_label: optionalTrim(120).optional().nullable(),
    notes: optionalTrim(8000).optional().nullable(),
    financial_notes: optionalTrim(8000).optional().nullable(),
    appointment_kind: appointmentKindSchema.optional(),
    deleted: z.boolean().optional(),
    title: optionalTrim(200).optional().nullable(),
    description: optionalTrim(8000).optional().nullable(),
    services: z.array(serviceLineSchema).optional(),
    pricing_porte_tier: optionalPricingPorte.optional(),
    pricing_coat_type: optionalPricingCoat.optional(),
    intake_hub_case_id: uuidStr.optional().nullable(),
    intake_create_new_case: z.boolean().optional(),
    intake_new_case_title: optionalTrim(200).optional().nullable(),
    extra_blocks: z.array(patchExtraBlockSchema).optional(),
    ...careLocationBodyFields,
  })
  .strict();

const EDITABLE_APPOINTMENT_STATUSES = new Set(['pending_confirm', 'confirmed']);

function isAppointmentStructurallyEditable(row: Record<string, unknown>): boolean {
  const status = String(row.status ?? '');
  if (!EDITABLE_APPOINTMENT_STATUSES.has(status)) return false;
  const startsAt = row.starts_at as string | undefined;
  if (!startsAt) return false;
  return new Date().getTime() < new Date(startsAt).getTime();
}

function isStructuralAppointmentPatch(body: z.infer<typeof patchAppointmentSchema>): boolean {
  if (body.deleted === true) return false;
  return (
    body.unit_id !== undefined ||
    body.care_location_kind !== undefined ||
    body.hub_partner_clinic_id !== undefined ||
    body.hub_service_type_id !== undefined ||
    body.hub_staff_member_id !== undefined ||
    body.pet_id !== undefined ||
    body.guardian_id !== undefined ||
    body.starts_at !== undefined ||
    body.ends_at !== undefined ||
    body.resource_label !== undefined ||
    body.notes !== undefined ||
    body.financial_notes !== undefined ||
    body.appointment_kind !== undefined ||
    body.title !== undefined ||
    body.description !== undefined ||
    body.pricing_porte_tier !== undefined ||
    body.pricing_coat_type !== undefined ||
    body.intake_hub_case_id !== undefined ||
    body.intake_create_new_case !== undefined ||
    body.intake_new_case_title !== undefined ||
    (body.services !== undefined && body.services.length > 0) ||
    body.extra_blocks !== undefined
  );
}

type PatchExtraBlock = z.infer<typeof patchExtraBlockSchema>;

async function syncExtraBlocksForParent(
  clinicId: string,
  parentId: string,
  parentRow: Record<string, unknown>,
  blocks: PatchExtraBlock[],
  excludeConflictIds: string[],
): Promise<{ error?: string; status?: number }> {
  const { data: existingChildren, error: childErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('parent_appointment_id', parentId)
    .is('deleted_at', null);
  if (childErr) return { error: childErr.message, status: 500 };

  const existingChildIds = (existingChildren ?? []).map((r: { id: string }) => r.id);
  const keepIds = new Set<string>();

  const apptOverride = (parentRow.pricing_porte_tier as string | null) ?? null;
  const apptCoatOverride = (parentRow.pricing_coat_type as string | null) ?? null;
  const petId = (parentRow.pet_id as string | null) ?? null;
  const guardianId = (parentRow.guardian_id as string | null) ?? null;
  const unitId = (parentRow.unit_id as string | null) ?? null;
  const seriesId = (parentRow.series_id as string | null) ?? null;
  const seriesOccDate = (parentRow.series_occurrence_date as string | null) ?? null;
  const parentStatus = (parentRow.status as string | undefined) ?? 'confirmed';

  const allStIds = [...new Set(blocks.flatMap((bl) => bl.services.map((s) => s.hub_service_type_id)))];
  let stMap: Map<string, ServiceTypePricingRow>;
  try {
    stMap = await fetchServiceTypesMap(clinicId, allStIds);
  } catch (e) {
    return { error: (e as Error).message, status: 500 };
  }
  for (const sid of allStIds) {
    if (!stMap.has(sid)) {
      return { error: `Tipo de serviço inválido: ${sid}`, status: 400 };
    }
  }

  const pet = await fetchPetPricingFields(clinicId, petId);
  const puppy = await getOrCreateHubClinicSettings(clinicId);

  for (const block of blocks) {
    if (new Date(block.ends_at) <= new Date(block.starts_at)) {
      return { error: 'ends_at do bloco adicional deve ser posterior a starts_at', status: 400 };
    }
    if (block.hub_staff_member_id !== undefined && block.hub_staff_member_id !== null) {
      if (!(await assertStaffInClinicOptional(clinicId, block.hub_staff_member_id))) {
        return { error: 'Profissional inválido no bloco adicional', status: 400 };
      }
    }

    const conflictExclude = [...excludeConflictIds, ...existingChildIds, ...[...keepIds]];
    const chk = await assertNoScheduleConflict(
      clinicId,
      conflictExclude,
      block.hub_staff_member_id ?? null,
      block.resource_label ?? null,
      unitId,
      block.starts_at,
      block.ends_at,
    );
    if (chk.conflict) {
      return { error: `Bloco adicional: ${chk.reason}`, status: 409 };
    }

    const firstSvcType = block.services[0]!.hub_service_type_id;
    const blockNormLines = block.services.map((s) => ({
      hub_service_type_id: s.hub_service_type_id,
      duration_minutes: s.duration_minutes,
      pricing_porte_tier: s.pricing_porte_tier ?? null,
      pricing_coat_type: s.pricing_coat_type ?? null,
      pricing_variant: s.pricing_variant ?? null,
    }));
    const blockYmd = block.starts_at.slice(0, 10);
    let blockSnaps: ReturnType<typeof buildServiceLineSnapshots>;
    try {
      blockSnaps = buildServiceLineSnapshots({
        lines: blockNormLines,
        stMap,
        pet,
        appointmentYmd: blockYmd,
        puppyMaxMonths: puppy.pet_puppy_max_months,
        appointmentOverride: apptOverride,
        appointmentCoatOverride: apptCoatOverride,
      });
    } catch (e) {
      return { error: (e as Error).message, status: 500 };
    }

    const rowPatch = {
      unit_id: unitId,
      hub_service_type_id: firstSvcType,
      hub_staff_member_id: block.hub_staff_member_id ?? null,
      pet_id: petId,
      guardian_id: guardianId,
      starts_at: block.starts_at,
      ends_at: block.ends_at,
      status: block.status ?? parentStatus,
      resource_label: block.resource_label ?? null,
      notes: block.notes ?? null,
      title: block.title ?? null,
      series_id: seriesId,
      series_occurrence_date: seriesOccDate,
      pricing_porte_tier: apptOverride,
      pricing_coat_type: apptCoatOverride,
      parent_appointment_id: parentId,
    };

    let blockId: string;
    if (block.id) {
      const { data: existingChild, error: exChildErr } = await supabaseAdmin
        .from('hub_appointments')
        .select('id')
        .eq('id', block.id)
        .eq('clinic_id', clinicId)
        .eq('parent_appointment_id', parentId)
        .is('deleted_at', null)
        .maybeSingle();
      if (exChildErr) return { error: exChildErr.message, status: 500 };
      if (!existingChild) {
        return { error: 'Bloco adicional não encontrado para este agendamento', status: 404 };
      }
      blockId = block.id;
      const { error: updErr } = await supabaseAdmin
        .from('hub_appointments')
        .update(rowPatch)
        .eq('id', blockId)
        .eq('clinic_id', clinicId);
      if (updErr) return { error: updErr.message, status: 500 };
      await supabaseAdmin.from('hub_appointment_services').delete().eq('appointment_id', blockId);
    } else {
      const { data: blockRow, error: blockErr } = await supabaseAdmin
        .from('hub_appointments')
        .insert({
          clinic_id: clinicId,
          appointment_kind: 'standard',
          ...rowPatch,
        })
        .select('id')
        .single();
      if (blockErr) return { error: blockErr.message, status: 500 };
      blockId = (blockRow as { id: string }).id;
    }

    keepIds.add(blockId);
    const blockSvcInsert = blockSnaps.map((row) => ({
      appointment_id: blockId,
      hub_service_type_id: row.hub_service_type_id,
      duration_minutes: row.duration_minutes,
      order_index: row.order_index,
      pricing_porte_tier_applied: row.pricing_porte_tier_applied,
      pricing_coat_type_applied: row.pricing_coat_type_applied,
      cost_amount_applied: row.cost_amount_applied,
      sale_amount_applied: row.sale_amount_applied,
      pricing_variant: row.pricing_variant as unknown as Record<string, unknown> | null,
    }));
    const { error: bSvcErr } = await supabaseAdmin.from('hub_appointment_services').insert(blockSvcInsert);
    if (bSvcErr) return { error: bSvcErr.message, status: 500 };
  }

  const now = new Date().toISOString();
  for (const childId of existingChildIds) {
    if (keepIds.has(childId)) continue;
    await supabaseAdmin
      .from('hub_appointments')
      .update({ deleted_at: now })
      .eq('id', childId)
      .eq('clinic_id', clinicId);
  }

  return {};
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export const listHubAppointments = async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { clinic_id, from, to, unit_id, care_location_kind, hub_partner_clinic_id, hub_staff_member_id, hub_service_type_id, service_group, status, resource_label } =
      parsed.data;

    let typeIdsFilter: string[] | null = null;
    if (service_group) {
      const { data: types, error: te } = await supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('service_group', service_group)
        .is('deleted_at', null);
      if (te) return res.status(500).json({ error: te.message });
      typeIdsFilter = (types ?? []).map((t: { id: string }) => t.id);
      if (typeIdsFilter.length === 0) {
        return res.json({ appointments: [], range: { from, to } });
      }
    }

    let q = supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at', { ascending: true });

    if (unit_id) q = q.eq('unit_id', unit_id);
    if (care_location_kind) q = q.eq('care_location_kind', care_location_kind);
    if (hub_partner_clinic_id) q = q.eq('hub_partner_clinic_id', hub_partner_clinic_id);
    if (hub_staff_member_id === '__na__') q = q.is('hub_staff_member_id', null);
    else if (hub_staff_member_id) q = q.eq('hub_staff_member_id', hub_staff_member_id);
    if (hub_service_type_id) q = q.eq('hub_service_type_id', hub_service_type_id);
    if (typeIdsFilter) q = q.in('hub_service_type_id', typeIdsFilter);
    if (status) q = q.eq('status', status);
    if (resource_label) q = q.eq('resource_label', resource_label);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const enriched = await enrichAppointments((data ?? []) as Record<string, unknown>[]);
    return res.json({ appointments: enriched, range: { from, to } });
  } catch (e: unknown) {
    console.error('listHubAppointments', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar agendamentos' });
  }
};

const SERVICE_GROUP_LABELS: Record<string, string> = {
  clinica: 'Clínica',
  banho_tosa: 'Banho & Tosa',
  hotel: 'Hotel',
  creche: 'Creche',
  leva_traz: 'Leva e Traz',
  cirurgia: 'Cirurgia',
  internacao: 'Internação',
  outros: 'Outros',
};

/** Contagem de agendamentos no intervalo por `hub_service_types.service_group` (slot sobrepõe [from,to]). */
export const getHubAppointmentsStatsByServiceGroup = async (req: Request, res: Response) => {
  try {
    const parsed = statsByServiceGroupQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { clinic_id, unit_id, from, to, hub_staff_member_id, hub_service_type_id } = parsed.data;
    if (from > to) return res.status(400).json({ error: 'from não pode ser maior que to' });
    const fromIso = `${from}T00:00:00.000Z`;
    const toIso = `${to}T23:59:59.999Z`;

    let q = supabaseAdmin
      .from('hub_appointments')
      .select('hub_service_type_id')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .lt('starts_at', toIso)
      .gt('ends_at', fromIso)
      .or(`unit_id.eq.${unit_id},unit_id.is.null`);
    if (hub_service_type_id) q = q.eq('hub_service_type_id', hub_service_type_id);
    if (hub_staff_member_id === '__na__') q = q.is('hub_staff_member_id', null);
    else if (hub_staff_member_id) q = q.eq('hub_staff_member_id', hub_staff_member_id);

    const { data: rows, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const typeIds = [...new Set((rows ?? []).map((r) => r.hub_service_type_id as string).filter(Boolean))];
    if (typeIds.length === 0) {
      return res.json({ period: { from, to }, items: [] as { service_group: string; label: string; count: number }[] });
    }
    const { data: types, error: te } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, service_group')
      .in('id', typeIds);
    if (te) return res.status(500).json({ error: te.message });
    const groupByType = new Map<string, string>();
    for (const t of types ?? []) {
      const raw = String((t as { service_group?: string }).service_group ?? '').trim();
      const gid = raw || 'outros';
      groupByType.set(t.id as string, gid);
    }
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      const tid = r.hub_service_type_id as string | null;
      if (!tid) continue;
      const g = groupByType.get(tid) ?? 'outros';
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const items = [...counts.entries()]
      .map(([service_group, count]) => ({
        service_group,
        label: SERVICE_GROUP_LABELS[service_group] ?? service_group.replace(/_/g, ' '),
        count,
      }))
      .sort((a, b) => b.count - a.count);
    return res.json({ period: { from, to }, items });
  } catch (e: unknown) {
    console.error('getHubAppointmentsStatsByServiceGroup', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const createHubAppointment = async (req: Request, res: Response) => {
  try {
    const parsed = createAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const b = parsed.data;
    if (new Date(b.ends_at) <= new Date(b.starts_at)) {
      return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
    }
    // Kind preliminar (walk-in etc.); pode virar pickup_route após carregar o serviço principal.
    let resolvedAppointmentKind: AppointmentKind = b.appointment_kind ?? 'standard';
    if (
      b.allow_schedule_overlap === true &&
      !isWalkInAppointmentKind(resolvedAppointmentKind) &&
      !b.visit_group_id
    ) {
      return res.status(400).json({ error: 'allow_schedule_overlap só é permitido para encaixes (walk-in) ou visitas multi-pet.' });
    }
    const skipScheduleConflictCheck =
      isWalkInAppointmentKind(resolvedAppointmentKind) || b.allow_schedule_overlap === true;

    // validations
    if (!(await assertServiceTypeInClinic(b.clinic_id, b.hub_service_type_id))) {
      return res.status(400).json({ error: 'Tipo de serviço inválido ou não pertence à clínica' });
    }
    if (!(await assertStaffInClinicOptional(b.clinic_id, b.hub_staff_member_id ?? null))) {
      return res.status(400).json({ error: 'Profissional inválido ou não pertence à clínica' });
    }
    if (!(await assertPetInClinic(b.clinic_id, b.pet_id ?? null))) {
      return res.status(400).json({ error: 'Pet inválido ou não pertence à clínica' });
    }
    if (!(await assertGuardianInClinic(b.clinic_id, b.guardian_id ?? null))) {
      return res.status(400).json({ error: 'Tutor inválido ou não pertence à clínica' });
    }
    if (b.intake_hub_case_id && b.intake_create_new_case === true) {
      return res.status(400).json({ error: 'Não combine intake_hub_case_id com intake_create_new_case.' });
    }
    if (b.intake_hub_case_id) {
      const petId = b.pet_id ?? null;
      if (!petId) {
        return res.status(400).json({ error: 'Para vincular um caso clínico, informe o pet no agendamento.' });
      }
      const { data: cRow } = await supabaseAdmin
        .from('hub_clinical_cases')
        .select('id')
        .eq('id', b.intake_hub_case_id)
        .eq('clinic_id', b.clinic_id)
        .eq('pet_id', petId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!cRow) {
        return res.status(400).json({ error: 'Caso clínico inválido ou não pertence a este pet.' });
      }
    }
    if (!(await assertUnitInClinic(b.clinic_id, b.unit_id ?? null))) {
      return res.status(400).json({ error: 'Unidade inválida ou não pertence à clínica' });
    }

    const careKind = b.care_location_kind ?? 'own_unit';
    // Unidade própria: usa a informada ou a padrão da clínica. Parceira: unit_id opcional (origem administrativa).
    const resolvedUnitId: string | null =
      careKind === 'partner_clinic'
        ? (b.unit_id ?? null)
        : (b.unit_id ?? (await resolveClinicDefaultUnitId(b.clinic_id)));

    const careResolved = await resolveCareLocation({
      clinicId: b.clinic_id,
      care_location_kind: careKind,
      hub_partner_clinic_id: b.hub_partner_clinic_id ?? null,
      unit_id: resolvedUnitId,
      allowNullUnit: careKind === 'partner_clinic',
    });
    if (!careResolved.ok) {
      return res.status(400).json({ error: careResolved.error });
    }

    // Validate service types for extra services
    const allServiceTypeIds = b.services ? b.services.map((s) => s.hub_service_type_id) : [];
    for (const stId of allServiceTypeIds) {
      if (stId !== b.hub_service_type_id && !(await assertServiceTypeInClinic(b.clinic_id, stId))) {
        return res.status(400).json({ error: `Tipo de serviço inválido: ${stId}` });
      }
    }

    const hasPickupRoutes = Boolean(b.with_pickup_route_before ?? b.with_pickup_route_after);
    if (b.pickup_route_pricing && !hasPickupRoutes) {
      return res.status(400).json({ error: 'pickup_route_pricing só é permitido com rotas de transporte.' });
    }
    if (hasPickupRoutes && !b.pickup_route_pricing) {
      return res.status(400).json({ error: 'Leva e Traz: indique o tipo de serviço de transporte.' });
    }

    const normLines = normalizeCreateServiceLines(b);
    const extraIds: string[] = [];
    for (const block of b.extra_blocks ?? []) {
      for (const s of block.services) extraIds.push(s.hub_service_type_id);
    }
    const ltSvcId = b.pickup_route_pricing?.hub_service_type_id;
    const allStIds = [...new Set([...normLines.map((l) => l.hub_service_type_id), ...extraIds, ...(ltSvcId ? [ltSvcId] : [])])];
    let stMap: Map<string, ServiceTypePricingRow>;
    try {
      stMap = await fetchServiceTypesMap(b.clinic_id, allStIds);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
    for (const id of allStIds) {
      if (!stMap.has(id)) {
        return res.status(400).json({ error: `Tipo de serviço inválido: ${id}` });
      }
    }

    const primarySt = stMap.get(b.hub_service_type_id);
    resolvedAppointmentKind = resolveAppointmentKindForCreate(b.appointment_kind, primarySt);

    if (hasPickupRoutes && isLevaTrazServiceGroup(primarySt)) {
      return res.status(400).json({
        error:
          'O atendimento principal já é Leva e Traz. Use o checkbox «Incluir Leva e Traz» apenas junto de banho, clínica ou outros serviços — não combine com um serviço L&T como principal.',
      });
    }

    if (hasPickupRoutes && b.pickup_route_pricing) {
      const ltSt = stMap.get(b.pickup_route_pricing.hub_service_type_id);
      const ge = validateLevaTrazServiceType(ltSt);
      if (ge) return res.status(400).json({ error: ge });
      // Preço único (sem matriz), faixas de km, ou personalizado (ex.: regiões).
      const parsedM = parsePricingMatrixJson(ltSt!.pricing_matrix);
      if (parsedM && typeof parsedM === 'object' && 'error' in parsedM && (parsedM as { error?: string }).error) {
        return res.status(400).json({ error: 'Matriz de preços do serviço de Leva e Traz inválida.' });
      }
      if (parsedM && typeof parsedM === 'object' && 'kind' in parsedM) {
        const kind = (parsedM as { kind: string }).kind;
        if (kind === 'km_banda') {
          const m = parsedM as { kind: 'km_banda'; tiers: unknown[] };
          const kmIdx = b.pickup_route_pricing.pricing_variant.km_tier_index;
          if (typeof kmIdx !== 'number' || kmIdx < 0 || kmIdx >= m.tiers.length) {
            return res.status(400).json({ error: 'Faixa de km inválida para o serviço de Leva e Traz.' });
          }
        } else if (kind === 'personalizado') {
          const m = parsedM as { kind: 'personalizado'; tiers: unknown[] };
          const customIdx = b.pickup_route_pricing.pricing_variant.custom_tier_index;
          if (typeof customIdx !== 'number' || customIdx < 0 || customIdx >= m.tiers.length) {
            return res.status(400).json({ error: 'Opção de preço inválida para o serviço de Leva e Traz.' });
          }
        } else {
          return res.status(400).json({
            error: 'O serviço de Leva e Traz deve usar preço único, faixas de km ou preços personalizados.',
          });
        }
      }
    }

    const pet = await fetchPetPricingFields(b.clinic_id, b.pet_id ?? null);
    const puppy = await getOrCreateHubClinicSettings(b.clinic_id);
    const apptOverride = b.pricing_porte_tier ?? null;
    const apptCoatOverride = b.pricing_coat_type ?? null;
    const allLinesForVal = [
      ...normLines,
      ...(b.extra_blocks ?? []).flatMap((bl) =>
        bl.services.map((s) => ({
          hub_service_type_id: s.hub_service_type_id,
          pricing_porte_tier: s.pricing_porte_tier ?? null,
          pricing_coat_type: s.pricing_coat_type ?? null,
        })),
      ),
    ];
    const valErr = validatePricingPorteInputs({
      appointmentOverride: apptOverride,
      appointmentCoatOverride: apptCoatOverride,
      pet,
      lines: allLinesForVal,
      stMap,
    });
    if (valErr.error) {
      return res.status(400).json({ error: valErr.error });
    }

    let pickupPricingBase: {
      ltId: string;
      kmVariant: HubQuotePricingVariantInput | null;
      /** Valor cadastrado (matriz / sale_amount) antes do escopo round_trip|per_leg. */
      catalogSale: number;
      catalogCost: number;
      priceScope: PickupPriceScope;
    } | null = null;
    if (hasPickupRoutes && b.pickup_route_pricing) {
      const ltId = b.pickup_route_pricing.hub_service_type_id;
      const ltSt = stMap.get(ltId);
      const ltMatrix = parsePricingMatrixJson(ltSt?.pricing_matrix);
      const matrixKind =
        ltMatrix != null && typeof ltMatrix === 'object' && 'kind' in ltMatrix
          ? (ltMatrix as { kind: string }).kind
          : null;
      let kmVariant: HubQuotePricingVariantInput | null = null;
      if (matrixKind === 'km_banda') {
        kmVariant = { km_tier_index: b.pickup_route_pricing.pricing_variant.km_tier_index ?? 0 };
      } else if (matrixKind === 'personalizado') {
        kmVariant = { custom_tier_index: b.pickup_route_pricing.pricing_variant.custom_tier_index ?? 0 };
      }
      const ymdRef = b.starts_at.slice(0, 10);
      try {
        const baseRows = buildServiceLineSnapshots({
          lines: [{ hub_service_type_id: ltId, duration_minutes: 1, pricing_variant: kmVariant }],
          stMap,
          pet,
          appointmentYmd: ymdRef,
          puppyMaxMonths: puppy.pet_puppy_max_months,
          appointmentOverride: apptOverride,
          appointmentCoatOverride: apptCoatOverride,
        });
        const br = baseRows[0];
        if (!br) throw new Error('Preço Leva e Traz inválido');
        pickupPricingBase = {
          ltId,
          kmVariant,
          catalogSale: br.sale_amount_applied,
          catalogCost: br.cost_amount_applied,
          priceScope: normalizePickupPriceScope(ltSt?.pickup_price_scope),
        };
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message || 'Erro ao precificar Leva e Traz' });
      }
    }

    const standaloneLtPrimary = isLevaTrazServiceGroup(primarySt) && resolvedAppointmentKind === 'pickup_route';
    const standalonePickupMode =
      standaloneLtPrimary && !hasPickupRoutes
        ? (b.standalone_pickup_mode ?? 'pickup_only')
        : null;
    if (standalonePickupMode === 'round_trip' && !b.standalone_pickup_return) {
      return res.status(400).json({
        error: 'Ida e volta: informe os horários da perna de retorno (standalone_pickup_return).',
      });
    }

    let standalonePricingBase: {
      kmVariant: HubQuotePricingVariantInput | null;
      catalogSale: number;
      catalogCost: number;
      priceScope: PickupPriceScope;
      legCount: 1 | 2;
    } | null = null;
    if (standalonePickupMode) {
      const ltId = b.hub_service_type_id;
      const ltSt = stMap.get(ltId);
      const ltMatrix = parsePricingMatrixJson(ltSt?.pricing_matrix);
      const matrixKind =
        ltMatrix != null && typeof ltMatrix === 'object' && 'kind' in ltMatrix
          ? (ltMatrix as { kind: string }).kind
          : null;
      let kmVariant: HubQuotePricingVariantInput | null = null;
      const primaryLine = normLines.find((s) => s.hub_service_type_id === ltId) ?? normLines[0];
      const pv = primaryLine?.pricing_variant ?? null;
      if (matrixKind === 'km_banda') {
        kmVariant = { km_tier_index: pv?.km_tier_index ?? 0 };
      } else if (matrixKind === 'personalizado') {
        kmVariant = { custom_tier_index: pv?.custom_tier_index ?? 0 };
      }
      const ymdRef = b.starts_at.slice(0, 10);
      try {
        const baseRows = buildServiceLineSnapshots({
          lines: [{ hub_service_type_id: ltId, duration_minutes: 1, pricing_variant: kmVariant }],
          stMap,
          pet,
          appointmentYmd: ymdRef,
          puppyMaxMonths: puppy.pet_puppy_max_months,
          appointmentOverride: apptOverride,
          appointmentCoatOverride: apptCoatOverride,
        });
        const br = baseRows[0];
        if (!br) throw new Error('Preço Leva e Traz inválido');
        standalonePricingBase = {
          kmVariant,
          catalogSale: br.sale_amount_applied,
          catalogCost: br.cost_amount_applied,
          priceScope: normalizePickupPriceScope(ltSt?.pickup_price_scope),
          legCount: standalonePickupMode === 'round_trip' ? 2 : 1,
        };
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message || 'Erro ao precificar Leva e Traz' });
      }
    }

    // ── Create series if recurrence requested ─────────────────────────────
    let seriesId: string | null = null;
    let occurrenceDates: string[] = [];

    if (b.recurrence) {
      const rule = b.recurrence;
      const { data: seriesRow, error: serErr } = await supabaseAdmin
        .from('hub_appointment_series')
        .insert({
          clinic_id: b.clinic_id,
          kind: rule.kind,
          interval_value: rule.interval_value ?? 1,
          days_of_week: rule.days_of_week ?? null,
          day_of_month: rule.day_of_month ?? null,
          start_date: b.starts_at.slice(0, 10),
          until_date: rule.until_date ?? null,
          occurrences: rule.occurrences ?? null,
        })
        .select('id')
        .single();
      if (serErr) return res.status(500).json({ error: serErr.message });
      seriesId = (seriesRow as { id: string }).id;
      occurrenceDates = generateOccurrenceDates(b.starts_at.slice(0, 10), rule as RecurrenceRule);
    } else {
      occurrenceDates = [b.starts_at.slice(0, 10)];
    }

    const conflicts: Array<{ date: string; reason: string; conflictingId?: string }> = [];
    const createdIds: string[] = [];

    for (const occDate of occurrenceDates) {
      const startsAt = seriesId ? shiftTimestampToDate(b.starts_at, occDate) : b.starts_at;
      const endsAt = seriesId ? shiftTimestampToDate(b.ends_at, occDate) : b.ends_at;

      const conflictWindows: Array<{
        staff: string | null;
        resource: string | null;
        starts: string;
        ends: string;
        label: string;
      }> = [];

      if (b.with_pickup_route_before) {
        const pb = b.with_pickup_route_before;
        const pStarts = seriesId ? shiftTimestampToDate(pb.starts_at, occDate) : pb.starts_at;
        const pEnds = seriesId ? shiftTimestampToDate(pb.ends_at, occDate) : pb.ends_at;
        conflictWindows.push({
          staff: pb.hub_staff_member_id ?? null,
          resource: pb.resource_label ?? null,
          starts: pStarts,
          ends: pEnds,
          label: 'Busca (Leva e Traz)',
        });
      }

      conflictWindows.push({
        staff: b.hub_staff_member_id ?? null,
        resource: b.resource_label ?? null,
        starts: startsAt,
        ends: endsAt,
        label: standalonePickupMode ? 'Leva e Traz (parada)' : 'Atendimento principal',
      });

      if (standalonePickupMode === 'round_trip' && b.standalone_pickup_return) {
        const rb = b.standalone_pickup_return;
        const rStarts = seriesId ? shiftTimestampToDate(rb.starts_at, occDate) : rb.starts_at;
        const rEnds = seriesId ? shiftTimestampToDate(rb.ends_at, occDate) : rb.ends_at;
        conflictWindows.push({
          staff: rb.hub_staff_member_id ?? null,
          resource: rb.resource_label ?? null,
          starts: rStarts,
          ends: rEnds,
          label: 'Retorno (Leva e Traz)',
        });
      }

      for (const block of b.extra_blocks ?? []) {
        const bStarts = seriesId ? shiftTimestampToDate(block.starts_at, occDate) : block.starts_at;
        const bEnds = seriesId ? shiftTimestampToDate(block.ends_at, occDate) : block.ends_at;
        conflictWindows.push({
          staff: block.hub_staff_member_id ?? null,
          resource: block.resource_label ?? null,
          starts: bStarts,
          ends: bEnds,
          label: 'Bloco extra',
        });
      }

      if (b.with_pickup_route_after) {
        const pa = b.with_pickup_route_after;
        const pStarts = seriesId ? shiftTimestampToDate(pa.starts_at, occDate) : pa.starts_at;
        const pEnds = seriesId ? shiftTimestampToDate(pa.ends_at, occDate) : pa.ends_at;
        conflictWindows.push({
          staff: pa.hub_staff_member_id ?? null,
          resource: pa.resource_label ?? null,
          starts: pStarts,
          ends: pEnds,
          label: 'Retorno (Leva e Traz)',
        });
      }

      let skipOcc = false;
      if (!skipScheduleConflictCheck) {
        for (const w of conflictWindows) {
          const chk = await assertNoScheduleConflict(
            b.clinic_id,
            [],
            w.staff,
            w.resource,
            resolvedUnitId,
            w.starts,
            w.ends,
          );
          if (chk.conflict) {
            conflicts.push({
              date: occDate,
              reason: `${w.label}: ${chk.reason}`,
              conflictingId: chk.conflictingId,
            });
            skipOcc = true;
            break;
          }
        }
      }
      if (skipOcc) continue;

      const insert = {
        clinic_id: b.clinic_id,
        unit_id: careResolved.value.unit_id,
        care_location_kind: careResolved.value.care_location_kind,
        hub_partner_clinic_id: careResolved.value.hub_partner_clinic_id,
        hub_service_type_id: b.hub_service_type_id,
        hub_staff_member_id: b.hub_staff_member_id ?? null,
        pet_id: b.pet_id ?? null,
        guardian_id: b.guardian_id ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        status: b.status ?? 'confirmed',
        resource_label: b.resource_label ?? null,
        notes: b.notes ?? null,
        appointment_kind: resolvedAppointmentKind,
        title: b.title ?? null,
        description: b.description ?? null,
        financial_notes: b.financial_notes ?? null,
        series_id: seriesId,
        series_occurrence_date: seriesId ? occDate : null,
        pricing_porte_tier: apptOverride,
        pricing_coat_type: apptCoatOverride,
        intake_hub_case_id: b.intake_hub_case_id ?? null,
        intake_create_new_case: b.intake_create_new_case === true ? true : null,
        intake_new_case_title: b.intake_new_case_title ?? null,
        visit_group_id:
          seriesId && b.visit_group_id
            ? visitGroupIdForOccurrence(b.visit_group_id, occDate)
            : b.visit_group_id ?? null,
      };

      const { data: apptRow, error: apptErr } = await supabaseAdmin
        .from('hub_appointments')
        .insert(insert)
        .select('id')
        .single();
      if (apptErr) return res.status(500).json({ error: apptErr.message });
      const apptId = (apptRow as { id: string }).id;
      createdIds.push(apptId);

      const ymd = startsAt.slice(0, 10);
      const standaloneLegAmounts = standalonePricingBase
        ? resolvePickupLegAmounts(
            standalonePricingBase.catalogSale,
            standalonePricingBase.catalogCost,
            standalonePricingBase.priceScope,
            standalonePricingBase.legCount,
          )
        : null;
      let snapRows: ReturnType<typeof buildServiceLineSnapshots>;
      try {
        const linesForSnap =
          standaloneLegAmounts && standalonePricingBase
            ? normLines.map((l, i) =>
                i === 0
                  ? {
                      ...l,
                      pricing_variant: standalonePricingBase.kmVariant ?? l.pricing_variant,
                      sale_amount_override: standaloneLegAmounts.saleLegs[0] ?? 0,
                      cost_amount_override: standaloneLegAmounts.costLegs[0] ?? 0,
                    }
                  : l,
              )
            : normLines;
        snapRows = buildServiceLineSnapshots({
          lines: linesForSnap,
          stMap,
          pet,
          appointmentYmd: ymd,
          puppyMaxMonths: puppy.pet_puppy_max_months,
          appointmentOverride: apptOverride,
          appointmentCoatOverride: apptCoatOverride,
        });
      } catch (e) {
        return res.status(500).json({ error: (e as Error).message });
      }
      const svcInsert = snapRows.map((row) => ({
        appointment_id: apptId,
        hub_service_type_id: row.hub_service_type_id,
        duration_minutes: row.duration_minutes,
        order_index: row.order_index,
        pricing_porte_tier_applied: row.pricing_porte_tier_applied,
        pricing_coat_type_applied: row.pricing_coat_type_applied,
        cost_amount_applied: row.cost_amount_applied,
        sale_amount_applied: row.sale_amount_applied,
        pricing_variant: row.pricing_variant as unknown as Record<string, unknown> | null,
      }));
      const { error: svcErr } = await supabaseAdmin.from('hub_appointment_services').insert(svcInsert);
      if (svcErr) return res.status(500).json({ error: svcErr.message });

      const ltCfg = b.pickup_route_pricing;
      const hasBefore = Boolean(b.with_pickup_route_before);
      const hasAfter = Boolean(b.with_pickup_route_after);
      const attachedLegCount: 1 | 2 = hasBefore && hasAfter ? 2 : 1;
      const attachedAmounts = pickupPricingBase
        ? resolvePickupLegAmounts(
            pickupPricingBase.catalogSale,
            pickupPricingBase.catalogCost,
            pickupPricingBase.priceScope,
            attachedLegCount,
          )
        : null;
      let saleBeforeLeg = 0;
      let saleAfterLeg = 0;
      let costBeforeLeg = 0;
      let costAfterLeg = 0;
      if (attachedAmounts) {
        if (hasBefore && hasAfter) {
          saleBeforeLeg = attachedAmounts.saleLegs[0] ?? 0;
          saleAfterLeg = attachedAmounts.saleLegs[1] ?? 0;
          costBeforeLeg = attachedAmounts.costLegs[0] ?? 0;
          costAfterLeg = attachedAmounts.costLegs[1] ?? 0;
        } else if (hasBefore) {
          saleBeforeLeg = attachedAmounts.saleLegs[0] ?? 0;
          costBeforeLeg = attachedAmounts.costLegs[0] ?? 0;
        } else if (hasAfter) {
          saleAfterLeg = attachedAmounts.saleLegs[0] ?? 0;
          costAfterLeg = attachedAmounts.costLegs[0] ?? 0;
        }
      }

      for (const [_kind, pickupBlock, saleLeg, costLeg] of [
        ['before', b.with_pickup_route_before, saleBeforeLeg, costBeforeLeg] as const,
        ['after', b.with_pickup_route_after, saleAfterLeg, costAfterLeg] as const,
      ]) {
        if (!pickupBlock || !ltCfg || !pickupPricingBase) continue;
        const pStarts = seriesId ? shiftTimestampToDate(pickupBlock.starts_at, occDate) : pickupBlock.starts_at;
        const pEnds = seriesId ? shiftTimestampToDate(pickupBlock.ends_at, occDate) : pickupBlock.ends_at;
        const legDur = pickupLegMinutes(pStarts, pEnds);
        const { data: pRow, error: pInsErr } = await supabaseAdmin
          .from('hub_appointments')
          .insert({
            clinic_id: b.clinic_id,
            unit_id: resolvedUnitId,
            hub_service_type_id: ltCfg.hub_service_type_id,
            hub_staff_member_id: pickupBlock.hub_staff_member_id ?? null,
            pet_id: b.pet_id ?? null,
            guardian_id: b.guardian_id ?? null,
            starts_at: pStarts,
            ends_at: pEnds,
            status: b.status ?? 'confirmed',
            resource_label: pickupBlock.resource_label ?? null,
            appointment_kind: 'pickup_route',
            parent_appointment_id: apptId,
            series_id: seriesId,
            series_occurrence_date: seriesId ? occDate : null,
            pricing_porte_tier: apptOverride,
            pricing_coat_type: apptCoatOverride,
          })
          .select('id')
          .single();
        if (pInsErr || !pRow) return res.status(500).json({ error: pInsErr?.message || 'Erro ao criar transporte' });
        const pickupApptId = (pRow as { id: string }).id;

        let pickupSnaps: ReturnType<typeof buildServiceLineSnapshots>;
        try {
          pickupSnaps = buildServiceLineSnapshots({
            lines: [
              {
                hub_service_type_id: ltCfg.hub_service_type_id,
                duration_minutes: legDur,
                pricing_variant: pickupPricingBase.kmVariant,
                sale_amount_override: saleLeg,
                cost_amount_override: costLeg,
              },
            ],
            stMap,
            pet,
            appointmentYmd: ymd,
            puppyMaxMonths: puppy.pet_puppy_max_months,
            appointmentOverride: apptOverride,
            appointmentCoatOverride: apptCoatOverride,
          });
        } catch (e) {
          return res.status(500).json({ error: (e as Error).message });
        }
        const pickupSvcInsert = pickupSnaps.map((row) => ({
          appointment_id: pickupApptId,
          hub_service_type_id: row.hub_service_type_id,
          duration_minutes: row.duration_minutes,
          order_index: row.order_index,
          pricing_porte_tier_applied: row.pricing_porte_tier_applied,
          pricing_coat_type_applied: row.pricing_coat_type_applied,
          cost_amount_applied: row.cost_amount_applied,
          sale_amount_applied: row.sale_amount_applied,
          pricing_variant: row.pricing_variant as unknown as Record<string, unknown> | null,
        }));
        const { error: pSvcErr } = await supabaseAdmin.from('hub_appointment_services').insert(pickupSvcInsert);
        if (pSvcErr) return res.status(500).json({ error: pSvcErr.message });
      }

      if (
        standalonePickupMode === 'round_trip' &&
        b.standalone_pickup_return &&
        standalonePricingBase &&
        standaloneLegAmounts
      ) {
        const rb = b.standalone_pickup_return;
        const rStarts = seriesId ? shiftTimestampToDate(rb.starts_at, occDate) : rb.starts_at;
        const rEnds = seriesId ? shiftTimestampToDate(rb.ends_at, occDate) : rb.ends_at;
        const legDur = pickupLegMinutes(rStarts, rEnds);
        const saleLeg = standaloneLegAmounts.saleLegs[1] ?? standaloneLegAmounts.saleLegs[0] ?? 0;
        const costLeg = standaloneLegAmounts.costLegs[1] ?? standaloneLegAmounts.costLegs[0] ?? 0;
        const { data: rRow, error: rInsErr } = await supabaseAdmin
          .from('hub_appointments')
          .insert({
            clinic_id: b.clinic_id,
            unit_id: resolvedUnitId,
            hub_service_type_id: b.hub_service_type_id,
            hub_staff_member_id: rb.hub_staff_member_id ?? b.hub_staff_member_id ?? null,
            pet_id: b.pet_id ?? null,
            guardian_id: b.guardian_id ?? null,
            starts_at: rStarts,
            ends_at: rEnds,
            status: b.status ?? 'confirmed',
            resource_label: rb.resource_label ?? b.resource_label ?? null,
            appointment_kind: 'pickup_route',
            parent_appointment_id: apptId,
            series_id: seriesId,
            series_occurrence_date: seriesId ? occDate : null,
            pricing_porte_tier: apptOverride,
            pricing_coat_type: apptCoatOverride,
            title: b.title ?? null,
          })
          .select('id')
          .single();
        if (rInsErr || !rRow) {
          return res.status(500).json({ error: rInsErr?.message || 'Erro ao criar retorno Leva e Traz' });
        }
        const returnApptId = (rRow as { id: string }).id;
        createdIds.push(returnApptId);
        let returnSnaps: ReturnType<typeof buildServiceLineSnapshots>;
        try {
          returnSnaps = buildServiceLineSnapshots({
            lines: [
              {
                hub_service_type_id: b.hub_service_type_id,
                duration_minutes: legDur,
                pricing_variant: standalonePricingBase.kmVariant,
                sale_amount_override: saleLeg,
                cost_amount_override: costLeg,
              },
            ],
            stMap,
            pet,
            appointmentYmd: ymd,
            puppyMaxMonths: puppy.pet_puppy_max_months,
            appointmentOverride: apptOverride,
            appointmentCoatOverride: apptCoatOverride,
          });
        } catch (e) {
          return res.status(500).json({ error: (e as Error).message });
        }
        const returnSvcInsert = returnSnaps.map((row) => ({
          appointment_id: returnApptId,
          hub_service_type_id: row.hub_service_type_id,
          duration_minutes: row.duration_minutes,
          order_index: row.order_index,
          pricing_porte_tier_applied: row.pricing_porte_tier_applied,
          pricing_coat_type_applied: row.pricing_coat_type_applied,
          cost_amount_applied: row.cost_amount_applied,
          sale_amount_applied: row.sale_amount_applied,
          pricing_variant: row.pricing_variant as unknown as Record<string, unknown> | null,
        }));
        const { error: rSvcErr } = await supabaseAdmin.from('hub_appointment_services').insert(returnSvcInsert);
        if (rSvcErr) return res.status(500).json({ error: rSvcErr.message });
      }

      for (const block of b.extra_blocks ?? []) {
        const bStarts = seriesId ? shiftTimestampToDate(block.starts_at, occDate) : block.starts_at;
        const bEnds = seriesId ? shiftTimestampToDate(block.ends_at, occDate) : block.ends_at;
        const firstSvcType = block.services[0]!.hub_service_type_id;
        const { data: blockRow, error: blockErr } = await supabaseAdmin
          .from('hub_appointments')
          .insert({
            clinic_id: b.clinic_id,
            unit_id: resolvedUnitId,
            hub_service_type_id: firstSvcType,
            hub_staff_member_id: block.hub_staff_member_id ?? null,
            pet_id: b.pet_id ?? null,
            guardian_id: b.guardian_id ?? null,
            starts_at: bStarts,
            ends_at: bEnds,
            status: block.status ?? b.status ?? 'confirmed',
            resource_label: block.resource_label ?? null,
            notes: block.notes ?? null,
            title: block.title ?? null,
            appointment_kind: 'standard',
            series_id: seriesId,
            series_occurrence_date: seriesId ? occDate : null,
            pricing_porte_tier: apptOverride,
            pricing_coat_type: apptCoatOverride,
            parent_appointment_id: apptId,
          })
          .select('id')
          .single();
        if (blockErr) return res.status(500).json({ error: blockErr.message });
        const blockId = (blockRow as { id: string }).id;
        const blockNormLines = block.services.map((s) => ({
          hub_service_type_id: s.hub_service_type_id,
          duration_minutes: s.duration_minutes,
          pricing_porte_tier: s.pricing_porte_tier ?? null,
          pricing_coat_type: s.pricing_coat_type ?? null,
          pricing_variant: s.pricing_variant ?? null,
        }));
        const blockYmd = bStarts.slice(0, 10);
        let blockSnaps: ReturnType<typeof buildServiceLineSnapshots>;
        try {
          blockSnaps = buildServiceLineSnapshots({
            lines: blockNormLines,
            stMap,
            pet,
            appointmentYmd: blockYmd,
            puppyMaxMonths: puppy.pet_puppy_max_months,
            appointmentOverride: apptOverride,
            appointmentCoatOverride: apptCoatOverride,
          });
        } catch (e) {
          return res.status(500).json({ error: (e as Error).message });
        }
        const blockSvcInsert = blockSnaps.map((row) => ({
          appointment_id: blockId,
          hub_service_type_id: row.hub_service_type_id,
          duration_minutes: row.duration_minutes,
          order_index: row.order_index,
          pricing_porte_tier_applied: row.pricing_porte_tier_applied,
          pricing_coat_type_applied: row.pricing_coat_type_applied,
          cost_amount_applied: row.cost_amount_applied,
          sale_amount_applied: row.sale_amount_applied,
          pricing_variant: row.pricing_variant as unknown as Record<string, unknown> | null,
        }));
        const { error: bSvcErr } = await supabaseAdmin.from('hub_appointment_services').insert(blockSvcInsert);
        if (bSvcErr) return res.status(500).json({ error: bSvcErr.message });
      }
    }

    if (conflicts.length > 0 && createdIds.length === 0) {
      return res.status(409).json({
        error: 'Todos os horários solicitados entram em conflito.',
        conflicts,
      });
    }

    // Fetch and return the main appointment (first created)
    if (createdIds.length === 0) {
      return res.status(409).json({ error: 'Nenhum agendamento criado (conflitos em todas as datas).', conflicts });
    }

    const { data: mainAppt } = await supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('id', createdIds[0]!)
      .single();
    const [enriched] = await enrichAppointments([mainAppt as Record<string, unknown>]);
    return res.status(201).json({
      appointment: enriched,
      created_count: createdIds.length,
      conflict_count: conflicts.length,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    });
  } catch (e: unknown) {
    console.error('createHubAppointment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar agendamento' });
  }
};

export const patchHubAppointment = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const scope = (req.query.scope as string) ?? 'this';
    if (!['this', 'future', 'all'].includes(scope)) {
      return res.status(400).json({ error: 'scope deve ser this, future ou all' });
    }

    const parsed = patchAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const b = parsed.data;

    if (b.extra_blocks !== undefined && scope !== 'this') {
      return res.status(400).json({
        error: 'Blocos adicionais só podem ser alterados nesta ocorrência (escopo «somente este»).',
      });
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('id', id)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado' });

    if (isStructuralAppointmentPatch(b) && !isAppointmentStructurallyEditable(existing as Record<string, unknown>)) {
      return res.status(409).json({
        error: 'Agendamento não pode ser editado após iniciado ou após o horário agendado.',
      });
    }

    // soft-delete scoped
    if (b.deleted === true) {
      const now = new Date().toISOString();
      if (scope === 'this') {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('id', id)
          .eq('clinic_id', b.clinic_id);
      } else if (scope === 'future' && (existing as Record<string, unknown>).series_id) {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('clinic_id', b.clinic_id)
          .eq('series_id', (existing as Record<string, unknown>).series_id as string)
          .gte('starts_at', (existing as Record<string, unknown>).starts_at as string)
          .is('deleted_at', null);
      } else if (scope === 'all' && (existing as Record<string, unknown>).series_id) {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('clinic_id', b.clinic_id)
          .eq('series_id', (existing as Record<string, unknown>).series_id as string)
          .is('deleted_at', null);
      } else {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('id', id)
          .eq('clinic_id', b.clinic_id);
      }
      return res.status(204).send();
    }

    const starts = b.starts_at ?? (existing.starts_at as string);
    const ends = b.ends_at ?? (existing.ends_at as string);
    if (new Date(ends) <= new Date(starts)) {
      return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
    }

    const nextStaff = b.hub_staff_member_id !== undefined ? b.hub_staff_member_id : (existing.hub_staff_member_id as string | null);
    const nextResource = b.resource_label !== undefined ? b.resource_label : (existing.resource_label as string | null);
    const nextUnit = b.unit_id !== undefined ? b.unit_id : (existing.unit_id as string | null);

    if (b.hub_service_type_id && !(await assertServiceTypeInClinic(b.clinic_id, b.hub_service_type_id))) {
      return res.status(400).json({ error: 'Tipo de serviço inválido' });
    }
    if (b.hub_staff_member_id !== undefined && !(await assertStaffInClinicOptional(b.clinic_id, b.hub_staff_member_id))) {
      return res.status(400).json({ error: 'Profissional inválido' });
    }
    if (b.pet_id !== undefined && !(await assertPetInClinic(b.clinic_id, b.pet_id))) {
      return res.status(400).json({ error: 'Pet inválido' });
    }
    if (b.guardian_id !== undefined && !(await assertGuardianInClinic(b.clinic_id, b.guardian_id))) {
      return res.status(400).json({ error: 'Tutor inválido' });
    }
    if (b.unit_id !== undefined && !(await assertUnitInClinic(b.clinic_id, b.unit_id))) {
      return res.status(400).json({ error: 'Unidade inválida' });
    }

    const nextCareKind =
      b.care_location_kind ??
      ((existing.care_location_kind as string | null | undefined) as 'own_unit' | 'partner_clinic' | undefined) ??
      'own_unit';
    const nextPartnerId =
      b.hub_partner_clinic_id !== undefined
        ? b.hub_partner_clinic_id
        : ((existing.hub_partner_clinic_id as string | null | undefined) ?? null);
    const careResolved = await resolveCareLocation({
      clinicId: b.clinic_id,
      care_location_kind: nextCareKind,
      hub_partner_clinic_id: nextPartnerId,
      unit_id: nextUnit,
      existing: {
        care_location_kind: (existing.care_location_kind as 'own_unit' | 'partner_clinic' | null) ?? 'own_unit',
        hub_partner_clinic_id: (existing.hub_partner_clinic_id as string | null) ?? null,
      },
      allowNullUnit: nextCareKind === 'partner_clinic',
      requireActivePartner: b.hub_partner_clinic_id !== undefined || b.care_location_kind === 'partner_clinic',
    });
    if (!careResolved.ok) {
      return res.status(400).json({ error: careResolved.error });
    }

    const check = await assertNoScheduleConflict(
      b.clinic_id,
      [id],
      nextStaff,
      nextResource,
      careResolved.value.unit_id,
      starts,
      ends,
    );
    if (check.conflict) {
      return res.status(409).json({ error: check.reason });
    }

    const patch: Record<string, unknown> = {};
    if (b.unit_id !== undefined || b.care_location_kind !== undefined || b.hub_partner_clinic_id !== undefined) {
      patch.unit_id = careResolved.value.unit_id;
      patch.care_location_kind = careResolved.value.care_location_kind;
      patch.hub_partner_clinic_id = careResolved.value.hub_partner_clinic_id;
    }
    if (b.hub_service_type_id !== undefined) patch.hub_service_type_id = b.hub_service_type_id;
    if (b.hub_staff_member_id !== undefined) patch.hub_staff_member_id = b.hub_staff_member_id;
    if (b.pet_id !== undefined) patch.pet_id = b.pet_id;
    if (b.guardian_id !== undefined) patch.guardian_id = b.guardian_id;
    if (b.starts_at !== undefined) patch.starts_at = b.starts_at;
    if (b.ends_at !== undefined) patch.ends_at = b.ends_at;
    if (b.status !== undefined) patch.status = b.status;
    if (b.resource_label !== undefined) patch.resource_label = b.resource_label;
    if (b.notes !== undefined) patch.notes = b.notes;
    if (b.financial_notes !== undefined) patch.financial_notes = b.financial_notes;
    if (b.appointment_kind !== undefined) patch.appointment_kind = b.appointment_kind;
    if (b.title !== undefined) patch.title = b.title;
    if (b.description !== undefined) patch.description = b.description;
    if (b.pricing_porte_tier !== undefined) patch.pricing_porte_tier = b.pricing_porte_tier;
    if (b.pricing_coat_type !== undefined) patch.pricing_coat_type = b.pricing_coat_type;
    if (b.intake_hub_case_id !== undefined) patch.intake_hub_case_id = b.intake_hub_case_id;
    if (b.intake_create_new_case !== undefined) patch.intake_create_new_case = b.intake_create_new_case;
    if (b.intake_new_case_title !== undefined) patch.intake_new_case_title = b.intake_new_case_title;

    if (b.services && b.services.length > 0) {
      patch.hub_service_type_id = b.services[0]!.hub_service_type_id;
    }

    if (Object.keys(patch).length === 0 && !b.services && b.extra_blocks === undefined) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    // determine IDs to update based on scope
    let targetIds: string[] = [id];
    const seriesId = (existing as Record<string, unknown>).series_id as string | null;
    if (seriesId && scope !== 'this') {
      let q = supabaseAdmin
        .from('hub_appointments')
        .select('id, starts_at')
        .eq('clinic_id', b.clinic_id)
        .eq('series_id', seriesId)
        .is('deleted_at', null);
      if (scope === 'future') {
        q = q.gte('starts_at', (existing as Record<string, unknown>).starts_at as string);
      }
      const { data: seriesRows } = await q;
      targetIds = (seriesRows ?? []).map((r: Record<string, unknown>) => r.id as string);
    }

    let patchServicePayload: {
      normLines: Array<{
        hub_service_type_id: string;
        duration_minutes: number;
        pricing_porte_tier?: string | null;
        pricing_coat_type?: string | null;
        pricing_variant?: HubQuotePricingVariantInput | null;
      }>;
      stMap: Map<string, ServiceTypePricingRow>;
    } | null = null;

    if (b.services && b.services.length > 0) {
      const normPatchLines = b.services.map((s) => ({
        hub_service_type_id: s.hub_service_type_id,
        duration_minutes: s.duration_minutes,
        pricing_porte_tier: s.pricing_porte_tier ?? null,
        pricing_coat_type: s.pricing_coat_type ?? null,
        pricing_variant: s.pricing_variant ?? null,
      }));
      const svcIds = [...new Set(normPatchLines.map((l) => l.hub_service_type_id))];
      let stMap: Map<string, ServiceTypePricingRow>;
      try {
        stMap = await fetchServiceTypesMap(b.clinic_id, svcIds);
      } catch (e) {
        return res.status(500).json({ error: (e as Error).message });
      }
      for (const sid of svcIds) {
        if (!stMap.has(sid)) {
          return res.status(400).json({ error: `Tipo de serviço inválido: ${sid}` });
        }
      }
      const mergedPricing =
        b.pricing_porte_tier !== undefined
          ? b.pricing_porte_tier
          : ((existing as Record<string, unknown>).pricing_porte_tier as string | null) ?? null;
      const mergedCoatPricing =
        b.pricing_coat_type !== undefined
          ? b.pricing_coat_type
          : ((existing as Record<string, unknown>).pricing_coat_type as string | null) ?? null;
      const mergedPetId =
        b.pet_id !== undefined ? b.pet_id : ((existing as Record<string, unknown>).pet_id as string | null) ?? null;
      const pet = await fetchPetPricingFields(b.clinic_id, mergedPetId);
      const valErr = validatePricingPorteInputs({
        appointmentOverride: mergedPricing,
        appointmentCoatOverride: mergedCoatPricing,
        pet,
        lines: normPatchLines,
        stMap,
      });
      if (valErr.error) {
        return res.status(400).json({ error: valErr.error });
      }
      patchServicePayload = { normLines: normPatchLines, stMap };
    } else if (
      b.pet_id !== undefined ||
      b.starts_at !== undefined ||
      b.pricing_porte_tier !== undefined ||
      b.pricing_coat_type !== undefined
    ) {
      const { data: existingLines, error: existingLinesErr } = await supabaseAdmin
        .from('hub_appointment_services')
        .select('hub_service_type_id')
        .eq('appointment_id', id);
      if (existingLinesErr) return res.status(500).json({ error: existingLinesErr.message });
      const lineIds = [...new Set((existingLines ?? []).map((l: { hub_service_type_id: string }) => l.hub_service_type_id))];
      const stMap = await fetchServiceTypesMap(b.clinic_id, lineIds);
      const mergedPricing =
        b.pricing_porte_tier !== undefined
          ? b.pricing_porte_tier
          : ((existing as Record<string, unknown>).pricing_porte_tier as string | null) ?? null;
      const mergedCoatPricing =
        b.pricing_coat_type !== undefined
          ? b.pricing_coat_type
          : ((existing as Record<string, unknown>).pricing_coat_type as string | null) ?? null;
      const mergedPetId =
        b.pet_id !== undefined ? b.pet_id : ((existing as Record<string, unknown>).pet_id as string | null) ?? null;
      const pet = await fetchPetPricingFields(b.clinic_id, mergedPetId);
      const valErr = validatePricingPorteInputs({
        appointmentOverride: mergedPricing,
        appointmentCoatOverride: mergedCoatPricing,
        pet,
        lines: lineIds.map((hub_service_type_id) => ({ hub_service_type_id })),
        stMap,
      });
      if (valErr.error) {
        return res.status(400).json({ error: valErr.error });
      }
    }

    for (const tid of targetIds) {
      if (Object.keys(patch).length > 0) {
        const { error: pErr } = await supabaseAdmin
          .from('hub_appointments')
          .update(patch)
          .eq('id', tid)
          .eq('clinic_id', b.clinic_id);
        if (pErr) return res.status(500).json({ error: pErr.message });
      }

      if (patchServicePayload) {
        await supabaseAdmin.from('hub_appointment_services').delete().eq('appointment_id', tid);
        const { data: apRow, error: apErr } = await supabaseAdmin
          .from('hub_appointments')
          .select('pet_id, starts_at, pricing_porte_tier, pricing_coat_type')
          .eq('id', tid)
          .single();
        if (apErr || !apRow) return res.status(500).json({ error: apErr?.message || 'Erro ao recarregar agendamento' });
        const ar = apRow as { pet_id: string | null; starts_at: string; pricing_porte_tier: string | null; pricing_coat_type: string | null };
        const pet = await fetchPetPricingFields(b.clinic_id, ar.pet_id);
        const puppy = await getOrCreateHubClinicSettings(b.clinic_id);
        let snaps: ReturnType<typeof buildServiceLineSnapshots>;
        try {
          snaps = buildServiceLineSnapshots({
            lines: patchServicePayload.normLines,
            stMap: patchServicePayload.stMap,
            pet,
            appointmentYmd: ar.starts_at.slice(0, 10),
            puppyMaxMonths: puppy.pet_puppy_max_months,
            appointmentOverride: ar.pricing_porte_tier ?? null,
            appointmentCoatOverride: ar.pricing_coat_type ?? null,
          });
        } catch (e) {
          return res.status(500).json({ error: (e as Error).message });
        }
        const svcInsert = snaps.map((row) => ({
          appointment_id: tid,
          hub_service_type_id: row.hub_service_type_id,
          duration_minutes: row.duration_minutes,
          order_index: row.order_index,
          pricing_porte_tier_applied: row.pricing_porte_tier_applied,
          pricing_coat_type_applied: row.pricing_coat_type_applied,
          cost_amount_applied: row.cost_amount_applied,
          sale_amount_applied: row.sale_amount_applied,
          pricing_variant: row.pricing_variant as unknown as Record<string, unknown> | null,
        }));
        const { error: svcErr } = await supabaseAdmin.from('hub_appointment_services').insert(svcInsert);
        if (svcErr) return res.status(500).json({ error: svcErr.message });
      } else if (
        b.pet_id !== undefined ||
        b.starts_at !== undefined ||
        b.pricing_porte_tier !== undefined ||
        b.pricing_coat_type !== undefined
      ) {
        const { data: apRow } = await supabaseAdmin
          .from('hub_appointments')
          .select('pet_id, starts_at, pricing_porte_tier, pricing_coat_type')
          .eq('id', tid)
          .single();
        if (apRow) {
          const ar = apRow as { pet_id: string | null; starts_at: string; pricing_porte_tier: string | null; pricing_coat_type: string | null };
          await refreshSnapshotsForAppointment(
            b.clinic_id,
            tid,
            ar.starts_at,
            ar.pet_id,
            ar.pricing_porte_tier ?? null,
            ar.pricing_coat_type ?? null,
          );
        }
      }
    }

    if (patch.status === 'cancelled') {
      for (const tid of targetIds) {
        void maybeFlagComandaCancellationPending(b.clinic_id, 'appointment', tid);
      }
    }

    if (b.status === 'done' || b.status === 'paid') {
      for (const tid of targetIds) {
        void syncOpenComandasAfterAppointmentOperationalComplete(b.clinic_id, tid);
      }
    }

    if (b.extra_blocks !== undefined) {
      const { data: parentAfterPatch } = await supabaseAdmin
        .from('hub_appointments')
        .select('*')
        .eq('id', id)
        .eq('clinic_id', b.clinic_id)
        .single();
      if (!parentAfterPatch) {
        return res.status(500).json({ error: 'Erro ao recarregar agendamento principal' });
      }
      const syncResult = await syncExtraBlocksForParent(
        b.clinic_id,
        id,
        parentAfterPatch as Record<string, unknown>,
        b.extra_blocks,
        [id, ...targetIds],
      );
      if (syncResult.error) {
        return res.status(syncResult.status ?? 500).json({ error: syncResult.error });
      }
    }

    const { data: updated } = await supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('id', id)
      .single();
    const [enriched] = await enrichAppointments([updated as Record<string, unknown>]);
    return res.json({ appointment: enriched, updated_count: targetIds.length });
  } catch (e: unknown) {
    console.error('patchHubAppointment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar agendamento' });
  }
};

// ── Calendar blocks ───────────────────────────────────────────────────────────

const listBlocksQuery = z.object({
  clinic_id: uuidStr,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listHubAgendaCalendarBlocks = async (req: Request, res: Response) => {
  try {
    const parsed = listBlocksQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, from, to } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('hub_agenda_calendar_blocks')
      .select('*')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .gte('block_date', from)
      .lte('block_date', to)
      .order('block_date');
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ blocks: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubAgendaCalendarBlocks', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar bloqueios' });
  }
};

const upsertBlockSchema = z
  .object({
    clinic_id: uuidStr,
    block_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    label: z.string().trim().min(1).max(200),
    kind: z.enum(['holiday', 'closure', 'reduced_staff', 'other']).optional(),
  })
  .strict();

export const upsertHubAgendaCalendarBlock = async (req: Request, res: Response) => {
  try {
    const parsed = upsertBlockSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    const row = {
      clinic_id: b.clinic_id,
      block_date: b.block_date,
      label: b.label,
      kind: b.kind ?? 'closure',
    };
    const { data: existing } = await supabaseAdmin
      .from('hub_agenda_calendar_blocks')
      .select('id')
      .eq('clinic_id', b.clinic_id)
      .eq('block_date', b.block_date)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from('hub_agenda_calendar_blocks')
        .update({ label: row.label, kind: row.kind, deleted_at: null })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ block: data });
    }

    const { data, error } = await supabaseAdmin.from('hub_agenda_calendar_blocks').insert(row).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ block: data });
  } catch (e: unknown) {
    console.error('upsertHubAgendaCalendarBlock', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao gravar bloqueio' });
  }
};

export const deleteHubAgendaCalendarBlock = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'ID inválido' });
    const clinic_id = z.string().uuid().safeParse(req.query.clinic_id);
    if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
    const { error } = await supabaseAdmin
      .from('hub_agenda_calendar_blocks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', clinic_id.data);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (e: unknown) {
    console.error('deleteHubAgendaCalendarBlock', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao remover bloqueio' });
  }
};

async function assertPetBelongsToGuardian(
  clinicId: string,
  petId: string,
  guardianId: string,
): Promise<boolean> {
  const { data: pet } = await supabaseAdmin
    .from('hub_pets')
    .select('id')
    .eq('id', petId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!pet) return false;
  const { data: link } = await supabaseAdmin
    .from('hub_pet_guardians')
    .select('id')
    .eq('pet_id', petId)
    .eq('guardian_id', guardianId)
    .maybeSingle();
  return Boolean(link);
}

/** POST /api/hub/appointments/batch — N agendamentos (1 por pet) com visit_group_id. */
export const createHubAppointmentBatch = async (req: Request, res: Response) => {
  try {
    const parsed = createAppointmentBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { clinic_id, visit_group_id: inputVisitGroupId, shared, pets } = parsed.data;

    if (new Date(shared.ends_at) <= new Date(shared.starts_at)) {
      return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
    }
    if (!shared.guardian_id) {
      return res.status(400).json({ error: 'Informe o tutor (guardian_id).' });
    }

    const guardianId = shared.guardian_id;
    for (const p of pets) {
      if (!(await assertPetBelongsToGuardian(clinic_id, p.pet_id, guardianId))) {
        return res.status(400).json({ error: `Pet ${p.pet_id} não pertence ao tutor informado.` });
      }
    }

    const visitGroupId = inputVisitGroupId ?? randomUUID();
    const createdIds: string[] = [];

    const rollbackCreated = async () => {
      if (createdIds.length === 0) return;
      const now = new Date().toISOString();
      await supabaseAdmin
        .from('hub_appointments')
        .update({ deleted_at: now })
        .in('id', createdIds)
        .eq('clinic_id', clinic_id);
    };

    try {
      for (const petEntry of pets) {
        const petServices = petEntry.services ?? shared.services;
        const body = {
          ...shared,
          pet_id: petEntry.pet_id,
          starts_at: petEntry.starts_at ?? shared.starts_at,
          ends_at: petEntry.ends_at ?? shared.ends_at,
          hub_staff_member_id:
            petEntry.hub_staff_member_id !== undefined
              ? petEntry.hub_staff_member_id ?? null
              : shared.hub_staff_member_id ?? null,
          resource_label: petEntry.resource_label ?? shared.resource_label,
          pricing_porte_tier: petEntry.pricing_porte_tier ?? shared.pricing_porte_tier ?? null,
          pricing_coat_type: petEntry.pricing_coat_type ?? shared.pricing_coat_type ?? null,
          services: petServices,
          extra_blocks: petEntry.extra_blocks ?? [],
          allow_schedule_overlap: true,
          visit_group_id: visitGroupId,
        };

        const fakeReq = { body } as Request;
        let statusCode = 201;
        let responseBody: Record<string, unknown> = {};
        const fakeRes = {
          status(code: number) {
            statusCode = code;
            return fakeRes;
          },
          json(data: Record<string, unknown>) {
            responseBody = data;
            return fakeRes;
          },
        } as unknown as Response;

        await createHubAppointment(fakeReq, fakeRes);

        if (statusCode >= 400) {
          await rollbackCreated();
          return res.status(statusCode).json(responseBody);
        }

        const appt = responseBody.appointment as { id?: string } | undefined;
        if (appt?.id) createdIds.push(appt.id);
      }
    } catch (e) {
      await rollbackCreated();
      throw e;
    }

    const enriched = await Promise.all(
      createdIds.map(async (id) => {
        const { data } = await supabaseAdmin.from('hub_appointments').select('*').eq('id', id).single();
        return data;
      }),
    );
    const appointments = await enrichAppointments(
      enriched.filter(Boolean) as Record<string, unknown>[],
    );

    return res.status(201).json({
      visit_group_id: visitGroupId,
      appointments,
      created_count: appointments.length,
    });
  } catch (e: unknown) {
    console.error('createHubAppointmentBatch', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar agendamentos em lote' });
  }
};
