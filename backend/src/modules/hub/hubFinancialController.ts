import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { resolveStaffIdForUser } from './hubStaffResolve';
import { computeBalances } from './hubInventoryController';
import { createSaleStockOut, restoreProductStockForReceivableLines } from './hubInventoryStockUtils';
import {
  computeStockReturnStatus,
  isProductStockLine,
} from './hubProductReturnStatus';
import { validateProductSalePricing } from './productSalePriceRules';
import { resolveAppliedSaleAmount } from './hubPricingResolve';
import { streamPaymentReceiptPdf } from './hubPaymentReceiptPdf';
import {
  fetchOpenComandaOriginKeysExported,
  leavePendingHandoffOpenComandasForUnit,
  refreshComandaFinancialStatus,
  tryAutoCloseComanda,
} from './hubComandasController';
import {
  closeCashSession,
  extractCronSecretFromRequest,
  isCronClinicFilterAllowed,
  runAutoCloseOverdueJob,
  verifyCronSecret,
} from './cashSessionCloseService';
import {
  FinanceLedgerError,
  postHistoricalCashPayment,
  recalculateReceivableFromPosted,
  returnReceivableProductLines,
  reversePaymentSoft,
  sumPostedPaymentsForReceivable,
  validatePaymentCashSession,
  type PaymentReversalMode,
} from './hubFinanceLedger';
import { applyQuoteDiscount, quoteDiscountAmount } from './hubQuoteDiscount';
import { getOrCreateHubClinicSettings } from './hubClinicSettingsController';
import {
  assertPaymentMethodInList,
  hubPaymentMethodSchema,
  patchPaymentMethodSettingsSchema,
  PaymentMethodNotAcceptedError,
} from './hubPaymentMethods';
import { aggregateCardFeeTotals } from './hubCardMachineFees';
import {
  buildBoardingComandaLine,
  buildBoardingExtraLines,
  estimateBoardingStayTotal,
  estimateBoardingUnbilledAmount,
  shouldIncludeInUnbilledBoarding,
  type BoardingExtraInput,
  type DayBoardBilling,
} from './boardingBilling';
import { isBoardingStatusReadyForComanda } from './boardingOperational';
import {
  HOSPITALIZATION_CLOSED_STATUSES,
  isHospitalizationClosed,
  loadHospitalizationComandaItems,
  resolveHospitalizationBillingOrigin,
  shouldIncludeInUnbilledHospitalization,
} from './hubHospitalizationBilling';
import {
  aggregateReceivableStatus,
  hasFinanceiroChargeableAmount,
  isDayBoardOperationallyComplete,
  isDayBoardPaidAndComplete,
  matchesFinanceiroDayBoardScope,
  pickActiveReceivableId,
} from './hubFinancialDayBoard';
import { collectOpenFinanceiroOriginKeys } from './hubFinanceDayBoardOpen';
import {
  buildManualDayBoardItem,
  buildManualServicesFromReceivableLines,
  type ManualDayBoardComanda,
  type ManualDayBoardLine,
} from './hubFinanceDayBoardManual';
import { financeSourceTypeSchema, receivableSourceTypeSchema } from './hubFinanceSchemas';
import { notifyHubPaymentDue } from './hubNotifyEvents';
import { syncChargeBundleStatusForReceivable } from './hubChargeBundlesService';
import { applyPackageCoverageToEstimate, hasPackageBalanceForServices, listActivePackageBalances } from './hubPackagesService';
import { findSeriesInvoiceCoverageForAppointments } from './hubSeriesBillingService';
import {
  markHubAppointmentPaidFromReceivable,
  syncHubAppointmentPaidFromReceivable,
} from './appointmentPaidFromBilling';
import {
  consumeHubCustomerCredit,
  CustomerCreditError,
  restoreCustomerCreditIfNeeded,
} from './hubCustomerCredit';
import {
  PAYABLE_CATEGORIES,
  PAYABLE_PAYMENT_METHODS,
  PAYABLE_SCHEDULE_AMOUNT_MODES,
  PAYABLE_SCHEDULE_FREQUENCIES,
  applyConfirmedEstimateToSchedule,
  endPayableSchedule,
  ensurePayableScheduleHorizon,
  listPayableSchedules,
  propagatePayableSchedule,
  summarizePayableDueAlerts,
  todayYmdSaoPaulo,
  sumPaidPayablesInPeriod,
  sumPendingPayables,
  type HubPayableRow,
  type HubPayableScheduleRow,
} from './hubPayablesService';

const uuidStr = z.string().uuid();

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

/** Dia civil em America/Sao_Paulo (YYYY-MM-DD) para comparar pagamentos com sessão de caixa. */
function paymentYmdSaoPaulo(iso: string | null | undefined): string {
  if (!iso) return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const raw = String(iso);
    return raw.length >= 10 ? raw.slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * @deprecated Removido: não vincular pagamentos órfãos automaticamente à sessão.
 * Mantido como no-op para imports legados de testes.
 */
export async function linkOrphanPaymentsToSession(
  _clinicId: string,
  _session: { id: string; unit_id: string; opened_at: string },
): Promise<void> {
  return;
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
  return recalculateReceivableFromPosted(receivableId);
}

/** Sync financial_status da comanda (aberta ou fechada) sem reabrir. */
async function syncComandaFinancialAfterLedger(comandaId: string | null | undefined, clinicId: string): Promise<void> {
  if (!comandaId) return;
  const { data: comandaRow } = await supabaseAdmin
    .from('hub_comandas')
    .select('*')
    .eq('id', comandaId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (!comandaRow) return;
  await refreshComandaFinancialStatus(comandaId, clinicId, comandaRow as Record<string, unknown>);
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
      'id, hub_service_type_id, order_index, sale_amount_applied, hub_service_types(name, sale_amount)'
    )
    .eq('appointment_id', appointmentId)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  const lines: ReceivableLineInsert[] = [];
  let subtotal = 0;
  let idx = 0;
  for (const row of svcRows ?? []) {
    const st = row.hub_service_types as
      | { name?: string; sale_amount?: number | null }
      | { name?: string; sale_amount?: number | null }[]
      | null;
    const stRow = Array.isArray(st) ? st[0] : st;
    const sale = resolveAppliedSaleAmount(row.sale_amount_applied, stRow?.sale_amount);
    const desc = (stRow?.name as string) || 'Serviço';
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

async function buildPreviewForBoardingReservation(
  clinicId: string,
  reservationId: string
): Promise<{ lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null }> {
  const { data: res, error } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select(
      'id, clinic_id, pet_id, guardian_id, unit_id, mode, status, expected_check_in, expected_check_out, checked_in_at, checked_out_at, daily_rate_cents, billing_waived_at'
    )
    .eq('id', reservationId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!res) throw new Error('NOT_FOUND');
  if (!isBoardingStatusReadyForComanda(String(res.status ?? ''), { allowIncomplete: true })) {
    throw new Error('NOT_READY');
  }
  if (res.billing_waived_at) throw new Error('WAIVED');

  const guardianId = res.guardian_id as string | null;
  if (!guardianId) throw new Error('NO_GUARDIAN');

  const unitIdForCutoff = (res.unit_id as string | null) ?? null;
  let cutoffTime: string | null = null;
  if (unitIdForCutoff) {
    const { data: settings } = await supabaseAdmin
      .from('hub_unit_boarding_settings')
      .select('checkout_cutoff_time')
      .eq('unit_id', unitIdForCutoff)
      .maybeSingle();
    cutoffTime = (settings?.checkout_cutoff_time as string | null | undefined) ?? null;
  }

  const { line, subtotal: baseSubtotal } = buildBoardingComandaLine(
    {
      id: res.id as string,
      mode: res.mode as string,
      pet_id: res.pet_id as string | null,
      expected_check_in: res.expected_check_in as string | null,
      expected_check_out: res.expected_check_out as string | null,
      checked_in_at: res.checked_in_at as string | null,
      checked_out_at: res.checked_out_at as string | null,
      daily_rate_cents: res.daily_rate_cents as number | null,
    },
    { cutoffTime },
  );

  const { data: extraRows } = await supabaseAdmin
    .from('hub_boarding_extras')
    .select('id, hub_service_type_id, description, quantity, unit_amount_cents, service_date, deleted_at')
    .eq('clinic_id', clinicId)
    .eq('hub_boarding_reservation_id', reservationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  const extras = buildBoardingExtraLines(
    (extraRows ?? []) as BoardingExtraInput[],
    (res.pet_id as string | null) ?? null,
  );

  const lines: ReceivableLineInsert[] = [
    {
      clinic_id: '',
      receivable_id: '',
      line_kind: 'manual',
      source_line_id: null,
      hub_service_type_id: null,
      description: line.description,
      quantity: line.quantity,
      unit_sale_amount: line.unit_amount,
      line_total: line.line_total,
      sort_order: 0,
    },
    ...extras.lines.map((ex, i) => ({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'manual' as const,
      source_line_id: ex.origin_id,
      hub_service_type_id: ex.hub_service_type_id,
      description: ex.description,
      quantity: ex.quantity,
      unit_sale_amount: ex.unit_amount,
      line_total: ex.line_total,
      sort_order: i + 1,
    })),
  ];

  return {
    lines,
    subtotal: round2(baseSubtotal + extras.subtotal),
    unit_id: (res.unit_id as string) ?? null,
    guardian_id: guardianId,
  };
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

function hospComandaItemsToPreviewLines(
  items: Array<{
    hub_service_type_id: string | null;
    description: string;
    quantity: number;
    unit_amount: number;
    line_total: number;
    origin_id: string;
    sort_order: number;
  }>,
): ReceivableLineInsert[] {
  return items.map((it) => ({
    clinic_id: '',
    receivable_id: '',
    line_kind: 'manual' as const,
    source_line_id: it.origin_id,
    hub_service_type_id: it.hub_service_type_id,
    description: it.description,
    quantity: it.quantity,
    unit_sale_amount: it.unit_amount,
    line_total: it.line_total,
    sort_order: it.sort_order,
  }));
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
  const hosp = await loadHospitalizationComandaItems({
    clinicId,
    encounterId,
    appointmentId: apptId,
  });
  if (hosp.items.length) {
    allLines.push(...hospComandaItemsToPreviewLines(hosp.items));
    subtotal = round2(subtotal + hosp.subtotal);
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
  const hosp = await loadHospitalizationComandaItems({
    clinicId,
    appointmentId,
  });
  if (hosp.items.length) {
    built.lines.push(...hospComandaItemsToPreviewLines(hosp.items));
    built.subtotal = round2(built.subtotal + hosp.subtotal);
  }
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

async function buildPreviewForHospitalization(
  clinicId: string,
  hospitalizationId: string,
): Promise<{ lines: ReceivableLineInsert[]; subtotal: number; unit_id: string | null; guardian_id: string | null }> {
  const { data: hosp, error } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select(
      'id, clinic_id, unit_id, guardian_id, pet_id, status, admitted_at, discharged_at, billing_waived_at, hub_encounter_id, hub_appointment_id, daily_hub_service_type_id, daily_unit_amount, deleted_at',
    )
    .eq('id', hospitalizationId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!hosp) throw new Error('NOT_FOUND');
  if (!isHospitalizationClosed(String(hosp.status))) throw new Error('NOT_READY');
  if (hosp.billing_waived_at) throw new Error('WAIVED');

  const loaded = await loadHospitalizationComandaItems({
    clinicId,
    hospitalizationId,
    encounterId: (hosp.hub_encounter_id as string | null) ?? null,
    appointmentId: (hosp.hub_appointment_id as string | null) ?? null,
    defaultPetId: (hosp.pet_id as string | null) ?? null,
  });
  const lines = hospComandaItemsToPreviewLines(loaded.items);
  const subtotal = loaded.subtotal;
  if (!lines.length) {
    lines.push({
      clinic_id: '',
      receivable_id: '',
      line_kind: 'manual',
      source_line_id: hospitalizationId,
      hub_service_type_id: null,
      description: 'Internação (sem linhas de cobrança)',
      quantity: 1,
      unit_sale_amount: 0,
      line_total: 0,
      sort_order: 0,
    });
  }
  return {
    lines,
    subtotal: round2(subtotal),
    unit_id: (hosp.unit_id as string) ?? null,
    guardian_id: (hosp.guardian_id as string) ?? null,
  };
}

async function buildPreviewForQuote(
  clinicId: string,
  quoteId: string
): Promise<{
  lines: ReceivableLineInsert[];
  subtotal: number;
  discount_amount: number;
  final_amount: number;
  unit_id: string | null;
  guardian_id: string | null;
}> {
  const { data: quote, error: qErr } = await supabaseAdmin
    .from('hub_quotes')
    .select(
      'id, clinic_id, unit_id, guardian_id, status, total_amount, discount_kind, discount_value, billing_state, billing_waived_at'
    )
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
  const subtotalRounded = round2(subtotal);
  const usedFallbackTotal = (qLines ?? []).length === 0;
  const discountKind = (quote.discount_kind as 'percent' | 'fixed' | null) ?? null;
  const discountValue = quote.discount_value as number | null;
  const discountAmount = usedFallbackTotal ? 0 : quoteDiscountAmount(subtotalRounded, discountKind, discountValue);
  const finalAmount = usedFallbackTotal
    ? subtotalRounded
    : applyQuoteDiscount(subtotalRounded, discountKind, discountValue);
  return {
    lines,
    subtotal: subtotalRounded,
    discount_amount: discountAmount,
    final_amount: finalAmount,
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

export const getHubFinancePaymentMethodSettings = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const settings = await getOrCreateHubClinicSettings(parsed.data);
    return res.json({
      accepted_payment_methods: settings.accepted_payment_methods,
      card_machine_fees: settings.card_machine_fees,
    });
  } catch (e) {
    console.error('[hub_finance] getPaymentMethodSettings', e);
    return res.status(500).json({ error: 'Erro ao carregar formas de pagamento' });
  }
};

export const patchHubFinancePaymentMethodSettings = async (req: Request, res: Response) => {
  try {
    const body = patchPaymentMethodSettingsSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const { clinic_id, accepted_payment_methods, card_machine_fees: feesPatch } = body.data;

    await getOrCreateHubClinicSettings(clinic_id);

    const patch: Record<string, unknown> = {};
    if (accepted_payment_methods !== undefined) {
      patch.accepted_payment_methods = accepted_payment_methods;
    }
    if (feesPatch !== undefined) {
      const { parseCardMachineFeesInput } = await import('./hubCardMachineFees.js');
      try {
        const current = await getOrCreateHubClinicSettings(clinic_id);
        patch.card_machine_fees = parseCardMachineFeesInput({
          debit_card: feesPatch.debit_card ?? current.card_machine_fees.debit_card,
          credit_card: feesPatch.credit_card ?? current.card_machine_fees.credit_card,
        });
      } catch (err) {
        return res.status(400).json({ error: (err as Error).message || 'Taxas da maquininha inválidas' });
      }
    }

    const { error } = await supabaseAdmin
      .from('hub_clinic_settings')
      .update(patch)
      .eq('clinic_id', clinic_id);
    if (error) {
      console.error('[hub_finance] patchPaymentMethodSettings', error);
      return res.status(500).json({ error: error.message });
    }

    const settings = await getOrCreateHubClinicSettings(clinic_id);
    return res.json({
      accepted_payment_methods: settings.accepted_payment_methods,
      card_machine_fees: settings.card_machine_fees,
    });
  } catch (e) {
    console.error('[hub_finance] patchPaymentMethodSettings', e);
    return res.status(500).json({ error: 'Erro ao gravar formas de pagamento' });
  }
};

export const getHubFinancePreview = async (req: Request, res: Response) => {
  try {
    const parsed = previewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id, source_type e source_id (UUID) são obrigatórios' });
    }
    const { clinic_id, source_type, source_id } = parsed.data;
    let built: {
      lines: ReceivableLineInsert[];
      subtotal: number;
      final_amount?: number;
      unit_id: string | null;
      guardian_id: string | null;
    };
    if (source_type === 'grooming_session') {
      built = await buildPreviewForGroomingSession(clinic_id, source_id);
    } else if (source_type === 'encounter') {
      built = await buildPreviewForEncounter(clinic_id, source_id);
    } else if (source_type === 'appointment') {
      built = await buildPreviewForAppointment(clinic_id, source_id);
    } else if (source_type === 'boarding_reservation') {
      built = await buildPreviewForBoardingReservation(clinic_id, source_id);
    } else if (source_type === 'hospitalization') {
      built = await buildPreviewForHospitalization(clinic_id, source_id);
    } else {
      built = await buildPreviewForQuote(clinic_id, source_id);
    }
    const chargeAmount =
      'final_amount' in built && typeof built.final_amount === 'number' ? built.final_amount : built.subtotal;
    return res.json({
      preview: {
        source_type,
        source_id,
        estimated_amount: chargeAmount,
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
    if (msg === 'NOT_READY') return res.status(409).json({ error: 'Origem não está pronta para cobrança' });
    if (msg === 'WAIVED') return res.status(409).json({ error: 'Origem marcada sem cobrança' });
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
    competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
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

/**
 * Cobrança nascida vencida (ex.: dívida antiga lançada manualmente) já entra como
 * pendência para o caixa/financeiro. Varredura periódica de vencidos fica para depois.
 */
function maybeNotifyOverdueReceivable(opts: {
  clinicId: string;
  unitId: string | null;
  receivableId: string;
  guardianId: string | null;
  amount: number;
  dueDate: string | null;
}): void {
  if (!opts.dueDate) return;
  const today = new Date().toISOString().slice(0, 10);
  if (opts.dueDate >= today) return;
  void notifyHubPaymentDue({
    clinicId: opts.clinicId,
    unitId: opts.unitId,
    receivableId: opts.receivableId,
    guardianId: opts.guardianId,
    amount: opts.amount,
    dueDate: opts.dueDate,
    reason: 'overdue',
  });
}

export const postHubFinanceReceivable = async (req: Request, res: Response) => {
  try {
    const parsed = createReceivableBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const {
      clinic_id,
      source_type,
      source_id,
      unit_id,
      guardian_id,
      due_date,
      competence_date,
      notes,
      lines: manualLines,
    } = parsed.data;
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
          net_amount_at_sale: subtotal,
          returned_amount: 0,
          status: 'pending',
          due_date: due_date ?? null,
          competence_date: competence_date ?? null,
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
      maybeNotifyOverdueReceivable({
        clinicId: clinic_id,
        unitId: unit_id ?? null,
        receivableId,
        guardianId: guardian_id ?? null,
        amount: subtotal,
        dueDate: due_date ?? null,
      });

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
    } else if (source_type === 'boarding_reservation') {
      const { data: b, error: bErr } = await supabaseAdmin
        .from('hub_boarding_reservations')
        .select('id, clinic_id, status, billing_waived_at')
        .eq('id', source_id!)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (bErr || !b) return res.status(404).json({ error: 'Reserva não encontrada' });
      if (!isBoardingStatusReadyForComanda(String(b.status ?? ''), { allowIncomplete: true })) {
        return res.status(409).json({ error: 'Reserva não está pronta para cobrança' });
      }
      if (b.billing_waived_at) return res.status(409).json({ error: 'Reserva marcada sem cobrança' });
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

    let built: {
      lines: ReceivableLineInsert[];
      subtotal: number;
      final_amount?: number;
      unit_id: string | null;
      guardian_id: string | null;
    };
    if (source_type === 'grooming_session') {
      built = await buildPreviewForGroomingSession(clinic_id, source_id!);
    } else if (source_type === 'encounter') {
      built = await buildPreviewForEncounter(clinic_id, source_id!);
    } else if (source_type === 'appointment') {
      built = await buildPreviewForAppointment(clinic_id, source_id!);
    } else if (source_type === 'boarding_reservation') {
      built = await buildPreviewForBoardingReservation(clinic_id, source_id!);
    } else {
      built = await buildPreviewForQuote(clinic_id, source_id!);
    }

    const finalAmount =
      'final_amount' in built && typeof built.final_amount === 'number' ? built.final_amount : built.subtotal;
    const { data: rec, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .insert({
        clinic_id,
        unit_id: built.unit_id,
        guardian_id: built.guardian_id,
        source_type,
        source_id: source_id!,
        original_amount: built.subtotal,
        final_amount: finalAmount,
        net_amount_at_sale: finalAmount,
        returned_amount: 0,
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
      try {
        await cascadeWaiveLinkedHospitalizations({
          clinicId: clinic_id,
          originType: 'encounter',
          originId: source_id,
          waivedAt: now,
          reason,
        });
      } catch (cascadeErr: unknown) {
        return res.status(500).json({ error: (cascadeErr as Error)?.message || 'Erro ao dispensar internações vinculadas' });
      }
    } else if (source_type === 'appointment') {
      const { error } = await supabaseAdmin
        .from('hub_appointments')
        .update({ billing_waived_at: now, billing_waive_reason: reason })
        .eq('id', source_id)
        .eq('clinic_id', clinic_id);
      if (error) return res.status(500).json({ error: error.message });
      try {
        await cascadeWaiveLinkedHospitalizations({
          clinicId: clinic_id,
          originType: 'appointment',
          originId: source_id,
          waivedAt: now,
          reason,
        });
      } catch (cascadeErr: unknown) {
        return res.status(500).json({ error: (cascadeErr as Error)?.message || 'Erro ao dispensar internações vinculadas' });
      }
    } else if (source_type === 'boarding_reservation') {
      const { error } = await supabaseAdmin
        .from('hub_boarding_reservations')
        .update({ billing_waived_at: now, billing_waive_reason: reason })
        .eq('id', source_id)
        .eq('clinic_id', clinic_id);
      if (error) return res.status(500).json({ error: error.message });
    } else if (source_type === 'hospitalization') {
      const { data: hosp, error: hErr } = await supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, status, billing_waived_at')
        .eq('id', source_id)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (hErr) return res.status(500).json({ error: hErr.message });
      if (!hosp) return res.status(404).json({ error: 'Internação não encontrada' });
      if (!isHospitalizationClosed(String(hosp.status))) {
        return res.status(409).json({ error: 'Só é possível dispensar cobrança após a alta da internação' });
      }
      if (hosp.billing_waived_at) {
        return res.status(409).json({ error: 'Internação já marcada sem cobrança' });
      }
      const { error } = await supabaseAdmin
        .from('hub_hospitalizations')
        .update({ billing_waived_at: now, billing_waive_reason: reason })
        .eq('id', source_id)
        .eq('clinic_id', clinic_id);
      if (error) {
        if (String(error.message || '').includes('billing_waived')) {
          return res.status(503).json({
            error: 'Colunas de waive da internação ausentes. Aplique 133_alter_hub_hospitalizations_billing.sql.',
          });
        }
        return res.status(500).json({ error: error.message });
      }
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
    payment_method: hubPaymentMethodSchema,
    installments: z.number().int().min(1).max(99).optional(),
    payment_date: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
    cash_session_id: uuidStr.optional().nullable(),
    idempotency_key: uuidStr.optional().nullable(),
    tendered_amount: z.number().positive().optional().nullable(),
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
    const {
      clinic_id,
      amount,
      payment_method,
      installments,
      payment_date,
      notes,
      cash_session_id,
      idempotency_key,
      tendered_amount,
    } = parsed.data;
    const userId = req.user?.id ?? null;

    const clinicSettings = await getOrCreateHubClinicSettings(clinic_id);
    try {
      assertPaymentMethodInList(payment_method, clinicSettings.accepted_payment_methods);
    } catch (e) {
      if (e instanceof PaymentMethodNotAcceptedError) {
        return res.status(400).json({ error: e.message });
      }
      throw e;
    }

    const { data: rec, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, clinic_id, unit_id, comanda_id, guardian_id, due_date, status, final_amount')
      .eq('id', receivableId)
      .maybeSingle();
    if (rErr || !rec || rec.clinic_id !== clinic_id) return res.status(404).json({ error: 'Recebível não encontrado' });
    if (rec.status === 'cancelled' || rec.status === 'refunded') {
      return res.status(409).json({ error: 'Recebível não aceita pagamentos neste estado' });
    }

    const cashCheck = await validatePaymentCashSession({
      clinicId: clinic_id,
      paymentMethod: payment_method,
      cashSessionId: cash_session_id ?? null,
      receivableUnitId: (rec.unit_id as string | null) ?? null,
    });
    if (!cashCheck.ok) {
      return res.status(cashCheck.status).json({ error: cashCheck.error });
    }
    const validatedCashSessionId = cashCheck.cash_session_id;

    const paidSoFar = await sumPostedPaymentsForReceivable(receivableId);
    const finalAmt = Number(rec.final_amount ?? 0);
    const remaining = round2(finalAmt - paidSoFar);
    if (round2(amount) > remaining + 0.02) {
      return res.status(400).json({ error: `Valor excede o saldo em aberto (${remaining.toFixed(2)})` });
    }

    if (payment_method === 'cash' && tendered_amount != null) {
      const tendered = round2(Number(tendered_amount));
      if (round2(amount) > tendered + 0.009) {
        return res.status(400).json({
          error: 'Valor do pagamento em dinheiro não pode exceder o valor recebido (tendered).',
        });
      }
    }

    if (payment_method === 'customer_credit') {
      const guardianId = rec.guardian_id as string | null;
      if (!guardianId) {
        return res.status(409).json({ error: 'Recebível sem tutor — não é possível pagar com crédito.' });
      }
      try {
        await consumeHubCustomerCredit({
          clinicId: clinic_id,
          guardianId,
          amount: round2(amount),
          reason: 'Pagamento com crédito do tutor',
          comandaId: (rec.comanda_id as string | null) ?? null,
          receivableId,
          createdByUserId: userId,
        });
      } catch (e) {
        if (e instanceof CustomerCreditError) {
          return res.status(e.status).json({ error: e.message });
        }
        throw e;
      }
    }

    const payAt = payment_date ?? new Date().toISOString();
    let tenderedAmount: number | null = null;
    let changeAmount: number | null = null;
    let paymentNotes = notes ?? null;
    if (payment_method === 'cash' && tendered_amount != null) {
      tenderedAmount = round2(Number(tendered_amount));
      const recorded = round2(amount);
      changeAmount = round2(Math.max(0, tenderedAmount - recorded));
      if (changeAmount > 0.009) {
        const trocoNote = `Troco R$ ${changeAmount.toFixed(2)} (recebido R$ ${tenderedAmount.toFixed(2)})`;
        paymentNotes = paymentNotes ? `${paymentNotes} | ${trocoNote}` : trocoNote;
      }
    }

    const { insertPostedPaymentWithIdempotency } = await import('./hubFinanceLedger.js');
    const inserted = await insertPostedPaymentWithIdempotency({
      clinicId: clinic_id,
      receivableId,
      cashSessionId: validatedCashSessionId,
      amount: round2(amount),
      paymentMethod: payment_method,
      installments: installments ?? 1,
      paymentDate: payAt,
      effectivePaymentDate: payAt,
      notes: paymentNotes,
      createdByUserId: userId,
      idempotencyKey: idempotency_key ?? null,
      tenderedAmount,
      changeAmount,
    });
    if (!inserted.ok) {
      return res.status(inserted.status ?? 500).json({
        error: inserted.error,
        ...(inserted.existing ? { existing_payment: inserted.existing } : {}),
      });
    }
    if (inserted.replayed) {
      const nextStatus = await recalculateReceivableFromPosted(receivableId);
      return res.status(200).json({
        payment: inserted.payment,
        receivable_status: nextStatus,
        replayed: true,
      });
    }
    const pay = inserted.payment;

    const nextStatus = await recalculateReceivableFromPosted(receivableId);
    const paid = await sumPostedPaymentsForReceivable(receivableId);

    // Encerra comanda aberta se quitada; sempre sincroniza financial_status (também se fechada).
    if (rec.comanda_id) {
      try {
        await tryAutoCloseComanda(rec.comanda_id as string, clinic_id);
      } catch (closeErr) {
        console.error('postHubFinanceReceivablePayment tryAutoCloseComanda', rec.comanda_id, closeErr);
      }
      try {
        await syncComandaFinancialAfterLedger(rec.comanda_id as string, clinic_id);
      } catch (syncErr) {
        console.error('postHubFinanceReceivablePayment syncComandaFinancial', rec.comanda_id, syncErr);
      }
    }

    if (nextStatus === 'partially_paid') {
      void notifyHubPaymentDue({
        clinicId: clinic_id,
        unitId: rec.unit_id as string | null,
        receivableId,
        guardianId: rec.guardian_id as string | null,
        amount: round2(finalAmt - paid),
        dueDate: rec.due_date as string | null,
        reason: 'partial',
      });
    }

    return res.status(201).json({ payment: pay, receivable_status: nextStatus });
  } catch (e: unknown) {
    console.error('postHubFinanceReceivablePayment', e);
    if (e instanceof FinanceLedgerError) {
      return res.status(e.status).json({ error: e.message });
    }
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
      .select(
        'id, clinic_id, name, sale_amount, cost_amount, max_sale_discount_pct, allow_price_override_on_sale, deleted_at, active',
      )
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
    const priced = validateProductSalePricing({
      item: item as {
        id: string;
        name?: string | null;
        sale_amount: number | null;
        max_sale_discount_pct: number | null;
        allow_price_override_on_sale: boolean | null;
      },
      quantity,
      unit_amount: unitSale,
      discount_amount: 0,
    });
    if (!priced.ok) return res.status(400).json({ error: priced.error });
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
          unit_cost_amount:
            item.cost_amount != null && Number.isFinite(Number(item.cost_amount))
              ? round2(Number(item.cost_amount))
              : null,
          line_total: lineTotal,
          sort_order: 9999,
        })
        .select('*')
        .single(),
    ]);
    if (lineErr || !line) return res.status(500).json({ error: lineErr?.message || 'Erro ao adicionar produto' });
    const nextSort = Number(maxRows?.[0]?.sort_order ?? 0) + 1;
    await supabaseAdmin.from('hub_receivable_lines').update({ sort_order: nextSort }).eq('id', line.id);

    const stockResult = await createSaleStockOut({
      clinicId: clinic_id,
      itemId: item_id,
      lotId: lot_id,
      qty: quantity,
      unitCost:
        item.cost_amount != null && Number.isFinite(Number(item.cost_amount))
          ? Number(item.cost_amount)
          : null,
      notes: notes ?? `Venda vinculada ao recebível ${receivableId}`,
      referenceType: 'hub_receivable_line',
      referenceId: line.id as string,
      createdBy: userId,
    });
    if ('error' in stockResult) {
      await supabaseAdmin.from('hub_receivable_lines').delete().eq('id', line.id);
      return res.status(400).json({ error: stockResult.error });
    }

    const original = round2(Number(rec.original_amount ?? 0) + lineTotal);
    const final = round2(Number(rec.final_amount ?? 0) + lineTotal);
    const { data: recMeta } = await supabaseAdmin
      .from('hub_receivables')
      .select('returned_amount, net_amount_at_sale')
      .eq('id', receivableId)
      .maybeSingle();
    const returnedAmt = Number(recMeta?.returned_amount ?? 0);
    const patch: Record<string, unknown> = { original_amount: original, final_amount: final };
    // Snapshot ainda mutável: sem devolução e ainda não congelado por pagamento.
    if (returnedAmt <= 0.009) {
      const paid = await sumPostedPaymentsForReceivable(receivableId);
      if (paid <= 0.009) patch.net_amount_at_sale = final;
    }
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('hub_receivables')
      .update(patch)
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
    // Remoção de linha = reversão comprovada de baixa indevida (não é devolução de cliente).
    if (line.hub_inventory_item_id && line.hub_inventory_lot_id && qty > 0) {
      const { restoreSaleStockIn } = await import('./hubInventoryStockUtils.js');
      const restored = await restoreSaleStockIn({
        clinicId: clinicId.data,
        itemId: line.hub_inventory_item_id as string,
        lotId: line.hub_inventory_lot_id as string,
        qty,
        referenceType: 'hub_receivable_line_removed',
        referenceId: line.id as string,
        notes: 'Reversão de produto removido de recebível',
        createdBy: req.user?.id ?? null,
      });
      if ('error' in restored) {
        return res.status(500).json({ error: restored.error });
      }
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
    const { data: recMeta } = await supabaseAdmin
      .from('hub_receivables')
      .select('returned_amount')
      .eq('id', receivableId.data)
      .maybeSingle();
    const returnedAmt = Number(recMeta?.returned_amount ?? 0);
    const patch: Record<string, unknown> = { original_amount: original, final_amount: final };
    if (returnedAmt <= 0.009) {
      const paid = await sumPostedPaymentsForReceivable(receivableId.data);
      if (paid <= 0.009) patch.net_amount_at_sale = final;
    }
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('hub_receivables')
      .update(patch)
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

const stockReturnLineSchema = z
  .object({
    line_id: uuidStr,
    qty: z.coerce.number().finite().positive().optional(),
  })
  .strict();

const reversePaymentBodySchema = z
  .object({
    clinic_id: uuidStr,
    reason: z.string().trim().min(3).max(2000),
    mode: z.enum(['payment_reversal', 'refund']).default('payment_reversal'),
    refund_method: hubPaymentMethodSchema.optional().nullable(),
    refund_effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    confirm_stock_return: z.boolean().optional().default(false),
    stock_return_condition: z.enum(['sellable', 'unsellable']).optional().nullable(),
    stock_return_lines: z.array(stockReturnLineSchema).max(200).optional().nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.confirm_stock_return && !val.stock_return_condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stock_return_condition é obrigatório quando confirm_stock_return=true',
        path: ['stock_return_condition'],
      });
    }
  });

export const postHubFinancePaymentReverse = async (req: Request, res: Response) => {
  try {
    const paymentId = uuidStr.safeParse(req.params.id);
    const parsed = reversePaymentBodySchema.safeParse(req.body);
    if (!paymentId.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const {
      clinic_id,
      reason,
      mode,
      refund_method,
      refund_effective_date,
      confirm_stock_return,
      stock_return_condition,
      stock_return_lines,
    } = parsed.data;
    const userId = req.user?.id ?? null;

    const { data: payment, error: pErr } = await supabaseAdmin
      .from('hub_payments')
      .select('id, clinic_id, receivable_id, status')
      .eq('id', paymentId.data)
      .maybeSingle();
    if (pErr || !payment || payment.clinic_id !== clinic_id) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }
    const pendingCancellation = await paymentBelongsToPendingCancellation(
      clinic_id,
      payment.receivable_id as string,
    );
    if (pendingCancellation) {
      return res.status(409).json({
        error: 'Este pagamento está em um cancelamento pendente. Resolva em Cancelamentos.',
      });
    }

    const result = await reversePaymentSoft({
      paymentId: paymentId.data,
      clinicId: clinic_id,
      userId,
      reason,
      mode: mode as PaymentReversalMode,
      refundMethod: refund_method ?? null,
      refundEffectiveDate: refund_effective_date ?? null,
      confirmStockReturn: confirm_stock_return,
      stockReturnCondition: stock_return_condition ?? undefined,
      stockReturnLines: stock_return_lines ?? undefined,
    });

    const { data: rec } = await supabaseAdmin
      .from('hub_receivables')
      .select('comanda_id')
      .eq('id', result.receivable_id)
      .maybeSingle();
    await syncComandaFinancialAfterLedger((rec?.comanda_id as string | null) ?? null, clinic_id);

    return res.json({
      ok: true,
      receivable_status: result.receivable_status,
      reversal_mode: result.reversal_mode,
      adjustment_id: result.adjustment_id,
      warning: result.warning,
      stock_restored: result.stock_restored ?? 0,
      stock_unsellable: result.stock_unsellable ?? 0,
    });
  } catch (e: unknown) {
    if (e instanceof FinanceLedgerError) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error('postHubFinancePaymentReverse', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const historicalCashBodySchema = z
  .object({
    clinic_id: uuidStr,
    amount: z.number().positive(),
    effective_payment_date: z.string().min(10),
    reason: z.string().trim().min(3).max(2000),
    notes: z.string().trim().max(2000).optional().nullable(),
    idempotency_key: uuidStr.optional().nullable(),
  })
  .strict();

export const postHubFinanceReceivableHistoricalCash = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const parsed = historicalCashBodySchema.safeParse(req.body);
    if (!idParsed.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
    }
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const result = await postHistoricalCashPayment({
      receivableId: idParsed.data,
      clinicId: parsed.data.clinic_id,
      amount: parsed.data.amount,
      effectivePaymentDate: parsed.data.effective_payment_date,
      reason: parsed.data.reason,
      userId,
      notes: parsed.data.notes ?? null,
      idempotencyKey: parsed.data.idempotency_key ?? null,
    });

    const { data: rec } = await supabaseAdmin
      .from('hub_receivables')
      .select('comanda_id')
      .eq('id', idParsed.data)
      .maybeSingle();
    if (rec?.comanda_id) {
      try {
        await tryAutoCloseComanda(rec.comanda_id as string, parsed.data.clinic_id);
      } catch (closeErr) {
        console.error('historicalCash tryAutoCloseComanda', rec.comanda_id, closeErr);
      }
      await syncComandaFinancialAfterLedger(rec.comanda_id as string, parsed.data.clinic_id);
    }

    return res.status(201).json({
      payment: result.payment,
      receivable_status: result.receivable_status,
    });
  } catch (e: unknown) {
    if (e instanceof FinanceLedgerError) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error('postHubFinanceReceivableHistoricalCash', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const listPaymentsQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** posted = elegíveis a estorno (padrão); reversed = histórico já anulado. */
    status: z.enum(['posted', 'reversed']).optional().default('posted'),
  })
  .strict();

function oneEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type PaymentListRow = {
  id: unknown;
  amount: number;
  payment_method: unknown;
  installments: number;
  payment_date: unknown;
  notes: unknown;
  cash_session_status: 'open' | 'closed' | null;
  status: 'posted' | 'reversed';
  receivable: {
    id: unknown;
    status: unknown;
    final_amount: number;
    source_type: unknown;
    comanda_id: string | null;
    guardian_name: string | null;
  } | null;
};

function mapPaymentListRow(row: Record<string, unknown>): PaymentListRow {
  const receivable = oneEmbed(row.receivable as Record<string, unknown> | Record<string, unknown>[] | null);
  const guardian = receivable
    ? oneEmbed(receivable.guardian as { full_name?: string } | { full_name?: string }[] | null)
    : null;
  const session = oneEmbed(row.cash_session as { status?: string } | { status?: string }[] | null);
  const sessionStatus = session?.status === 'open' || session?.status === 'closed' ? session.status : null;
  const payStatus = String(row.status ?? 'posted') === 'reversed' ? 'reversed' : 'posted';
  return {
    id: row.id,
    amount: Number(row.amount ?? 0),
    payment_method: row.payment_method,
    installments: Number(row.installments ?? 1),
    payment_date: row.payment_date,
    notes: row.notes ?? null,
    cash_session_status: sessionStatus,
    status: payStatus,
    receivable: receivable
      ? {
          id: receivable.id,
          status: receivable.status,
          final_amount: Number(receivable.final_amount ?? 0),
          source_type: receivable.source_type,
          comanda_id: receivable.comanda_id == null ? null : String(receivable.comanda_id),
          guardian_name: guardian?.full_name ?? null,
        }
      : null,
  };
}

/** Comandas com cancelamento operacional ainda sem decisão do financeiro. */
async function comandaIdsWithPendingCancellation(clinicId: string, comandaIds: string[]): Promise<Set<string>> {
  if (comandaIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('hub_comandas')
    .select('id')
    .eq('clinic_id', clinicId)
    .in('id', comandaIds)
    .not('cancellation_pending_at', 'is', null)
    .is('cancellation_resolved_at', null)
    .is('deleted_at', null);
  if (error) {
    if (String(error.message || '').includes('cancellation_pending')) return new Set();
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((row) => String(row.id)));
}

async function paymentBelongsToPendingCancellation(clinicId: string, receivableId: string): Promise<boolean> {
  const { data: receivable, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('comanda_id')
    .eq('id', receivableId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error || !receivable?.comanda_id) return false;
  const pending = await comandaIdsWithPendingCancellation(clinicId, [String(receivable.comanda_id)]);
  return pending.has(String(receivable.comanda_id));
}

/** Detalhe de um pagamento para o formulário de estorno (inclui fora do período da lista). */
export const getHubFinancePayment = async (req: Request, res: Response) => {
  try {
    const paymentId = uuidStr.safeParse(req.params.id);
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!paymentId.success || !clinicId.success) {
      return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    }
    const { data: row, error } = await supabaseAdmin
      .from('hub_payments')
      .select(
        `
        id, amount, payment_method, installments, payment_date, notes, status, clinic_id,
        cash_session:hub_cash_sessions(status),
        receivable:hub_receivables(
          id, unit_id, status, final_amount, source_type, comanda_id, deleted_at,
          guardian:hub_guardians(full_name)
        )
      `,
      )
      .eq('id', paymentId.data)
      .eq('clinic_id', clinicId.data)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: 'Pagamento não encontrado' });
    const receivable = oneEmbed(
      (row as { receivable?: Record<string, unknown> | Record<string, unknown>[] | null }).receivable ??
        null,
    );
    if (receivable?.deleted_at) return res.status(404).json({ error: 'Pagamento não encontrado' });
    return res.json({ payment: mapPaymentListRow(row as Record<string, unknown>) });
  } catch (e: unknown) {
    console.error('getHubFinancePayment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const listHubFinancePayments = async (req: Request, res: Response) => {
  try {
    const parsed = listPaymentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
    }
    const { clinic_id, unit_id, from, to, status: paymentStatus } = parsed.data;
    const select = `
      id, amount, payment_method, installments, payment_date, notes, status,
      cash_session:hub_cash_sessions(status),
      receivable:hub_receivables!inner(
        id, unit_id, status, final_amount, source_type, comanda_id, deleted_at,
        guardian:hub_guardians(full_name)
      )
    `;

    const build = (matchNullUnit: boolean) => {
      let q = supabaseAdmin
        .from('hub_payments')
        .select(select)
        .eq('clinic_id', clinic_id)
        .eq('status', paymentStatus)
        .order('payment_date', { ascending: false })
        .limit(300);
      q = matchNullUnit
        ? q.is('receivable.unit_id', null)
        : q.eq('receivable.unit_id', unit_id);
      if (from) q = q.gte('payment_date', `${from}T00:00:00.000-03:00`);
      if (to) q = q.lte('payment_date', `${to}T23:59:59.999-03:00`);
      return q;
    };

    const [byUnit, legacy] = await Promise.all([build(false), build(true)]);
    let rawRows: Array<Record<string, unknown>> = [];
    if (byUnit.error || legacy.error) {
      let fallback = supabaseAdmin
        .from('hub_payments')
        .select(select)
        .eq('clinic_id', clinic_id)
        .eq('status', paymentStatus)
        .order('payment_date', { ascending: false })
        .limit(400);
      if (from) fallback = fallback.gte('payment_date', `${from}T00:00:00.000-03:00`);
      if (to) fallback = fallback.lte('payment_date', `${to}T23:59:59.999-03:00`);
      const recovered = await fallback;
      if (recovered.error) {
        return res.status(500).json({ error: (byUnit.error ?? legacy.error ?? recovered.error).message });
      }
      rawRows = ((recovered.data ?? []) as Array<Record<string, unknown>>).filter((row) => {
        const receivable = oneEmbed(row.receivable as Record<string, unknown> | Record<string, unknown>[] | null);
        const rowUnit = receivable?.unit_id == null ? null : String(receivable.unit_id);
        return rowUnit == null || rowUnit === unit_id;
      });
    } else {
      rawRows = [...(byUnit.data ?? []), ...(legacy.data ?? [])] as Array<Record<string, unknown>>;
    }

    const seen = new Set<string>();
    const payments = rawRows
      .filter((row) => {
        const id = String(row.id ?? '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        const receivable = oneEmbed(row.receivable as Record<string, unknown> | Record<string, unknown>[] | null);
        return !receivable?.deleted_at;
      })
      .sort((a, b) => String(b.payment_date ?? '').localeCompare(String(a.payment_date ?? '')))
      .map(mapPaymentListRow);

    // Na lista de ação (posted), esconde pagamentos de cancelamento operacional ainda pendente.
    // No histórico (reversed) mostra tudo do período.
    let visiblePayments = payments;
    if (paymentStatus === 'posted') {
      const comandaIds = [
        ...new Set(
          payments
            .map((payment) => payment.receivable?.comanda_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const pendingComandaIds = await comandaIdsWithPendingCancellation(clinic_id, comandaIds);
      if (pendingComandaIds.size > 0) {
        visiblePayments = payments.filter((payment) => {
          const comandaId = payment.receivable?.comanda_id;
          return !comandaId || !pendingComandaIds.has(comandaId);
        });
      }
    }

    return res.json({ payments: visiblePayments });
  } catch (e: unknown) {
    console.error('listHubFinancePayments', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const cancelReceivableBodySchema = z
  .object({
    clinic_id: uuidStr,
    reason: z.string().trim().min(3).max(2000),
    confirm_stock_return: z.boolean().optional().default(false),
    stock_return_condition: z.enum(['sellable', 'unsellable']).optional().nullable(),
    stock_return_lines: z.array(stockReturnLineSchema).max(200).optional().nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.confirm_stock_return && !val.stock_return_condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stock_return_condition é obrigatório quando confirm_stock_return=true',
        path: ['stock_return_condition'],
      });
    }
  });

export const postHubFinanceReceivableCancel = async (req: Request, res: Response) => {
  try {
    const receivableId = uuidStr.safeParse(req.params.id);
    const parsed = cancelReceivableBodySchema.safeParse(req.body);
    if (!receivableId.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const {
      clinic_id,
      reason,
      confirm_stock_return,
      stock_return_condition,
      stock_return_lines,
    } = parsed.data;
    const { data: rec, error: rErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, clinic_id, status, final_amount, lines:hub_receivable_lines(*)')
      .eq('id', receivableId.data)
      .maybeSingle();
    if (rErr || !rec || rec.clinic_id !== clinic_id) return res.status(404).json({ error: 'Recebível não encontrado' });
    if (rec.status === 'cancelled') return res.json({ receivable: rec });
    const { data: payments } = await supabaseAdmin
      .from('hub_payments')
      .select('id')
      .eq('receivable_id', receivableId.data)
      .eq('status', 'posted');
    if ((payments ?? []).length > 0) {
      return res.status(409).json({ error: 'Estorne os pagamentos antes de cancelar o recebível' });
    }

    let stockRestored = 0;
    let stockUnsellable = 0;
    let stockWarning: string | null =
      'Estoque não foi alterado. Cancelamento financeiro não presume devolução física.';
    if (confirm_stock_return) {
      const nestedLines = (rec.lines ?? []) as Array<Record<string, unknown>>;
      const stock = await restoreProductStockForReceivableLines({
        clinicId: clinic_id,
        receivableId: receivableId.data,
        notes: `Devolução física confirmada no cancelamento: ${reason.trim()}`,
        createdBy: req.user?.id ?? null,
        lines: nestedLines.length > 0 ? nestedLines : undefined,
        condition: stock_return_condition ?? 'sellable',
        lineSpecs: stock_return_lines ?? undefined,
      });
      if (stock.errors.length) {
        return res.status(500).json({ error: `Falha ao processar devolução de estoque: ${stock.errors[0]}` });
      }
      stockRestored = stock.restored;
      stockUnsellable = stock.unsellable;
      if (stock_return_condition === 'unsellable') {
        stockWarning =
          stockUnsellable > 0
            ? `Devolução sem reentrada ao disponível (${stockUnsellable} linha(s) sem condição de revenda).`
            : 'Devolução sem condição de revenda: estoque disponível inalterado.';
      } else {
        stockWarning = `Estoque reentrado (${stockRestored} nova(s), ${stock.skipped} já registrada(s)).`;
      }
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
    try {
      const { syncPackageBalancesForReceivable } = await import('./hubPackagesService.js');
      await syncPackageBalancesForReceivable(receivableId.data);
    } catch (syncErr) {
      const msg = (syncErr as Error)?.message ?? '';
      if (msg.startsWith('PACKAGE_BALANCE_HAS_REDEMPTIONS')) {
        await supabaseAdmin
          .from('hub_receivables')
          .update({ status: rec.status })
          .eq('id', receivableId.data);
        return res.status(409).json({
          error:
            'Não é possível cancelar: o pacote já teve sessões consumidas. Estorne os resgates antes.',
        });
      }
      throw syncErr;
    }
    return res.json({
      receivable: updated,
      stock_restored: stockRestored,
      stock_unsellable: stockUnsellable,
      warning: stockWarning,
    });
  } catch (e: unknown) {
    console.error('postHubFinanceReceivableCancel', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const productReturnBodySchema = z
  .object({
    clinic_id: uuidStr,
    reason: z.string().trim().min(3).max(2000),
    stock_return_condition: z.enum(['sellable', 'unsellable']),
    stock_return_lines: z.array(stockReturnLineSchema).min(1).max(200),
    /** Obrigatório somente quando houver valor financeiro a devolver. */
    refund_method: hubPaymentMethodSchema.optional().nullable(),
    refund_effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    /** UUID por abertura do formulário; reutilizar em retry da mesma operação. */
    idempotency_key: uuidStr,
  })
  .strict();

/**
 * Devolução física por item (parcial ou total) via RPC atômica.
 * Comercial devolvido ≠ reembolso financeiro (matriz pago × líquido vigente).
 */
export const postHubFinanceReceivableProductReturn = async (req: Request, res: Response) => {
  try {
    const receivableId = uuidStr.safeParse(req.params.id);
    const parsed = productReturnBodySchema.safeParse(req.body);
    if (!receivableId.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos (idempotency_key UUID obrigatória)' });
    }
    const {
      clinic_id,
      reason,
      stock_return_condition,
      stock_return_lines,
      refund_method,
      refund_effective_date,
      idempotency_key,
    } = parsed.data;

    const result = await returnReceivableProductLines({
      clinicId: clinic_id,
      receivableId: receivableId.data,
      userId: req.user?.id ?? null,
      reason,
      condition: stock_return_condition,
      lineSpecs: stock_return_lines,
      refundMethod: refund_method ?? null,
      refundEffectiveDate: refund_effective_date ?? null,
      idempotencyKey: idempotency_key,
    });

    const detail = await buildReceivableDetail(receivableId.data, clinic_id);
    return res.json({
      ok: true,
      receivable: detail,
      receivable_status: result.receivable_status,
      refund_amount: result.refund_amount,
      commercial_returned: result.commercial_returned ?? null,
      balance_due: result.balance_due ?? null,
      adjustment_id: result.adjustment_id,
      stock_restored: result.stock_restored,
      stock_unsellable: result.stock_unsellable,
      stock_return_status: detail?.stock_return_status ?? null,
      warning: result.warning,
      replayed: result.replayed ?? false,
    });
  } catch (e: unknown) {
    if (e instanceof FinanceLedgerError) {
      return res.status(e.status).json({ error: e.message });
    }
    console.error('postHubFinanceReceivableProductReturn', e);
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

  let rawLines = (rec.lines ?? []) as Record<string, unknown>[];
  if (rawLines.length === 0) {
    const { data: flatLines, error: flatErr } = await supabaseAdmin
      .from('hub_receivable_lines')
      .select('*')
      .eq('receivable_id', receivableId)
      .eq('clinic_id', clinicId);
    if (flatErr) throw new Error(flatErr.message);
    rawLines = (flatLines ?? []) as Record<string, unknown>[];
  }
  const lines = await enrichReceivableLines(rawLines);
  const [{ data: guardian }, { data: unit }, { data: payments }, { data: adjustments }, { data: productReturns }, source] =
    await Promise.all([
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
        .select('*, cash_session:hub_cash_sessions(status)')
        .eq('receivable_id', receivableId)
        .eq('clinic_id', clinicId)
        .order('payment_date', { ascending: false }),
      supabaseAdmin
        .from('hub_financial_adjustments')
        .select('*')
        .eq('receivable_id', receivableId)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('hub_product_return_events')
        .select('id, receivable_line_id, item_id, lot_id, qty, condition, reason, created_by, created_at')
        .eq('receivable_id', receivableId)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .then((r) => {
          // Tabela pode não existir em ambientes sem migration 162.
          if (r.error && /does not exist|schema cache|42P01/i.test(String(r.error.message))) {
            return { data: [] as Record<string, unknown>[] };
          }
          if (r.error) throw new Error(r.error.message);
          return r;
        }),
      loadReceivableSourceDetails(rec as Record<string, unknown>),
    ]);

  const paymentRows: Array<Record<string, unknown>> = ((payments ?? []) as Array<Record<string, unknown>>).map(
    (row) => {
      const session = oneEmbed(row.cash_session as { status?: string } | { status?: string }[] | null);
      const cash_session_status =
        session?.status === 'open' || session?.status === 'closed' ? session.status : null;
      return {
        ...row,
        cash_session: undefined,
        cash_session_status,
      };
    },
  );
  const paidAmount = round2(
    paymentRows
      .filter((row) => String(row.status ?? 'posted') === 'posted')
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const finalAmount = Number(rec.final_amount ?? 0);
  const productLineIds = (lines as Array<Record<string, unknown>>)
    .filter((l) => isProductStockLine(l))
    .map((l) => String(l.id));
  const stock_return_status = computeStockReturnStatus({
    productLineIds,
    returns: ((productReturns ?? []) as Array<Record<string, unknown>>).map((r) => ({
      receivable_line_id: String(r.receivable_line_id),
      condition: String(r.condition ?? ''),
    })),
    receivableStatus: String(rec.status ?? ''),
  });
  return {
    ...rec,
    lines,
    guardian,
    unit,
    source,
    payments: paymentRows,
    adjustments: adjustments ?? [],
    product_returns: productReturns ?? [],
    stock_return_status,
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
    const { clinic_id, unit_id, opening_balance, opened_by_staff_id: bodyStaffId } = parsed.data;

    // Resolve o profissional vinculado ao usuário autenticado, se não informado no body
    let opened_by_staff_id: string | null = bodyStaffId ?? null;
    if (!opened_by_staff_id && req.user?.id) {
      const { data: clinicUser } = await supabaseAdmin
        .from('clinic_users')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('user_id', req.user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (clinicUser?.id) {
        const { data: staffRow } = await supabaseAdmin
          .from('hub_staff_members')
          .select('id')
          .eq('clinic_id', clinic_id)
          .eq('clinic_user_id', clinicUser.id)
          .is('deleted_at', null)
          .maybeSingle();
        opened_by_staff_id = (staffRow?.id as string | null) ?? null;
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id, opened_at')
      .eq('unit_id', unit_id)
      .eq('status', 'open')
      .maybeSingle();
    if (existing) {
      const openedAtDate = existing.opened_at
        ? new Date(existing.opened_at as string).toISOString().slice(0, 10)
        : null;
      const todayYmd = new Date().toISOString().slice(0, 10);
      const isPreviousDay = openedAtDate && openedAtDate < todayYmd;
      return res.status(409).json({
        error: 'Já existe caixa aberto nesta unidade',
        previous_session_id: existing.id,
        is_previous_day: isPreviousDay ?? false,
      });
    }

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
    const result = await closeCashSession({
      sessionId: idParsed.data,
      clinicId: clinic_id,
      closingBalance: closing_balance,
      autoClosed: false,
      notes: notes ?? null,
      actorUserId: req.user?.id ?? null,
      abortOnHandoffErrors: false,
    });
    return res.json({
      cash_session: result.cash_session,
      auto_handoff_count: result.auto_handoff_count,
      auto_handoff_errors: result.auto_handoff_errors,
    });
  } catch (e: unknown) {
    const status = Number((e as { statusCode?: number })?.statusCode);
    if (status === 404) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (status === 409) return res.status(409).json({ error: (e as Error).message || 'Caixa já fechado' });
    console.error('postHubFinanceCashSessionClose', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const autoCloseOverdueSchema = z
  .object({
    dry_run: z.boolean().optional(),
    clinic_id: uuidStr.optional(),
  })
  .strict();

/**
 * POST /finance/cash-sessions/auto-close-overdue
 * Job de meia-noite: fecha sessões open com opened_at em dia civil SP anterior a hoje.
 * Auth: CRON_SECRET (Bearer ou X-Cron-Secret). clinic_id só fora de production.
 */
export const postHubFinanceCashSessionsAutoCloseOverdue = async (req: Request, res: Response) => {
  try {
    const provided = extractCronSecretFromRequest(req.headers as {
      authorization?: string;
      'x-cron-secret'?: string;
    });
    const expected = process.env.CRON_SECRET;
    if (!verifyCronSecret(provided, expected)) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const parsed = autoCloseOverdueSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    if (parsed.data.clinic_id && !isCronClinicFilterAllowed(process.env.NODE_ENV)) {
      return res.status(400).json({
        error: 'clinic_id não é permitido em production; o job fecha globalmente',
      });
    }

    const result = await runAutoCloseOverdueJob({
      dryRun: parsed.data.dry_run ?? false,
      clinicId: parsed.data.clinic_id ?? null,
    });
    return res.json(result);
  } catch (e: unknown) {
    console.error('postHubFinanceCashSessionsAutoCloseOverdue', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/**
 * GET /finance/cash-sessions/status
 * Endpoint leve que agrega status do caixa + contagem de pendências em uma única chamada.
 * Usado pelo HubCashSessionContext para polling periódico no sidebar e no guard de saída.
 * Contagem sem montar preview/valores (includeAmounts: false) para evitar N+1.
 */
export const getHubFinanceCashSessionStatus = async (req: Request, res: Response) => {
  try {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    const unitParsed = uuidStr.safeParse(req.query.unit_id);
    if (!clinicParsed.success || !unitParsed.success) {
      return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
    }
    const clinic_id = clinicParsed.data;
    const unit_id = unitParsed.data;

    const keys = await fetchActiveReceivableKeys(clinic_id).catch(() => new Set<string>());
    const [cashSessionRes, pendingBillingResult, openComandasRes] = await Promise.all([
      supabaseAdmin
        .from('hub_cash_sessions')
        .select('id, status, opened_at, opening_balance, closed_at')
        .eq('clinic_id', clinic_id)
        .eq('unit_id', unit_id)
        .eq('status', 'open')
        .maybeSingle(),
      collectUnbilledItems(clinic_id, unit_id, keys, { includeAmounts: false }).catch(
        () => [] as unknown[],
      ),
      supabaseAdmin
        .from('hub_comandas')
        .select('id, total_amount')
        .eq('clinic_id', clinic_id)
        .eq('unit_id', unit_id)
        .eq('status', 'aberta')
        .is('finance_handoff_at', null),
    ]);

    const openComandasRows = openComandasRes.data;
    const openComandasCount = (openComandasRows ?? []).length;
    const openComandasTotal = round2(
      (openComandasRows ?? []).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
    );

    return res.json({
      cash_session: cashSessionRes.data ?? null,
      pending_billing_count: pendingBillingResult.length,
      open_comandas_count: openComandasCount,
      open_comandas_total: openComandasTotal,
    });
  } catch (e: unknown) {
    console.error('getHubFinanceCashSessionStatus', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const handoffPendingBodySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  })
  .strict();

/**
 * POST /finance/handoff-pending
 * Envia em uma chamada todas as comandas abertas da unidade ao financeiro (leave_pending completo).
 */
export const postHubFinanceHandoffPending = async (req: Request, res: Response) => {
  try {
    const parsed = handoffPendingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, unit_id, due_date } = parsed.data;
    const dueDate = due_date || paymentYmdSaoPaulo(new Date().toISOString());
    const handoff = await leavePendingHandoffOpenComandasForUnit(clinic_id, unit_id, {
      dueDate,
      userId: req.user?.id ?? null,
    });
    const hasErrors = handoff.errors.length > 0;
    return res.status(hasErrors ? 207 : 200).json({
      handoff_count: handoff.handoff_count,
      skipped_count: handoff.skipped_count,
      results: handoff.results,
      errors: handoff.errors,
      partial_errors: hasErrors,
    });
  } catch (e: unknown) {
    console.error('postHubFinanceHandoffPending', e);
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
        'id, opened_at, closed_at, opening_balance, closing_balance, expected_balance, difference_amount, status, notes, auto_closed, opened_by_staff_id, opened_by_staff:hub_staff_members!opened_by_staff_id(id, full_name, display_name)'
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
      .select('*, opened_by_staff:hub_staff_members!opened_by_staff_id(id, full_name, display_name)')
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

    const sessionClosed = String(session.status) === 'closed';

    const [
      { data: payments, error: pErr },
      { data: allPayments, error: allPErr },
      { data: allPaymentsDetailed, error: allDetErr },
      { data: movements, error: mErr },
      { data: postCloseRows, error: postCloseErr },
    ] = await Promise.all([
      supabaseAdmin
        .from('hub_payments')
        .select('*, receivable:hub_receivables(id, comanda_id, source_type, source_id, guardian_id, final_amount, status)')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .eq('payment_method', 'cash')
        .eq('status', 'posted')
        .eq('posting_kind', 'operational')
        .order('payment_date', { ascending: false }),
      supabaseAdmin
        .from('hub_payments')
        .select('payment_method, amount, card_fee_amount, net_amount')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .eq('status', 'posted'),
      supabaseAdmin
        .from('hub_payments')
        .select('*, receivable:hub_receivables(id, comanda_id, source_type, source_id, guardian_id, final_amount, status)')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .eq('status', 'posted')
        .order('payment_date', { ascending: false }),
      supabaseAdmin
        .from('hub_cash_movements')
        .select('*')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('hub_cash_session_post_close_adjustments')
        .select('*')
        .eq('clinic_id', clinicId.data)
        .eq('cash_session_id', sessionId.data)
        .order('created_at', { ascending: false }),
    ]);
    if (pErr) return res.status(500).json({ error: pErr.message });
    if (allPErr) return res.status(500).json({ error: allPErr.message });
    if (allDetErr) return res.status(500).json({ error: allDetErr.message });
    if (mErr) return res.status(500).json({ error: mErr.message });
    // Tabela pode não existir ainda em ambientes sem migration 137
    const postCloseAdjustments = postCloseErr ? [] : postCloseRows ?? [];

    // Enrich payments with comanda origin + product/service composition for Caixa history.
    const enrichPaymentsWithComandaContext = async <T extends { receivable?: unknown }>(
      rows: T[] | null | undefined,
    ): Promise<T[]> => {
      const list = rows ?? [];
      if (!list.length) return list;
      const comandaIds = Array.from(
        new Set(
          list
            .map((row) => {
              const receivable = row.receivable as { comanda_id?: string | null } | null | undefined;
              return receivable?.comanda_id ? String(receivable.comanda_id) : '';
            })
            .filter(Boolean),
        ),
      );
      if (!comandaIds.length) return list;

      const [{ data: comandas }, { data: items }] = await Promise.all([
        supabaseAdmin.from('hub_comandas').select('id, origin_type').in('id', comandaIds),
        supabaseAdmin.from('hub_comanda_items').select('comanda_id, item_kind').in('comanda_id', comandaIds),
      ]);

      const originByComanda = new Map<string, string>();
      for (const c of comandas ?? []) {
        if (c?.id) originByComanda.set(String(c.id), String(c.origin_type ?? 'manual'));
      }
      const compositionByComanda = new Map<string, { has_product: boolean; has_service: boolean }>();
      for (const it of items ?? []) {
        const cid = String(it?.comanda_id ?? '');
        if (!cid) continue;
        const prev = compositionByComanda.get(cid) ?? { has_product: false, has_service: false };
        const kind = String(it?.item_kind ?? '');
        if (kind === 'product') prev.has_product = true;
        else if (kind === 'service' || kind === 'fee') prev.has_service = true;
        compositionByComanda.set(cid, prev);
      }

      return list.map((row) => {
        const receivable = row.receivable as Record<string, unknown> | null | undefined;
        if (!receivable?.comanda_id) return row;
        const cid = String(receivable.comanda_id);
        const composition = compositionByComanda.get(cid) ?? { has_product: false, has_service: false };
        return {
          ...row,
          receivable: {
            ...receivable,
            comanda_origin_type: originByComanda.get(cid) ?? null,
            has_product: composition.has_product,
            has_service: composition.has_service,
          },
        };
      });
    };

    const paymentsEnriched = await enrichPaymentsWithComandaContext(payments);
    const allPaymentsDetailedEnriched = await enrichPaymentsWithComandaContext(allPaymentsDetailed);

    const cashInBase = round2((paymentsEnriched ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
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
    // Sessão fechada: snapshot congelado; aberta: cálculo ao vivo.
    const expectedBalance = sessionClosed
      ? round2(Number(session.expected_balance ?? openingBalance + cashIn + deposits - withdrawals))
      : round2(openingBalance + cashIn + deposits - withdrawals);

    const totalsMap = new Map<string, number>();
    for (const p of allPayments ?? []) {
      const method = String(p.payment_method ?? 'outros');
      totalsMap.set(method, round2((totalsMap.get(method) ?? 0) + Number(p.amount ?? 0)));
    }
    const totals_by_method = Object.fromEntries(totalsMap.entries());

    const cardFeeTotals = aggregateCardFeeTotals(
      (allPayments ?? []).map((p) => ({
        payment_method: String(p.payment_method ?? ''),
        amount: Number(p.amount ?? 0),
        card_fee_amount:
          (p as { card_fee_amount?: unknown }).card_fee_amount == null ||
          !Number.isFinite(Number((p as { card_fee_amount?: unknown }).card_fee_amount))
            ? null
            : Number((p as { card_fee_amount?: unknown }).card_fee_amount),
        net_amount:
          (p as { net_amount?: unknown }).net_amount == null ||
          !Number.isFinite(Number((p as { net_amount?: unknown }).net_amount))
            ? null
            : Number((p as { net_amount?: unknown }).net_amount),
      })),
    );

    return res.json({
      cash_session: session,
      payments: paymentsEnriched,
      all_payments: allPaymentsDetailedEnriched,
      movements: movements ?? [],
      post_close_adjustments: postCloseAdjustments,
      summary: {
        opening_balance: round2(openingBalance),
        cash_payments_total: cashIn,
        cash_payments_from_receivables: cashInBase,
        credit_cash_in_total: creditCashIn,
        deposits_total: deposits,
        withdrawals_total: withdrawals,
        expected_balance: expectedBalance,
        closing_balance: sessionClosed ? round2(Number(session.closing_balance ?? 0)) : null,
        difference_amount: sessionClosed ? round2(Number(session.difference_amount ?? 0)) : null,
        snapshot_frozen: sessionClosed,
        totals_by_method,
        card_gross_total: cardFeeTotals.card_gross_total,
        card_fee_total: cardFeeTotals.card_fee_total,
        card_net_total: cardFeeTotals.card_net_total,
        card_without_fee_gross_total: cardFeeTotals.card_without_fee_gross_total,
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
  /** Para `hospitalization`: origem da comanda (encounter/appointment). */
  billing_origin_type?: 'encounter' | 'appointment' | null;
  billing_origin_id?: string | null;
};

async function fetchBilledOriginKeysFromComandas(clinicId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const { data: comandas, error: cErr } = await supabaseAdmin
    .from('hub_comandas')
    .select('id, origin_type, origin_id, status')
    .eq('clinic_id', clinicId)
    .neq('status', 'cancelada')
    .is('deleted_at', null)
    .not('origin_id', 'is', null);
  if (cErr) throw new Error(cErr.message);
  if (!comandas?.length) return keys;

  const comandaIds = comandas.map((c) => c.id as string);
  const { data: receivables, error: rErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('comanda_id, status')
    .eq('clinic_id', clinicId)
    .in('comanda_id', comandaIds)
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (rErr) throw new Error(rErr.message);

  const billedComandaIds = new Set(
    (receivables ?? []).map((r) => r.comanda_id as string).filter(Boolean)
  );

  for (const c of comandas) {
    // Fechada sem recebível = cobertura total (pacote/desconto) — também conta como cobrada.
    if (billedComandaIds.has(c.id as string) || String(c.status) === 'fechada') {
      keys.add(`${c.origin_type as string}:${c.origin_id as string}`);
    }
  }
  const { expandBoardingAppointmentOriginKeys } = await import('./boardingOriginKeys');
  return expandBoardingAppointmentOriginKeys(clinicId, keys);
}

async function collectUnbilledItems(
  clinicId: string,
  unitId: string | undefined,
  keys: Set<string>,
  opts?: { includeAmounts?: boolean },
): Promise<UnbilledItem[]> {
  // Quando false, pula buildPreview/loadHospitalization (N+1) — só conta itens.
  const includeAmounts = opts?.includeAmounts !== false;
  const items: UnbilledItem[] = [];
  let comandaOpenKeys: Set<string>;
  let billedViaComandaKeys: Set<string>;
  try {
    comandaOpenKeys = await fetchOpenComandaOriginKeysExported(clinicId);
    billedViaComandaKeys = await fetchBilledOriginKeysFromComandas(clinicId);
  } catch {
    comandaOpenKeys = new Set();
    billedViaComandaKeys = new Set();
  }

  const unbilledBoardingCtx = {
    activeReceivableKeys: keys,
    comandaOpenKeys,
    billedViaComandaKeys,
  };

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
    if (billedViaComandaKeys.has(`grooming_session:${row.id}`)) continue;
    const apptId = row.hub_appointment_id as string | null | undefined;
    if (apptId && comandaOpenKeys.has(`appointment:${apptId}`)) continue;
    if (apptId && billedViaComandaKeys.has(`appointment:${apptId}`)) continue;
    const estimated_amount = includeAmounts
      ? (await buildPreviewForGroomingSession(clinicId, row.id as string)).subtotal
      : 0;
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
      estimated_amount,
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
    if (billedViaComandaKeys.has(`encounter:${row.id}`)) continue;
    const apptIdEnc = row.hub_appointment_id as string | null | undefined;
    if (apptIdEnc && comandaOpenKeys.has(`appointment:${apptIdEnc}`)) continue;
    if (apptIdEnc && billedViaComandaKeys.has(`appointment:${apptIdEnc}`)) continue;
    const estimated_amount = includeAmounts
      ? (await buildPreviewForEncounter(clinicId, row.id as string)).subtotal
      : 0;
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
      estimated_amount,
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
    if (billedViaComandaKeys.has(`quote:${row.id}`)) continue;
    const estimated_amount = includeAmounts
      ? (await buildPreviewForQuote(clinicId, row.id as string)).final_amount
      : Number(row.total_amount ?? 0);
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
      estimated_amount,
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
    const [{ data: encOps }, { data: groomOps }, { data: boardingOps }] = await Promise.all([
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
      supabaseAdmin
        .from('hub_boarding_reservations')
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
    for (const row of boardingOps ?? []) {
      if (row.hub_appointment_id) apptIdsWithOperation.add(row.hub_appointment_id as string);
    }
  }
  for (const row of apptRows ?? []) {
    const id = row.id as string;
    if (keys.has(`appointment:${id}`)) continue;
    if (comandaOpenKeys.has(`appointment:${id}`)) continue;
    if (billedViaComandaKeys.has(`appointment:${id}`)) continue;
    if (apptIdsWithOperation.has(id)) continue;
    const estimated_amount = includeAmounts
      ? (await buildPreviewForAppointment(clinicId, id)).subtotal
      : 0;
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
      estimated_amount,
      operational_status: String(row.status),
    });
  }

  let bq = supabaseAdmin
    .from('hub_boarding_reservations')
    .select(
      `
      id, unit_id, checked_out_at, expected_check_out, expected_check_in, checked_in_at,
      guardian_id, pet_id, mode, status, daily_rate_cents, billing_waived_at, deleted_at,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `
    )
    .eq('clinic_id', clinicId)
    .eq('status', 'checked_out')
    .is('deleted_at', null)
    .is('billing_waived_at', null)
    .order('checked_out_at', { ascending: false })
    .limit(200);
  if (unitId) bq = bq.eq('unit_id', unitId);
  const { data: boardingRows, error: bErr } = await bq;
  if (bErr) throw new Error(bErr.message);
  const boardingIds = (boardingRows ?? []).map((row) => row.id as string);
  const extrasByReservation = new Map<string, BoardingExtraInput[]>();
  if (boardingIds.length > 0) {
    const { data: extraRows } = await supabaseAdmin
      .from('hub_boarding_extras')
      .select(
        'id, hub_boarding_reservation_id, hub_service_type_id, description, quantity, unit_amount_cents, service_date, deleted_at'
      )
      .eq('clinic_id', clinicId)
      .in('hub_boarding_reservation_id', boardingIds)
      .is('deleted_at', null);
    for (const ex of extraRows ?? []) {
      const rid = ex.hub_boarding_reservation_id as string;
      const list = extrasByReservation.get(rid) ?? [];
      list.push({
        id: ex.id as string,
        hub_service_type_id: (ex.hub_service_type_id as string | null) ?? null,
        description: String(ex.description ?? 'Adicional'),
        quantity: Number(ex.quantity) || 0,
        unit_amount_cents: Number(ex.unit_amount_cents) || 0,
        service_date: (ex.service_date as string | null) ?? null,
        deleted_at: (ex.deleted_at as string | null) ?? null,
      });
      extrasByReservation.set(rid, list);
    }
  }
  for (const row of boardingRows ?? []) {
    const reservation = {
      id: row.id as string,
      mode: row.mode as string,
      status: row.status as string,
      expected_check_in: row.expected_check_in as string | null,
      expected_check_out: row.expected_check_out as string | null,
      checked_in_at: row.checked_in_at as string | null,
      checked_out_at: row.checked_out_at as string | null,
      daily_rate_cents: row.daily_rate_cents as number | null,
      billing_waived_at: row.billing_waived_at as string | null,
      deleted_at: row.deleted_at as string | null,
    };
    if (!shouldIncludeInUnbilledBoarding(reservation, unbilledBoardingCtx)) continue;

    const modeLabel = row.mode === 'hotel' ? 'Hotel' : 'Creche';
    const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
    const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
    const checkOut =
      (row.checked_out_at as string | null) ?? (row.expected_check_out as string | null);
    items.push({
      source_type: 'boarding_reservation',
      source_id: row.id as string,
      origin_label: `Hotel & Creche (${modeLabel})`,
      completed_at: checkOut,
      unit_id: (row.unit_id as string) ?? null,
      guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
      pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
      staff: null,
      estimated_amount: estimateBoardingUnbilledAmount(
        reservation,
        extrasByReservation.get(row.id as string) ?? [],
      ),
      operational_status: 'checked_out',
    });
  }

  // C — Internações encerradas como origem explícita na fila sem cobrança.
  {
    let hq = supabaseAdmin
      .from('hub_hospitalizations')
      .select(
        `
        id, unit_id, status, discharged_at, admitted_at, guardian_id, pet_id,
        hub_encounter_id, hub_appointment_id, daily_hub_service_type_id, daily_unit_amount,
        billing_waived_at, deleted_at,
        pet:hub_pets(id, name),
        guardian:hub_guardians(id, full_name)
      `
      )
      .eq('clinic_id', clinicId)
      .in('status', [...HOSPITALIZATION_CLOSED_STATUSES])
      .is('deleted_at', null)
      .is('billing_waived_at', null)
      .not('discharged_at', 'is', null)
      .order('discharged_at', { ascending: false })
      .limit(200);
    if (unitId) hq = hq.eq('unit_id', unitId);
    const { data: hospRows, error: hErr } = await hq;
    if (hErr && !String(hErr.message || '').includes('hub_hospitalizations')) throw new Error(hErr.message);

    const alreadyListedBillingOrigins = new Set(
      items
        .filter((i) => i.source_type === 'encounter' || i.source_type === 'appointment')
        .map((i) => `${i.source_type}:${i.source_id}`),
    );
    // Também considera billing_origin já emitido por outra internação.
    for (const i of items) {
      if (i.billing_origin_type && i.billing_origin_id) {
        alreadyListedBillingOrigins.add(`${i.billing_origin_type}:${i.billing_origin_id}`);
      }
    }

    const unbilledHospCtx = {
      activeReceivableKeys: keys,
      comandaOpenKeys,
      billedViaComandaKeys,
      alreadyListedBillingOrigins,
    };

    for (const row of hospRows ?? []) {
      const hospInput = {
        id: row.id as string,
        status: String(row.status ?? ''),
        billing_waived_at: (row.billing_waived_at as string | null) ?? null,
        deleted_at: (row.deleted_at as string | null) ?? null,
        hub_encounter_id: (row.hub_encounter_id as string | null) ?? null,
        hub_appointment_id: (row.hub_appointment_id as string | null) ?? null,
      };
      if (!shouldIncludeInUnbilledHospitalization(hospInput, unbilledHospCtx)) continue;

      const origin = resolveHospitalizationBillingOrigin(hospInput);
      if (!origin) continue;

      let estimated_amount = 0;
      if (includeAmounts) {
        const hosp = await loadHospitalizationComandaItems({
          clinicId,
          hospitalizationId: row.id as string,
          encounterId: origin.origin_type === 'encounter' ? origin.origin_id : null,
          appointmentId: origin.origin_type === 'appointment' ? origin.origin_id : hospInput.hub_appointment_id,
          defaultPetId: (row.pet_id as string | null) ?? null,
        });
        if (hosp.subtotal <= 0.009 && hosp.items.length === 0) continue;
        estimated_amount = hosp.subtotal;
      }

      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      alreadyListedBillingOrigins.add(`${origin.origin_type}:${origin.origin_id}`);
      items.push({
        source_type: 'hospitalization',
        source_id: row.id as string,
        origin_label: 'Internação (alta)',
        completed_at: (row.discharged_at as string) ?? (row.admitted_at as string) ?? null,
        unit_id: (row.unit_id as string) ?? null,
        guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
        pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
        staff: null,
        estimated_amount,
        operational_status: String(row.status),
        billing_origin_type: origin.origin_type,
        billing_origin_id: origin.origin_id,
      });
    }
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

async function fetchActiveReceivableKeysExpanded(clinicId: string): Promise<Set<string>> {
  const keys = await fetchActiveReceivableKeys(clinicId);
  const { expandBoardingAppointmentOriginKeys } = await import('./boardingOriginKeys');
  return expandBoardingAppointmentOriginKeys(clinicId, keys);
}

export const getHubFinanceUnbilledCompleted = async (req: Request, res: Response) => {
  try {
    const parsed = unbilledQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
    }
    const { clinic_id, unit_id } = parsed.data;
    const keys = await fetchActiveReceivableKeysExpanded(clinic_id);
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
    const keys = await fetchActiveReceivableKeysExpanded(clinic_id);
    const items = await collectUnbilledItems(clinic_id, unit_id, keys);
    return res.json({ pending_billing_count: items.length });
  } catch (e: unknown) {
    console.error('getHubFinancePendingBillingCount', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

// ─── DAY BOARD (Caixa: todos os atendimentos do dia) ────────────────────────

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

  const appointmentIdsWithoutComanda = originKeys
    .filter((k) => k.origin_type === 'appointment' && !comandaByKey.has(`appointment:${k.origin_id}`))
    .map((k) => k.origin_id);
  if (appointmentIdsWithoutComanda.length > 0) {
    const { data: encs } = await supabaseAdmin
      .from('hub_encounters')
      .select('id, hub_appointment_id')
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', appointmentIdsWithoutComanda)
      .is('deleted_at', null);
    for (const enc of encs ?? []) {
      const apptId = enc.hub_appointment_id as string | null;
      if (!apptId) continue;
      const encComanda = comandaByKey.get(`encounter:${enc.id as string}`);
      if (encComanda) comandaByKey.set(`appointment:${apptId}`, encComanda);
    }
  }

  // Alias Hotel/Creche ↔ agendamento: comanda appointment conta para boarding_reservation e vice-versa.
  const boardingIdsForAlias = originKeys
    .filter((k) => k.origin_type === 'boarding_reservation')
    .map((k) => k.origin_id);
  const appointmentIdsForAlias = originKeys
    .filter((k) => k.origin_type === 'appointment')
    .map((k) => k.origin_id);
  if (boardingIdsForAlias.length || appointmentIdsForAlias.length) {
    const { fetchBoardingAppointmentLinks } = await import('./boardingOriginKeys');
    const links = await fetchBoardingAppointmentLinks(clinicId, {
      boardingIds: boardingIdsForAlias,
      appointmentIds: appointmentIdsForAlias,
    });
    for (const [boardingId, apptId] of links.appointmentByBoardingId) {
      const boardKey = `boarding_reservation:${boardingId}`;
      const apptKey = `appointment:${apptId}`;
      const boardComanda = comandaByKey.get(boardKey);
      const apptComanda = comandaByKey.get(apptKey);
      if (!boardComanda && apptComanda) comandaByKey.set(boardKey, apptComanda);
      if (!apptComanda && boardComanda) comandaByKey.set(apptKey, boardComanda);
    }
  }

  // Carrega recebíveis ativos por source_key e comanda_id
  const { data: receivables } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, source_type, source_id, comanda_id, status, due_date, final_amount')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .neq('status', 'cancelled');

  const receivableRowsBySourceKey = new Map<
    string,
    Array<{ id: string; status: string; due_date: string | null; final_amount: number }>
  >();
  const receivableRowsByComandaId = new Map<
    string,
    Array<{ id: string; status: string; due_date: string | null; final_amount: number }>
  >();

  const pushReceivable = (
    map: Map<string, Array<{ id: string; status: string; due_date: string | null; final_amount: number }>>,
    mapKey: string,
    row: { id: string; status: string; due_date: string | null; final_amount: number },
  ) => {
    const list = map.get(mapKey) ?? [];
    list.push(row);
    map.set(mapKey, list);
  };

  for (const r of receivables ?? []) {
    const row = {
      id: r.id as string,
      status: String(r.status),
      due_date: (r.due_date as string | null) ?? null,
      final_amount: Number(r.final_amount ?? 0),
    };
    pushReceivable(receivableRowsBySourceKey, `${r.source_type as string}:${r.source_id as string}`, row);
    if (r.comanda_id) {
      pushReceivable(receivableRowsByComandaId, r.comanda_id as string, row);
    }
  }

  for (const { origin_type, origin_id } of originKeys) {
    const key = `${origin_type}:${origin_id}`;
    const comanda = comandaByKey.get(key) ?? null;
    const rowsById = new Map<string, { id: string; status: string; due_date: string | null; final_amount: number }>();
    for (const row of receivableRowsBySourceKey.get(key) ?? []) rowsById.set(row.id, row);
    if (comanda) {
      for (const row of receivableRowsByComandaId.get(comanda.id) ?? []) rowsById.set(row.id, row);
    }
    const receivableRows = [...rowsById.values()];
    const statuses = receivableRows.map((r) => r.status);
    const receivable_status = aggregateReceivableStatus(statuses);
    const has_receivable = statuses.length > 0;
    const activeId = pickActiveReceivableId(receivableRows);
    const activeRow = activeId ? receivableRows.find((r) => r.id === activeId) : undefined;
    result.set(key, {
      comanda_id: comanda?.id ?? null,
      comanda_status: comanda?.status ?? null,
      has_receivable,
      receivable_status,
      finance_handoff_at: comanda?.finance_handoff_at ?? null,
      active_receivable_id: activeId,
      due_date: activeRow?.due_date ?? null,
      receivable_amount: activeRow != null ? Number(activeRow.final_amount ?? 0) : null,
      stock_return_status: null,
    });
  }

  const activeIds = [...result.values()]
    .map((b) => b.active_receivable_id)
    .filter((id): id is string => Boolean(id));
  if (activeIds.length > 0) {
    const [{ data: productLines }, { data: returnEvents }] = await Promise.all([
      supabaseAdmin
        .from('hub_receivable_lines')
        .select('id, receivable_id, line_kind, hub_inventory_item_id, hub_inventory_lot_id, quantity')
        .eq('clinic_id', clinicId)
        .in('receivable_id', activeIds),
      supabaseAdmin
        .from('hub_product_return_events')
        .select('receivable_id, receivable_line_id, condition')
        .eq('clinic_id', clinicId)
        .in('receivable_id', activeIds)
        .then((r) => {
          if (r.error && /does not exist|schema cache|42P01/i.test(String(r.error.message))) {
            return { data: [] as Array<Record<string, unknown>> };
          }
          if (r.error) throw new Error(r.error.message);
          return r;
        }),
    ]);

    const linesByRec = new Map<string, string[]>();
    for (const line of productLines ?? []) {
      if (!isProductStockLine(line as Record<string, unknown>)) continue;
      const rid = String((line as { receivable_id: string }).receivable_id);
      const list = linesByRec.get(rid) ?? [];
      list.push(String((line as { id: string }).id));
      linesByRec.set(rid, list);
    }
    const returnsByRec = new Map<string, Array<{ receivable_line_id: string; condition: string }>>();
    for (const ev of returnEvents ?? []) {
      const rid = String((ev as { receivable_id: string }).receivable_id);
      const list = returnsByRec.get(rid) ?? [];
      list.push({
        receivable_line_id: String((ev as { receivable_line_id: string }).receivable_line_id),
        condition: String((ev as { condition: string }).condition),
      });
      returnsByRec.set(rid, list);
    }

    for (const billing of result.values()) {
      const rid = billing.active_receivable_id;
      if (!rid) continue;
      billing.stock_return_status = computeStockReturnStatus({
        productLineIds: linesByRec.get(rid) ?? [],
        returns: returnsByRec.get(rid) ?? [],
        receivableStatus: billing.receivable_status,
      });
    }
  }

  return result;
}

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

function resolveServiceGroupLabel(group: string): string {
  return SERVICE_GROUP_LABELS[group] ?? group.replace(/_/g, ' ');
}

function timestampInUtcDayRange(iso: string | null | undefined, dayStart: string, dayEnd: string): boolean {
  if (!iso) return false;
  return iso >= dayStart && iso <= dayEnd;
}

type AppointmentServiceEmbed = {
  hub_service_type_id?: string | null;
  service_type?: { name?: string; service_group?: string | null } | null;
};

function resolveAppointmentDayBoardMeta(
  row: {
    title?: string | null;
    hub_service_type_id?: string | null;
    appointment_services?: AppointmentServiceEmbed[] | null;
  },
  serviceTypeMetaById?: Map<string, { name: string; service_group: string }>
): { service_group: string; origin_label: string } {
  const services = row.appointment_services ?? [];
  const primarySvc =
    row.hub_service_type_id != null
      ? services.find((s) => s.hub_service_type_id === row.hub_service_type_id) ?? services[0]
      : services[0];
  const primaryTypeId = (primarySvc?.hub_service_type_id ?? row.hub_service_type_id) as string | null | undefined;
  const metaFromMap = primaryTypeId ? serviceTypeMetaById?.get(primaryTypeId) : undefined;
  const group =
    String(primarySvc?.service_type?.service_group ?? metaFromMap?.service_group ?? 'outros').trim() || 'outros';
  const groupLabel = resolveServiceGroupLabel(group);
  const title = String(row.title ?? '').trim();
  const primaryName = String(primarySvc?.service_type?.name ?? metaFromMap?.name ?? '').trim();
  let origin_label: string;
  if (title && title !== 'Agendamento') {
    origin_label = `${groupLabel} — ${title}`;
  } else if (primaryName) {
    origin_label = `${groupLabel} — ${primaryName}`;
  } else {
    origin_label = groupLabel;
  }
  return { service_group: group, origin_label };
}

type DayBoardItem = {
  origin_type: string;
  origin_id: string;
  origin_label: string;
  service_group: string | null;
  starts_at: string | null;
  guardian_id: string | null;
  guardian: { id: string; full_name: string } | null;
  pet_id: string | null;
  pet: { id: string; name: string } | null;
  operational_status: string;
  estimated_amount: number;
  services: Array<{ name: string; amount: number; kind?: 'service' | 'product' | 'fee' | null }>;
  billing: DayBoardBilling;
  has_package_balance?: boolean;
  /** none | package | series_invoice */
  coverage_kind?: 'none' | 'package' | 'series_invoice';
  series_invoice_comanda_id?: string | null;
  /** Presente em `hospitalization`: origem real da comanda. */
  billing_origin_type?: 'encounter' | 'appointment' | null;
  billing_origin_id?: string | null;
  /** Vínculos de agenda (appointments) para rótulo informativo de visita. */
  parent_appointment_id?: string | null;
  visit_group_id?: string | null;
  appointment_kind?: string | null;
};

/** Waive em cascata: alta cobrada via encounter/appointment também sai da fila C. */
async function cascadeWaiveLinkedHospitalizations(opts: {
  clinicId: string;
  originType: 'encounter' | 'appointment';
  originId: string;
  waivedAt: string;
  reason: string;
}): Promise<void> {
  const col = opts.originType === 'encounter' ? 'hub_encounter_id' : 'hub_appointment_id';
  const { error } = await supabaseAdmin
    .from('hub_hospitalizations')
    .update({ billing_waived_at: opts.waivedAt, billing_waive_reason: opts.reason })
    .eq('clinic_id', opts.clinicId)
    .eq(col, opts.originId)
    .in('status', [...HOSPITALIZATION_CLOSED_STATUSES])
    .is('deleted_at', null)
    .is('billing_waived_at', null);
  if (error && !String(error.message || '').includes('billing_waived')) {
    throw new Error(error.message);
  }
}

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const dayBoardQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    date: ymdSchema.optional(),
    from: ymdSchema.optional(),
    to: ymdSchema.optional(),
    /** Lista tudo em aberto / enviado ao financeiro, sem filtro de data do atendimento. */
    open: z.enum(['1', 'true', 'yes']).optional(),
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
    const openMode = Boolean(parsed.data.open);
    const fromYmd = parsed.data.from ?? parsed.data.date ?? ymdTodayUtc();
    const toYmd = parsed.data.to ?? parsed.data.date ?? fromYmd;
    if (!openMode && fromYmd > toYmd) {
      return res.status(400).json({ error: 'from deve ser anterior ou igual a to' });
    }
    const dayStart = utcDayStartIso(fromYmd);
    const dayEnd = utcDayEndIso(toYmd);
    const dateYmd = parsed.data.date ?? toYmd;

    const openOriginKeys = openMode ? await collectOpenFinanceiroOriginKeys(clinic_id, unit_id) : null;
    const openIdsByType = new Map<string, string[]>();
    if (openOriginKeys) {
      for (const k of openOriginKeys) {
        const list = openIdsByType.get(k.origin_type) ?? [];
        list.push(k.origin_id);
        openIdsByType.set(k.origin_type, list);
      }
    }

    const items: DayBoardItem[] = [];
    const originKeys: Array<{ origin_type: string; origin_id: string }> = [];

    // ── 1. Agendamentos (por período ou por IDs em aberto) ──
    const openAppointmentIds = openIdsByType.get('appointment') ?? [];
    let apptRows: Array<Record<string, unknown>> | null = null;
    if (!openMode || openAppointmentIds.length > 0) {
      let aq = supabaseAdmin
        .from('hub_appointments')
        .select(
          `id, unit_id, starts_at, ends_at, status, guardian_id, pet_id, billing_waived_at, title, hub_service_type_id,
          parent_appointment_id, visit_group_id, appointment_kind,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name),
          appointment_services:hub_appointment_services(id, hub_service_type_id, sale_amount_applied, service_type:hub_service_types(name, service_group, sale_amount))`
        )
        .eq('clinic_id', clinic_id)
        .not('status', 'in', '("cancelled","no_show")')
        .is('deleted_at', null)
        .order('starts_at', { ascending: true });
      if (openMode) {
        aq = aq.in('id', openAppointmentIds);
      } else {
        aq = aq.gte('starts_at', dayStart).lte('starts_at', dayEnd);
      }
      if (unit_id) aq = aq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
      const apptRes = await aq;
      if (apptRes.error) throw new Error(apptRes.error.message);
      apptRows = (apptRes.data as Array<Record<string, unknown>> | null) ?? [];
    } else {
      apptRows = [];
    }

    const appointmentServiceTypeIds = new Set<string>();
    for (const row of apptRows ?? []) {
      const primaryTypeId = row.hub_service_type_id as string | null | undefined;
      if (primaryTypeId) appointmentServiceTypeIds.add(primaryTypeId);
      const svcRows = (row.appointment_services as Array<{ hub_service_type_id?: string | null }> | null) ?? [];
      for (const svc of svcRows) {
        if (svc.hub_service_type_id) appointmentServiceTypeIds.add(svc.hub_service_type_id);
      }
    }
    const serviceTypeMetaById = new Map<
      string,
      { name: string; service_group: string; sale_amount: number | null }
    >();
    if (appointmentServiceTypeIds.size > 0) {
      const { data: serviceTypeRows, error: stErr } = await supabaseAdmin
        .from('hub_service_types')
        .select('id, name, service_group, sale_amount')
        .in('id', [...appointmentServiceTypeIds]);
      if (stErr) throw new Error(stErr.message);
      for (const st of serviceTypeRows ?? []) {
        serviceTypeMetaById.set(String(st.id), {
          name: String(st.name ?? 'Serviço'),
          service_group: String(st.service_group ?? 'outros').trim() || 'outros',
          sale_amount: st.sale_amount == null ? null : Number(st.sale_amount),
        });
      }
    }

    for (const row of apptRows ?? []) {
      if (row.billing_waived_at) continue;
      const id = row.id as string;
      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      const services =
        (row.appointment_services as Array<{
          sale_amount_applied?: number | null;
          hub_service_type_id?: string | null;
          service_type?: {
            name?: string;
            service_group?: string | null;
            sale_amount?: number | null;
          } | null;
        }>) ?? [];
      const servicesEnriched = services.map((sv) => {
        const embedded = sv.service_type;
        if (embedded?.service_group != null && embedded?.sale_amount != null) return sv;
        const typeId = sv.hub_service_type_id as string | null | undefined;
        const meta = typeId ? serviceTypeMetaById.get(typeId) : undefined;
        if (!meta) return sv;
        return {
          ...sv,
          service_type: {
            name: embedded?.name ?? meta.name,
            service_group: embedded?.service_group ?? meta.service_group,
            sale_amount: embedded?.sale_amount ?? meta.sale_amount,
          },
        };
      });
      const estimated = round2(
        servicesEnriched.reduce(
          (s, sv) => s + resolveAppliedSaleAmount(sv.sale_amount_applied, sv.service_type?.sale_amount),
          0
        )
      );
      const { service_group, origin_label } = resolveAppointmentDayBoardMeta(
        {
          title: row.title as string | null,
          hub_service_type_id: row.hub_service_type_id as string | null,
          appointment_services: servicesEnriched,
        },
        serviceTypeMetaById
      );
      originKeys.push({ origin_type: 'appointment', origin_id: id });
      items.push({
        origin_type: 'appointment',
        origin_id: id,
        origin_label,
        service_group,
        starts_at: (row.starts_at as string) ?? null,
        guardian_id: (row.guardian_id as string) ?? null,
        guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
        pet_id: (row.pet_id as string) ?? null,
        pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
        operational_status: String(row.status),
        estimated_amount: estimated,
        services: servicesEnriched.map((sv) => ({
          name: String(sv.service_type?.name ?? 'Serviço'),
          amount: resolveAppliedSaleAmount(sv.sale_amount_applied, sv.service_type?.sale_amount),
          kind: 'service' as const,
        })),
        billing: {
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
          due_date: null,
        },
        parent_appointment_id: (row.parent_appointment_id as string | null | undefined) ?? null,
        visit_group_id: (row.visit_group_id as string | null | undefined) ?? null,
        appointment_kind: (row.appointment_kind as string | null | undefined) ?? null,
      });
    }

    // ── 2. Sessões B&T (walk-ins do dia + encerradas do dia c/ agenda, ou IDs em aberto) ──
    // Antes só entravam walk-ins (hub_appointment_id null): banho da agenda encerrado
    // ficava só no relatório "Cobrança não gerada" e o Caixa via appointment com valor sem adicional.
    const openGroomingIds = openIdsByType.get('grooming_session') ?? [];
    let groomRows: Array<Record<string, unknown>> = [];
    if (openMode) {
      if (openGroomingIds.length > 0) {
        let gq = supabaseAdmin
          .from('hub_grooming_sessions')
          .select(
            `id, unit_id, created_at, closed_at, grooming_stage, guardian_id, pet_id, billing_waived_at, hub_appointment_id,
            pet:hub_pets(id, name),
            guardian:hub_guardians(id, full_name)`
          )
          .eq('clinic_id', clinic_id)
          .is('deleted_at', null)
          .neq('grooming_stage', 'cancelled')
          .in('id', openGroomingIds)
          .order('created_at', { ascending: true });
        if (unit_id) gq = gq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const groomRes = await gq;
        if (groomRes.error) throw new Error(groomRes.error.message);
        groomRows = (groomRes.data as Array<Record<string, unknown>> | null) ?? [];
      }
    } else {
      const groomSelect = `id, unit_id, created_at, closed_at, grooming_stage, guardian_id, pet_id, billing_waived_at, hub_appointment_id,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name)`;
      let walkInQ = supabaseAdmin
        .from('hub_grooming_sessions')
        .select(groomSelect)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .neq('grooming_stage', 'cancelled')
        .is('hub_appointment_id', null)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .order('created_at', { ascending: true });
      let closedQ = supabaseAdmin
        .from('hub_grooming_sessions')
        .select(groomSelect)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .eq('grooming_stage', 'closed')
        .gte('closed_at', dayStart)
        .lte('closed_at', dayEnd)
        .order('closed_at', { ascending: true });
      if (unit_id) {
        walkInQ = walkInQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        closedQ = closedQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
      }
      const [walkInRes, closedRes] = await Promise.all([walkInQ, closedQ]);
      if (walkInRes.error) throw new Error(walkInRes.error.message);
      if (closedRes.error) throw new Error(closedRes.error.message);
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of [...(walkInRes.data ?? []), ...(closedRes.data ?? [])]) {
        byId.set(String(row.id), row as Record<string, unknown>);
      }
      groomRows = [...byId.values()];
    }

    const groomingLinkedAppointmentIds = new Set<string>();
    for (const row of groomRows) {
      if (row.billing_waived_at) continue;
      const id = row.id as string;
      const apptId = (row.hub_appointment_id as string | null) ?? null;
      if (apptId) groomingLinkedAppointmentIds.add(apptId);
      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const petObj = pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      let estimated = 0;
      let services: Array<{ name: string; amount: number; kind?: 'service' | 'product' | 'fee' | null }> = [];
      try {
        const pv = await buildPreviewForGroomingSession(clinic_id, id);
        estimated = pv.subtotal;
        services = pv.lines.map((line) => ({
          name: String(line.description ?? 'Serviço'),
          amount: round2(Number(line.line_total ?? 0)),
          kind: 'service' as const,
        }));
      } catch {
        // Mantém zero se a prévia falhar — billing/enrichment ainda aplica.
      }
      const startsAt =
        (row.closed_at as string | null) ?? (row.created_at as string | null) ?? null;
      originKeys.push({ origin_type: 'grooming_session', origin_id: id });
      items.push({
        origin_type: 'grooming_session',
        origin_id: id,
        origin_label: apptId ? 'Banho & Tosa' : 'Banho & Tosa (walk-in)',
        service_group: 'banho_tosa',
        starts_at: startsAt,
        guardian_id: (row.guardian_id as string) ?? null,
        guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
        pet_id: (row.pet_id as string | null) ?? petObj?.id ?? null,
        pet: petObj,
        operational_status: String(row.grooming_stage),
        estimated_amount: estimated,
        services,
        billing: {
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
          active_receivable_id: null,
          due_date: null,
        },
      });
    }

    // Preferir a sessão B&T (valor + adicional) ao appointment espelho na listagem do Caixa.
    if (groomingLinkedAppointmentIds.size > 0) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.origin_type === 'appointment' && groomingLinkedAppointmentIds.has(it.origin_id)) {
          items.splice(i, 1);
        }
      }
      for (let i = originKeys.length - 1; i >= 0; i--) {
        const k = originKeys[i];
        if (k.origin_type === 'appointment' && groomingLinkedAppointmentIds.has(k.origin_id)) {
          originKeys.splice(i, 1);
        }
      }
    }

    // ── 3. Encounters walk-in (período ou IDs em aberto) ──
    const openEncounterIds = openIdsByType.get('encounter') ?? [];
    let encRows: Array<Record<string, unknown>> | null = [];
    if (!openMode || openEncounterIds.length > 0) {
      let eq = supabaseAdmin
        .from('hub_encounters')
        .select(
          `id, unit_id, created_at, status, guardian_id, billing_waived_at, hub_appointment_id,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name)`
        )
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .not('status', 'in', '("cancelled")')
        .order('created_at', { ascending: true });
      if (openMode) {
        eq = eq.in('id', openEncounterIds);
      } else {
        eq = eq.is('hub_appointment_id', null).gte('created_at', dayStart).lte('created_at', dayEnd);
      }
      if (unit_id) eq = eq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
      const encRes = await eq;
      if (encRes.error) throw new Error(encRes.error.message);
      encRows = (encRes.data as Array<Record<string, unknown>> | null) ?? [];
    }

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
        service_group: 'clinica',
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
          due_date: null,
        },
      });
    }

    // ── 4. Boarding: check-in/out no período, ou IDs em aberto ──
    const appointmentIdsInBoard = new Set(
      items.filter((i) => i.origin_type === 'appointment').map((i) => i.origin_id)
    );
    const boardingIdsInBoard = new Set<string>();
    const openBoardingIds = new Set(openIdsByType.get('boarding_reservation') ?? []);

    let boardingRowsAll: Array<Record<string, unknown>> | null = [];
    if (!openMode || openBoardingIds.size > 0) {
      let bq = supabaseAdmin
        .from('hub_boarding_reservations')
        .select(
          `id, unit_id, hub_appointment_id, expected_check_in, expected_check_out, checked_in_at, checked_out_at, status, guardian_id, pet_id, mode, daily_rate_cents,
          pet:hub_pets(id, name),
          guardian:hub_guardians(id, full_name)`
        )
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .not('status', 'in', '("cancelled")')
        .order('expected_check_out', { ascending: true });
      if (openMode) {
        bq = bq.in('id', [...openBoardingIds]);
      }
      if (unit_id) bq = bq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
      const boardingRes = await bq;
      if (boardingRes.error) throw new Error(boardingRes.error.message);
      boardingRowsAll = (boardingRes.data as Array<Record<string, unknown>> | null) ?? [];
    }

    for (const row of boardingRowsAll ?? []) {
      const id = row.id as string;
      const expectedCheckIn = (row.expected_check_in as string) ?? null;
      const expectedCheckOut = (row.expected_check_out as string) ?? null;
      const isCheckInDay = timestampInUtcDayRange(expectedCheckIn, dayStart, dayEnd);
      const isCheckOutDay = timestampInUtcDayRange(expectedCheckOut, dayStart, dayEnd);
      if (!openMode && !isCheckInDay && !isCheckOutDay) continue;
      if (openMode && !openBoardingIds.has(id)) continue;

      const apptId = (row.hub_appointment_id as string | null) ?? null;
      if (!openMode && isCheckInDay && !isCheckOutDay && apptId && appointmentIdsInBoard.has(apptId)) {
        continue;
      }

      if (boardingIdsInBoard.has(id)) continue;
      boardingIdsInBoard.add(id);

      const modeLabel = row.mode === 'hotel' ? 'Hotel' : 'Creche';
      const serviceGroup = row.mode === 'hotel' ? 'hotel' : 'creche';
      const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
      const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
      const dailyRateCents = (row.daily_rate_cents as number | null) ?? 0;
      const estimated = estimateBoardingStayTotal(
        {
          id,
          mode: String(row.mode ?? 'hotel'),
          expected_check_in: expectedCheckIn,
          expected_check_out: expectedCheckOut,
          checked_in_at: (row.checked_in_at as string | null) ?? null,
          checked_out_at: (row.checked_out_at as string | null) ?? null,
          daily_rate_cents: dailyRateCents,
        },
        [],
      ).total;
      originKeys.push({ origin_type: 'boarding_reservation', origin_id: id });
      items.push({
        origin_type: 'boarding_reservation',
        origin_id: id,
        origin_label: `Hotel & Creche (${modeLabel})`,
        service_group: serviceGroup,
        starts_at: (isCheckOutDay ? expectedCheckOut : null) ?? expectedCheckOut ?? expectedCheckIn,
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
          due_date: null,
        },
      });
    }

    // ── 4a. Internações com alta no período → origem explícita (gap C) ──
    if (!openMode) {
      let hq = supabaseAdmin
        .from('hub_hospitalizations')
        .select(
          `id, unit_id, status, admitted_at, discharged_at, guardian_id, pet_id, hub_encounter_id, hub_appointment_id,
           daily_hub_service_type_id, daily_unit_amount, billing_waived_at,
           pet:hub_pets(id, name),
           guardian:hub_guardians(id, full_name)`
        )
        .eq('clinic_id', clinic_id)
        .in('status', [...HOSPITALIZATION_CLOSED_STATUSES])
        .is('deleted_at', null)
        .is('billing_waived_at', null)
        .not('discharged_at', 'is', null)
        .gte('discharged_at', dayStart)
        .lte('discharged_at', dayEnd)
        .order('discharged_at', { ascending: true });
      if (unit_id) hq = hq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
      const hospRes = await hq;
      if (hospRes.error && !String(hospRes.error.message || '').includes('hub_hospitalizations')) {
        throw new Error(hospRes.error.message);
      }
      const hospRows = (hospRes.data as Array<Record<string, unknown>> | null) ?? [];

      const seenBoardKeys = new Set(items.map((i) => `${i.origin_type}:${i.origin_id}`));
      for (const row of hospRows) {
        if (!isHospitalizationClosed(String(row.status))) continue;
        const origin = resolveHospitalizationBillingOrigin({
          hub_encounter_id: (row.hub_encounter_id as string | null) ?? null,
          hub_appointment_id: (row.hub_appointment_id as string | null) ?? null,
        });
        if (!origin) continue;

        const encId = origin.origin_type === 'encounter' ? origin.origin_id : null;
        const apptId =
          origin.origin_type === 'appointment'
            ? origin.origin_id
            : ((row.hub_appointment_id as string | null) ?? null);

        const hospEstimate = (
          await loadHospitalizationComandaItems({
            clinicId: clinic_id,
            hospitalizationId: row.id as string,
            encounterId: encId,
            appointmentId: apptId,
            defaultPetId: (row.pet_id as string | null) ?? null,
          })
        ).subtotal;

        // Se a origem cobrável já está no board, só anexa estimativa (evita duplicar linha).
        const existing = items.find(
          (i) => i.origin_type === origin.origin_type && i.origin_id === origin.origin_id,
        );
        if (existing) {
          existing.estimated_amount = round2(Number(existing.estimated_amount ?? 0) + hospEstimate);
          if (!String(existing.origin_label).includes('Internação')) {
            existing.origin_label = `${existing.origin_label} · Internação (alta)`;
          }
          continue;
        }

        const billingOriginKey = `${origin.origin_type}:${origin.origin_id}`;
        const hospKey = `hospitalization:${row.id as string}`;
        if (seenBoardKeys.has(hospKey) || seenBoardKeys.has(billingOriginKey)) continue;
        seenBoardKeys.add(hospKey);
        seenBoardKeys.add(billingOriginKey);

        const pet = row.pet as { id: string; name: string } | { id: string; name: string }[] | null;
        const g = row.guardian as { id: string; full_name: string } | { id: string; full_name: string }[] | null;
        // Billing da comanda vive na origem cobrável (encounter/appointment).
        originKeys.push({ origin_type: origin.origin_type, origin_id: origin.origin_id });
        items.push({
          origin_type: 'hospitalization',
          origin_id: row.id as string,
          origin_label: 'Internação (alta)',
          service_group: 'clinica',
          starts_at: (row.discharged_at as string) ?? (row.admitted_at as string) ?? null,
          guardian_id: (row.guardian_id as string) ?? null,
          guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
          pet_id: (row.pet_id as string) ?? null,
          pet: pet ? (Array.isArray(pet) ? (pet[0] ?? null) : pet) : null,
          operational_status: String(row.status),
          estimated_amount: hospEstimate,
          services: [],
          billing_origin_type: origin.origin_type,
          billing_origin_id: origin.origin_id,
          billing: {
            comanda_id: null,
            comanda_status: null,
            has_receivable: false,
            receivable_status: null,
            finance_handoff_at: null,
            active_receivable_id: null,
            due_date: null,
          },
        });
      }
    }

    // ── 4b. Vendas rápidas (comandas origin_type=manual) ──
    {
      const openManualIds = openIdsByType.get('manual') ?? [];
      const seenManual = new Set(
        items.filter((i) => i.origin_type === 'manual').map((i) => i.origin_id),
      );
      let loadManuals = !openMode;
      if (openMode && openManualIds.length > 0) loadManuals = true;
      if (loadManuals) {
        let mq = supabaseAdmin
          .from('hub_comandas')
          .select(
            `id, origin_id, status, opened_at, total_amount, finance_handoff_at, guardian_id, pet_id,
            guardian:hub_guardians(id, full_name),
            pet:hub_pets(id, name)`,
          )
          .eq('clinic_id', clinic_id)
          .eq('origin_type', 'manual')
          .neq('status', 'cancelada')
          .is('deleted_at', null)
          .not('origin_id', 'is', null);
        if (openMode) {
          mq = mq.in('origin_id', openManualIds);
        } else {
          mq = mq.gte('opened_at', dayStart).lte('opened_at', dayEnd);
        }
        if (unit_id) mq = mq.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { data: manualRows, error: manualErr } = await mq;
        if (manualErr) throw new Error(manualErr.message);

        const manualComandas: ManualDayBoardComanda[] = [];
        for (const row of manualRows ?? []) {
          const originId = row.origin_id as string | null;
          if (!originId || seenManual.has(originId)) continue;
          seenManual.add(originId);
          const g = row.guardian as
            | { id: string; full_name: string }
            | { id: string; full_name: string }[]
            | null;
          const p = row.pet as
            | { id: string; name: string }
            | { id: string; name: string }[]
            | null;
          manualComandas.push({
            id: row.id as string,
            origin_id: originId,
            status: String(row.status ?? 'aberta'),
            opened_at: (row.opened_at as string | null) ?? null,
            total_amount: row.total_amount == null ? null : Number(row.total_amount),
            finance_handoff_at: (row.finance_handoff_at as string | null) ?? null,
            guardian_id: (row.guardian_id as string | null) ?? null,
            pet_id: (row.pet_id as string | null) ?? null,
            guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
            pet: p ? (Array.isArray(p) ? (p[0] ?? null) : p) : null,
          });
        }

        const manualComandaIds = manualComandas.map((c) => c.id);
        const linesByComanda = new Map<string, ManualDayBoardLine[]>();
        if (manualComandaIds.length > 0) {
          const { data: lineRows, error: lineErr } = await supabaseAdmin
            .from('hub_comanda_items')
            .select('comanda_id, description, line_total, quantity, item_kind, pet_id')
            .eq('clinic_id', clinic_id)
            .in('comanda_id', manualComandaIds);
          if (lineErr) throw new Error(lineErr.message);
          for (const ln of lineRows ?? []) {
            const cid = ln.comanda_id as string;
            const list = linesByComanda.get(cid) ?? [];
            list.push({
              comanda_id: cid,
              description: (ln.description as string | null) ?? null,
              line_total: ln.line_total == null ? null : Number(ln.line_total),
              quantity: ln.quantity == null ? null : Number(ln.quantity),
              item_kind: (ln.item_kind as string | null) ?? null,
              pet_id: (ln.pet_id as string | null) ?? null,
              status: null,
            });
            linesByComanda.set(cid, list);
          }
        }

        for (const comanda of manualComandas) {
          const built = buildManualDayBoardItem(comanda, linesByComanda.get(comanda.id) ?? []);
          originKeys.push({ origin_type: 'manual', origin_id: comanda.origin_id });
          items.push({
            ...built,
            billing: {
              comanda_id: null,
              comanda_status: null,
              has_receivable: false,
              receivable_status: null,
              finance_handoff_at: null,
              active_receivable_id: null,
              due_date: null,
            },
          });
        }
      }
    }

    // ── 4c. Origens em aberto sem entidade operacional carregada (orçamento, pacote, etc.) ──
    if (openMode && openOriginKeys) {
      const seen = new Set(items.map((i) => `${i.origin_type}:${i.origin_id}`));
      for (const k of openOriginKeys) {
        const key = `${k.origin_type}:${k.origin_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        originKeys.push(k);
        items.push({
          origin_type: k.origin_type,
          origin_id: k.origin_id,
          origin_label: resolveOpenOriginLabel(k.origin_type),
          service_group: null,
          starts_at: null,
          guardian_id: null,
          guardian: null,
          pet_id: null,
          pet: null,
          operational_status: 'open',
          estimated_amount: 0,
          services: [],
          billing: {
            comanda_id: null,
            comanda_status: null,
            has_receivable: false,
            receivable_status: null,
            finance_handoff_at: null,
            active_receivable_id: null,
            due_date: null,
          },
        });
      }
    }

    // ── 5. Enriquecer billing em batch ──
    const billingMap = await fetchBillingStatusBatch(clinic_id, originKeys);
    for (const item of items) {
      const key =
        item.origin_type === 'hospitalization' && item.billing_origin_type && item.billing_origin_id
          ? `${item.billing_origin_type}:${item.billing_origin_id}`
          : `${item.origin_type}:${item.origin_id}`;
      const billing = billingMap.get(key);
      if (billing) item.billing = billing;
    }

    // ── 5b. Enriquecer stubs manuais restantes (recebível avulso sem comanda carregada) ──
    {
      const stubs = items.filter(
        (i) =>
          i.origin_type === 'manual' &&
          (!i.services.length || !i.guardian_id) &&
          (i.billing.active_receivable_id || i.billing.comanda_id),
      );
      if (stubs.length > 0) {
        const recIds = stubs
          .map((s) => s.billing.active_receivable_id)
          .filter((id): id is string => Boolean(id));
        const comandaIds = stubs
          .map((s) => s.billing.comanda_id)
          .filter((id): id is string => Boolean(id));

        const guardianByRec = new Map<string, { id: string; full_name: string } | null>();
        const linesByRec = new Map<
          string,
          Array<{ description: string | null; line_total: number | null; quantity: number | null; line_kind: string | null }>
        >();
        if (recIds.length > 0) {
          const { data: recRows } = await supabaseAdmin
            .from('hub_receivables')
            .select('id, guardian_id, guardian:hub_guardians(id, full_name)')
            .eq('clinic_id', clinic_id)
            .in('id', recIds);
          for (const r of recRows ?? []) {
            const g = r.guardian as
              | { id: string; full_name: string }
              | { id: string; full_name: string }[]
              | null;
            guardianByRec.set(
              r.id as string,
              g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
            );
          }
          const { data: lnRows } = await supabaseAdmin
            .from('hub_receivable_lines')
            .select('receivable_id, description, line_total, quantity, line_kind')
            .eq('clinic_id', clinic_id)
            .in('receivable_id', recIds);
          for (const ln of lnRows ?? []) {
            const rid = ln.receivable_id as string;
            const list = linesByRec.get(rid) ?? [];
            list.push({
              description: (ln.description as string | null) ?? null,
              line_total: ln.line_total == null ? null : Number(ln.line_total),
              quantity: ln.quantity == null ? null : Number(ln.quantity),
              line_kind: (ln.line_kind as string | null) ?? null,
            });
            linesByRec.set(rid, list);
          }
        }

        const comandaById = new Map<string, ManualDayBoardComanda>();
        const linesByComandaId = new Map<string, ManualDayBoardLine[]>();
        if (comandaIds.length > 0) {
          const { data: cmdRows } = await supabaseAdmin
            .from('hub_comandas')
            .select(
              `id, origin_id, status, opened_at, total_amount, finance_handoff_at, guardian_id, pet_id,
              guardian:hub_guardians(id, full_name),
              pet:hub_pets(id, name)`,
            )
            .eq('clinic_id', clinic_id)
            .in('id', comandaIds);
          for (const row of cmdRows ?? []) {
            const g = row.guardian as
              | { id: string; full_name: string }
              | { id: string; full_name: string }[]
              | null;
            const p = row.pet as
              | { id: string; name: string }
              | { id: string; name: string }[]
              | null;
            comandaById.set(row.id as string, {
              id: row.id as string,
              origin_id: (row.origin_id as string) ?? '',
              status: String(row.status ?? 'aberta'),
              opened_at: (row.opened_at as string | null) ?? null,
              total_amount: row.total_amount == null ? null : Number(row.total_amount),
              finance_handoff_at: (row.finance_handoff_at as string | null) ?? null,
              guardian_id: (row.guardian_id as string | null) ?? null,
              pet_id: (row.pet_id as string | null) ?? null,
              guardian: g ? (Array.isArray(g) ? (g[0] ?? null) : g) : null,
              pet: p ? (Array.isArray(p) ? (p[0] ?? null) : p) : null,
            });
          }
          const { data: cmdLines } = await supabaseAdmin
            .from('hub_comanda_items')
            .select('comanda_id, description, line_total, quantity, item_kind, pet_id')
            .eq('clinic_id', clinic_id)
            .in('comanda_id', comandaIds);
          for (const ln of cmdLines ?? []) {
            const cid = ln.comanda_id as string;
            const list = linesByComandaId.get(cid) ?? [];
            list.push({
              comanda_id: cid,
              description: (ln.description as string | null) ?? null,
              line_total: ln.line_total == null ? null : Number(ln.line_total),
              quantity: ln.quantity == null ? null : Number(ln.quantity),
              item_kind: (ln.item_kind as string | null) ?? null,
              pet_id: (ln.pet_id as string | null) ?? null,
              status: null,
            });
            linesByComandaId.set(cid, list);
          }
        }

        for (const item of stubs) {
          const cid = item.billing.comanda_id;
          if (cid && comandaById.has(cid)) {
            const built = buildManualDayBoardItem(
              comandaById.get(cid)!,
              linesByComandaId.get(cid) ?? [],
            );
            item.origin_label = built.origin_label;
            item.starts_at = item.starts_at ?? built.starts_at;
            item.guardian_id = item.guardian_id ?? built.guardian_id;
            item.guardian = item.guardian ?? built.guardian;
            item.pet_id = item.pet_id ?? built.pet_id;
            item.pet = item.pet ?? built.pet;
            item.operational_status = built.operational_status;
            if (!item.services.length) item.services = built.services;
            if (!(item.estimated_amount > 0.009)) item.estimated_amount = built.estimated_amount;
            continue;
          }
          const rid = item.billing.active_receivable_id;
          if (!rid) continue;
          const g = guardianByRec.get(rid);
          if (g && !item.guardian) {
            item.guardian = g;
            item.guardian_id = g.id;
          }
          if (!item.services.length) {
            item.services = buildManualServicesFromReceivableLines(linesByRec.get(rid) ?? []);
            item.estimated_amount = item.services.reduce((s, sv) => s + sv.amount, 0);
          }
          if (item.origin_label === 'Cobrança avulsa' || !item.origin_label) {
            item.origin_label = 'Venda rápida';
          }
        }
      }
    }

    const clinicBalances = await listActivePackageBalances({ clinicId: clinic_id });
    const appointmentIds = items.filter((i) => i.origin_type === 'appointment').map((i) => i.origin_id);
    const seriesCoverage = await findSeriesInvoiceCoverageForAppointments(appointmentIds);

    for (const item of items) {
      item.coverage_kind = 'none';
      item.series_invoice_comanda_id = null;

      const invCov = item.origin_type === 'appointment' ? seriesCoverage.get(item.origin_id) : undefined;
      if (invCov && invCov.comanda_id) {
        item.coverage_kind = 'series_invoice';
        item.series_invoice_comanda_id = invCov.comanda_id;
        item.has_package_balance = false;
        item.estimated_amount = 0;
        item.services = item.services.map((s) => ({ ...s, amount: 0 }));
        // Preferir comanda da fatura no badge de cobrança se ainda não houver billing da ocorrência
        if (!item.billing.comanda_id) {
          item.billing = {
            ...item.billing,
            comanda_id: invCov.comanda_id,
            comanda_status: item.billing.comanda_status ?? 'aberta',
          };
        }
        continue;
      }

      const serviceTypeIds: string[] = [];
      if (item.origin_type === 'appointment') {
        const apptRow = (apptRows ?? []).find((r) => r.id === item.origin_id);
        const svcs = (apptRow?.appointment_services as Array<{ hub_service_type_id?: string }> | null) ?? [];
        for (const s of svcs) {
          if (s.hub_service_type_id) serviceTypeIds.push(s.hub_service_type_id);
        }
        if (!serviceTypeIds.length) {
          const primary = apptRow?.hub_service_type_id as string | null;
          if (primary) serviceTypeIds.push(primary);
        }
      } else {
        for (let idx = 0; idx < item.services.length; idx++) {
          const apptRow = (apptRows ?? []).find((r) => r.id === item.origin_id);
          const svcs = (apptRow?.appointment_services as Array<{ hub_service_type_id?: string }> | null) ?? [];
          const st = svcs[idx]?.hub_service_type_id;
          if (st) serviceTypeIds.push(st);
        }
      }

      const coveredByPkg = hasPackageBalanceForServices(
        clinicBalances,
        item.guardian_id,
        item.pet_id,
        [...new Set(serviceTypeIds)]
      );
      item.has_package_balance = coveredByPkg;

      if (coveredByPkg && item.services.length > 0) {
        const adj = applyPackageCoverageToEstimate({
          balances: clinicBalances,
          guardianId: item.guardian_id,
          petId: item.pet_id,
          serviceTypeIds,
          services: item.services,
          estimatedAmount: item.estimated_amount,
        });
        item.services = adj.services;
        item.estimated_amount = adj.estimated_amount;
        if (adj.covered) item.coverage_kind = 'package';
      }
    }

    let filteredItems = items;
    if (billing_scope === 'financeiro') {
      filteredItems = items.filter((item) => {
        const { billing } = item;
        if (isDayBoardPaidAndComplete(item.origin_type, item.operational_status, billing.receivable_status)) {
          return false;
        }
        if (!matchesFinanceiroDayBoardScope(billing)) return false;
        return hasFinanceiroChargeableAmount({
          estimated_amount: item.estimated_amount,
          billing,
        });
      });
    }

    filteredItems.sort((a, b) => {
      const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      return ta - tb;
    });

    return res.json({
      items: filteredItems,
      date: dateYmd,
      from: openMode ? null : fromYmd,
      to: openMode ? null : toYmd,
      open: openMode,
      count: filteredItems.length,
    });
  } catch (e: unknown) {
    console.error('getHubFinanceDayBoard', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

function resolveOpenOriginLabel(originType: string): string {
  switch (originType) {
    case 'quote':
      return 'Orçamento';
    case 'package':
      return 'Pacote';
    case 'series_invoice':
      return 'Fatura de série';
    case 'manual':
      return 'Venda rápida';
    case 'appointment':
      return 'Agenda';
    case 'grooming_session':
      return 'Banho & Tosa';
    case 'encounter':
      return 'Atendimento clínico';
    case 'boarding_reservation':
      return 'Hotel & Creche';
    case 'hospitalization':
      return 'Internação';
    default:
      return originType.replace(/_/g, ' ');
  }
}

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

export type FinanceDateBasis = 'payment_date' | 'created_at' | 'competence_date' | 'due_date';

function parseDateBasis(raw: unknown, fallback: FinanceDateBasis = 'payment_date'): FinanceDateBasis {
  const parsed = z.enum(['payment_date', 'created_at', 'competence_date', 'due_date']).safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

function parsePeriodQuery(q: {
  clinic_id?: unknown;
  unit_id?: unknown;
  days?: unknown;
  from?: unknown;
  to?: unknown;
  date_basis?: unknown;
}):
  | { ok: true; clinic_id: string; unit_id: string; fromYmd: string; toYmd: string; date_basis: FinanceDateBasis }
  | { ok: false; error: string } {
  const clinic = uuidStr.safeParse(q.clinic_id);
  const unit = uuidStr.safeParse(q.unit_id);
  if (!clinic.success || !unit.success) {
    return { ok: false, error: 'clinic_id e unit_id são obrigatórios (UUID)' };
  }
  const date_basis = parseDateBasis(q.date_basis, 'payment_date');
  const fromRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.from);
  const toRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.to);
  if (fromRaw.success && toRaw.success) {
    if (fromRaw.data > toRaw.data) return { ok: false, error: 'from não pode ser maior que to' };
    return {
      ok: true,
      clinic_id: clinic.data,
      unit_id: unit.data,
      fromYmd: fromRaw.data,
      toYmd: toRaw.data,
      date_basis,
    };
  }
  const days = z.coerce.number().int().min(1).max(366).safeParse(q.days);
  const n = days.success ? days.data : 30;
  const toYmd = ymdTodayUtc();
  const fromYmd = addDaysYmd(toYmd, -(n - 1));
  return { ok: true, clinic_id: clinic.data, unit_id: unit.data, fromYmd, toYmd, date_basis };
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
    const openRecsWithValue = (openRecs ?? []).filter((r) => Number(r.final_amount ?? 0) > 0.009);
    const recIds = openRecsWithValue.map((r) => r.id as string);
    let receivables_outstanding = 0;
    if (recIds.length > 0) {
      const { data: payRows, error: pErr } = await supabaseAdmin
        .from('hub_payments')
        .select('receivable_id, amount')
        .in('receivable_id', recIds)
        .eq('status', 'posted');
      if (pErr) return res.status(500).json({ error: pErr.message });
      const paidByRec = new Map<string, number>();
      for (const row of payRows ?? []) {
        const id = row.receivable_id as string;
        paidByRec.set(id, round2((paidByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
      }
      for (const r of openRecsWithValue) {
        const fin = Number(r.final_amount ?? 0);
        const paid = paidByRec.get(r.id as string) ?? 0;
        receivables_outstanding = round2(receivables_outstanding + round2(fin - paid));
      }
    }

    const { data: payPeriod, error: ppErr } = await supabaseAdmin
      .from('hub_payments')
      .select('amount, payment_date, receivable_id')
      .eq('clinic_id', clinic_id)
      .eq('status', 'posted')
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
          error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: eErr.message });
    }
    const expensesOnly = round2(
      (expRows ?? []).reduce((a, row) => a + Number(row.amount ?? 0), 0)
    );

    const paidPayables = await sumPaidPayablesInPeriod({
      clinicId: clinic_id,
      unitId: unit_id,
      fromYmd,
      toYmd,
    });
    if (paidPayables.error) return res.status(500).json({ error: paidPayables.error });

    const pendingPayables = await sumPendingPayables({ clinicId: clinic_id, unitId: unit_id });
    if (pendingPayables.error) return res.status(500).json({ error: pendingPayables.error });

    const expenses_total_period = round2(expensesOnly + paidPayables.total);

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
      receivables_pending_count: openRecsWithValue.length,
      receivables_open_count: openRecsWithValue.length,
      receivables_outstanding,
      payments_total_period,
      expenses_total_period,
      payables_pending_count: pendingPayables.count,
      payables_outstanding: pendingPayables.total,
      payables_unconfirmed_count: pendingPayables.unconfirmedCount,
      payables_estimated_total: pendingPayables.estimatedTotal,
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
    const { clinic_id, unit_id, fromYmd, toYmd, date_basis } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    // Fluxo de caixa: payment_date (efetivo) ou created_at (registro). competence/due não aplicam a pagamentos.
    const payDateCol =
      date_basis === 'created_at' ? 'created_at' : 'payment_date';

    const { data: sessions, error: sErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id')
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id);
    if (sErr) return res.status(500).json({ error: sErr.message });
    const sessionIds = (sessions ?? []).map((s) => s.id as string);

    const { data: payPeriod, error: ppErr } = await supabaseAdmin
      .from('hub_payments')
      .select(`amount, payment_date, created_at, receivable_id`)
      .eq('clinic_id', clinic_id)
      .eq('status', 'posted')
      .gte(payDateCol, fromIso)
      .lte(payDateCol, toIso);
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
          error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: eErr.message });
    }
    expRows = (ex ?? []) as { amount: number | string; expense_date: string }[];

    const paidPayablesCf = await sumPaidPayablesInPeriod({
      clinicId: clinic_id,
      unitId: unit_id,
      fromYmd,
      toYmd,
    });
    if (paidPayablesCf.error) return res.status(500).json({ error: paidPayablesCf.error });

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
      const rawDate =
        payDateCol === 'created_at'
          ? String((p as { created_at?: string }).created_at ?? p.payment_date ?? '')
          : String(p.payment_date ?? '');
      const key = rawDate.slice(0, 10);
      if (!key) continue;
      payByDay.set(key, round2((payByDay.get(key) ?? 0) + Number(p.amount ?? 0)));
    }

    const expByDay = new Map<string, number>();
    for (const row of expRows) {
      const key = row.expense_date.slice(0, 10);
      expByDay.set(key, round2((expByDay.get(key) ?? 0) + Number(row.amount ?? 0)));
    }
    for (const [key, amt] of paidPayablesCf.byDay) {
      expByDay.set(key, round2((expByDay.get(key) ?? 0) + amt));
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

    return res.json({
      period: { from: fromYmd, to: toYmd },
      date_basis: payDateCol === 'created_at' ? 'created_at' : 'payment_date',
      days,
    });
  } catch (e: unknown) {
    console.error('getHubFinanceCashFlow', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const getHubFinanceRevenueReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd, date_basis } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    const payDateCol = date_basis === 'created_at' ? 'created_at' : 'payment_date';
    const { data: payments, error } = await supabaseAdmin
      .from('hub_payments')
      .select('amount, payment_method, payment_date, created_at, receivable_id')
      .eq('clinic_id', clinic_id)
      .eq('status', 'posted')
      .gte(payDateCol, fromIso)
      .lte(payDateCol, toIso);
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
    return res.json({
      period: { from: fromYmd, to: toYmd },
      date_basis: payDateCol === 'created_at' ? 'created_at' : 'payment_date',
      total,
      by_method,
    });
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
      .eq('status', 'posted')
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

/**
 * Vendas por produto + mix (serviços vs produtos vs demais) + margem/COGS.
 * COGS usa unit_cost_amount (snapshot); fallback: cost_amount atual do catálogo.
 */
export const getHubFinanceProductSalesReport = async (req: Request, res: Response) => {
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
    if (ids.length === 0) {
      return res.json({
        period: { from: fromYmd, to: toYmd },
        mix: { services: 0, products: 0, other: 0, total: 0 },
        summary: {
          items_count: 0,
          quantity: 0,
          revenue: 0,
          cogs: 0,
          margin: 0,
          margin_pct: null as number | null,
        },
        items: [],
      });
    }

    const { data: lines, error: lineErr } = await supabaseAdmin
      .from('hub_receivable_lines')
      .select(
        'line_kind, hub_inventory_item_id, description, quantity, line_total, unit_cost_amount',
      )
      .eq('clinic_id', clinic_id)
      .in('receivable_id', ids);
    if (lineErr) return res.status(500).json({ error: lineErr.message });

    let mixServices = 0;
    let mixProducts = 0;
    let mixOther = 0;
    for (const line of lines ?? []) {
      const total = Number(line.line_total ?? 0);
      const kind = String(line.line_kind ?? '');
      if (kind === 'product') mixProducts = round2(mixProducts + total);
      else if (kind === 'appointment_service' || kind === 'grooming_extra' || kind === 'quote_line') {
        mixServices = round2(mixServices + total);
      } else mixOther = round2(mixOther + total);
    }
    const mixTotal = round2(mixServices + mixProducts + mixOther);

    const productLines = (lines ?? []).filter((l) => String(l.line_kind) === 'product');
    const itemIds = [
      ...new Set(
        productLines
          .map((l) => l.hub_inventory_item_id as string | null)
          .filter(Boolean) as string[],
      ),
    ];
    const catalogCost = new Map<string, number>();
    const catalogName = new Map<string, string>();
    const catalogKind = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: inv } = await supabaseAdmin
        .from('hub_inventory_items')
        .select('id, name, item_kind, cost_amount')
        .in('id', itemIds);
      for (const it of inv ?? []) {
        catalogName.set(it.id as string, String(it.name ?? ''));
        catalogKind.set(it.id as string, String(it.item_kind ?? 'product'));
        if (it.cost_amount != null && Number.isFinite(Number(it.cost_amount))) {
          catalogCost.set(it.id as string, Number(it.cost_amount));
        }
      }
    }

    type Agg = {
      item_id: string | null;
      name: string;
      item_kind: string | null;
      quantity: number;
      revenue: number;
      cogs: number;
    };
    const byItem = new Map<string, Agg>();
    for (const line of productLines) {
      const itemId = (line.hub_inventory_item_id as string | null) ?? null;
      const key = itemId ?? `desc:${String(line.description ?? 'Produto')}`;
      const qty = Number(line.quantity ?? 0);
      const revenue = Number(line.line_total ?? 0);
      let unitCost: number | null =
        line.unit_cost_amount != null && Number.isFinite(Number(line.unit_cost_amount))
          ? Number(line.unit_cost_amount)
          : null;
      if (unitCost == null && itemId && catalogCost.has(itemId)) {
        unitCost = catalogCost.get(itemId)!;
      }
      const cogs = unitCost != null ? round2(qty * unitCost) : 0;
      const cur = byItem.get(key) ?? {
        item_id: itemId,
        name: itemId
          ? catalogName.get(itemId) || String(line.description || 'Produto')
          : String(line.description || 'Produto'),
        item_kind: itemId ? catalogKind.get(itemId) ?? null : null,
        quantity: 0,
        revenue: 0,
        cogs: 0,
      };
      cur.quantity = round2(cur.quantity + qty);
      cur.revenue = round2(cur.revenue + revenue);
      cur.cogs = round2(cur.cogs + cogs);
      byItem.set(key, cur);
    }

    const items = [...byItem.values()]
      .map((r) => {
        const margin = round2(r.revenue - r.cogs);
        const margin_pct = r.revenue > 0 ? round2((margin / r.revenue) * 100) : null;
        return { ...r, margin, margin_pct };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 200);

    const revenue = round2(items.reduce((s, i) => s + i.revenue, 0));
    const cogs = round2(items.reduce((s, i) => s + i.cogs, 0));
    const margin = round2(revenue - cogs);
    const quantity = round2(items.reduce((s, i) => s + i.quantity, 0));

    return res.json({
      period: { from: fromYmd, to: toYmd },
      mix: {
        services: mixServices,
        products: mixProducts,
        other: mixOther,
        total: mixTotal,
      },
      summary: {
        items_count: items.length,
        quantity,
        revenue,
        cogs,
        margin,
        margin_pct: revenue > 0 ? round2((margin / revenue) * 100) : null,
      },
      items,
      notes:
        'COGS usa unit_cost_amount da linha; linhas antigas sem snapshot usam cost_amount atual do catálogo.',
    });
  } catch (e: unknown) {
    console.error('getHubFinanceProductSalesReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/**
 * Movimentação de vendas no período, agregada por setor (service_group) e detalhe por serviço.
 * Produtos de estoque entram no bucket sintético `produtos` — não divide sessão de caixa.
 */
export const getHubFinanceMovementBySectorReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);

    const empty = () =>
      res.json({
        period: { from: fromYmd, to: toYmd },
        summary: {
          receivables_count: 0,
          lines_count: 0,
          total: 0,
          groups_count: 0,
        },
        by_group: [],
        by_service: [],
      });

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
    if (ids.length === 0) return empty();

    const { data: lines, error: lineErr } = await supabaseAdmin
      .from('hub_receivable_lines')
      .select('hub_service_type_id, line_kind, description, quantity, line_total')
      .eq('clinic_id', clinic_id)
      .in('receivable_id', ids);
    if (lineErr) return res.status(500).json({ error: lineErr.message });
    if (!lines?.length) return empty();

    const serviceIds = [
      ...new Set(
        (lines ?? [])
          .map((l) => l.hub_service_type_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const serviceMeta = new Map<string, { name: string; service_group: string }>();
    if (serviceIds.length > 0) {
      const { data: services } = await supabaseAdmin
        .from('hub_service_types')
        .select('id, name, service_group')
        .in('id', serviceIds);
      for (const svc of services ?? []) {
        const group = String(svc.service_group ?? 'outros').trim() || 'outros';
        serviceMeta.set(svc.id as string, {
          name: String(svc.name || svc.id),
          service_group: group,
        });
      }
    }

    type GroupAgg = { service_group: string; lines_count: number; quantity: number; total: number };
    type ServiceAgg = {
      service_group: string;
      service_id: string | null;
      name: string;
      lines_count: number;
      quantity: number;
      total: number;
    };

    const byGroup = new Map<string, GroupAgg>();
    const byService = new Map<string, ServiceAgg>();

    const resolveBucket = (line: {
      hub_service_type_id?: string | null;
      line_kind?: string | null;
      description?: string | null;
    }): { service_group: string; service_id: string | null; name: string } => {
      const kind = String(line.line_kind ?? '');
      if (kind === 'product') {
        return {
          service_group: 'produtos',
          service_id: null,
          name: String(line.description || 'Produto').trim() || 'Produto',
        };
      }
      const serviceId = (line.hub_service_type_id as string | null) ?? null;
      if (serviceId) {
        const meta = serviceMeta.get(serviceId);
        const fallbackName = String(line.description || 'Serviço').trim() || 'Serviço';
        return {
          service_group: meta?.service_group ?? 'outros',
          service_id: serviceId,
          name: meta?.name ?? fallbackName,
        };
      }
      return {
        service_group: 'outros',
        service_id: null,
        name: String(line.description || 'Outros').trim() || 'Outros',
      };
    };

    for (const line of lines ?? []) {
      const bucket = resolveBucket(line);
      const qty = Number(line.quantity ?? 0);
      const total = Number(line.line_total ?? 0);

      const g = byGroup.get(bucket.service_group) ?? {
        service_group: bucket.service_group,
        lines_count: 0,
        quantity: 0,
        total: 0,
      };
      g.lines_count += 1;
      g.quantity = round2(g.quantity + qty);
      g.total = round2(g.total + total);
      byGroup.set(bucket.service_group, g);

      const serviceKey = bucket.service_id
        ? `svc:${bucket.service_id}`
        : `name:${bucket.service_group}:${bucket.name}`;
      const s = byService.get(serviceKey) ?? {
        service_group: bucket.service_group,
        service_id: bucket.service_id,
        name: bucket.name,
        lines_count: 0,
        quantity: 0,
        total: 0,
      };
      s.lines_count += 1;
      s.quantity = round2(s.quantity + qty);
      s.total = round2(s.total + total);
      byService.set(serviceKey, s);
    }

    const grandTotal = round2([...byGroup.values()].reduce((acc, g) => acc + g.total, 0));
    const by_group = [...byGroup.values()]
      .map((g) => ({
        ...g,
        share_pct: grandTotal > 0 ? round2((g.total / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const by_service = [...byService.values()].sort((a, b) => b.total - a.total).slice(0, 300);

    return res.json({
      period: { from: fromYmd, to: toYmd },
      summary: {
        receivables_count: ids.length,
        lines_count: lines.length,
        total: grandTotal,
        groups_count: by_group.length,
      },
      by_group,
      by_service,
    });
  } catch (e: unknown) {
    console.error('getHubFinanceMovementBySectorReport', e);
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

/** Vendas (recebíveis criados) e acertos (descontos, estornos, write-offs) no período. */
export const getHubFinanceSalesAdjustmentsReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);

    const { data: recs, error: recErr } = await supabaseAdmin
      .from('hub_receivables')
      .select('id, final_amount, status, created_at, guardian_id, guardian:hub_guardians(id, full_name)')
      .eq('clinic_id', clinic_id)
      .or(`unit_id.eq.${unit_id},unit_id.is.null`)
      .is('deleted_at', null)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(500);
    if (recErr) return res.status(500).json({ error: recErr.message });

    const salesByStatus: Record<string, { count: number; total: number }> = {};
    let salesTotal = 0;
    let salesCount = 0;
    for (const rec of recs ?? []) {
      if (rec.status === 'cancelled') continue;
      const amount = Number(rec.final_amount ?? 0);
      const st = String(rec.status ?? 'unknown');
      const cur = salesByStatus[st] ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total = round2(cur.total + amount);
      salesByStatus[st] = cur;
      salesTotal = round2(salesTotal + amount);
      salesCount += 1;
    }

    const { data: adjustments, error: adjErr } = await supabaseAdmin
      .from('hub_financial_adjustments')
      .select(
        'id, receivable_id, adjustment_type, amount, reason, created_at, clinic_id'
      )
      .eq('clinic_id', clinic_id)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(500);
    if (adjErr) return res.status(500).json({ error: adjErr.message });

    const adjRecIds = [...new Set((adjustments ?? []).map((a) => a.receivable_id as string))];
    const recMeta = new Map<string, { unit_id: string | null; guardian_name: string | null }>();
    if (adjRecIds.length > 0) {
      const { data: adjRecs, error: adjRecErr } = await supabaseAdmin
        .from('hub_receivables')
        .select('id, unit_id, guardian:hub_guardians(full_name)')
        .in('id', adjRecIds);
      if (adjRecErr) return res.status(500).json({ error: adjRecErr.message });
      for (const row of adjRecs ?? []) {
        const g = row.guardian as { full_name?: string } | { full_name?: string }[] | null;
        const name = Array.isArray(g) ? g[0]?.full_name : g?.full_name;
        recMeta.set(row.id as string, {
          unit_id: (row.unit_id as string | null) ?? null,
          guardian_name: name ?? null,
        });
      }
    }

    const by_type: Record<string, { count: number; total: number }> = {};
    const items: Array<{
      id: string;
      receivable_id: string;
      adjustment_type: string;
      amount: number;
      reason: string | null;
      created_at: string;
      guardian_name: string | null;
    }> = [];
    let adjustmentsTotal = 0;

    for (const adj of adjustments ?? []) {
      const meta = recMeta.get(adj.receivable_id as string);
      if (meta && !unitMatchesSelected(meta.unit_id, unit_id)) continue;
      const amount = Number(adj.amount ?? 0);
      const type = String(adj.adjustment_type ?? 'unknown');
      const cur = by_type[type] ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total = round2(cur.total + amount);
      by_type[type] = cur;
      adjustmentsTotal = round2(adjustmentsTotal + amount);
      items.push({
        id: adj.id as string,
        receivable_id: adj.receivable_id as string,
        adjustment_type: type,
        amount,
        reason: (adj.reason as string | null) ?? null,
        created_at: adj.created_at as string,
        guardian_name: meta?.guardian_name ?? null,
      });
    }

    return res.json({
      period: { from: fromYmd, to: toYmd },
      sales: {
        receivables_count: salesCount,
        total: salesTotal,
        by_status: salesByStatus,
      },
      adjustments: {
        count: items.length,
        total: adjustmentsTotal,
        by_type,
        items: items.slice(0, 200),
      },
    });
  } catch (e: unknown) {
    console.error('getHubFinanceSalesAdjustmentsReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

type CommissionReportPayload = {
  period: { from: string; to: string };
  summary: {
    receivables_count: number;
    lines_with_commission: number;
    total_commission: number;
    total_sales: number;
  };
  by_service: Array<{
    service_id: string;
    name: string;
    lines_count: number;
    sales_total: number;
    commission_total: number;
  }>;
  by_product: Array<{
    product_id: string;
    name: string;
    lines_count: number;
    sales_total: number;
    commission_total: number;
  }>;
  by_staff: Array<{
    staff_id: string;
    name: string;
    lines_count: number;
    sales_total: number;
    commission_total: number;
  }>;
  items: Array<{
    receivable_id: string;
    line_id: string;
    description: string;
    service_name: string | null;
    product_name: string | null;
    staff_name: string | null;
    staff_id: string | null;
    line_total: number;
    commission_amount: number;
    basis: string | null;
    rate: number | null;
  }>;
};

async function buildCommissionsReport(params: {
  clinic_id: string;
  unit_id: string;
  fromYmd: string;
  toYmd: string;
  /** Se informado, mantém apenas linhas atribuídas a este staff. */
  onlyStaffId?: string | null;
}): Promise<{ ok: true; data: CommissionReportPayload } | { ok: false; status: number; error: string }> {
  const { clinic_id, unit_id, fromYmd, toYmd, onlyStaffId } = params;
  const fromIso = utcDayStartIso(fromYmd);
  const toIso = utcDayEndIso(toYmd);

  const { data: rules, error: ruErr } = await supabaseAdmin
    .from('hub_commission_rules')
    .select('hub_service_type_id, hub_inventory_item_id, basis, rate, active')
    .eq('clinic_id', clinic_id)
    .eq('active', true)
    .is('deleted_at', null);
  if (ruErr) {
    const msg = String(ruErr.message || '');
    const missingTable =
      /Could not find the table .*hub_commission_rules/i.test(msg) ||
      /relation .*hub_commission_rules.* does not exist/i.test(msg);
    if (missingTable) {
      return {
        ok: false,
        status: 503,
        error: 'Tabela hub_commission_rules não encontrada. Aplique 038_create_hub_commission_rules.sql.',
      };
    }
    return { ok: false, status: 500, error: msg };
  }
  const ruleByService = new Map<string, { basis: string; rate: number }>();
  const ruleByProduct = new Map<string, { basis: string; rate: number }>();
  for (const r of rules ?? []) {
    const entry = { basis: String(r.basis), rate: Number(r.rate ?? 0) };
    const sid = r.hub_service_type_id as string | null;
    const pid = r.hub_inventory_item_id as string | null;
    if (sid) ruleByService.set(sid, entry);
    if (pid) ruleByProduct.set(pid, entry);
  }

  const { data: recs, error: recErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, source_type, source_id, final_amount, status, created_at')
    .eq('clinic_id', clinic_id)
    .or(`unit_id.eq.${unit_id},unit_id.is.null`)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .limit(800);
  if (recErr) return { ok: false, status: 500, error: recErr.message };
  const recIds = (recs ?? []).map((r) => r.id as string);
  if (recIds.length === 0) {
    return {
      ok: true,
      data: {
        period: { from: fromYmd, to: toYmd },
        summary: { receivables_count: 0, lines_with_commission: 0, total_commission: 0, total_sales: 0 },
        by_service: [],
        by_product: [],
        by_staff: [],
        items: [],
      },
    };
  }

  const { data: lines, error: lnErr } = await supabaseAdmin
    .from('hub_receivable_lines')
    .select('id, receivable_id, hub_service_type_id, hub_inventory_item_id, description, line_total')
    .eq('clinic_id', clinic_id)
    .in('receivable_id', recIds);
  if (lnErr) return { ok: false, status: 500, error: lnErr.message };

  const appointmentIds = (recs ?? [])
    .filter((r) => r.source_type === 'appointment' && r.source_id)
    .map((r) => r.source_id as string);
  const encounterIds = (recs ?? [])
    .filter((r) => r.source_type === 'encounter' && r.source_id)
    .map((r) => r.source_id as string);

  const staffByAppointment = new Map<string, string>();
  if (appointmentIds.length > 0) {
    const { data: appts } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, hub_staff_member_id')
      .in('id', appointmentIds);
    for (const a of appts ?? []) {
      if (a.hub_staff_member_id) staffByAppointment.set(a.id as string, a.hub_staff_member_id as string);
    }
  }

  const staffByEncounter = new Map<string, string>();
  if (encounterIds.length > 0) {
    const { data: encs } = await supabaseAdmin
      .from('hub_encounters')
      .select('id, hub_staff_member_id')
      .in('id', encounterIds);
    for (const e of encs ?? []) {
      if (e.hub_staff_member_id) staffByEncounter.set(e.id as string, e.hub_staff_member_id as string);
    }
  }

  const staffIds = [
    ...new Set([...staffByAppointment.values(), ...staffByEncounter.values()]),
  ];
  const staffNames = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from('hub_staff_members')
      .select('id, full_name, display_name')
      .in('id', staffIds);
    for (const s of staffRows ?? []) {
      staffNames.set(
        s.id as string,
        String((s.display_name as string | null) || (s.full_name as string | null) || s.id)
      );
    }
  }

  const serviceIds = [
    ...new Set((lines ?? []).map((l) => l.hub_service_type_id as string | null).filter(Boolean) as string[]),
  ];
  const serviceNames = new Map<string, string>();
  if (serviceIds.length > 0) {
    const { data: svcRows } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, name')
      .in('id', serviceIds);
    for (const s of svcRows ?? []) serviceNames.set(s.id as string, String(s.name ?? s.id));
  }

  const productIds = [
    ...new Set((lines ?? []).map((l) => l.hub_inventory_item_id as string | null).filter(Boolean) as string[]),
  ];
  const productNames = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: itemRows } = await supabaseAdmin
      .from('hub_inventory_items')
      .select('id, name')
      .in('id', productIds);
    for (const p of itemRows ?? []) productNames.set(p.id as string, String(p.name ?? p.id));
  }

  const recById = new Map((recs ?? []).map((r) => [r.id as string, r]));
  const byService = new Map<
    string,
    { service_id: string; name: string; lines_count: number; sales_total: number; commission_total: number }
  >();
  const byProduct = new Map<
    string,
    { product_id: string; name: string; lines_count: number; sales_total: number; commission_total: number }
  >();
  const byStaff = new Map<
    string,
    { staff_id: string; name: string; lines_count: number; sales_total: number; commission_total: number }
  >();
  const items: CommissionReportPayload['items'] = [];

  let totalCommission = 0;
  let totalSales = 0;
  let linesWithCommission = 0;
  const receivableIdsWithKeptLines = new Set<string>();

  for (const ln of lines ?? []) {
    const lineTotal = round2(Number(ln.line_total ?? 0));
    const stId = (ln.hub_service_type_id as string) ?? null;
    const itemId = (ln.hub_inventory_item_id as string) ?? null;
    const rule = stId ? ruleByService.get(stId) : itemId ? ruleByProduct.get(itemId) : undefined;
    let commission = 0;
    let basis: string | null = null;
    let rate: number | null = null;
    if (rule) {
      basis = rule.basis;
      rate = rule.rate;
      if (rule.basis === 'percent_of_sale') commission = round2(lineTotal * (rule.rate / 100));
      else commission = round2(Math.min(rule.rate, lineTotal));
    }
    if (commission <= 0) continue;

    const rec = recById.get(ln.receivable_id as string);
    let staffId: string | null = null;
    if (rec?.source_id) {
      if (rec.source_type === 'appointment') {
        staffId = staffByAppointment.get(rec.source_id as string) ?? null;
      } else if (rec.source_type === 'encounter') {
        staffId = staffByEncounter.get(rec.source_id as string) ?? null;
      }
    }

    if (onlyStaffId && staffId !== onlyStaffId) continue;

    linesWithCommission += 1;
    totalCommission = round2(totalCommission + commission);
    totalSales = round2(totalSales + lineTotal);
    receivableIdsWithKeptLines.add(ln.receivable_id as string);

    if (stId) {
      const cur = byService.get(stId) ?? {
        service_id: stId,
        name: serviceNames.get(stId) ?? 'Serviço',
        lines_count: 0,
        sales_total: 0,
        commission_total: 0,
      };
      cur.lines_count += 1;
      cur.sales_total = round2(cur.sales_total + lineTotal);
      cur.commission_total = round2(cur.commission_total + commission);
      byService.set(stId, cur);
    }
    if (itemId) {
      const cur = byProduct.get(itemId) ?? {
        product_id: itemId,
        name: productNames.get(itemId) ?? 'Produto',
        lines_count: 0,
        sales_total: 0,
        commission_total: 0,
      };
      cur.lines_count += 1;
      cur.sales_total = round2(cur.sales_total + lineTotal);
      cur.commission_total = round2(cur.commission_total + commission);
      byProduct.set(itemId, cur);
    }
    if (staffId) {
      const cur = byStaff.get(staffId) ?? {
        staff_id: staffId,
        name: staffNames.get(staffId) ?? 'Profissional',
        lines_count: 0,
        sales_total: 0,
        commission_total: 0,
      };
      cur.lines_count += 1;
      cur.sales_total = round2(cur.sales_total + lineTotal);
      cur.commission_total = round2(cur.commission_total + commission);
      byStaff.set(staffId, cur);
    }
    items.push({
      receivable_id: ln.receivable_id as string,
      line_id: ln.id as string,
      description: String(ln.description ?? ''),
      service_name: stId ? serviceNames.get(stId) ?? null : null,
      product_name: itemId ? productNames.get(itemId) ?? null : null,
      staff_name: staffId ? staffNames.get(staffId) ?? null : null,
      staff_id: staffId,
      line_total: lineTotal,
      commission_amount: commission,
      basis,
      rate,
    });
  }

  return {
    ok: true,
    data: {
      period: { from: fromYmd, to: toYmd },
      summary: {
        receivables_count: onlyStaffId ? receivableIdsWithKeptLines.size : recIds.length,
        lines_with_commission: linesWithCommission,
        total_commission: totalCommission,
        total_sales: totalSales,
      },
      by_service: [...byService.values()].sort((a, b) => b.commission_total - a.commission_total),
      by_product: [...byProduct.values()].sort((a, b) => b.commission_total - a.commission_total),
      by_staff: [...byStaff.values()].sort((a, b) => b.commission_total - a.commission_total),
      items: items.slice(0, 300),
    },
  };
}

/** Comissões estimadas no período (regras ativas × linhas de recebíveis não cancelados). */
export const getHubFinanceCommissionsReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const built = await buildCommissionsReport({ clinic_id, unit_id, fromYmd, toYmd });
    if (!built.ok) return res.status(built.status).json({ error: built.error });
    return res.json(built.data);
  } catch (e: unknown) {
    console.error('getHubFinanceCommissionsReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/**
 * Comissões do profissional logado (self-scoped).
 * Ignora qualquer staff_id da query — sempre resolve pelo usuário autenticado.
 */
export const getHubFinanceMyCommissionsReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;

    const myStaffId = await resolveStaffIdForUser(clinic_id, req.user?.id);
    if (!myStaffId) {
      return res.status(403).json({
        error: 'Seu usuário não está vinculado a um profissional da equipe nesta clínica.',
      });
    }

    const built = await buildCommissionsReport({
      clinic_id,
      unit_id,
      fromYmd,
      toYmd,
      onlyStaffId: myStaffId,
    });
    if (!built.ok) return res.status(built.status).json({ error: built.error });

    return res.json({
      ...built.data,
      staff_id: myStaffId,
      by_staff: built.data.by_staff.filter((s) => s.staff_id === myStaffId),
    });
  } catch (e: unknown) {
    console.error('getHubFinanceMyCommissionsReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** Top clientes por faturamento (pagamentos) no período. */
export const getHubFinanceTopClientsReport = async (req: Request, res: Response) => {
  try {
    const parsed = parsePeriodQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    const limitRaw = z.coerce.number().int().min(5).max(100).safeParse(req.query.limit);
    const limit = limitRaw.success ? limitRaw.data : 25;

    const { data: payments, error } = await supabaseAdmin
      .from('hub_payments')
      .select('amount, payment_date, receivable_id')
      .eq('clinic_id', clinic_id)
      .eq('status', 'posted')
      .gte('payment_date', fromIso)
      .lte('payment_date', toIso)
      .limit(20000);
    if (error) return res.status(500).json({ error: error.message });

    const recIds = [...new Set((payments ?? []).map((p) => p.receivable_id as string))];
    const recMeta = new Map<string, { unit_id: string | null; guardian_id: string | null }>();
    if (recIds.length > 0) {
      const chunk = 500;
      for (let i = 0; i < recIds.length; i += chunk) {
        const slice = recIds.slice(i, i + chunk);
        const { data: recs, error: recErr } = await supabaseAdmin
          .from('hub_receivables')
          .select('id, unit_id, guardian_id')
          .in('id', slice);
        if (recErr) return res.status(500).json({ error: recErr.message });
        for (const rec of recs ?? []) {
          recMeta.set(rec.id as string, {
            unit_id: (rec.unit_id as string | null) ?? null,
            guardian_id: (rec.guardian_id as string | null) ?? null,
          });
        }
      }
    }

    const byGuardian = new Map<string, { total: number; payments_count: number }>();
    let grandTotal = 0;
    for (const p of payments ?? []) {
      const meta = recMeta.get(p.receivable_id as string);
      if (!meta || !unitMatchesSelected(meta.unit_id, unit_id)) continue;
      const gid = meta.guardian_id;
      if (!gid) continue;
      const amount = Number(p.amount ?? 0);
      const cur = byGuardian.get(gid) ?? { total: 0, payments_count: 0 };
      cur.total = round2(cur.total + amount);
      cur.payments_count += 1;
      byGuardian.set(gid, cur);
      grandTotal = round2(grandTotal + amount);
    }

    const ranked = [...byGuardian.entries()]
      .map(([guardian_id, v]) => ({ guardian_id, ...v }))
      .sort((a, b) => b.total - a.total);
    const top = ranked.slice(0, limit);

    const nameById = new Map<string, { full_name: string; phone: string | null }>();
    if (top.length > 0) {
      const { data: gRows, error: gErr } = await supabaseAdmin
        .from('hub_guardians')
        .select('id, full_name, phone')
        .in(
          'id',
          top.map((t) => t.guardian_id)
        );
      if (gErr) return res.status(500).json({ error: gErr.message });
      for (const g of gRows ?? []) {
        nameById.set(g.id as string, {
          full_name: String(g.full_name ?? ''),
          phone: (g.phone as string | null) ?? null,
        });
      }
    }

    return res.json({
      period: { from: fromYmd, to: toYmd },
      summary: {
        clients_with_payments: ranked.length,
        total_revenue: grandTotal,
      },
      items: top.map((t, idx) => {
        const meta = nameById.get(t.guardian_id);
        return {
          rank: idx + 1,
          guardian_id: t.guardian_id,
          full_name: meta?.full_name ?? '—',
          phone: meta?.phone ?? null,
          payments_count: t.payments_count,
          total: t.total,
          share_pct: grandTotal > 0 ? Math.round((t.total / grandTotal) * 1000) / 10 : 0,
        };
      }),
    });
  } catch (e: unknown) {
    console.error('getHubFinanceTopClientsReport', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

/** Pacotes: vendidos no período, consumos, saldos ativos e a vencer. */
export const getHubFinancePackagesReport = async (req: Request, res: Response) => {
  try {
    const clinic = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinic_id = clinic.data;
    const period = (() => {
      const fromRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.from);
      const toRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.to);
      if (fromRaw.success && toRaw.success) {
        if (fromRaw.data > toRaw.data) return { ok: false as const, error: 'from não pode ser maior que to' };
        return { ok: true as const, fromYmd: fromRaw.data, toYmd: toRaw.data };
      }
      const days = z.coerce.number().int().min(1).max(366).safeParse(req.query.days);
      const n = days.success ? days.data : 30;
      const toYmd = ymdTodayUtc();
      const fromYmd = addDaysYmd(toYmd, -(n - 1));
      return { ok: true as const, fromYmd, toYmd };
    })();
    if (!period.ok) return res.status(400).json({ error: period.error });
    const { fromYmd, toYmd } = period;
    const fromIso = utcDayStartIso(fromYmd);
    const toIso = utcDayEndIso(toYmd);
    const asOf = ymdTodayUtc();
    const expiringDaysParsed = z.coerce.number().int().min(1).max(180).safeParse(req.query.expiring_days);
    const expiringDays = expiringDaysParsed.success ? expiringDaysParsed.data : 30;
    const expiringUntil = addDaysYmd(asOf, expiringDays);

    const { data: balances, error: bErr } = await supabaseAdmin
      .from('hub_customer_package_balances')
      .select(
        `id, guardian_id, pet_id, package_id, sessions_remaining, sessions_total, expires_at, purchased_at, created_at, purchase_group_id,
        hub_packages(id, name),
        hub_guardians(id, full_name),
        hub_pets(id, name),
        hub_service_types(id, name)`
      )
      .eq('clinic_id', clinic_id)
      .order('purchased_at', { ascending: false })
      .limit(5000);
    if (bErr) {
      if (String(bErr.message || '').includes('hub_customer_package_balances')) {
        return res.json({
          period: { from: fromYmd, to: toYmd },
          expiring_until: expiringUntil,
          summary: {
            purchased_lines: 0,
            sessions_sold: 0,
            sessions_redeemed: 0,
            active_with_balance: 0,
            expiring_soon: 0,
          },
          purchased: [],
          active: [],
          expiring: [],
        });
      }
      return res.status(500).json({ error: bErr.message });
    }

    const purchased: Array<{
      id: string;
      package_name: string | null;
      service_name: string | null;
      guardian_id: string;
      guardian_name: string | null;
      pet_name: string | null;
      sessions_total: number;
      sessions_remaining: number;
      purchased_at: string | null;
      expires_at: string | null;
    }> = [];
    const active: typeof purchased = [];
    const expiring: typeof purchased = [];
    let sessionsSold = 0;
    let activeCount = 0;
    let expiringCount = 0;

    const mapRow = (row: (typeof balances)[number]) => {
      const pkg = row.hub_packages as { name?: string } | { name?: string }[] | null;
      const g = row.hub_guardians as { full_name?: string } | { full_name?: string }[] | null;
      const pet = row.hub_pets as { name?: string } | { name?: string }[] | null;
      const svc = row.hub_service_types as { name?: string } | { name?: string }[] | null;
      const pkgName = Array.isArray(pkg) ? pkg[0]?.name : pkg?.name;
      const gName = Array.isArray(g) ? g[0]?.full_name : g?.full_name;
      const petName = Array.isArray(pet) ? pet[0]?.name : pet?.name;
      const svcName = Array.isArray(svc) ? svc[0]?.name : svc?.name;
      return {
        id: row.id as string,
        package_name: pkgName ?? null,
        service_name: svcName ?? null,
        guardian_id: row.guardian_id as string,
        guardian_name: gName ?? null,
        pet_name: petName ?? null,
        sessions_total: Number(row.sessions_total ?? 0),
        sessions_remaining: Number(row.sessions_remaining ?? 0),
        purchased_at: (row.purchased_at as string | null) ?? (row.created_at as string | null) ?? null,
        expires_at: (row.expires_at as string | null) ?? null,
      };
    };

    for (const row of balances ?? []) {
      const mapped = mapRow(row);
      const purchasedAt = mapped.purchased_at;
      if (purchasedAt && purchasedAt >= fromIso && purchasedAt <= toIso) {
        purchased.push(mapped);
        sessionsSold += mapped.sessions_total || 0;
      }
      if (mapped.sessions_remaining > 0) {
        activeCount += 1;
        if (active.length < 200) active.push(mapped);
        const exp = mapped.expires_at;
        if (exp && exp >= asOf && exp <= expiringUntil) {
          expiringCount += 1;
          expiring.push(mapped);
        }
      }
    }

    let sessionsRedeemed = 0;
    const { data: redemptions, error: redErr } = await supabaseAdmin
      .from('hub_package_redemptions')
      .select('id, redeemed_at, reversed_at')
      .eq('clinic_id', clinic_id)
      .is('reversed_at', null)
      .gte('redeemed_at', fromIso)
      .lte('redeemed_at', toIso)
      .limit(8000);
    if (!redErr && redemptions) {
      sessionsRedeemed = redemptions.length;
    } else if (redErr && !String(redErr.message || '').includes('hub_package_redemptions')) {
      return res.status(500).json({ error: redErr.message });
    }

    expiring.sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)));

    return res.json({
      period: { from: fromYmd, to: toYmd },
      expiring_until: expiringUntil,
      summary: {
        purchased_lines: purchased.length,
        sessions_sold: sessionsSold,
        sessions_redeemed: sessionsRedeemed,
        active_with_balance: activeCount,
        expiring_soon: expiringCount,
      },
      purchased: purchased.slice(0, 200),
      active: active.slice(0, 100),
      expiring: expiring.slice(0, 100),
    });
  } catch (e: unknown) {
    console.error('getHubFinancePackagesReport', e);
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
          error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
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
          error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
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

export const patchHubFinanceExpense = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = postExpenseBodySchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
    }
    const { clinic_id, unit_id, amount, category, description, expense_date, payment_method, notes } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('hub_expenses')
      .update({
        amount: round2(amount),
        category,
        description,
        expense_date: expense_date ?? ymdTodayUtc(),
        payment_method: payment_method ?? null,
        notes: notes ?? null,
      })
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id)
      .select('*')
      .maybeSingle();
    if (error) {
      if (String(error.message || '').includes('hub_expenses')) {
        return res.status(503).json({
          error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Despesa não encontrada' });
    return res.json({ expense: data });
  } catch (e: unknown) {
    console.error('patchHubFinanceExpense', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const deleteExpenseQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
  })
  .strict();

export const deleteHubFinanceExpense = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = deleteExpenseQuerySchema.safeParse(req.query);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    const { clinic_id, unit_id } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('hub_expenses')
      .delete()
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id)
      .select('id')
      .maybeSingle();
    if (error) {
      if (String(error.message || '').includes('hub_expenses')) {
        return res.status(503).json({
          error: 'Tabela hub_expenses não encontrada. Aplique a migração 037_create_hub_expenses.sql.',
        });
      }
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Despesa não encontrada' });
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('deleteHubFinanceExpense', e);
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

const payableCategorySchema = z.enum(PAYABLE_CATEGORIES);
const payablePaymentMethodSchema = z.enum(PAYABLE_PAYMENT_METHODS);
const payableStatusSchema = z.enum(['pending', 'paid', 'cancelled']);

const missingPayablesTable = (msg: string) =>
  String(msg || '').includes('hub_payables')
    ? 'Tabela hub_payables não encontrada. Aplique a migração 113_create_hub_payables.sql.'
    : null;

const missingPayableSchedulesTable = (msg: string) =>
  String(msg || '').includes('hub_payable_schedules') || String(msg || '').includes('recurrence_detached')
    ? 'Recorrência de contas a pagar indisponível. Aplique a migração 117_create_hub_payable_schedules.sql.'
    : null;

const missingEstimatedAmountColumns = (msg: string) =>
  String(msg || '').includes('amount_confirmed') || String(msg || '').includes('amount_mode')
    ? 'Valor estimado de contas a pagar indisponível. Aplique a migração 118_alter_hub_payables_estimated_amount.sql.'
    : null;

function payableWriteError(message: string, statusFallback: (error: string) => number = () => 500) {
  const estimated = missingEstimatedAmountColumns(message);
  if (estimated) return { status: 503, error: estimated };
  const schedule = missingPayableSchedulesTable(message);
  if (schedule) return { status: 503, error: schedule };
  const table = missingPayablesTable(message);
  if (table) return { status: 503, error: table };
  return { status: statusFallback(message), error: message };
}

function payableSourceLabel(
  payable: HubPayableRow,
  surgeryMeta: Map<string, { title: string; pet_name?: string | null }>,
): string {
  if (payable.source_type === 'recurrence') return 'Recorrente';
  if (payable.source_type === 'surgery' && payable.source_id) {
    const meta = surgeryMeta.get(payable.source_id);
    if (!meta) return 'Cirurgia';
    return meta.pet_name ? `Cirurgia: ${meta.title} (${meta.pet_name})` : `Cirurgia: ${meta.title}`;
  }
  return 'Manual';
}

const listPayablesQuerySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    status: payableStatusSchema.optional(),
    source_type: z.enum(['surgery', 'manual', 'recurrence']).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const listHubFinancePayables = async (req: Request, res: Response) => {
  try {
    const parsed = listPayablesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
    }
    const { clinic_id, unit_id, status, source_type, from, to } = parsed.data;
    const horizon = await ensurePayableScheduleHorizon({ clinicId: clinic_id, unitId: unit_id });
    if (horizon.error && !horizon.missingTable) {
      console.error('ensurePayableScheduleHorizon', horizon.error);
    }
    let q = supabaseAdmin
      .from('hub_payables')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('unit_id', unit_id)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (status) q = q.eq('status', status);
    else q = q.neq('status', 'cancelled');
    if (source_type) q = q.eq('source_type', source_type);

    const { data, error } = await q;
    if (error) {
      const hint = missingPayablesTable(error.message);
      if (hint) return res.status(503).json({ error: hint });
      return res.status(500).json({ error: error.message });
    }

    let payables = (data ?? []) as HubPayableRow[];
    if (from || to) {
      payables = payables.filter((p) => {
        const ref =
          p.status === 'paid' && p.paid_at
            ? String(p.paid_at).slice(0, 10)
            : p.due_date
              ? String(p.due_date).slice(0, 10)
              : String(p.created_at).slice(0, 10);
        if (from && ref < from) return false;
        if (to && ref > to) return false;
        return true;
      });
    }
    const surgeryIds = [
      ...new Set(
        payables
          .filter((p) => p.source_type === 'surgery' && p.source_id)
          .map((p) => p.source_id as string),
      ),
    ];
    const surgeryMeta = new Map<string, { title: string; pet_name?: string | null }>();
    if (surgeryIds.length) {
      const { data: surgeries } = await supabaseAdmin
        .from('hub_surgeries')
        .select('id, title, hub_pets(name)')
        .eq('clinic_id', clinic_id)
        .in('id', surgeryIds);
      for (const s of surgeries ?? []) {
        const pet = s.hub_pets as { name?: string } | { name?: string }[] | null;
        const petName = Array.isArray(pet) ? pet[0]?.name : pet?.name;
        surgeryMeta.set(s.id as string, { title: String(s.title ?? ''), pet_name: petName ?? null });
      }
    }

    return res.json({
      payables: payables.map((p) => ({
        ...p,
        source_label: payableSourceLabel(p, surgeryMeta),
      })),
    });
  } catch (e: unknown) {
    console.error('listHubFinancePayables', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const postPayableBodySchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    amount: z.number().positive(),
    category: payableCategorySchema.default('professional_fee'),
    description: z.string().trim().min(1).max(2000),
    notes: z.string().trim().max(4000).optional().nullable(),
    payee_staff_member_id: uuidStr.optional().nullable(),
    payee_supplier_id: uuidStr.optional().nullable(),
    payee_name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['pending', 'paid']).default('pending'),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    payment_method: payablePaymentMethodSchema.optional().nullable(),
    paid_at: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.payee_staff_member_id && v.payee_supplier_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe profissional ou fornecedor, não os dois',
        path: ['payee_supplier_id'],
      });
    }
    if (!v.payee_staff_member_id && !v.payee_supplier_id && !(v.payee_name && v.payee_name.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o profissional, o fornecedor ou o nome do credor',
        path: ['payee_name'],
      });
    }
    if (v.status === 'paid') {
      if (!v.payment_method) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Forma de pagamento obrigatória quando já pago',
          path: ['payment_method'],
        });
      }
    }
  });

export const postHubFinancePayable = async (req: Request, res: Response) => {
  try {
    const parsed = postPayableBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    let payeeName = (b.payee_name || '').trim();
    let payeeStaffId = b.payee_staff_member_id ?? null;
    let payeeSupplierId = b.payee_supplier_id ?? null;

    if (payeeStaffId && payeeSupplierId) {
      return res.status(400).json({ error: 'Informe profissional ou fornecedor, não os dois' });
    }

    if (payeeStaffId) {
      const { data: staff } = await supabaseAdmin
        .from('hub_staff_members')
        .select('id, full_name, display_name')
        .eq('id', payeeStaffId)
        .eq('clinic_id', b.clinic_id)
        .maybeSingle();
      if (!staff) return res.status(400).json({ error: 'Profissional não encontrado nesta clínica' });
      if (!payeeName) {
        payeeName = String(staff.full_name || staff.display_name || 'Profissional');
      }
    }

    if (payeeSupplierId) {
      const { data: supplier } = await supabaseAdmin
        .from('hub_suppliers')
        .select('id, name, party_name')
        .eq('id', payeeSupplierId)
        .eq('clinic_id', b.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!supplier) return res.status(400).json({ error: 'Fornecedor não encontrado nesta clínica' });
      if (!payeeName) {
        payeeName = String(supplier.name || supplier.party_name || 'Fornecedor');
      }
    }

    const status = b.status;
    const paidAt =
      status === 'paid' ? b.paid_at ?? new Date().toISOString() : null;
    const paymentMethod = status === 'paid' ? b.payment_method ?? null : null;

    const { data, error } = await supabaseAdmin
      .from('hub_payables')
      .insert({
        clinic_id: b.clinic_id,
        unit_id: b.unit_id,
        amount: round2(b.amount),
        category: b.category,
        description: b.description,
        notes: b.notes ?? null,
        payee_staff_member_id: payeeStaffId,
        payee_supplier_id: payeeSupplierId,
        payee_name: payeeName,
        source_type: 'manual',
        source_id: null,
        source_role: null,
        status,
        due_date: status === 'pending' ? b.due_date ?? null : b.due_date ?? null,
        paid_at: paidAt,
        payment_method: paymentMethod,
        created_by_user_id: req.user?.id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      const hint = missingPayablesTable(error.message);
      if (hint) return res.status(503).json({ error: hint });
      if (String(error.message || '').includes('payee_supplier_id')) {
        return res.status(503).json({
          error: 'Coluna payee_supplier_id ausente. Aplique a migração 115_alter_hub_payables_supplier.sql.',
        });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ payable: data });
  } catch (e: unknown) {
    console.error('postHubFinancePayable', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const patchPayableBodySchema = z
  .object({
    clinic_id: uuidStr,
    amount: z.number().positive().optional(),
    category: payableCategorySchema.optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    notes: z.string().trim().max(4000).optional().nullable(),
    payee_staff_member_id: uuidStr.optional().nullable(),
    payee_supplier_id: uuidStr.optional().nullable(),
    payee_name: z.string().trim().min(1).max(200).optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.payee_staff_member_id && v.payee_supplier_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe profissional ou fornecedor, não os dois',
        path: ['payee_supplier_id'],
      });
    }
  });

export const patchHubFinancePayable = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = patchPayableBodySchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
    }
    const { clinic_id, ...fields } = parsed.data;

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_payables')
      .select('*')
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) {
      const hint = missingPayablesTable(exErr.message);
      if (hint) return res.status(503).json({ error: hint });
      return res.status(500).json({ error: exErr.message });
    }
    if (!existing) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: 'Só é possível editar títulos pendentes' });
    }

    const update: Record<string, unknown> = {};
    if (fields.amount != null) update.amount = round2(fields.amount);
    if (fields.category != null) update.category = fields.category;
    if (fields.description != null) update.description = fields.description;
    if (fields.notes !== undefined) update.notes = fields.notes;
    if (fields.due_date !== undefined) update.due_date = fields.due_date;

    const nextStaff =
      fields.payee_staff_member_id !== undefined
        ? fields.payee_staff_member_id
        : (existing.payee_staff_member_id as string | null);
    const nextSupplier =
      fields.payee_supplier_id !== undefined
        ? fields.payee_supplier_id
        : ((existing as { payee_supplier_id?: string | null }).payee_supplier_id ?? null);

    if (fields.payee_staff_member_id !== undefined || fields.payee_supplier_id !== undefined) {
      if (nextStaff && nextSupplier) {
        return res.status(400).json({ error: 'Informe profissional ou fornecedor, não os dois' });
      }
      if (fields.payee_staff_member_id !== undefined) {
        update.payee_staff_member_id = fields.payee_staff_member_id;
        if (fields.payee_staff_member_id) {
          update.payee_supplier_id = null;
          const { data: staff } = await supabaseAdmin
            .from('hub_staff_members')
            .select('full_name, display_name')
            .eq('id', fields.payee_staff_member_id)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
          if (!staff) return res.status(400).json({ error: 'Profissional não encontrado nesta clínica' });
          if (!fields.payee_name) {
            update.payee_name = String(staff.full_name || staff.display_name || existing.payee_name);
          }
        }
      }
      if (fields.payee_supplier_id !== undefined) {
        update.payee_supplier_id = fields.payee_supplier_id;
        if (fields.payee_supplier_id) {
          update.payee_staff_member_id = null;
          const { data: supplier } = await supabaseAdmin
            .from('hub_suppliers')
            .select('id, name, party_name')
            .eq('id', fields.payee_supplier_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
          if (!supplier) return res.status(400).json({ error: 'Fornecedor não encontrado nesta clínica' });
          if (!fields.payee_name) {
            update.payee_name = String(supplier.name || supplier.party_name || existing.payee_name);
          }
        }
      }
    }

    if (fields.payee_name != null) update.payee_name = fields.payee_name;

    if (Object.keys(update).length === 0) {
      return res.json({ payable: existing });
    }

    const confirmingAmount = fields.amount != null && existing.source_type === 'recurrence';
    if (existing.source_type === 'recurrence') {
      update.recurrence_detached = true;
      if (confirmingAmount) update.amount_confirmed = true;
    }

    const { data, error } = await supabaseAdmin
      .from('hub_payables')
      .update(update)
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .select('*')
      .maybeSingle();
    if (error) {
      if (String(error.message || '').includes('payee_supplier_id')) {
        return res.status(503).json({
          error: 'Coluna payee_supplier_id ausente. Aplique a migração 115_alter_hub_payables_supplier.sql.',
        });
      }
      const estimatedHint = missingEstimatedAmountColumns(error.message);
      if (estimatedHint) return res.status(503).json({ error: estimatedHint });
      const scheduleHint = missingPayableSchedulesTable(error.message);
      if (scheduleHint) return res.status(503).json({ error: scheduleHint });
      if (error.code === '23505' || String(error.message || '').includes('uniq_hub_payables_recurrence_due')) {
        return res.status(409).json({ error: 'Já existe uma competência desta recorrência nessa data.' });
      }
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (confirmingAmount && existing.source_id) {
      const synced = await applyConfirmedEstimateToSchedule({
        clinicId: clinic_id,
        scheduleId: String(existing.source_id),
        amount: round2(fields.amount as number),
      });
      if (synced.error) {
        const mapped = payableWriteError(synced.error);
        return res.status(mapped.status).json({ error: mapped.error });
      }
    }
    return res.json({ payable: data });
  } catch (e: unknown) {
    console.error('patchHubFinancePayable', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const payPayableBodySchema = z
  .object({
    clinic_id: uuidStr,
    payment_method: payablePaymentMethodSchema,
    paid_at: z.string().datetime({ offset: true }).optional().nullable(),
    amount: z.number().positive().optional(),
  })
  .strict();

export const postHubFinancePayablePay = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = payPayableBodySchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
    }
    const { clinic_id, payment_method, paid_at, amount } = parsed.data;

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_payables')
      .select('*')
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) {
      const hint = missingPayablesTable(exErr.message);
      if (hint) return res.status(503).json({ error: hint });
      return res.status(500).json({ error: exErr.message });
    }
    if (!existing) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: 'Só é possível pagar títulos pendentes' });
    }

    const needsInvoice = existing.amount_confirmed === false;
    if (needsInvoice && amount == null) {
      return res.status(409).json({ error: 'Informe o valor da fatura' });
    }
    const invoiceAmount = needsInvoice ? round2(amount as number) : null;
    if (invoiceAmount != null && existing.source_type === 'recurrence') {
      const { error: confirmErr } = await supabaseAdmin
        .from('hub_payables')
        .update({
          amount: invoiceAmount,
          amount_confirmed: true,
          recurrence_detached: true,
        })
        .eq('id', id.data)
        .eq('clinic_id', clinic_id)
        .eq('status', 'pending');
      if (confirmErr) {
        const mapped = payableWriteError(confirmErr.message);
        return res.status(mapped.status).json({ error: mapped.error });
      }
      if (existing.source_id) {
        const synced = await applyConfirmedEstimateToSchedule({
          clinicId: clinic_id,
          scheduleId: String(existing.source_id),
          amount: invoiceAmount,
        });
        if (synced.error) {
          const mapped = payableWriteError(synced.error);
          return res.status(mapped.status).json({ error: mapped.error });
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('hub_payables')
      .update({
        status: 'paid',
        payment_method,
        paid_at: paid_at ?? new Date().toISOString(),
        ...(invoiceAmount != null ? { amount: invoiceAmount, amount_confirmed: true } : {}),
      })
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) {
      const mapped = payableWriteError(error.message);
      return res.status(mapped.status).json({ error: mapped.error });
    }
    if (!data) return res.status(409).json({ error: 'Título já não está pendente' });
    return res.json({ payable: data });
  } catch (e: unknown) {
    console.error('postHubFinancePayablePay', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const cancelPayableBodySchema = z
  .object({
    clinic_id: uuidStr,
  })
  .strict();

export const postHubFinancePayableCancel = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = cancelPayableBodySchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    const { clinic_id } = parsed.data;

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_payables')
      .select('*')
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) {
      const hint = missingPayablesTable(exErr.message);
      if (hint) return res.status(503).json({ error: hint });
      return res.status(500).json({ error: exErr.message });
    }
    if (!existing) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: 'Só é possível cancelar títulos pendentes' });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_payables')
      .update({ status: 'cancelled' })
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(409).json({ error: 'Título já não está pendente' });
    return res.json({ payable: data });
  } catch (e: unknown) {
    console.error('postHubFinancePayableCancel', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const payableScheduleFrequencySchema = z.enum(PAYABLE_SCHEDULE_FREQUENCIES);

const schedulePayeeSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    amount: z.number().positive(),
    category: payableCategorySchema.optional(),
    description: z.string().trim().min(1).max(2000),
    notes: z.string().trim().max(4000).optional().nullable(),
    payee_staff_member_id: uuidStr.optional().nullable(),
    payee_supplier_id: uuidStr.optional().nullable(),
    payee_name: z.string().trim().min(1).max(200).optional(),
    amount_mode: z.enum(PAYABLE_SCHEDULE_AMOUNT_MODES).optional(),
    frequency: payableScheduleFrequencySchema.optional(),
    anchor_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    until_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict();

async function resolvePayablePayee(params: {
  clinicId: string;
  payeeStaffId: string | null;
  payeeSupplierId: string | null;
  payeeName: string;
}): Promise<{ payeeName: string; payeeStaffId: string | null; payeeSupplierId: string | null; error?: string }> {
  let payeeName = params.payeeName.trim();
  const payeeStaffId = params.payeeStaffId;
  const payeeSupplierId = params.payeeSupplierId;
  if (payeeStaffId && payeeSupplierId) {
    return { payeeName, payeeStaffId, payeeSupplierId, error: 'Informe profissional ou fornecedor, não os dois' };
  }
  if (payeeStaffId) {
    const { data: staff } = await supabaseAdmin
      .from('hub_staff_members')
      .select('id, full_name, display_name')
      .eq('id', payeeStaffId)
      .eq('clinic_id', params.clinicId)
      .maybeSingle();
    if (!staff) {
      return { payeeName, payeeStaffId, payeeSupplierId, error: 'Profissional não encontrado nesta clínica' };
    }
    if (!payeeName) payeeName = String(staff.full_name || staff.display_name || 'Profissional');
  }
  if (payeeSupplierId) {
    const { data: supplier } = await supabaseAdmin
      .from('hub_suppliers')
      .select('id, name, party_name')
      .eq('id', payeeSupplierId)
      .eq('clinic_id', params.clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!supplier) {
      return { payeeName, payeeStaffId, payeeSupplierId, error: 'Fornecedor não encontrado nesta clínica' };
    }
    if (!payeeName) payeeName = String(supplier.name || supplier.party_name || 'Fornecedor');
  }
  if (!payeeStaffId && !payeeSupplierId && !payeeName) {
    return { payeeName, payeeStaffId, payeeSupplierId, error: 'Informe o profissional, o fornecedor ou o nome do credor' };
  }
  return { payeeName, payeeStaffId, payeeSupplierId };
}

export const listHubFinancePayableSchedules = async (req: Request, res: Response) => {
  try {
    const parsed = z
      .object({ clinic_id: uuidStr, unit_id: uuidStr })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
    const listed = await listPayableSchedules({
      clinicId: parsed.data.clinic_id,
      unitId: parsed.data.unit_id,
    });
    if (listed.missingTable) {
      return res.status(503).json({
        error: 'Recorrência de contas a pagar indisponível. Aplique a migração 117_create_hub_payable_schedules.sql.',
      });
    }
    if (listed.error) return res.status(500).json({ error: listed.error });
    return res.json({ schedules: listed.schedules });
  } catch (e: unknown) {
    console.error('listHubFinancePayableSchedules', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const postHubFinancePayableSchedule = async (req: Request, res: Response) => {
  try {
    const parsed = schedulePayeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const b = parsed.data;
    if (!b.unit_id) return res.status(400).json({ error: 'unit_id obrigatório' });
    if (!b.frequency) return res.status(400).json({ error: 'Informe a frequência' });
    if (!b.anchor_date) return res.status(400).json({ error: 'Informe o primeiro vencimento' });
    if (b.until_date && b.until_date < b.anchor_date) {
      return res.status(400).json({ error: 'A data final não pode ser anterior ao primeiro vencimento' });
    }
    const payee = await resolvePayablePayee({
      clinicId: b.clinic_id,
      payeeStaffId: b.payee_staff_member_id ?? null,
      payeeSupplierId: b.payee_supplier_id ?? null,
      payeeName: b.payee_name ?? '',
    });
    if (payee.error) return res.status(400).json({ error: payee.error });

    const { data, error } = await supabaseAdmin
      .from('hub_payable_schedules')
      .insert({
        clinic_id: b.clinic_id,
        unit_id: b.unit_id,
        amount: round2(b.amount),
        category: b.category ?? 'rent',
        description: b.description,
        notes: b.notes ?? null,
        payee_staff_member_id: payee.payeeStaffId,
        payee_supplier_id: payee.payeeSupplierId,
        payee_name: payee.payeeName,
        amount_mode: b.amount_mode ?? 'fixed',
        frequency: b.frequency,
        anchor_date: b.anchor_date,
        until_date: b.until_date ?? null,
        status: 'active',
        created_by_user_id: req.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) {
      const mapped = payableWriteError(error.message);
      return res.status(mapped.status).json({ error: mapped.error });
    }
    const schedule = data as HubPayableScheduleRow;
    const horizon = await ensurePayableScheduleHorizon({
      clinicId: b.clinic_id,
      unitId: b.unit_id,
    });
    if (horizon.error && !horizon.missingTable) {
      const mapped = payableWriteError(horizon.error);
      return res.status(mapped.status).json({ error: mapped.error });
    }
    return res.status(201).json({
      schedule: {
        ...schedule,
        anchor_date: String(schedule.anchor_date).slice(0, 10),
        until_date: schedule.until_date ? String(schedule.until_date).slice(0, 10) : null,
      },
    });
  } catch (e: unknown) {
    console.error('postHubFinancePayableSchedule', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const patchHubFinancePayableSchedule = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = schedulePayeeSchema
      .partial()
      .extend({ clinic_id: uuidStr })
      .safeParse(req.body);
    if (!id.success || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
    }
    const b = parsed.data;
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_payable_schedules')
      .select('*')
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) {
      const hint = missingPayableSchedulesTable(exErr.message);
      if (hint) return res.status(503).json({ error: hint });
      return res.status(500).json({ error: exErr.message });
    }
    if (!existing) return res.status(404).json({ error: 'Recorrência não encontrada' });
    if (existing.status === 'ended') {
      return res.status(409).json({ error: 'Recorrência encerrada não pode ser alterada' });
    }

    const nextAnchor = String(existing.anchor_date).slice(0, 10);
    const nextUntil =
      b.until_date !== undefined ? b.until_date : existing.until_date ? String(existing.until_date).slice(0, 10) : null;
    if (nextUntil && nextUntil < nextAnchor) {
      return res.status(400).json({ error: 'A data final não pode ser anterior ao primeiro vencimento' });
    }

    const nextStaff =
      b.payee_staff_member_id !== undefined
        ? b.payee_staff_member_id
        : (existing.payee_staff_member_id as string | null);
    const nextSupplier =
      b.payee_supplier_id !== undefined
        ? b.payee_supplier_id
        : (existing.payee_supplier_id as string | null);
    const payee = await resolvePayablePayee({
      clinicId: b.clinic_id,
      payeeStaffId: nextStaff,
      payeeSupplierId: nextSupplier,
      payeeName: b.payee_name ?? String(existing.payee_name ?? ''),
    });
    if (payee.error) return res.status(400).json({ error: payee.error });

    const update: Record<string, unknown> = {
      payee_staff_member_id: payee.payeeStaffId,
      payee_supplier_id: payee.payeeSupplierId,
      payee_name: payee.payeeName,
    };
    if (b.amount != null) update.amount = round2(b.amount);
    if (b.amount_mode != null) update.amount_mode = b.amount_mode;
    if (b.category != null) update.category = b.category;
    if (b.description != null) update.description = b.description;
    if (b.notes !== undefined) update.notes = b.notes;
    if (b.until_date !== undefined) update.until_date = b.until_date;
    if (b.status != null) update.status = b.status;

    const { data, error } = await supabaseAdmin
      .from('hub_payable_schedules')
      .update(update)
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .select('*')
      .maybeSingle();
    if (error) {
      const mapped = payableWriteError(error.message);
      return res.status(mapped.status).json({ error: mapped.error });
    }
    if (!data) return res.status(404).json({ error: 'Recorrência não encontrada' });
    const schedule = data as HubPayableScheduleRow;
    const propagated = await propagatePayableSchedule(schedule);
    if (propagated.error) {
      const mapped = payableWriteError(propagated.error);
      return res.status(mapped.status).json({ error: mapped.error });
    }
    if (schedule.status === 'active') {
      const horizon = await ensurePayableScheduleHorizon({
        clinicId: schedule.clinic_id,
        unitId: schedule.unit_id,
      });
      if (horizon.error && !horizon.missingTable) {
        const mapped = payableWriteError(horizon.error);
        return res.status(mapped.status).json({ error: mapped.error });
      }
    }
    return res.json({ schedule });
  } catch (e: unknown) {
    console.error('patchHubFinancePayableSchedule', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const postHubFinancePayableScheduleEnd = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = z.object({ clinic_id: uuidStr }).strict().safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_payable_schedules')
      .select('*')
      .eq('id', id.data)
      .eq('clinic_id', parsed.data.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) {
      const hint = missingPayableSchedulesTable(exErr.message);
      if (hint) return res.status(503).json({ error: hint });
      return res.status(500).json({ error: exErr.message });
    }
    if (!existing) return res.status(404).json({ error: 'Recorrência não encontrada' });
    if (existing.status === 'ended') return res.json({ schedule: existing });
    const ended = await endPayableSchedule({ schedule: existing as HubPayableScheduleRow, todayYmd: todayYmdSaoPaulo() });
    if (ended.error) {
      const hint = missingPayableSchedulesTable(ended.error);
      if (hint) return res.status(503).json({ error: hint });
      return res.status(500).json({ error: ended.error });
    }
    return res.json({ schedule: { ...existing, status: 'ended' } });
  } catch (e: unknown) {
    console.error('postHubFinancePayableScheduleEnd', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
