/**
 * Cancelamento operacional de agendamentos (cascade pickup / encounters / comanda).
 * Usado pelo PATCH da agenda e pelo auto-cancel pós-óbito.
 */
import { supabaseAdmin } from '../../config/supabase';
import {
  handleComandaAfterOperationalCancel,
  type ComandaOperationalCancelEffect,
} from './hubComandaOperationalCancel';
import { cancelLinkedOpenEncountersForAppointments } from './hubClinicalAppointmentMirror';

export type AppointmentOperationalCancelResult = {
  cancelledIds: string[];
  cascadedLegIds: string[];
  cancelledEncounterIds: string[];
  comandaEffects: ComandaOperationalCancelEffect[];
};

const DEFAULT_CANCEL_WAIVE = 'Cancelamento operacional do agendamento';
const DEFAULT_NO_SHOW_WAIVE = 'Falta registrada no agendamento';
export const PET_DEATH_CANCEL_WAIVE = 'Cancelamento automático por óbito do pet';

/**
 * Cascade após o status terminal já ter sido gravado nos appointments alvo:
 * pernas L&T filhas, encounters abertos vinculados e efeito de comanda.
 */
export async function cascadeAfterAppointmentTerminalStatus(opts: {
  clinicId: string;
  appointmentIds: string[];
  terminalStatus: 'cancelled' | 'no_show';
  waiveReason?: string;
}): Promise<Omit<AppointmentOperationalCancelResult, 'cancelledIds'> & { cancelledIds: string[] }> {
  const clinicId = opts.clinicId;
  const targetIds = [...new Set(opts.appointmentIds.filter(Boolean))];
  const terminalStatus = opts.terminalStatus;
  const waiveReason =
    opts.waiveReason ??
    (terminalStatus === 'no_show' ? DEFAULT_NO_SHOW_WAIVE : DEFAULT_CANCEL_WAIVE);

  if (targetIds.length === 0) {
    return {
      cancelledIds: [],
      cascadedLegIds: [],
      cancelledEncounterIds: [],
      comandaEffects: [],
    };
  }

  const cascadedLegIds: string[] = [];
  for (const tid of targetIds) {
    const { data: parentKindRow } = await supabaseAdmin
      .from('hub_appointments')
      .select('appointment_kind')
      .eq('id', tid)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const parentKind = String(
      (parentKindRow as { appointment_kind?: string } | null)?.appointment_kind ?? '',
    );
    if (parentKind === 'pickup_route') continue;

    const { data: childLegs } = await supabaseAdmin
      .from('hub_appointments')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('parent_appointment_id', tid)
      .eq('appointment_kind', 'pickup_route')
      .is('deleted_at', null)
      .not('status', 'in', '("cancelled","no_show")');
    const legIds = (childLegs ?? [])
      .map((r) => (r as { id: string }).id)
      .filter((legId) => !targetIds.includes(legId));
    if (legIds.length === 0) continue;

    const { error: cascadeErr } = await supabaseAdmin
      .from('hub_appointments')
      .update({ status: terminalStatus, updated_at: new Date().toISOString() })
      .in('id', legIds)
      .eq('clinic_id', clinicId);
    if (cascadeErr) {
      console.error(
        `cascadeAfterAppointmentTerminalStatus cascade ${terminalStatus} pickup legs`,
        tid,
        cascadeErr.message,
      );
    } else {
      cascadedLegIds.push(...legIds);
    }
  }

  const allApptIds = [...targetIds, ...cascadedLegIds];
  const cancelledEncounterIds = await cancelLinkedOpenEncountersForAppointments({
    clinicId,
    appointmentIds: allApptIds,
  });

  const comandaEffects: ComandaOperationalCancelEffect[] = [];
  for (const tid of allApptIds) {
    const effect = await handleComandaAfterOperationalCancel(clinicId, 'appointment', tid, {
      waiveReason,
    });
    comandaEffects.push(effect);
  }
  for (const encounterId of cancelledEncounterIds) {
    const effect = await handleComandaAfterOperationalCancel(clinicId, 'encounter', encounterId, {
      waiveReason,
    });
    comandaEffects.push(effect);
  }

  return {
    cancelledIds: targetIds,
    cascadedLegIds,
    cancelledEncounterIds,
    comandaEffects,
  };
}

/**
 * Atualiza status para cancelled/no_show e aplica cascade operacional.
 */
export async function applyOperationalCancelToAppointments(opts: {
  clinicId: string;
  appointmentIds: string[];
  terminalStatus?: 'cancelled' | 'no_show';
  waiveReason?: string;
}): Promise<AppointmentOperationalCancelResult> {
  const clinicId = opts.clinicId;
  const targetIds = [...new Set(opts.appointmentIds.filter(Boolean))];
  const terminalStatus = opts.terminalStatus ?? 'cancelled';

  if (targetIds.length === 0) {
    return {
      cancelledIds: [],
      cascadedLegIds: [],
      cancelledEncounterIds: [],
      comandaEffects: [],
    };
  }

  const { error: statusErr } = await supabaseAdmin
    .from('hub_appointments')
    .update({ status: terminalStatus, updated_at: new Date().toISOString() })
    .in('id', targetIds)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null);

  if (statusErr) {
    console.error('applyOperationalCancelToAppointments status', statusErr.message);
    throw new Error(statusErr.message || 'Falha ao cancelar agendamentos');
  }

  return cascadeAfterAppointmentTerminalStatus({
    clinicId,
    appointmentIds: targetIds,
    terminalStatus,
    waiveReason: opts.waiveReason,
  });
}
