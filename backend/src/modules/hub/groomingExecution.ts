import { supabaseAdmin } from '../../config/supabase';

const GROOMING_SERVICE_GROUP = 'banho_tosa';

/**
 * Ao marcar Pronto (ou estágios posteriores), as linhas de Banho & Tosa do agendamento
 * passam a `executed_at` — alinha o contador «X/Y feitos» com o estágio operacional.
 * Não sobrescreve linhas já marcadas; não toca em serviços de outros grupos.
 */
export async function ensureGroomingAppointmentLinesExecuted(opts: {
  clinicId: string;
  appointmentId: string | null | undefined;
  executedByStaffId?: string | null;
  at?: string;
}): Promise<number> {
  const appointmentId = opts.appointmentId;
  if (!appointmentId) return 0;

  const { data: appt, error: aErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, clinic_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message);
  if (!appt || appt.clinic_id !== opts.clinicId) return 0;

  const { data: lineRows, error: lErr } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('id, hub_service_type_id, executed_at')
    .eq('appointment_id', appointmentId);
  if (lErr) throw new Error(lErr.message);
  if (!lineRows?.length) return 0;

  const pending = lineRows.filter((r) => !(r as { executed_at?: string | null }).executed_at);
  if (pending.length === 0) return 0;

  const typeIds = [
    ...new Set(pending.map((r) => String((r as { hub_service_type_id: string }).hub_service_type_id))),
  ];
  const { data: sts, error: stErr } = await supabaseAdmin
    .from('hub_service_types')
    .select('id, service_group')
    .in('id', typeIds);
  if (stErr) throw new Error(stErr.message);
  const groomingTypeIds = new Set(
    (sts ?? [])
      .filter((s) => String((s as { service_group?: string }).service_group) === GROOMING_SERVICE_GROUP)
      .map((s) => s.id as string),
  );

  const idsToMark = pending
    .filter((r) => groomingTypeIds.has(String((r as { hub_service_type_id: string }).hub_service_type_id)))
    .map((r) => r.id as string);
  if (idsToMark.length === 0) return 0;

  const now = opts.at ?? new Date().toISOString();
  const patch: Record<string, unknown> = {
    executed_at: now,
    executed_by_staff_id: opts.executedByStaffId ?? null,
  };

  const { error: uErr } = await supabaseAdmin
    .from('hub_appointment_services')
    .update(patch)
    .in('id', idsToMark);
  if (uErr) throw new Error(uErr.message);
  return idsToMark.length;
}
