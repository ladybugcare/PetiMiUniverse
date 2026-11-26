/**
 * Apuração imutável de comissão por linha de recebível.
 * Resolve profissional (matriz de origem), casa regra ativa no instante e congela valor.
 * Não recalcula finanças — usa base líquida de hubReceivableFinancialBalance.
 */

import { supabaseAdmin } from '../../config/supabase';
import { resolveStaffIdForUser } from './hubStaffResolve';
import {
  allocateLiquidLineAmounts,
  commissionAdjustmentForReturn,
} from './hubReceivableFinancialBalance';
import {
  computeCommissionAmount,
  matchRuleForLine,
  type CommissionRuleBasis,
  type CommissionRuleRow,
} from './hubCommissionCalc';

export type CommissionStaffSource = 'service_executor' | 'sale_author' | 'none';

export type { CommissionRuleBasis, CommissionRuleRow };
export { computeCommissionAmount, matchRuleForLine };

export type CommissionSnapshotFields = {
  commission_staff_member_id: string | null;
  commission_staff_source: CommissionStaffSource;
  commission_attributed_at: string;
  commission_rule_id: string | null;
  commission_rule_basis: CommissionRuleBasis | null;
  commission_rule_rate: number | null;
  commission_basis_amount: number;
  commission_original_amount: number;
  commission_accrued_at: string;
};

export type AccrualLineInput = {
  /** Identificador estável só para mapear líquidos (ex.: comanda_item_id). */
  key: string;
  line_total: number;
  /** Quantidade da linha — usada em fixed_per_unit. */
  quantity?: number | null;
  hub_service_type_id: string | null;
  hub_inventory_item_id: string | null;
  item_kind: string | null;
  origin_type: string | null;
  origin_id: string | null;
  /** Vendedor já persistido na comanda (produtos). */
  sold_by_staff_id: string | null;
  /** source_line_id / appointment_service id etc. quando sem comanda. */
  source_line_id?: string | null;
};

export type AccrueCommissionsOpts = {
  clinicId: string;
  lines: AccrualLineInput[];
  originalAmount: number;
  netAmountAtSale: number;
  /**
   * Usuário autenticado da operação que **cria** a linha financeira.
   * Só vira sale_author se o produto ainda não tem sold_by e a política
   * allowActingUserAsSaleAuthor=true (ex.: produto avulso / venda rápida).
   */
  actingUserId?: string | null;
  /** Se true, resolve staff do actingUser para produtos sem sold_by. Default false no handoff/auto-close. */
  allowActingUserAsSaleAuthor?: boolean;
  /** Instantâneo ISO; default now. */
  accruedAt?: string;
  /** Regras pré-carregadas (evita N+1). Se omitido, carrega da clínica. */
  rules?: CommissionRuleRow[];
};

export async function loadActiveCommissionRules(clinicId: string): Promise<CommissionRuleRow[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_commission_rules')
    .select('id, hub_service_type_id, hub_inventory_item_id, basis, rate')
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    hub_service_type_id: (r.hub_service_type_id as string | null) ?? null,
    hub_inventory_item_id: (r.hub_inventory_item_id as string | null) ?? null,
    basis: r.basis as CommissionRuleBasis,
    rate: Number(r.rate ?? 0),
  }));
}

async function assertStaffInClinic(clinicId: string, staffId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('id', staffId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data?.id);
}

/** Resolve executor de serviço conforme matriz do plano (sem inferências proibidas). */
export async function resolveServiceExecutorStaff(opts: {
  clinicId: string;
  originType: string | null;
  originId: string | null;
}): Promise<string | null> {
  const { clinicId, originType, originId } = opts;
  if (!originType || !originId) return null;

  if (originType === 'appointment_service') {
    const { data: svc } = await supabaseAdmin
      .from('hub_appointment_services')
      .select('id, executed_by_staff_id, appointment_id')
      .eq('id', originId)
      .maybeSingle();
    if (!svc) return null;
    if (svc.executed_by_staff_id) {
      const ok = await assertStaffInClinic(clinicId, svc.executed_by_staff_id as string);
      return ok ? (svc.executed_by_staff_id as string) : null;
    }
    // L&T: motorista da rota, se o agendamento for pickup_route
    const appointmentId = svc.appointment_id as string | null;
    if (!appointmentId) return null;
    const { data: appt } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, appointment_kind')
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (String(appt?.appointment_kind ?? '') !== 'pickup_route') return null;
    const { data: stop } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('hub_pickup_route_id')
      .eq('hub_appointment_id', appointmentId)
      .maybeSingle();
    if (!stop?.hub_pickup_route_id) return null;
    const { data: route } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select('driver_staff_id')
      .eq('id', stop.hub_pickup_route_id as string)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const driverId = (route?.driver_staff_id as string | null) ?? null;
    if (!driverId) return null;
    const ok = await assertStaffInClinic(clinicId, driverId);
    return ok ? driverId : null;
  }

  if (originType === 'grooming_extra') {
    // created_by_staff_id = cadastro, não executor — Sem profissional
    return null;
  }

  if (originType === 'vaccination') {
    const { data } = await supabaseAdmin
      .from('hub_vaccination_records')
      .select('hub_staff_member_id')
      .eq('id', originId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const sid = (data?.hub_staff_member_id as string | null) ?? null;
    if (!sid) return null;
    return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
  }

  if (originType === 'medication_service') {
    const { data } = await supabaseAdmin
      .from('hub_encounter_medication_administrations')
      .select('hub_staff_member_id')
      .eq('id', originId)
      .maybeSingle();
    const sid = (data?.hub_staff_member_id as string | null) ?? null;
    if (!sid) return null;
    return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
  }

  if (originType === 'clinical_exam') {
    // requested_by = solicitante — proibido; Sem profissional
    return null;
  }

  if (originType === 'surgery_service') {
    const { data: ss } = await supabaseAdmin
      .from('hub_surgery_services')
      .select('surgery_id')
      .eq('id', originId)
      .maybeSingle();
    if (!ss?.surgery_id) return null;
    const { data: surg } = await supabaseAdmin
      .from('hub_surgeries')
      .select('hub_staff_member_id')
      .eq('id', ss.surgery_id as string)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const sid = (surg?.hub_staff_member_id as string | null) ?? null;
    if (!sid) return null;
    return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
  }

  if (originType === 'encounter_service') {
    const { data: es } = await supabaseAdmin
      .from('hub_encounter_services')
      .select('hub_encounter_id')
      .eq('id', originId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (!es?.hub_encounter_id) return null;
    const { data: enc } = await supabaseAdmin
      .from('hub_encounters')
      .select('hub_staff_member_id')
      .eq('id', es.hub_encounter_id as string)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const sid = (enc?.hub_staff_member_id as string | null) ?? null;
    if (!sid) return null;
    return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
  }

  if (originType === 'hospitalization_daily') {
    return null;
  }

  if (originType === 'hospitalization_charge') {
    // Só atribuir se houver dose 1:1 determinística (hospitalization_charge_id UNIQUE)
    const { data: dose } = await supabaseAdmin
      .from('hub_hospitalization_med_doses')
      .select('id, administered_by_staff_id')
      .eq('hospitalization_charge_id', originId)
      .maybeSingle();
    const sid = (dose?.administered_by_staff_id as string | null) ?? null;
    if (!sid) return null;
    return (await assertStaffInClinic(clinicId, sid)) ? sid : null;
  }

  // boarding_*, quote_line, package_purchase, manual_line, etc.
  return null;
}

export async function resolveLineStaff(opts: {
  clinicId: string;
  line: AccrualLineInput;
  actingUserId?: string | null;
  allowActingUserAsSaleAuthor?: boolean;
}): Promise<{ staffId: string | null; source: CommissionStaffSource }> {
  const { clinicId, line, actingUserId, allowActingUserAsSaleAuthor } = opts;
  const isProduct =
    String(line.item_kind ?? '') === 'product' || Boolean(line.hub_inventory_item_id && !line.hub_service_type_id);

  if (isProduct) {
    if (line.sold_by_staff_id) {
      const ok = await assertStaffInClinic(clinicId, line.sold_by_staff_id);
      if (ok) return { staffId: line.sold_by_staff_id, source: 'sale_author' };
    }
    if (allowActingUserAsSaleAuthor && actingUserId) {
      const sid = await resolveStaffIdForUser(clinicId, actingUserId);
      if (sid && (await assertStaffInClinic(clinicId, sid))) {
        return { staffId: sid, source: 'sale_author' };
      }
    }
    return { staffId: null, source: 'none' };
  }

  // Serviço
  const originId = line.origin_id ?? line.source_line_id ?? null;
  const executor = await resolveServiceExecutorStaff({
    clinicId,
    originType: line.origin_type,
    originId,
  });
  if (executor) return { staffId: executor, source: 'service_executor' };
  return { staffId: null, source: 'none' };
}

/**
 * Calcula snapshots para um grupo de linhas do mesmo recebível
 * (mesmo original_amount / net_amount_at_sale).
 */
export async function accrueCommissionSnapshots(
  opts: AccrueCommissionsOpts,
): Promise<Map<string, CommissionSnapshotFields>> {
  const accruedAt = opts.accruedAt ?? new Date().toISOString();
  const rules = opts.rules ?? (await loadActiveCommissionRules(opts.clinicId));
  const liquids = allocateLiquidLineAmounts({
    lineTotals: opts.lines.map((l) => Number(l.line_total ?? 0)),
    originalAmount: opts.originalAmount,
    netAmountAtSale: opts.netAmountAtSale,
  });

  const out = new Map<string, CommissionSnapshotFields>();
  for (let i = 0; i < opts.lines.length; i++) {
    const line = opts.lines[i]!;
    const liquidBase = liquids[i] ?? 0;
    const staff = await resolveLineStaff({
      clinicId: opts.clinicId,
      line,
      actingUserId: opts.actingUserId,
      allowActingUserAsSaleAuthor: opts.allowActingUserAsSaleAuthor ?? false,
    });
    const rule = matchRuleForLine(rules, line);
    const commission = computeCommissionAmount(
      rule,
      liquidBase,
      line.quantity == null ? undefined : Number(line.quantity),
    );

    out.set(line.key, {
      commission_staff_member_id: staff.staffId,
      commission_staff_source: staff.source,
      commission_attributed_at: accruedAt,
      commission_rule_id: rule?.id ?? null,
      commission_rule_basis: rule?.basis ?? null,
      commission_rule_rate: rule != null ? Number(rule.rate) : null,
      commission_basis_amount: liquidBase,
      commission_original_amount: commission,
      commission_accrued_at: accruedAt,
    });
  }
  return out;
}

/** Campos a mesclar no INSERT de hub_receivable_lines. */
export function snapshotToInsertFields(
  snap: CommissionSnapshotFields | undefined,
): Partial<CommissionSnapshotFields> {
  if (!snap) return {};
  return { ...snap };
}

/** Converte itens de comanda (ou equivalentes) em inputs de apuração. */
export function comandaItemsToAccrualInputs(
  items: Array<Record<string, unknown>>,
): AccrualLineInput[] {
  return items.map((it, idx) => ({
    key: String(it.id ?? `idx-${idx}`),
    line_total: Number(it.line_total ?? 0),
    quantity: Number(it.quantity ?? 1) || 1,
    hub_service_type_id: (it.hub_service_type_id as string | null) ?? null,
    hub_inventory_item_id: (it.hub_inventory_item_id as string | null) ?? null,
    item_kind: (it.item_kind as string | null) ?? null,
    origin_type: (it.origin_type as string | null) ?? null,
    origin_id: (it.origin_id as string | null) ?? null,
    sold_by_staff_id: (it.sold_by_staff_id as string | null) ?? null,
    source_line_id: (it.origin_id as string | null) ?? null,
  }));
}

/**
 * Apura snapshots para um grupo de itens e devolve Map key → campos de insert.
 * Falhas de regra/staff não interrompem o checkout — linha fica Sem profissional / sem regra.
 */
export async function buildCommissionInsertFieldsForItems(opts: {
  clinicId: string;
  items: Array<Record<string, unknown>>;
  originalAmount: number;
  netAmountAtSale: number;
  actingUserId?: string | null;
  allowActingUserAsSaleAuthor?: boolean;
}): Promise<Map<string, CommissionSnapshotFields>> {
  const inputs = comandaItemsToAccrualInputs(opts.items);
  return accrueCommissionSnapshots({
    clinicId: opts.clinicId,
    lines: inputs,
    originalAmount: opts.originalAmount,
    netAmountAtSale: opts.netAmountAtSale,
    actingUserId: opts.actingUserId,
    allowActingUserAsSaleAuthor: opts.allowActingUserAsSaleAuthor,
  });
}

export { commissionAdjustmentForReturn };
