/**
 * Listagem e marcação de execução de linhas de serviço (comissão)
 * para o Caixa/Financeiro — sem depender do módulo Banho & Tosa.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  loadActiveCommissionRules,
  matchRuleForLine,
} from './hubCommissionAccrual';

const uuidStr = z.string().uuid();

const SOURCE_TYPES = [
  'appointment',
  'grooming_session',
  'encounter',
  'hospitalization',
] as const;

type SourceType = (typeof SOURCE_TYPES)[number];

async function resolveAppointmentIds(
  clinicId: string,
  sourceType: SourceType,
  sourceId: string,
): Promise<{ appointmentIds: string[]; error?: string; status?: number }> {
  if (sourceType === 'appointment') {
    const { data, error } = await supabaseAdmin
      .from('hub_appointments')
      .select('id')
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) return { appointmentIds: [], error: error.message, status: 500 };
    if (!data) return { appointmentIds: [], error: 'Agendamento não encontrado', status: 404 };
    return { appointmentIds: [data.id as string] };
  }

  if (sourceType === 'grooming_session') {
    const { data, error } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('id, hub_appointment_id')
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { appointmentIds: [], error: error.message, status: 500 };
    if (!data) return { appointmentIds: [], error: 'Sessão de Banho e Tosa não encontrada', status: 404 };
    const apptId = (data.hub_appointment_id as string | null) ?? null;
    if (!apptId) {
      return {
        appointmentIds: [],
        error: 'Sessão sem agendamento vinculado para marcar execução.',
        status: 404,
      };
    }
    return { appointmentIds: [apptId] };
  }

  if (sourceType === 'encounter') {
    const { data, error } = await supabaseAdmin
      .from('hub_encounters')
      .select('id, hub_appointment_id')
      .eq('id', sourceId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error) return { appointmentIds: [], error: error.message, status: 500 };
    if (!data) return { appointmentIds: [], error: 'Atendimento clínico não encontrado', status: 404 };
    const apptId = (data.hub_appointment_id as string | null) ?? null;
    if (!apptId) {
      return {
        appointmentIds: [],
        error: 'Atendimento sem agendamento espelhado para marcar execução.',
        status: 404,
      };
    }
    return { appointmentIds: [apptId] };
  }

  // hospitalization
  const { data: hosp, error: hospErr } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('id, hub_appointment_id, hub_encounter_id')
    .eq('id', sourceId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (hospErr) return { appointmentIds: [], error: hospErr.message, status: 500 };
  if (!hosp) return { appointmentIds: [], error: 'Internação não encontrada', status: 404 };

  const directAppt = (hosp.hub_appointment_id as string | null) ?? null;
  if (directAppt) return { appointmentIds: [directAppt] };

  const encId = (hosp.hub_encounter_id as string | null) ?? null;
  if (encId) {
    const { data: enc, error: encErr } = await supabaseAdmin
      .from('hub_encounters')
      .select('hub_appointment_id')
      .eq('id', encId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (encErr) return { appointmentIds: [], error: encErr.message, status: 500 };
    const apptId = (enc?.hub_appointment_id as string | null) ?? null;
    if (apptId) return { appointmentIds: [apptId] };
  }

  return {
    appointmentIds: [],
    error: 'Internação sem agendamento vinculado para marcar execução.',
    status: 404,
  };
}

/** GET /finance/service-execution-lines */
export const getHubFinanceServiceExecutionLines = async (req: Request, res: Response) => {
  try {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    const sourceTypeRaw = String(req.query.source_type ?? '');
    const sourceIdParsed = uuidStr.safeParse(req.query.source_id);
    if (!clinicParsed.success || !sourceIdParsed.success) {
      return res.status(400).json({ error: 'clinic_id e source_id são obrigatórios (UUID)' });
    }
    if (!(SOURCE_TYPES as readonly string[]).includes(sourceTypeRaw)) {
      return res.status(400).json({
        error: `source_type inválido. Use: ${SOURCE_TYPES.join(', ')}`,
      });
    }
    const clinicId = clinicParsed.data;
    const sourceType = sourceTypeRaw as SourceType;
    const sourceId = sourceIdParsed.data;

    const resolved = await resolveAppointmentIds(clinicId, sourceType, sourceId);
    if (resolved.error) {
      return res.status(resolved.status ?? 400).json({ error: resolved.error });
    }
    const appointmentIds = resolved.appointmentIds;
    if (appointmentIds.length === 0) {
      return res.json({ lines: [], appointment_ids: [] });
    }

    const { data: appts, error: apptErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, appointment_kind')
      .eq('clinic_id', clinicId)
      .in('id', appointmentIds);
    if (apptErr) return res.status(500).json({ error: apptErr.message });

    const eligibleApptIds = (appts ?? [])
      .filter((a) => String(a.appointment_kind ?? '') !== 'pickup_route')
      .map((a) => a.id as string);

    if (eligibleApptIds.length === 0) {
      return res.json({ lines: [], appointment_ids: appointmentIds });
    }

    const { data: svcRows, error: svcErr } = await supabaseAdmin
      .from('hub_appointment_services')
      .select(
        'id, appointment_id, hub_service_type_id, executed_at, executed_by_staff_id, sale_amount_applied, service_type:hub_service_types(id, name, service_group)',
      )
      .in('appointment_id', eligibleApptIds);
    if (svcErr) return res.status(500).json({ error: svcErr.message });

    const rules = await loadActiveCommissionRules(clinicId);

    const lines = (svcRows ?? []).map((row) => {
      const serviceType = row.service_type as
        | { id?: string; name?: string; service_group?: string | null }
        | { id?: string; name?: string; service_group?: string | null }[]
        | null;
      const st = Array.isArray(serviceType) ? serviceType[0] ?? null : serviceType;
      const hubServiceTypeId = (row.hub_service_type_id as string | null) ?? null;
      const executedBy = (row.executed_by_staff_id as string | null) ?? null;
      const rule = matchRuleForLine(rules, {
        hub_service_type_id: hubServiceTypeId,
        hub_inventory_item_id: null,
      });
      return {
        id: row.id as string,
        appointment_id: row.appointment_id as string,
        hub_service_type_id: hubServiceTypeId,
        name: st?.name ?? 'Serviço',
        service_group: st?.service_group ?? null,
        executed_at: (row.executed_at as string | null) ?? null,
        executed_by_staff_id: executedBy,
        commission_requires_executor: Boolean(rule) && !executedBy,
      };
    });

    return res.json({ lines, appointment_ids: appointmentIds });
  } catch (e: unknown) {
    console.error('getHubFinanceServiceExecutionLines', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

const patchLineSchema = z
  .object({
    clinic_id: uuidStr,
    executed: z.boolean(),
    executed_by_staff_id: uuidStr.optional().nullable(),
  })
  .strict();

/** PATCH /finance/appointment-service-lines/:lineId */
export const patchHubFinanceAppointmentServiceLine = async (req: Request, res: Response) => {
  try {
    const lineId = uuidStr.safeParse(req.params.lineId);
    const parsed = patchLineSchema.safeParse(req.body);
    if (!lineId.success || !parsed.success) {
      return res.status(400).json({ error: 'lineId e body inválidos' });
    }
    const { clinic_id, executed, executed_by_staff_id } = parsed.data;

    const { data: line, error: lErr } = await supabaseAdmin
      .from('hub_appointment_services')
      .select('id, appointment_id')
      .eq('id', lineId.data)
      .maybeSingle();
    if (lErr) return res.status(500).json({ error: lErr.message });
    if (!line) return res.status(404).json({ error: 'Linha não encontrada' });

    const { data: appt, error: aErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, clinic_id')
      .eq('id', line.appointment_id as string)
      .maybeSingle();
    if (aErr) return res.status(500).json({ error: aErr.message });
    if (!appt || appt.clinic_id !== clinic_id) {
      return res.status(403).json({ error: 'Agendamento inválido' });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      executed_at: executed ? now : null,
      executed_by_staff_id: executed ? executed_by_staff_id ?? null : null,
    };

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('hub_appointment_services')
      .update(patch)
      .eq('id', lineId.data)
      .select('id, appointment_id, hub_service_type_id, executed_at, executed_by_staff_id')
      .maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });

    return res.json({ line: updated });
  } catch (e: unknown) {
    console.error('patchHubFinanceAppointmentServiceLine', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar linha' });
  }
};
