"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubVaccinesDueReport = exports.getHubGroomingProductivityReport = exports.getHubBirthdaysReport = exports.getHubClientCohortsReport = exports.getHubBoardingOccupancySeriesReport = exports.getHubNoShowsReport = exports.getHubAbsentClientsReport = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
function ymdTodayUtc() {
    const dt = new Date();
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function addDaysYmd(ymd, delta) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function daysBetweenYmd(fromYmd, toYmd) {
    const a = Date.parse(`${fromYmd}T12:00:00Z`);
    const b = Date.parse(`${toYmd}T12:00:00Z`);
    return Math.floor((b - a) / 86_400_000);
}
/**
 * Clientes ativos sem visita (agendamento não cancelado ou recebível) há N dias.
 * Query: clinic_id, days (default 60), unit_id opcional (filtra última atividade na unidade).
 */
const getHubAbsentClientsReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const unitRaw = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
        const unitParsed = unitRaw ? uuidStr.safeParse(unitRaw) : null;
        if (unitRaw && !unitParsed?.success)
            return res.status(400).json({ error: 'unit_id inválido' });
        const unit_id = unitParsed?.success ? unitParsed.data : null;
        const daysParsed = zod_1.z.coerce.number().int().min(7).max(730).safeParse(req.query.days);
        const days = daysParsed.success ? daysParsed.data : 60;
        const asOf = ymdTodayUtc();
        const cutoffYmd = addDaysYmd(asOf, -days);
        const cutoffIso = `${cutoffYmd}T00:00:00.000Z`;
        const { data: guardians, error: gErr } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone, email, client_status, created_at')
            .eq('clinic_id', clinic_id)
            .eq('client_status', 'active')
            .is('deleted_at', null)
            .order('full_name', { ascending: true })
            .limit(3000);
        if (gErr)
            return res.status(500).json({ error: gErr.message });
        const lastActivity = new Map();
        let apptQ = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('guardian_id, starts_at, unit_id')
            .eq('clinic_id', clinic_id)
            .not('guardian_id', 'is', null)
            .neq('status', 'cancelled')
            .order('starts_at', { ascending: false })
            .limit(8000);
        if (unit_id)
            apptQ = apptQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { data: appts, error: aErr } = await apptQ;
        if (aErr)
            return res.status(500).json({ error: aErr.message });
        for (const row of appts ?? []) {
            const gid = row.guardian_id;
            if (!gid || lastActivity.has(gid))
                continue;
            lastActivity.set(gid, { at: row.starts_at, source: 'appointment' });
        }
        let recQ = supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('guardian_id, created_at, unit_id')
            .eq('clinic_id', clinic_id)
            .not('guardian_id', 'is', null)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(8000);
        if (unit_id)
            recQ = recQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { data: recs, error: rErr } = await recQ;
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        for (const row of recs ?? []) {
            const gid = row.guardian_id;
            if (!gid)
                continue;
            const at = row.created_at;
            const prev = lastActivity.get(gid);
            if (!prev || at > prev.at) {
                lastActivity.set(gid, { at, source: 'receivable' });
            }
        }
        const items = [];
        for (const g of guardians ?? []) {
            const act = lastActivity.get(g.id);
            if (act && act.at >= cutoffIso)
                continue;
            const lastYmd = act ? act.at.slice(0, 10) : null;
            items.push({
                guardian_id: g.id,
                full_name: String(g.full_name ?? ''),
                phone: g.phone ?? null,
                email: g.email ?? null,
                last_activity_at: act?.at ?? null,
                last_activity_source: act?.source ?? null,
                days_absent: lastYmd ? daysBetweenYmd(lastYmd, asOf) : null,
                never_attended: !act,
            });
        }
        items.sort((a, b) => {
            if (a.never_attended !== b.never_attended)
                return a.never_attended ? 1 : -1;
            const da = a.days_absent ?? 0;
            const db = b.days_absent ?? 0;
            if (da !== db)
                return db - da;
            return a.full_name.localeCompare(b.full_name, 'pt-BR');
        });
        return res.json({
            as_of: asOf,
            days,
            cutoff: cutoffYmd,
            unit_id,
            summary: {
                absent_count: items.length,
                never_attended_count: items.filter((i) => i.never_attended).length,
                active_guardians_scanned: guardians?.length ?? 0,
            },
            items: items.slice(0, 500),
        });
    }
    catch (e) {
        console.error('getHubAbsentClientsReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubAbsentClientsReport = getHubAbsentClientsReport;
function parseReportPeriod(q) {
    const fromRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.from);
    const toRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.to);
    if (fromRaw.success && toRaw.success) {
        if (fromRaw.data > toRaw.data)
            return { ok: false, error: 'from não pode ser maior que to' };
        return { ok: true, fromYmd: fromRaw.data, toYmd: toRaw.data };
    }
    const days = zod_1.z.coerce.number().int().min(1).max(366).safeParse(q.days);
    const n = days.success ? days.data : 30;
    const toYmd = ymdTodayUtc();
    const fromYmd = addDaysYmd(toYmd, -(n - 1));
    return { ok: true, fromYmd, toYmd };
}
/**
 * No-shows: reservas de hotel/creche com status no_show + agendamentos
 * confirmados/pendentes cujo horário já passou sem evolução (falta implícita).
 */
const getHubNoShowsReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const unitRaw = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
        const unitParsed = unitRaw ? uuidStr.safeParse(unitRaw) : null;
        if (unitRaw && !unitParsed?.success)
            return res.status(400).json({ error: 'unit_id inválido' });
        const unit_id = unitParsed?.success ? unitParsed.data : null;
        const period = parseReportPeriod(req.query);
        if (!period.ok)
            return res.status(400).json({ error: period.error });
        const { fromYmd, toYmd } = period;
        const fromIso = `${fromYmd}T00:00:00.000Z`;
        const toIso = `${toYmd}T23:59:59.999Z`;
        const nowIso = new Date().toISOString();
        let boardQ = supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select(`id, mode, status, expected_check_in, expected_check_out, pet_id, guardian_id, unit_id,
        hub_pets!hub_boarding_reservations_pet_id_fkey(name),
        hub_guardians!hub_boarding_reservations_guardian_id_fkey(full_name, phone)`)
            .eq('clinic_id', clinic_id)
            .eq('status', 'no_show')
            .gte('expected_check_in', fromIso)
            .lte('expected_check_in', toIso)
            .order('expected_check_in', { ascending: false })
            .limit(500);
        if (unit_id)
            boardQ = boardQ.eq('unit_id', unit_id);
        const { data: boardingRows, error: bErr } = await boardQ;
        if (bErr)
            return res.status(500).json({ error: bErr.message });
        let apptQ = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, status, starts_at, ends_at, guardian_id, pet_id, unit_id, title, hub_staff_member_id')
            .eq('clinic_id', clinic_id)
            .in('status', ['confirmed', 'pending_confirm'])
            .gte('starts_at', fromIso)
            .lte('starts_at', toIso)
            .lt('ends_at', nowIso)
            .order('starts_at', { ascending: false })
            .limit(500);
        if (unit_id)
            apptQ = apptQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { data: apptRows, error: aErr } = await apptQ;
        if (aErr)
            return res.status(500).json({ error: aErr.message });
        const guIds = [
            ...new Set([
                ...(boardingRows ?? []).map((r) => r.guardian_id),
                ...(apptRows ?? []).map((r) => r.guardian_id),
            ].filter(Boolean)),
        ];
        const petIds = [
            ...new Set([
                ...(boardingRows ?? []).map((r) => r.pet_id),
                ...(apptRows ?? []).map((r) => r.pet_id),
            ].filter(Boolean)),
        ];
        const guardianMap = new Map();
        const petMap = new Map();
        if (guIds.length > 0) {
            const { data: gus } = await supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id, full_name, phone')
                .in('id', guIds);
            for (const g of gus ?? []) {
                guardianMap.set(g.id, {
                    full_name: String(g.full_name ?? ''),
                    phone: g.phone ?? null,
                });
            }
        }
        if (petIds.length > 0) {
            const { data: pets } = await supabase_1.supabaseAdmin.from('hub_pets').select('id, name').in('id', petIds);
            for (const p of pets ?? [])
                petMap.set(p.id, String(p.name ?? ''));
        }
        // Denominador para taxa: atendimentos "fechados" no período + no-shows
        let doneQ = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', clinic_id)
            .in('status', ['done', 'paid', 'in_progress', 'checked_in'])
            .gte('starts_at', fromIso)
            .lte('starts_at', toIso);
        if (unit_id)
            doneQ = doneQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { count: attendedCount } = await doneQ;
        let boardDoneQ = supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', clinic_id)
            .in('status', ['checked_out', 'checked_in'])
            .gte('expected_check_in', fromIso)
            .lte('expected_check_in', toIso);
        if (unit_id)
            boardDoneQ = boardDoneQ.eq('unit_id', unit_id);
        const { count: boardingAttendedCount } = await boardDoneQ;
        const items = [];
        for (const r of boardingRows ?? []) {
            const g = r.guardian_id ? guardianMap.get(r.guardian_id) : null;
            // Prefer embedded join when present
            const embG = r.hub_guardians;
            const embGObj = Array.isArray(embG) ? embG[0] ?? null : embG;
            const embP = r.hub_pets;
            const embPObj = Array.isArray(embP) ? embP[0] ?? null : embP;
            items.push({
                id: r.id,
                source: 'boarding',
                kind_label: r.mode === 'daycare' ? 'Creche' : 'Hotel',
                when_at: r.expected_check_in,
                guardian_name: embGObj?.full_name ?? g?.full_name ?? null,
                phone: embGObj?.phone ?? g?.phone ?? null,
                pet_name: embPObj?.name ?? (r.pet_id ? petMap.get(r.pet_id) ?? null : null),
                status: 'no_show',
            });
        }
        for (const r of apptRows ?? []) {
            const g = r.guardian_id ? guardianMap.get(r.guardian_id) : null;
            items.push({
                id: r.id,
                source: 'appointment',
                kind_label: r.title?.trim() || 'Agendamento',
                when_at: r.starts_at,
                guardian_name: g?.full_name ?? null,
                phone: g?.phone ?? null,
                pet_name: r.pet_id ? petMap.get(r.pet_id) ?? null : null,
                status: String(r.status),
            });
        }
        items.sort((a, b) => b.when_at.localeCompare(a.when_at));
        const boardingNoShows = (boardingRows ?? []).length;
        const appointmentNoShows = (apptRows ?? []).length;
        const totalNoShows = boardingNoShows + appointmentNoShows;
        const attended = (attendedCount ?? 0) + (boardingAttendedCount ?? 0);
        const denom = attended + totalNoShows;
        const rate_pct = denom > 0 ? Math.round((totalNoShows / denom) * 1000) / 10 : 0;
        return res.json({
            period: { from: fromYmd, to: toYmd },
            unit_id,
            summary: {
                total_no_shows: totalNoShows,
                boarding_no_shows: boardingNoShows,
                appointment_implied_no_shows: appointmentNoShows,
                attended_count: attended,
                rate_pct,
            },
            items: items.slice(0, 400),
        });
    }
    catch (e) {
        console.error('getHubNoShowsReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubNoShowsReport = getHubNoShowsReport;
/** Série diária de ocupação hotel/creche no período. */
const getHubBoardingOccupancySeriesReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const unitRaw = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
        const unitParsed = unitRaw ? uuidStr.safeParse(unitRaw) : null;
        if (unitRaw && !unitParsed?.success)
            return res.status(400).json({ error: 'unit_id inválido' });
        const unit_id = unitParsed?.success ? unitParsed.data : null;
        const period = parseReportPeriod(req.query);
        if (!period.ok)
            return res.status(400).json({ error: period.error });
        const { fromYmd, toYmd } = period;
        const fromTs = new Date(`${fromYmd}T00:00:00-03:00`).toISOString();
        const toTs = new Date(`${toYmd}T23:59:59.999-03:00`).toISOString();
        let rQ = supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, mode, status, expected_check_in, expected_check_out')
            .eq('clinic_id', clinic_id)
            .not('status', 'in', '("cancelled","no_show")')
            .lt('expected_check_in', toTs)
            .gt('expected_check_out', fromTs)
            .limit(5000);
        if (unit_id)
            rQ = rQ.eq('unit_id', unit_id);
        const { data: reservations, error: rErr } = await rQ;
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        let settingsQ = supabase_1.supabaseAdmin
            .from('hub_unit_boarding_settings')
            .select('hotel_slots, daycare_slots_per_shift')
            .eq('clinic_id', clinic_id);
        if (unit_id)
            settingsQ = settingsQ.eq('unit_id', unit_id);
        const { data: settingsRows } = await settingsQ;
        const settings = settingsRows?.[0] ?? null;
        const hotelMax = settings?.hotel_slots != null ? Number(settings.hotel_slots) : null;
        const daycareMax = settings?.daycare_slots_per_shift != null ? Number(settings.daycare_slots_per_shift) : null;
        const days = [];
        let peakHotel = 0;
        let peakDaycare = 0;
        let sumHotelPct = 0;
        let hotelPctDays = 0;
        let sumDaycarePct = 0;
        let daycarePctDays = 0;
        for (let d = fromYmd;; d = addDaysYmd(d, 1)) {
            const dayStart = new Date(`${d}T00:00:00-03:00`).getTime();
            const dayEnd = new Date(`${d}T23:59:59.999-03:00`).getTime();
            let hotel = 0;
            let daycare = 0;
            for (const r of reservations ?? []) {
                const cin = Date.parse(r.expected_check_in);
                const cout = Date.parse(r.expected_check_out);
                if (Number.isNaN(cin) || Number.isNaN(cout))
                    continue;
                if (cin < dayEnd && cout > dayStart) {
                    if (r.mode === 'hotel')
                        hotel += 1;
                    else if (r.mode === 'daycare')
                        daycare += 1;
                }
            }
            const hotel_pct = hotelMax && hotelMax > 0 ? Math.round((hotel / hotelMax) * 1000) / 10 : null;
            const daycare_pct = daycareMax && daycareMax > 0 ? Math.round((daycare / daycareMax) * 1000) / 10 : null;
            days.push({
                date: d,
                hotel_current: hotel,
                hotel_max: hotelMax,
                hotel_pct,
                daycare_current: daycare,
                daycare_max: daycareMax,
                daycare_pct,
            });
            if (hotel > peakHotel)
                peakHotel = hotel;
            if (daycare > peakDaycare)
                peakDaycare = daycare;
            if (hotel_pct != null) {
                sumHotelPct += hotel_pct;
                hotelPctDays += 1;
            }
            if (daycare_pct != null) {
                sumDaycarePct += daycare_pct;
                daycarePctDays += 1;
            }
            if (d === toYmd)
                break;
        }
        return res.json({
            period: { from: fromYmd, to: toYmd },
            unit_id,
            capacity: { hotel_max: hotelMax, daycare_max: daycareMax },
            summary: {
                peak_hotel: peakHotel,
                peak_daycare: peakDaycare,
                avg_hotel_pct: hotelPctDays ? Math.round((sumHotelPct / hotelPctDays) * 10) / 10 : null,
                avg_daycare_pct: daycarePctDays ? Math.round((sumDaycarePct / daycarePctDays) * 10) / 10 : null,
                days_count: days.length,
            },
            days,
        });
    }
    catch (e) {
        console.error('getHubBoardingOccupancySeriesReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubBoardingOccupancySeriesReport = getHubBoardingOccupancySeriesReport;
/**
 * Cohortes de clientes no período:
 * - novos: tutores cadastrados no período
 * - recorrentes: tutores com recebível no período e já tinham recebível antes
 * - primeira_compra: tutores cuja primeira venda (recebível) caiu no período
 */
const getHubClientCohortsReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const unitRaw = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
        const unitParsed = unitRaw ? uuidStr.safeParse(unitRaw) : null;
        if (unitRaw && !unitParsed?.success)
            return res.status(400).json({ error: 'unit_id inválido' });
        const unit_id = unitParsed?.success ? unitParsed.data : null;
        const period = parseReportPeriod(req.query);
        if (!period.ok)
            return res.status(400).json({ error: period.error });
        const { fromYmd, toYmd } = period;
        const fromIso = `${fromYmd}T00:00:00.000Z`;
        const toIso = `${toYmd}T23:59:59.999Z`;
        const { data: newGuardians, error: ngErr } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone, email, created_at, client_status')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .order('created_at', { ascending: false })
            .limit(500);
        if (ngErr)
            return res.status(500).json({ error: ngErr.message });
        let recQ = supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, guardian_id, final_amount, created_at, unit_id, status')
            .eq('clinic_id', clinic_id)
            .not('guardian_id', 'is', null)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: true })
            .limit(12000);
        if (unit_id)
            recQ = recQ.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { data: recs, error: rErr } = await recQ;
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        const firstSaleAt = new Map();
        const priorGuardians = new Set();
        const periodTotals = new Map();
        for (const row of recs ?? []) {
            const gid = row.guardian_id;
            const at = row.created_at;
            if (!firstSaleAt.has(gid))
                firstSaleAt.set(gid, at);
            if (at < fromIso)
                priorGuardians.add(gid);
            if (at >= fromIso && at <= toIso) {
                const cur = periodTotals.get(gid) ?? { amount: 0, count: 0 };
                cur.amount = Math.round((cur.amount + Number(row.final_amount ?? 0)) * 100) / 100;
                cur.count += 1;
                periodTotals.set(gid, cur);
            }
        }
        const periodGuardianIds = [...periodTotals.keys()];
        const nameById = new Map();
        if (periodGuardianIds.length > 0) {
            const { data: gRows, error: gErr } = await supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id, full_name, phone')
                .in('id', periodGuardianIds.slice(0, 2000));
            if (gErr)
                return res.status(500).json({ error: gErr.message });
            for (const g of gRows ?? []) {
                nameById.set(g.id, {
                    full_name: String(g.full_name ?? ''),
                    phone: g.phone ?? null,
                });
            }
        }
        const recurring = [];
        const firstPurchase = [];
        for (const gid of periodGuardianIds) {
            const tot = periodTotals.get(gid);
            const meta = nameById.get(gid);
            const row = {
                guardian_id: gid,
                full_name: meta?.full_name ?? '—',
                phone: meta?.phone ?? null,
                receivables_count: tot.count,
                total: tot.amount,
            };
            const firstAt = firstSaleAt.get(gid);
            if (priorGuardians.has(gid))
                recurring.push(row);
            else if (firstAt && firstAt >= fromIso && firstAt <= toIso)
                firstPurchase.push(row);
        }
        recurring.sort((a, b) => b.total - a.total);
        firstPurchase.sort((a, b) => b.total - a.total);
        return res.json({
            period: { from: fromYmd, to: toYmd },
            unit_id,
            summary: {
                new_clients_count: newGuardians?.length ?? 0,
                recurring_count: recurring.length,
                first_purchase_count: firstPurchase.length,
            },
            new_clients: (newGuardians ?? []).map((g) => ({
                guardian_id: g.id,
                full_name: String(g.full_name ?? ''),
                phone: g.phone ?? null,
                email: g.email ?? null,
                created_at: g.created_at,
                client_status: g.client_status ?? null,
            })),
            recurring: recurring.slice(0, 200),
            first_purchase: firstPurchase.slice(0, 200),
        });
    }
    catch (e) {
        console.error('getHubClientCohortsReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubClientCohortsReport = getHubClientCohortsReport;
function nextBirthdayOnOrAfter(birthYmd, fromYmd) {
    const bm = birthYmd.slice(5, 7);
    const bd = birthYmd.slice(8, 10);
    if (!/^\d{2}$/.test(bm) || !/^\d{2}$/.test(bd))
        return null;
    const fromY = Number(fromYmd.slice(0, 4));
    const tryYmd = (y) => {
        let day = Number(bd);
        const month = Number(bm);
        if (month === 2 && day === 29) {
            const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
            if (!leap)
                day = 28;
        }
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
    };
    let cand = tryYmd(fromY);
    if (cand < fromYmd)
        cand = tryYmd(fromY + 1);
    return cand;
}
/**
 * Aniversariantes (pets e tutores) nos próximos N dias (default 30).
 * Query: clinic_id, days (1–90).
 */
const getHubBirthdaysReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const daysParsed = zod_1.z.coerce.number().int().min(1).max(90).safeParse(req.query.days);
        const days = daysParsed.success ? daysParsed.data : 30;
        const asOf = ymdTodayUtc();
        const until = addDaysYmd(asOf, days);
        const [{ data: guardians, error: gErr }, { data: pets, error: pErr }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id, full_name, phone, email, birth_date')
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .not('birth_date', 'is', null)
                .limit(5000),
            supabase_1.supabaseAdmin
                .from('hub_pets')
                .select('id, name, species, birth_date, clinic_id')
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .not('birth_date', 'is', null)
                .limit(8000),
        ]);
        if (gErr)
            return res.status(500).json({ error: gErr.message });
        if (pErr)
            return res.status(500).json({ error: pErr.message });
        const petIds = (pets ?? []).map((p) => p.id);
        const petGuardian = new Map();
        if (petIds.length > 0) {
            const chunk = 500;
            for (let i = 0; i < petIds.length; i += chunk) {
                const slice = petIds.slice(i, i + chunk);
                const { data: links, error: lErr } = await supabase_1.supabaseAdmin
                    .from('hub_pet_guardians')
                    .select('pet_id, guardian_id, role, hub_guardians(id, full_name)')
                    .in('pet_id', slice);
                if (lErr)
                    return res.status(500).json({ error: lErr.message });
                for (const link of links ?? []) {
                    const petId = link.pet_id;
                    if (petGuardian.has(petId) && link.role !== 'primary')
                        continue;
                    const g = link.hub_guardians;
                    const gObj = Array.isArray(g) ? g[0] : g;
                    if (!gObj?.id)
                        continue;
                    petGuardian.set(petId, {
                        guardian_id: gObj.id,
                        guardian_name: String(gObj.full_name ?? ''),
                    });
                }
            }
        }
        const items = [];
        for (const g of guardians ?? []) {
            const bd = String(g.birth_date ?? '');
            const next = nextBirthdayOnOrAfter(bd, asOf);
            if (!next || next > until)
                continue;
            items.push({
                kind: 'guardian',
                id: g.id,
                name: String(g.full_name ?? ''),
                birth_date: bd,
                next_birthday: next,
                days_until: daysBetweenYmd(asOf, next),
                phone: g.phone ?? null,
                guardian_id: g.id,
                guardian_name: String(g.full_name ?? ''),
                species: null,
            });
        }
        for (const p of pets ?? []) {
            const bd = String(p.birth_date ?? '');
            const next = nextBirthdayOnOrAfter(bd, asOf);
            if (!next || next > until)
                continue;
            const link = petGuardian.get(p.id);
            items.push({
                kind: 'pet',
                id: p.id,
                name: String(p.name ?? ''),
                birth_date: bd,
                next_birthday: next,
                days_until: daysBetweenYmd(asOf, next),
                phone: null,
                guardian_id: link?.guardian_id ?? null,
                guardian_name: link?.guardian_name ?? null,
                species: p.species ?? null,
            });
        }
        items.sort((a, b) => {
            if (a.days_until !== b.days_until)
                return a.days_until - b.days_until;
            return a.name.localeCompare(b.name, 'pt-BR');
        });
        return res.json({
            as_of: asOf,
            days,
            until,
            summary: {
                total: items.length,
                guardians: items.filter((i) => i.kind === 'guardian').length,
                pets: items.filter((i) => i.kind === 'pet').length,
            },
            items: items.slice(0, 500),
        });
    }
    catch (e) {
        console.error('getHubBirthdaysReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubBirthdaysReport = getHubBirthdaysReport;
/**
 * Produtividade Banho & Tosa: sessões fechadas por profissional/dia no período.
 */
const getHubGroomingProductivityReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const unitRaw = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
        const unitParsed = unitRaw ? uuidStr.safeParse(unitRaw) : null;
        if (unitRaw && !unitParsed?.success)
            return res.status(400).json({ error: 'unit_id inválido' });
        const unit_id = unitParsed?.success ? unitParsed.data : null;
        const period = parseReportPeriod(req.query);
        if (!period.ok)
            return res.status(400).json({ error: period.error });
        const { fromYmd, toYmd } = period;
        const fromIso = `${fromYmd}T00:00:00.000Z`;
        const toIso = `${toYmd}T23:59:59.999Z`;
        let q = supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('id, hub_staff_member_id, grooming_stage, started_at, closed_at, checked_in_at, unit_id, pet_id, guardian_id')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .not('closed_at', 'is', null)
            .gte('closed_at', fromIso)
            .lte('closed_at', toIso)
            .order('closed_at', { ascending: false })
            .limit(5000);
        if (unit_id)
            q = q.or(`unit_id.eq.${unit_id},unit_id.is.null`);
        const { data: sessions, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        const staffIds = [
            ...new Set((sessions ?? [])
                .map((s) => s.hub_staff_member_id)
                .filter((id) => Boolean(id))),
        ];
        const staffNames = new Map();
        if (staffIds.length > 0) {
            const { data: staffRows } = await supabase_1.supabaseAdmin
                .from('hub_staff_members')
                .select('id, full_name')
                .in('id', staffIds);
            for (const s of staffRows ?? []) {
                staffNames.set(s.id, String(s.full_name ?? ''));
            }
        }
        const byStaff = new Map();
        const byDayStaff = new Map();
        let closedTotal = 0;
        let durationSum = 0;
        let durationSamples = 0;
        for (const s of sessions ?? []) {
            closedTotal += 1;
            const sid = s.hub_staff_member_id ?? null;
            const key = sid ?? '__none__';
            const name = sid ? staffNames.get(sid) ?? '—' : 'Sem profissional';
            const agg = byStaff.get(key) ?? {
                staff_id: sid,
                staff_name: name,
                closed_count: 0,
                total_duration_min: 0,
                duration_samples: 0,
            };
            agg.closed_count += 1;
            const closedAt = s.closed_at ? Date.parse(s.closed_at) : NaN;
            const startedAt = s.started_at
                ? Date.parse(s.started_at)
                : s.checked_in_at
                    ? Date.parse(s.checked_in_at)
                    : NaN;
            if (!Number.isNaN(closedAt) && !Number.isNaN(startedAt) && closedAt >= startedAt) {
                const mins = Math.round((closedAt - startedAt) / 60_000);
                agg.total_duration_min += mins;
                agg.duration_samples += 1;
                durationSum += mins;
                durationSamples += 1;
            }
            byStaff.set(key, agg);
            const day = String(s.closed_at).slice(0, 10);
            const dayKey = `${day}|${key}`;
            const dayAgg = byDayStaff.get(dayKey) ?? {
                date: day,
                staff_id: sid,
                staff_name: name,
                closed_count: 0,
            };
            dayAgg.closed_count += 1;
            byDayStaff.set(dayKey, dayAgg);
        }
        const by_staff = [...byStaff.values()]
            .map((a) => ({
            staff_id: a.staff_id,
            staff_name: a.staff_name,
            closed_count: a.closed_count,
            avg_duration_min: a.duration_samples > 0 ? Math.round(a.total_duration_min / a.duration_samples) : null,
        }))
            .sort((a, b) => b.closed_count - a.closed_count);
        const by_day = [...byDayStaff.values()].sort((a, b) => {
            if (a.date !== b.date)
                return a.date.localeCompare(b.date);
            return b.closed_count - a.closed_count;
        });
        return res.json({
            period: { from: fromYmd, to: toYmd },
            unit_id,
            summary: {
                closed_sessions: closedTotal,
                staff_count: by_staff.filter((s) => s.staff_id).length,
                avg_duration_min: durationSamples > 0 ? Math.round(durationSum / durationSamples) : null,
            },
            by_staff,
            by_day: by_day.slice(0, 500),
        });
    }
    catch (e) {
        console.error('getHubGroomingProductivityReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubGroomingProductivityReport = getHubGroomingProductivityReport;
/**
 * Vacinas com próxima dose vencida ou a vencer nos próximos N dias.
 */
const getHubVaccinesDueReport = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinic_id = clinic.data;
        const daysParsed = zod_1.z.coerce.number().int().min(1).max(180).safeParse(req.query.days);
        const days = daysParsed.success ? daysParsed.data : 30;
        const asOf = ymdTodayUtc();
        const until = addDaysYmd(asOf, days);
        const { data: rows, error } = await supabase_1.supabaseAdmin
            .from('hub_vaccination_records')
            .select('id, pet_id, vaccine_name, administered_at, next_dose_at, batch_number, source, hub_pets(id, name, species)')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .not('next_dose_at', 'is', null)
            .lte('next_dose_at', until)
            .order('next_dose_at', { ascending: true })
            .limit(1000);
        if (error)
            return res.status(500).json({ error: error.message });
        const petIds = [...new Set((rows ?? []).map((r) => r.pet_id))];
        const petGuardian = new Map();
        if (petIds.length > 0) {
            const { data: links, error: lErr } = await supabase_1.supabaseAdmin
                .from('hub_pet_guardians')
                .select('pet_id, role, hub_guardians(id, full_name, phone)')
                .in('pet_id', petIds.slice(0, 2000));
            if (lErr)
                return res.status(500).json({ error: lErr.message });
            for (const link of links ?? []) {
                const petId = link.pet_id;
                if (petGuardian.has(petId) && link.role !== 'primary')
                    continue;
                const g = link.hub_guardians;
                const gObj = Array.isArray(g) ? g[0] : g;
                if (!gObj?.id)
                    continue;
                petGuardian.set(petId, {
                    guardian_id: gObj.id,
                    guardian_name: String(gObj.full_name ?? ''),
                    phone: gObj.phone ?? null,
                });
            }
        }
        const items = (rows ?? []).map((r) => {
            const petEmb = r.hub_pets;
            const pet = Array.isArray(petEmb) ? petEmb[0] : petEmb;
            const next = String(r.next_dose_at);
            const overdue = next < asOf;
            const link = petGuardian.get(r.pet_id);
            return {
                id: r.id,
                pet_id: r.pet_id,
                pet_name: pet?.name ?? '—',
                species: pet?.species ?? null,
                vaccine_name: String(r.vaccine_name ?? ''),
                administered_at: r.administered_at,
                next_dose_at: next,
                days_until: daysBetweenYmd(asOf, next),
                overdue,
                source: r.source ?? null,
                batch_number: r.batch_number ?? null,
                guardian_id: link?.guardian_id ?? null,
                guardian_name: link?.guardian_name ?? null,
                phone: link?.phone ?? null,
            };
        });
        return res.json({
            as_of: asOf,
            days,
            until,
            summary: {
                total: items.length,
                overdue: items.filter((i) => i.overdue).length,
                upcoming: items.filter((i) => !i.overdue).length,
            },
            items: items.slice(0, 500),
        });
    }
    catch (e) {
        console.error('getHubVaccinesDueReport', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubVaccinesDueReport = getHubVaccinesDueReport;
