import { supabaseAdmin } from '../../config/supabase';
import {
  DEFAULT_SERIES_ENDING_MAX_REMAINING,
  DEFAULT_SERIES_ENDING_WITHIN_DAYS,
  filterEndingSoonSeries,
  groupFutureAppointmentsBySeries,
  type FutureSeriesAppointment,
} from './hubSeriesEndingSoonService';

export type HubSeriesEndingSoonRow = {
  series_id: string;
  remaining_count: number;
  last_starts_at: string;
  kind: string;
  interval_value: number;
  days_of_week: number[] | null;
  day_of_month: number | null;
  until_date: string | null;
  occurrences: number | null;
  sample_appointment_id: string;
  pet_id: string | null;
  guardian_id: string | null;
  title: string | null;
};

/**
 * Séries recorrentes da clínica que estão perto de acabar
 * (poucas ocorrências futuras ou última ocorrência na janela).
 */
export async function loadClinicSeriesEndingSoon(
  clinicId: string,
  opts?: { maxRemaining?: number; withinDays?: number },
): Promise<HubSeriesEndingSoonRow[]> {
  const maxRemaining = opts?.maxRemaining ?? DEFAULT_SERIES_ENDING_MAX_REMAINING;
  const withinDays = opts?.withinDays ?? DEFAULT_SERIES_ENDING_WITHIN_DAYS;
  const now = new Date();

  const { data: rows, error } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, series_id, starts_at, pet_id, guardian_id, title, status')
    .eq('clinic_id', clinicId)
    .not('series_id', 'is', null)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .gte('starts_at', now.toISOString())
    .order('starts_at', { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);

  const future = ((rows ?? []) as Array<Record<string, unknown>>)
    .filter((r) => typeof r.series_id === 'string')
    .map((r) => ({
      id: r.id as string,
      series_id: r.series_id as string,
      starts_at: r.starts_at as string,
      pet_id: (r.pet_id as string | null) ?? null,
      guardian_id: (r.guardian_id as string | null) ?? null,
      title: (r.title as string | null) ?? null,
    })) satisfies FutureSeriesAppointment[];

  const ending = filterEndingSoonSeries(
    groupFutureAppointmentsBySeries(future),
    now,
    maxRemaining,
    withinDays,
  );
  if (ending.length === 0) return [];

  const seriesIds = ending.map((s) => s.series_id);
  const { data: seriesRows, error: se } = await supabaseAdmin
    .from('hub_appointment_series')
    .select('id, kind, interval_value, days_of_week, day_of_month, until_date, occurrences')
    .eq('clinic_id', clinicId)
    .in('id', seriesIds);
  if (se) throw new Error(se.message);

  const seriesById = new Map(
    ((seriesRows ?? []) as Array<Record<string, unknown>>).map((r) => [r.id as string, r]),
  );

  return ending.map((s) => {
    const meta = seriesById.get(s.series_id);
    return {
      series_id: s.series_id,
      remaining_count: s.remaining_count,
      last_starts_at: s.last_starts_at,
      kind: (meta?.kind as string) ?? 'weekly',
      interval_value: Number(meta?.interval_value ?? 1) || 1,
      days_of_week: (meta?.days_of_week as number[] | null) ?? null,
      day_of_month: (meta?.day_of_month as number | null) ?? null,
      until_date: (meta?.until_date as string | null) ?? null,
      occurrences: (meta?.occurrences as number | null) ?? null,
      sample_appointment_id: s.sample_appointment_id,
      pet_id: s.pet_id,
      guardian_id: s.guardian_id,
      title: s.title,
    };
  });
}
