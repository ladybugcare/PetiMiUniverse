"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SERIES_ENDING_WITHIN_DAYS = exports.DEFAULT_SERIES_ENDING_MAX_REMAINING = void 0;
exports.isSeriesEndingSoon = isSeriesEndingSoon;
exports.groupFutureAppointmentsBySeries = groupFutureAppointmentsBySeries;
exports.filterEndingSoonSeries = filterEndingSoonSeries;
exports.DEFAULT_SERIES_ENDING_MAX_REMAINING = 2;
exports.DEFAULT_SERIES_ENDING_WITHIN_DAYS = 7;
function isSeriesEndingSoon(remainingCount, lastStartsAt, now, maxRemaining, withinDays) {
    if (remainingCount <= 0)
        return false;
    if (remainingCount <= maxRemaining)
        return true;
    const lastMs = new Date(lastStartsAt).getTime();
    if (!Number.isFinite(lastMs))
        return false;
    const cutoff = now.getTime() + withinDays * 24 * 60 * 60 * 1000;
    return lastMs <= cutoff;
}
/** Agrupa ocorrências futuras por série; a amostra é o último slot (maior starts_at). */
function groupFutureAppointmentsBySeries(rows) {
    const bySeries = new Map();
    for (const row of rows) {
        if (!row.series_id)
            continue;
        const list = bySeries.get(row.series_id) ?? [];
        list.push(row);
        bySeries.set(row.series_id, list);
    }
    const out = [];
    for (const [series_id, list] of bySeries) {
        let last = list[0];
        for (const item of list) {
            if (item.starts_at > last.starts_at)
                last = item;
        }
        out.push({
            series_id,
            remaining_count: list.length,
            last_starts_at: last.starts_at,
            sample_appointment_id: last.id,
            pet_id: last.pet_id,
            guardian_id: last.guardian_id,
            title: last.title,
        });
    }
    return out;
}
function filterEndingSoonSeries(aggs, now, maxRemaining, withinDays) {
    return aggs
        .filter((a) => isSeriesEndingSoon(a.remaining_count, a.last_starts_at, now, maxRemaining, withinDays))
        .sort((a, b) => a.last_starts_at.localeCompare(b.last_starts_at));
}
