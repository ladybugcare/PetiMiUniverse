/**
 * Cancelamento operacional → comanda:
 * - sem pagamento: anula comanda aberta (waive + cancelada)
 * - com pagamento: delega a maybeFlagComandaCancellationPending
 */
import { supabaseAdmin } from '../../config/supabase';
import { reversePackageRedemptionsForComanda } from './hubPackagesService';

export type CancellationOperationalType = 'appointment' | 'grooming_session' | 'encounter' | 'quote';

export type ComandaOperationalCancelEffect =
  | { kind: 'none' }
  | { kind: 'cancelled'; comandaId: string }
  | { kind: 'pending_adjustment'; comandaId: string };

async function findOpenComandaIdByOrigin(
  clinicId: string,
  originType: string,
  originId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_comandas')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('origin_type', originType)
    .eq('origin_id', originId)
    .eq('status', 'aberta')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string) ?? null;
}

async function findOpenGroomingComandaIdForAppointment(
  clinicId: string,
  appointmentId: string,
): Promise<string | null> {
  const { data: sessions } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('hub_appointment_id', appointmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  for (const sess of sessions ?? []) {
    const bySess = await findOpenComandaIdByOrigin(clinicId, 'grooming_session', sess.id as string);
    if (bySess) return bySess;
  }
  return null;
}

/** Inclui reservas já canceladas: o cancelamento costuma chegar depois da reserva mudar de status. */
async function findOpenBoardingComandaIdForAppointment(
  clinicId: string,
  appointmentId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('hub_appointment_id', appointmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const byBoard = await findOpenComandaIdByOrigin(clinicId, 'boarding_reservation', row.id as string);
    if (byBoard) return byBoard;
  }
  return null;
}

async function findOpenEncounterComandaIdForAppointment(
  clinicId: string,
  appointmentId: string,
): Promise<string | null> {
  const { data: encs } = await supabaseAdmin
    .from('hub_encounters')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('hub_appointment_id', appointmentId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  for (const enc of encs ?? []) {
    const byEnc = await findOpenComandaIdByOrigin(clinicId, 'encounter', enc.id as string);
    if (byEnc) return byEnc;
  }
  return null;
}

/** Mesma ordem de resolveExistingOpenComandaIdForOpen (appointment). */
async function resolveOpenComandaIdForAppointment(
  clinicId: string,
  appointmentId: string,
): Promise<string | null> {
  const byAppt = await findOpenComandaIdByOrigin(clinicId, 'appointment', appointmentId);
  if (byAppt) return byAppt;
  const byGroom = await findOpenGroomingComandaIdForAppointment(clinicId, appointmentId);
  if (byGroom) return byGroom;
  const byBoard = await findOpenBoardingComandaIdForAppointment(clinicId, appointmentId);
  if (byBoard) return byBoard;
  return findOpenEncounterComandaIdForAppointment(clinicId, appointmentId);
}

async function resolveOpenComandaIdForCancellation(
  clinicId: string,
  operationalType: CancellationOperationalType,
  operationalId: string,
): Promise<string | null> {
  if (operationalType === 'appointment') {
    return resolveOpenComandaIdForAppointment(clinicId, operationalId);
  }
  // Demais origens: resolução direta por origin_type (escopo appointment no plano).
  return findOpenComandaIdByOrigin(clinicId, operationalType, operationalId);
}

async function computePaidTotalForComanda(clinicId: string, comandaId: string): Promise<number> {
  const { data: recs, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('id')
    .eq('comanda_id', comandaId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (error) throw new Error(error.message);
  const ids = (recs ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;
  const { data: pays, error: pErr } = await supabaseAdmin
    .from('hub_payments')
    .select('amount')
    .in('receivable_id', ids)
    .eq('status', 'posted');
  if (pErr) throw new Error(pErr.message);
  return Math.round(((pays ?? []).reduce((s, row) => s + Number(row.amount ?? 0), 0) + Number.EPSILON) * 100) / 100;
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

/** Waive na origem operacional + anula comanda aberta (núcleo do checkout cancel). */
export async function waiveOriginAndCancelOpenComanda(opts: {
  clinicId: string;
  comandaId: string;
  originType: string;
  originId: string | null;
  waiveReason: string;
}): Promise<void> {
  const { clinicId, comandaId, originType, originId, waiveReason } = opts;
  const now = new Date().toISOString();
  if (originId) {
    if (originType === 'grooming_session') {
      await supabaseAdmin
        .from('hub_grooming_sessions')
        .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
        .eq('id', originId)
        .eq('clinic_id', clinicId);
    } else if (originType === 'encounter') {
      await supabaseAdmin
        .from('hub_encounters')
        .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
        .eq('id', originId)
        .eq('clinic_id', clinicId);
    } else if (originType === 'appointment') {
      await supabaseAdmin
        .from('hub_appointments')
        .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
        .eq('id', originId)
        .eq('clinic_id', clinicId);
    } else if (originType === 'quote') {
      await supabaseAdmin
        .from('hub_quotes')
        .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
        .eq('id', originId)
        .eq('clinic_id', clinicId);
    } else if (originType === 'boarding_reservation') {
      await supabaseAdmin
        .from('hub_boarding_reservations')
        .update({ billing_waived_at: now, billing_waive_reason: waiveReason })
        .eq('id', originId)
        .eq('clinic_id', clinicId);
    }
  }
  await reversePackageRedemptionsForComanda(clinicId, comandaId);
  await supabaseAdmin
    .from('hub_comandas')
    .update({ status: 'cancelada', closed_at: now, financial_status: 'balanced' })
    .eq('id', comandaId)
    .eq('clinic_id', clinicId);
}

async function cancelUnpaidReceivablesForComanda(
  clinicId: string,
  comandaId: string,
  reason: string,
): Promise<{ cancelledIds: string[]; blockedByPayment: boolean }> {
  const { data: recs, error } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, status, final_amount')
    .eq('comanda_id', comandaId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (error) throw new Error(error.message);

  const cancelledIds: string[] = [];
  let blockedByPayment = false;
  for (const row of recs ?? []) {
    const rid = row.id as string;
    const { data: pays, error: pErr } = await supabaseAdmin
      .from('hub_payments')
      .select('id')
      .eq('receivable_id', rid)
      .eq('status', 'posted')
      .limit(1);
    if (pErr) throw new Error(pErr.message);
    if ((pays ?? []).length > 0) {
      blockedByPayment = true;
      continue;
    }
    const finalAmt = Number(row.final_amount ?? 0);
    if (finalAmt > 0.009) {
      await supabaseAdmin.from('hub_financial_adjustments').insert({
        clinic_id: clinicId,
        receivable_id: rid,
        adjustment_type: 'write_off',
        amount: finalAmt,
        reason: `Cancelamento operacional — comanda ${comandaId}: ${reason}`.slice(0, 2000),
      });
    }
    const upd = await supabaseAdmin
      .from('hub_receivables')
      .update({ status: 'cancelled', cancel_rebill: false })
      .eq('id', rid)
      .eq('clinic_id', clinicId);
    if (upd.error && String(upd.error.message || '').includes('cancel_rebill')) {
      await supabaseAdmin
        .from('hub_receivables')
        .update({ status: 'cancelled' })
        .eq('id', rid)
        .eq('clinic_id', clinicId);
    } else if (upd.error) {
      throw new Error(upd.error.message);
    }
    cancelledIds.push(rid);
  }
  return { cancelledIds, blockedByPayment };
}

/** Marca pendência na comanda já resolvida (evita re-resolve que perde grooming/boarding). */
async function flagKnownComandaCancellationPending(opts: {
  clinicId: string;
  comandaId: string;
  operationalType: CancellationOperationalType;
  operationalId: string;
  paidAmount: number;
}): Promise<void> {
  const { clinicId, comandaId, operationalType, operationalId, paidAmount } = opts;
  const now = new Date().toISOString();
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('hub_comandas')
    .select('id, cancellation_pending_at, cancellation_resolved_at, unit_id, guardian_id')
    .eq('id', comandaId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (exErr || !existing || existing.cancellation_resolved_at) return;

  const patch: Record<string, unknown> = {
    cancellation_operational_at: now,
    cancellation_operational_type: operationalType,
    cancellation_operational_id: operationalId,
    financial_status: 'awaiting_balance',
  };
  const isNewPending = !existing.cancellation_pending_at;
  if (isNewPending) {
    patch.cancellation_pending_at = now;
  }
  await supabaseAdmin.from('hub_comandas').update(patch).eq('id', comandaId).eq('clinic_id', clinicId);

  if (isNewPending) {
    const { notifyHubCancellationPending } = await import('./hubNotifyEvents.js');
    void notifyHubCancellationPending({
      clinicId,
      unitId: (existing.unit_id as string | null) ?? null,
      comandaId,
      guardianId: (existing.guardian_id as string | null) ?? null,
      paidAmount,
    });
  }
}

/**
 * Após cancel/falta operacional: comanda sem pagamento é anulada;
 * com pagamento antecipado marca pendência de ajuste.
 */
export async function handleComandaAfterOperationalCancel(
  clinicId: string,
  operationalType: CancellationOperationalType,
  operationalId: string,
  opts?: { waiveReason?: string },
): Promise<ComandaOperationalCancelEffect> {
  try {
    const comandaId = await resolveOpenComandaIdForCancellation(clinicId, operationalType, operationalId);
    if (!comandaId) return { kind: 'none' };
    return await applyOperationalCancelToComanda({
      clinicId,
      comandaId,
      flagTarget: { operationalType, operationalId },
      waiveReason:
        opts?.waiveReason?.trim() ||
        (operationalType === 'appointment'
          ? 'Cancelamento operacional do agendamento'
          : 'Cancelamento operacional'),
    });
  } catch (e: unknown) {
    console.error('handleComandaAfterOperationalCancel', e);
    return { kind: 'none' };
  }
}

/**
 * Cancelamento/falta da reserva de Hotel/Creche.
 * Com agendamento vinculado, segue o fluxo de appointment (que encontra a comanda da reserva).
 * Sem agendamento, anula comanda sem pagamento; com pagamento não há tipo operacional válido
 * para marcar pendência — fica para a conferência do caixa (origem cancelada).
 */
export async function handleComandaAfterBoardingCancel(
  clinicId: string,
  reservationId: string,
  appointmentId: string | null,
  opts?: { waiveReason?: string },
): Promise<ComandaOperationalCancelEffect> {
  const waiveReason = opts?.waiveReason?.trim() || 'Cancelamento da reserva de Hotel/Creche';
  try {
    const direct = await findOpenComandaIdByOrigin(clinicId, 'boarding_reservation', reservationId);
    if (direct) {
      return await applyOperationalCancelToComanda({
        clinicId,
        comandaId: direct,
        flagTarget: appointmentId ? { operationalType: 'appointment', operationalId: appointmentId } : null,
        waiveReason,
      });
    }
    if (appointmentId) {
      return await handleComandaAfterOperationalCancel(clinicId, 'appointment', appointmentId, { waiveReason });
    }
    return { kind: 'none' };
  } catch (e: unknown) {
    console.error('handleComandaAfterBoardingCancel', e);
    return { kind: 'none' };
  }
}

async function applyOperationalCancelToComanda(opts: {
  clinicId: string;
  comandaId: string;
  flagTarget: { operationalType: CancellationOperationalType; operationalId: string } | null;
  waiveReason: string;
}): Promise<ComandaOperationalCancelEffect> {
  const { clinicId, comandaId, flagTarget, waiveReason } = opts;
  {
    const paidTotal = await computePaidTotalForComanda(clinicId, comandaId);
    if (paidTotal > 0.009) {
      if (!flagTarget) {
        console.warn('applyOperationalCancelToComanda: comanda paga sem tipo operacional', comandaId);
        return { kind: 'none' };
      }
      const { operationalType, operationalId } = flagTarget;
      await flagKnownComandaCancellationPending({
        clinicId,
        comandaId,
        operationalType,
        operationalId,
        paidAmount: paidTotal,
      });
      return { kind: 'pending_adjustment', comandaId };
    }

    const { data: comandaRow, error: cErr } = await supabaseAdmin
      .from('hub_comandas')
      .select('id, origin_type, origin_id, status')
      .eq('id', comandaId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr || !comandaRow || String(comandaRow.status) !== 'aberta') {
      return { kind: 'none' };
    }

    const unpaidCancel = await cancelUnpaidReceivablesForComanda(clinicId, comandaId, waiveReason);
    if (unpaidCancel.blockedByPayment) {
      console.error(
        'handleComandaAfterOperationalCancel: recebível com pagamento posted e paid_total≈0',
        comandaId,
      );
      return { kind: 'none' };
    }

    const originType = String(comandaRow.origin_type ?? '');
    const originId = (comandaRow.origin_id as string | null) ?? null;
    if (originType && originType !== 'manual' && originId) {
      const keys = await fetchActiveReceivableKeys(clinicId);
      if (keys.has(`${originType}:${originId}`)) {
        console.error(
          'handleComandaAfterOperationalCancel: ainda há cobrança ativa após limpar recebíveis',
          comandaId,
        );
        return { kind: 'none' };
      }
    }

    await waiveOriginAndCancelOpenComanda({
      clinicId,
      comandaId,
      originType,
      originId,
      waiveReason,
    });
    return { kind: 'cancelled', comandaId };
  }
}
