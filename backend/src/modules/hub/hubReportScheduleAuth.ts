import { supabaseAdmin } from '../../config/supabase';
import { authorizeHubReport } from './hubReportAuthorize';
import { SCHEDULABLE_REPORT_IDS, isHubReportId } from './reportsContract';

export type ScheduleRow = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  report_id: string;
  recipient_email: string;
  period_days: number;
  cadence: string;
  active: boolean;
  created_by_user_id: string | null;
  suspension_reason?: string | null;
};

/**
 * Destinatário permitido: e-mail de um clinic_users ativo da mesma clínica.
 * Sem regra de compartilhamento externo documentada — e-mail externo é recusado.
 */
export async function assertScheduleRecipientAllowed(
  clinicId: string,
  recipientEmail: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 403; error: string }> {
  const email = recipientEmail.trim().toLowerCase();
  if (!email) return { ok: false, status: 400, error: 'recipient_email inválido' };

  const { data: clinicUsers, error } = await supabaseAdmin
    .from('clinic_users')
    .select('user_id')
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .limit(200);
  if (error) return { ok: false, status: 400, error: error.message };
  const userIds = (clinicUsers ?? []).map((r) => r.user_id as string).filter(Boolean);
  if (userIds.length === 0) {
    return { ok: false, status: 403, error: 'Nenhum usuário ativo na clínica para receber o relatório' };
  }

  for (const userId of userIds) {
    try {
      const { data, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (uErr || !data?.user?.email) continue;
      if (String(data.user.email).trim().toLowerCase() === email) {
        return { ok: true };
      }
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    status: 403,
    error: 'Destinatário deve ser e-mail de um usuário ativo da clínica',
  };
}

export async function authorizeReportScheduleMutation(opts: {
  userId: string;
  clinicId: string;
  reportId: string;
  unitId?: string | null;
  recipientEmail: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isHubReportId(opts.reportId) || !SCHEDULABLE_REPORT_IDS.includes(opts.reportId)) {
    return { ok: false, status: 400, error: 'report_id não permite agendamento' };
  }
  const auth = await authorizeHubReport({
    userId: opts.userId,
    clinicId: opts.clinicId,
    reportId: opts.reportId,
    requestedUnitId: opts.unitId,
    requireSchedule: true,
  });
  if (!auth.ok) return auth;

  const recipient = await assertScheduleRecipientAllowed(opts.clinicId, opts.recipientEmail);
  if (!recipient.ok) return recipient;
  return { ok: true };
}

/**
 * Revalida autorização do proprietário do agendamento (create/edit/run/cron).
 * Escopo de dados = do proprietário — não do caller.
 */
export async function authorizeReportScheduleExecution(opts: {
  schedule: ScheduleRow;
}): Promise<{ ok: true } | { ok: false; status: number; error: string; suspend?: boolean }> {
  const ownerId = opts.schedule.created_by_user_id;
  if (!ownerId) {
    return {
      ok: false,
      status: 403,
      error: 'Agendamento sem proprietário; suspender',
      suspend: true,
    };
  }
  if (!isHubReportId(opts.schedule.report_id)) {
    return { ok: false, status: 400, error: 'report_id inválido', suspend: true };
  }

  const auth = await authorizeHubReport({
    userId: ownerId,
    clinicId: opts.schedule.clinic_id,
    reportId: opts.schedule.report_id,
    requestedUnitId: opts.schedule.unit_id,
    requireSchedule: true,
  });
  if (!auth.ok) {
    return { ...auth, suspend: true };
  }

  const recipient = await assertScheduleRecipientAllowed(
    opts.schedule.clinic_id,
    opts.schedule.recipient_email,
  );
  if (!recipient.ok) {
    return { ...recipient, suspend: true };
  }
  return { ok: true };
}

export async function suspendReportSchedule(
  scheduleId: string,
  clinicId: string,
  reason: string,
): Promise<void> {
  await supabaseAdmin
    .from('hub_report_email_schedules')
    .update({
      active: false,
      last_status: 'suspended',
      last_error: reason.slice(0, 500),
      suspension_reason: reason.slice(0, 500),
    })
    .eq('id', scheduleId)
    .eq('clinic_id', clinicId);
}

/** Revisa agendamentos ativos da clínica e suspende os inválidos (sem promover permissões). */
export async function auditActiveReportSchedules(clinicId: string): Promise<{
  checked: number;
  suspended: number;
}> {
  const { data, error } = await supabaseAdmin
    .from('hub_report_email_schedules')
    .select(
      'id, clinic_id, unit_id, report_id, recipient_email, period_days, cadence, active, created_by_user_id, suspension_reason',
    )
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .limit(200);
  if (error || !data) return { checked: 0, suspended: 0 };

  let suspended = 0;
  for (const row of data as ScheduleRow[]) {
    const result = await authorizeReportScheduleExecution({ schedule: row });
    if (!result.ok && result.suspend) {
      await suspendReportSchedule(row.id, clinicId, result.error);
      suspended += 1;
    }
  }
  return { checked: data.length, suspended };
}
