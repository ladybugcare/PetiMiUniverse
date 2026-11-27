"use strict";
/**
 * Plano de medicação da internação: geração de doses (horários fixos / intervalo)
 * e reconciliação com doses existentes. Sem I/O — testável isoladamente.
 * Fuso: America/Sao_Paulo (mesma convenção do boarding/finanças no MVP).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VET_JOB_TITLE = exports.NOT_ADMIN_REASON_LABELS = exports.NOT_ADMIN_REASON_CODES = exports.HOSP_MED_TZ = void 0;
exports.normalizeHm = normalizeHm;
exports.normalizeTimes = normalizeTimes;
exports.civilYmdInSp = civilYmdInSp;
exports.localDateTimeToIsoSp = localDateTimeToIsoSp;
exports.addDaysYmd = addDaysYmd;
exports.todayYmdSp = todayYmdSp;
exports.hmInSp = hmInSp;
exports.materializationWindow = materializationWindow;
exports.buildDoseSpecsForVersion = buildDoseSpecsForVersion;
exports.diffMedDoses = diffMedDoses;
exports.formatDoseLabel = formatDoseLabel;
exports.isDoseOverdue = isDoseOverdue;
exports.HOSP_MED_TZ = 'America/Sao_Paulo';
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
function normalizeHm(raw) {
    const s = String(raw ?? '').trim();
    if (!HM_RE.test(s))
        return null;
    return s;
}
function normalizeTimes(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    const seen = new Set();
    for (const t of raw) {
        const hm = normalizeHm(t);
        if (!hm || seen.has(hm))
            continue;
        seen.add(hm);
        out.push(hm);
    }
    return out.sort();
}
/** YYYY-MM-DD do instante no fuso America/Sao_Paulo. */
function civilYmdInSp(isoOrDate) {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    return new Intl.DateTimeFormat('en-CA', { timeZone: exports.HOSP_MED_TZ }).format(d);
}
/** Instante ISO de HH:MM em uma data civil de São Paulo (UTC-3 fixo, igual boarding). */
function localDateTimeToIsoSp(ymd, hm) {
    return new Date(`${ymd}T${hm}:00-03:00`).toISOString();
}
function addDaysYmd(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}
function todayYmdSp(now = new Date()) {
    return civilYmdInSp(now);
}
function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}
/** HH:MM no fuso SP a partir de um Date. */
function hmInSp(d) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: exports.HOSP_MED_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hour}:${minute}`;
}
/**
 * Horizonte de materialização: hoje e amanhã (civil SP), cortado por ends_at.
 */
function materializationWindow(args) {
    const now = args.now ?? new Date();
    const fromYmd = todayYmdSp(now);
    let toYmd = addDaysYmd(fromYmd, 1);
    if (args.endsAt) {
        const endYmd = civilYmdInSp(args.endsAt);
        if (endYmd < toYmd)
            toYmd = endYmd;
    }
    const fromMs = new Date(`${fromYmd}T00:00:00-03:00`).getTime();
    const toMs = new Date(`${toYmd}T23:59:59.999-03:00`).getTime();
    return { fromYmd, toYmd, fromMs, toMs };
}
function buildDoseSpecsForVersion(version, opts) {
    const startsMs = new Date(version.starts_at).getTime();
    if (Number.isNaN(startsMs))
        return [];
    const endsMs = version.ends_at ? new Date(version.ends_at).getTime() : null;
    const win = materializationWindow({ now: opts?.now, endsAt: version.ends_at });
    const specs = [];
    const push = (scheduledFor, planKey) => {
        const t = new Date(scheduledFor).getTime();
        if (t < startsMs)
            return;
        if (endsMs != null && t > endsMs)
            return;
        if (t < win.fromMs || t > win.toMs)
            return;
        const task_date = civilYmdInSp(scheduledFor);
        if (task_date < win.fromYmd || task_date > win.toYmd)
            return;
        specs.push({
            order_id: version.order_id,
            order_version_id: version.id,
            task_date,
            scheduled_for: scheduledFor,
            plan_key: planKey,
        });
    };
    if (version.schedule_kind === 'fixed_times') {
        const times = normalizeTimes(version.times);
        for (let ymd = win.fromYmd; ymd <= win.toYmd; ymd = addDaysYmd(ymd, 1)) {
            for (const hm of times) {
                const iso = localDateTimeToIsoSp(ymd, hm);
                push(iso, `${version.order_id}:${hm}`);
            }
        }
    }
    else {
        const hours = Number(version.interval_hours);
        if (!Number.isFinite(hours) || hours <= 0)
            return [];
        const stepMs = hours * 3600_000;
        // Âncora: starts_at; gera até o fim da janela
        let t = startsMs;
        // Avança até entrar na janela
        if (t < win.fromMs) {
            const skips = Math.floor((win.fromMs - t) / stepMs);
            t += skips * stepMs;
            while (t < win.fromMs)
                t += stepMs;
        }
        let guard = 0;
        while (t <= win.toMs && guard < 500) {
            guard += 1;
            const iso = new Date(t).toISOString();
            const keyHm = hmInSp(new Date(t));
            // plan_key estável por instante absoluto para intervalo
            push(iso, `${version.order_id}:interval:${iso}`);
            void keyHm;
            void pad2;
            t += stepMs;
        }
    }
    return specs.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
}
/**
 * Diff plano desejado × doses existentes.
 * Executadas (administered / not_administered) nunca mudam.
 * Pendentes fora do plano → cancel (superseded_schedule).
 * Pendentes com mesmo plan_key → atualiza order_version_id se mudou.
 */
function diffMedDoses(args) {
    const existingByKey = new Map();
    for (const d of args.existing) {
        existingByKey.set(`${d.plan_key}|${d.task_date}`, d);
    }
    const desiredKeys = new Set(args.desired.map((s) => `${s.plan_key}|${s.task_date}`));
    const toInsert = [];
    const toCancel = [];
    const toTouchVersion = [];
    const toReactivate = [];
    if (args.suspendAllPending) {
        for (const d of args.existing) {
            if (d.status === 'pending') {
                toCancel.push({ id: d.id, reason: 'order_suspended' });
            }
        }
        return { toInsert: [], toCancel, toTouchVersion: [], toReactivate: [] };
    }
    for (const spec of args.desired) {
        const key = `${spec.plan_key}|${spec.task_date}`;
        const ex = existingByKey.get(key);
        if (!ex) {
            toInsert.push(spec);
            continue;
        }
        if (ex.status === 'administered' || ex.status === 'not_administered') {
            continue;
        }
        if (ex.status === 'cancelled') {
            toReactivate.push({
                id: ex.id,
                order_version_id: spec.order_version_id,
                scheduled_for: spec.scheduled_for,
            });
            continue;
        }
        // pending
        if (ex.order_version_id !== spec.order_version_id) {
            toTouchVersion.push({ id: ex.id, order_version_id: spec.order_version_id });
        }
    }
    for (const d of args.existing) {
        if (d.status !== 'pending')
            continue;
        const key = `${d.plan_key}|${d.task_date}`;
        if (!desiredKeys.has(key)) {
            toCancel.push({ id: d.id, reason: 'superseded_schedule' });
        }
    }
    return { toInsert, toCancel, toTouchVersion, toReactivate };
}
function formatDoseLabel(doseValue, doseUnit) {
    const n = typeof doseValue === 'number' ? doseValue : Number(doseValue);
    const num = Number.isFinite(n) ? String(n).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '') : String(doseValue);
    return `${num} ${doseUnit}`.trim();
}
exports.NOT_ADMIN_REASON_CODES = [
    'recusou',
    'vomito',
    'via_indisponivel',
    'medicamento_indisponivel',
    'prescritor_suspendeu',
    'outro',
];
exports.NOT_ADMIN_REASON_LABELS = {
    recusou: 'Recusou',
    vomito: 'Vômito',
    via_indisponivel: 'Via indisponível',
    medicamento_indisponivel: 'Medicamento indisponível',
    prescritor_suspendeu: 'Prescritor suspendeu',
    outro: 'Outro',
};
function isDoseOverdue(status, scheduledFor, now = new Date()) {
    return status === 'pending' && new Date(scheduledFor).getTime() < now.getTime();
}
exports.VET_JOB_TITLE = 'Médico(a) Veterinário(a)';
