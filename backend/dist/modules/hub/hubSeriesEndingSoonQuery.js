"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadClinicSeriesEndingSoon = loadClinicSeriesEndingSoon;
const supabase_1 = require("../../config/supabase");
const hubSeriesEndingSoonService_1 = require("./hubSeriesEndingSoonService");
/**
 * Séries recorrentes da clínica que estão perto de acabar
 * (poucas ocorrências futuras ou última ocorrência na janela).
 */
async function loadClinicSeriesEndingSoon(clinicId, opts) {
    const maxRemaining = opts?.maxRemaining ?? hubSeriesEndingSoonService_1.DEFAULT_SERIES_ENDING_MAX_REMAINING;
    const withinDays = opts?.withinDays ?? hubSeriesEndingSoonService_1.DEFAULT_SERIES_ENDING_WITHIN_DAYS;
    const now = new Date();
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, series_id, starts_at, pet_id, guardian_id, title, status')
        .eq('clinic_id', clinicId)
        .not('series_id', 'is', null)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .gte('starts_at', now.toISOString())
        .order('starts_at', { ascending: true })
        .limit(5000);
    if (error)
        throw new Error(error.message);
    const future = (rows ?? [])
        .filter((r) => typeof r.series_id === 'string')
        .map((r) => ({
        id: r.id,
        series_id: r.series_id,
        starts_at: r.starts_at,
        pet_id: r.pet_id ?? null,
        guardian_id: r.guardian_id ?? null,
        title: r.title ?? null,
    }));
    const ending = (0, hubSeriesEndingSoonService_1.filterEndingSoonSeries)((0, hubSeriesEndingSoonService_1.groupFutureAppointmentsBySeries)(future), now, maxRemaining, withinDays);
    if (ending.length === 0)
        return [];
    const seriesIds = ending.map((s) => s.series_id);
    const { data: seriesRows, error: se } = await supabase_1.supabaseAdmin
        .from('hub_appointment_series')
        .select('id, kind, interval_value, days_of_week, day_of_month, until_date, occurrences')
        .eq('clinic_id', clinicId)
        .in('id', seriesIds);
    if (se)
        throw new Error(se.message);
    const seriesById = new Map((seriesRows ?? []).map((r) => [r.id, r]));
    return ending.map((s) => {
        const meta = seriesById.get(s.series_id);
        return {
            series_id: s.series_id,
            remaining_count: s.remaining_count,
            last_starts_at: s.last_starts_at,
            kind: meta?.kind ?? 'weekly',
            interval_value: Number(meta?.interval_value ?? 1) || 1,
            days_of_week: meta?.days_of_week ?? null,
            day_of_month: meta?.day_of_month ?? null,
            until_date: meta?.until_date ?? null,
            occurrences: meta?.occurrences ?? null,
            sample_appointment_id: s.sample_appointment_id,
            pet_id: s.pet_id,
            guardian_id: s.guardian_id,
            title: s.title,
        };
    });
}
