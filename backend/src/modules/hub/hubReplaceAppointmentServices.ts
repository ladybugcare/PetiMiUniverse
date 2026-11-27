/**
 * Substitui linhas de hub_appointment_services de forma atômica (RPC) com fallback
 * sequencial para mocks / ambientes sem a função.
 */
import { supabaseAdmin } from '../../config/supabase';

export type AppointmentServiceInsertRow = {
  appointment_id: string;
  hub_service_type_id: string;
  duration_minutes: number;
  order_index: number;
  pricing_porte_tier_applied?: string | null;
  pricing_coat_type_applied?: string | null;
  cost_amount_applied?: number | null;
  sale_amount_applied?: number | null;
  pricing_variant?: Record<string, unknown> | null;
  pricing_source?: string | null;
  special_price_id?: string | null;
};

/** Testes e HUB_APPOINTMENT_SERVICES_TS_FALLBACK=1 usam delete+insert sequencial. */
export function allowAppointmentServicesTsFallback(): boolean {
  if (process.env.HUB_APPOINTMENT_SERVICES_TS_FALLBACK === '1') return true;
  if (process.env.HUB_APPOINTMENT_SERVICES_TS_FALLBACK === '0') return false;
  return process.env.NODE_ENV === 'test';
}

function isReplaceRpcUnavailable(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('could not find the function') ||
    m.includes('function public.hub_replace_appointment_services') ||
    (m.includes('hub_replace_appointment_services') && m.includes('does not exist')) ||
    m.includes('is not a function') ||
    m.includes('rpc_unavailable') ||
    m.includes('.rpc is not a function')
  );
}

async function replaceAppointmentServicesTsFallback(
  appointmentId: string,
  rows: AppointmentServiceInsertRow[],
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabaseAdmin
    .from('hub_appointment_services')
    .delete()
    .eq('appointment_id', appointmentId);
  if (delErr) return { error: delErr.message };

  if (rows.length === 0) return { error: null };

  const { error: insErr } = await supabaseAdmin.from('hub_appointment_services').insert(rows);
  if (insErr) return { error: insErr.message };
  return { error: null };
}

/**
 * Apaga as linhas atuais e insere `rows` (já montadas) na mesma operação atômica via RPC.
 * Em mock/test: fallback sequencial — snapshots devem estar prontos antes da chamada.
 */
export async function replaceAppointmentServices(
  appointmentId: string,
  rows: AppointmentServiceInsertRow[],
): Promise<{ error: string | null }> {
  let rpcErrMsg: string | null = null;
  try {
    const rpcRes = await supabaseAdmin.rpc('hub_replace_appointment_services', {
      p_appointment_id: appointmentId,
      p_rows: rows,
    });
    if (rpcRes.error) {
      rpcErrMsg = rpcRes.error.message || 'rpc_error';
    } else if (
      rpcRes.data &&
      typeof rpcRes.data === 'object' &&
      (rpcRes.data as { ok?: boolean }).ok === false
    ) {
      rpcErrMsg = String((rpcRes.data as { error?: string }).error || 'rpc_failed');
    } else {
      return { error: null };
    }
  } catch (e) {
    rpcErrMsg = (e as Error)?.message || 'rpc_unavailable';
  }

  if (rpcErrMsg && isReplaceRpcUnavailable(rpcErrMsg) && allowAppointmentServicesTsFallback()) {
    return replaceAppointmentServicesTsFallback(appointmentId, rows);
  }

  return { error: rpcErrMsg || 'Erro ao substituir serviços do agendamento' };
}
