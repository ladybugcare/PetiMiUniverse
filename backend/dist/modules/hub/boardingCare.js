"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASK_OVERDUE_GRACE_MIN = exports.BATCH_TASK_KINDS = exports.OUTCOME_LABELS = exports.OUTCOMES_BY_KIND = exports.BLOCK_LABELS = exports.ESSENTIAL_BLOCKS = exports.PROFILE_BLOCK_KEYS = exports.CARE_BLOCK_KEYS = exports.CARE_MEAL_SLOT_ANCHOR_HM = exports.CARE_MEAL_SLOT_LABELS = exports.CARE_MEAL_SLOTS = void 0;
exports.mealSlotFromLegacyTime = mealSlotFromLegacyTime;
exports.normalizeTime = normalizeTime;
exports.resolveMealSlotTimes = resolveMealSlotTimes;
exports.normalizeFeeding = normalizeFeeding;
exports.normalizeMedications = normalizeMedications;
exports.normalizeWalks = normalizeWalks;
exports.normalizeHandling = normalizeHandling;
exports.normalizeRecreation = normalizeRecreation;
exports.normalizeBlock = normalizeBlock;
exports.normalizeProfileBlocks = normalizeProfileBlocks;
exports.normalizePlanBlocks = normalizePlanBlocks;
exports.isBlockEmpty = isBlockEmpty;
exports.blocksEqual = blocksEqual;
exports.buildPlanFromProfile = buildPlanFromProfile;
exports.applyPlanEdit = applyPlanEdit;
exports.computePlanPendencies = computePlanPendencies;
exports.taskDetailsDisplayText = taskDetailsDisplayText;
exports.localDateTimeToIso = localDateTimeToIso;
exports.generatePlanTasks = generatePlanTasks;
exports.diffPlanTasks = diffPlanTasks;
exports.isValidOutcome = isValidOutcome;
exports.isConcerningOutcome = isConcerningOutcome;
exports.isTaskOverdue = isTaskOverdue;
exports.canJoinGroupRecreation = canJoinGroupRecreation;
exports.computeAttention = computeAttention;
exports.buildTutorReportText = buildTutorReportText;
exports.buildHandoffSnapshot = buildHandoffSnapshot;
exports.buildBoardingTimeline = buildBoardingTimeline;
/**
 * Regras puras de Hotel & Creche: ficha de cuidados → plano da estadia → tarefas,
 * pendências, atenção, relatório ao tutor e linha do tempo.
 * Sem acesso a banco: tudo aqui é testável isoladamente.
 */
const boardingBilling_1 = require("./boardingBilling");
exports.CARE_MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];
exports.CARE_MEAL_SLOT_LABELS = {
    breakfast: 'Café da manhã',
    lunch: 'Almoço',
    snack: 'Lanche',
    dinner: 'Janta',
};
/**
 * Horário padrão de cada período (America/Sao_Paulo).
 * A unidade substitui isso em hub_unit_boarding_settings.meal_slot_times.
 */
exports.CARE_MEAL_SLOT_ANCHOR_HM = {
    breakfast: '08:00',
    lunch: '12:00',
    snack: '16:00',
    dinner: '19:00',
};
const SLOT_ORDER = {
    breakfast: 0,
    lunch: 1,
    snack: 2,
    dinner: 3,
};
function isCareMealSlot(v) {
    return v === 'breakfast' || v === 'lunch' || v === 'snack' || v === 'dinner';
}
/** Mapeia HH:mm legado para o período mais próximo. */
function mealSlotFromLegacyTime(hm) {
    const [hStr, mStr] = hm.split(':');
    const minutes = Number(hStr) * 60 + Number(mStr);
    const anchors = [
        { slot: 'breakfast', at: 8 * 60 },
        { slot: 'lunch', at: 12 * 60 },
        { slot: 'snack', at: 16 * 60 },
        { slot: 'dinner', at: 19 * 60 },
    ];
    let best = anchors[0];
    let bestDist = Math.abs(minutes - best.at);
    for (const a of anchors.slice(1)) {
        const d = Math.abs(minutes - a.at);
        if (d < bestDist) {
            best = a;
            bestDist = d;
        }
    }
    return best.slot;
}
exports.CARE_BLOCK_KEYS = ['feeding', 'medications', 'walks', 'handling', 'recreation'];
/** Ficha permanente / tutor: sem passeios — atividades vêm da recreação da unidade. */
exports.PROFILE_BLOCK_KEYS = ['feeding', 'medications', 'handling'];
/** Blocos que precisam estar confirmados para a estadia ficar "pronta". */
exports.ESSENTIAL_BLOCKS = ['feeding', 'medications', 'handling'];
exports.BLOCK_LABELS = {
    feeding: 'Alimentação',
    medications: 'Medicação',
    walks: 'Passeios',
    handling: 'Manejo',
    recreation: 'Atividades',
};
// ─── Normalização ─────────────────────────────────────────────────────────
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function normalizeTime(v) {
    if (typeof v !== 'string')
        return null;
    const t = v.trim().slice(0, 5);
    return HM_RE.test(t) ? t : null;
}
/** Completa com o padrão o que a unidade não configurou. */
function resolveMealSlotTimes(raw) {
    const out = { ...exports.CARE_MEAL_SLOT_ANCHOR_HM };
    if (!raw || typeof raw !== 'object')
        return out;
    const o = raw;
    for (const slot of exports.CARE_MEAL_SLOTS) {
        const t = normalizeTime(o[slot]);
        if (t)
            out[slot] = t;
    }
    return out;
}
function normalizeTimes(v) {
    if (!Array.isArray(v))
        return [];
    const out = v.map(normalizeTime).filter((t) => Boolean(t));
    return [...new Set(out)].sort();
}
function str(v) {
    if (typeof v !== 'string')
        return null;
    const t = v.trim();
    return t ? t : null;
}
function normalizeFeeding(v) {
    if (!v || typeof v !== 'object')
        return null;
    const o = v;
    const bySlot = new Map();
    if (Array.isArray(o.meals)) {
        for (const raw of o.meals) {
            const mm = (raw ?? {});
            let slot = isCareMealSlot(mm.slot) ? mm.slot : null;
            if (!slot) {
                const legacyTime = normalizeTime(mm.time);
                if (legacyTime)
                    slot = mealSlotFromLegacyTime(legacyTime);
            }
            if (!slot)
                continue;
            const next = { slot, amount: str(mm.amount), notes: str(mm.notes) };
            const prev = bySlot.get(slot);
            // Mantém a quantidade/notas do primeiro; se o novo tiver e o antigo não, preenche.
            if (!prev)
                bySlot.set(slot, next);
            else
                bySlot.set(slot, {
                    slot,
                    amount: prev.amount ?? next.amount,
                    notes: prev.notes ?? next.notes,
                });
        }
    }
    const meals = [...bySlot.values()].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
    const src = o.food_source === 'own' || o.food_source === 'house' ? o.food_source : null;
    const feedsOnSite = typeof o.feeds_on_site === 'boolean' ? o.feeds_on_site : null;
    return {
        food_source: src,
        food_name: str(o.food_name),
        meals: feedsOnSite === false ? [] : meals,
        restrictions: str(o.restrictions),
        feeds_on_site: feedsOnSite,
    };
}
function normalizeMedications(v) {
    if (v == null)
        return null;
    if (!Array.isArray(v))
        return null;
    return v
        .map((m) => {
        const mm = (m ?? {});
        const name = str(mm.name);
        if (!name)
            return null;
        return {
            name,
            dose: str(mm.dose),
            times: normalizeTimes(mm.times),
            instructions: str(mm.instructions),
        };
    })
        .filter((m) => m != null);
}
function normalizeWalks(v) {
    if (!v || typeof v !== 'object')
        return null;
    const o = v;
    return { times: normalizeTimes(o.times), notes: str(o.notes) };
}
function normalizeHandling(v) {
    if (!v || typeof v !== 'object')
        return null;
    const o = v;
    const soc = o.sociability === 'sociable' || o.sociability === 'selective' || o.sociability === 'isolated'
        ? o.sociability
        : null;
    return {
        sociability: soc,
        group_play_allowed: typeof o.group_play_allowed === 'boolean' ? o.group_play_allowed : null,
        contact_restrictions: str(o.contact_restrictions),
        special_care: str(o.special_care),
    };
}
function normalizeRecreation(v) {
    if (!v || typeof v !== 'object')
        return null;
    const o = v;
    return {
        allowed: typeof o.allowed === 'boolean' ? o.allowed : null,
        times: normalizeTimes(o.times),
    };
}
function normalizeBlock(key, v) {
    switch (key) {
        case 'feeding':
            return normalizeFeeding(v);
        case 'medications':
            return normalizeMedications(v);
        case 'walks':
            return normalizeWalks(v);
        case 'handling':
            return normalizeHandling(v);
        case 'recreation':
            return normalizeRecreation(v);
    }
}
function normalizeProfileBlocks(raw) {
    return {
        feeding: normalizeFeeding(raw?.feeding),
        medications: normalizeMedications(raw?.medications),
        walks: normalizeWalks(raw?.walks),
        handling: normalizeHandling(raw?.handling),
    };
}
function normalizePlanBlocks(raw) {
    return { ...normalizeProfileBlocks(raw), recreation: normalizeRecreation(raw?.recreation) };
}
/** Bloco sem informação útil (equivale a "não informado"). */
function isBlockEmpty(key, v) {
    if (v == null)
        return true;
    switch (key) {
        case 'feeding': {
            const f = v;
            if (f.feeds_on_site === false)
                return false;
            return !(f.meals?.length || f.food_name || f.restrictions || f.food_source);
        }
        case 'medications':
            return !Array.isArray(v);
        case 'walks': {
            const w = v;
            return !(w.times?.length || w.notes);
        }
        case 'handling': {
            const h = v;
            return !(h.sociability || h.group_play_allowed != null || h.contact_restrictions || h.special_care);
        }
        case 'recreation':
            return v.allowed == null;
    }
}
function stableStringify(v) {
    if (Array.isArray(v))
        return `[${v.map(stableStringify).join(',')}]`;
    if (v && typeof v === 'object') {
        const o = v;
        return `{${Object.keys(o)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
            .join(',')}}`;
    }
    return JSON.stringify(v ?? null);
}
function blocksEqual(key, a, b) {
    return stableStringify(normalizeBlock(key, a)) === stableStringify(normalizeBlock(key, b));
}
// ─── Herança: ficha → plano ───────────────────────────────────────────────
function recreationFromHandling(h) {
    if (!h || h.group_play_allowed == null)
        return null;
    return { allowed: h.group_play_allowed, times: [] };
}
/** Plano inicial a partir da ficha: o que existe vem "herdado", o resto fica "pendente". */
function buildPlanFromProfile(profile) {
    const p = profile ?? { feeding: null, medications: null, walks: null, handling: null };
    const blocks = {
        feeding: p.feeding,
        medications: p.medications,
        walks: p.walks,
        handling: p.handling,
        recreation: recreationFromHandling(p.handling),
    };
    const block_status = {};
    for (const key of exports.CARE_BLOCK_KEYS) {
        block_status[key] = isBlockEmpty(key, blocks[key]) ? 'pending' : 'inherited';
    }
    return { blocks, block_status };
}
/**
 * Aplica a edição da recepção no plano.
 * - Bloco vazio → pendente.
 * - Diferente da ficha → alterado (só nesta estadia; conta como confirmado).
 * - Igual à ficha → confirmado se a recepção confirmou, senão mantém o estado anterior.
 */
function applyPlanEdit(args) {
    const blocks = { ...args.current };
    const status = { ...args.currentStatus };
    const confirm = new Set(args.confirmBlocks);
    const profileRec = recreationFromHandling(args.profile?.handling ?? null);
    for (const key of exports.CARE_BLOCK_KEYS) {
        const touched = Object.prototype.hasOwnProperty.call(args.patch, key);
        if (touched) {
            blocks[key] = normalizeBlock(key, args.patch[key]);
        }
        const value = blocks[key];
        if (isBlockEmpty(key, value)) {
            status[key] = 'pending';
            continue;
        }
        const base = key === 'recreation' ? profileRec : args.profile?.[key] ?? null;
        const baseEmpty = isBlockEmpty(key, base);
        const sameAsProfile = !baseEmpty &&
            (key === 'recreation'
                ? value.allowed === base.allowed
                : blocksEqual(key, value, base));
        if (!sameAsProfile) {
            // Ficha vazia: o que a recepção informou já vale como confirmado.
            if (baseEmpty)
                status[key] = touched || confirm.has(key) || !status[key] ? 'confirmed' : status[key];
            else if (touched || status[key] === 'overridden' || !status[key])
                status[key] = 'overridden';
        }
        else if (confirm.has(key) || status[key] === 'confirmed') {
            status[key] = 'confirmed';
        }
        else {
            status[key] = 'inherited';
        }
    }
    return { blocks, block_status: status };
}
/** Pendências dos blocos essenciais (sem plano = tudo pendente). */
function computePlanPendencies(plan, mode = 'hotel') {
    const st = plan?.block_status ?? {};
    const essentials = mode === 'daycare' ? ['feeding', 'medications', 'handling'] : exports.ESSENTIAL_BLOCKS;
    const out = [];
    for (const key of essentials) {
        const s = plan ? st[key] ?? 'pending' : 'pending';
        if (s === 'pending')
            out.push({ block: key, kind: 'missing', label: PENDENCY_LABELS[key].missing });
        else if (s === 'inherited')
            out.push({ block: key, kind: 'unconfirmed', label: PENDENCY_LABELS[key].unconfirmed });
    }
    return out;
}
const PENDENCY_LABELS = {
    feeding: { missing: 'Alimentação não informada', unconfirmed: 'Alimentação não confirmada' },
    medications: { missing: 'Medicação não informada', unconfirmed: 'Medicação não confirmada' },
    walks: { missing: 'Passeios não informados', unconfirmed: 'Passeios não confirmados' },
    handling: { missing: 'Manejo não informado', unconfirmed: 'Manejo não confirmado' },
    recreation: { missing: 'Recreação não definida', unconfirmed: 'Recreação não confirmada' },
};
/**
 * Converte jsonb de detalhes da tarefa em texto para a API/UI.
 * Objeto vazio `{}` é truthy no JS e quebra React se renderizado cru.
 */
function taskDetailsDisplayText(details) {
    if (details == null)
        return null;
    if (typeof details === 'string') {
        const t = details.trim();
        return t || null;
    }
    if (typeof details !== 'object' || Array.isArray(details))
        return null;
    const d = details;
    const parts = [];
    const push = (v) => {
        if (typeof v === 'string' && v.trim())
            parts.push(v.trim());
        else if (typeof v === 'number' && Number.isFinite(v))
            parts.push(String(v));
    };
    push(d.food_name);
    push(d.amount);
    push(d.dose);
    push(d.instructions);
    push(d.notes);
    push(d.restrictions);
    if (parts.length === 0) {
        for (const [k, v] of Object.entries(d)) {
            if (k === 'slot' || k === 'food_source' || k === 'name')
                continue;
            push(v);
        }
    }
    return parts.length ? parts.join(' · ') : null;
}
function addDaysYmd(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}
/** Instante ISO de HH:MM em uma data local de São Paulo (UTC-3). */
function localDateTimeToIso(ymd, hm) {
    return new Date(`${ymd}T${hm}:00-03:00`).toISOString();
}
const MAX_TASK_DAYS = 60;
/**
 * Tarefas desejadas para a estadia: cada item do plano em cada dia, dentro da janela [start, end].
 * Recreação só entra se o plano permitir; sem horários próprios usa os horários da unidade.
 */
function generatePlanTasks(args) {
    const startParts = (0, boardingBilling_1.boardingLocalParts)(args.start);
    if (!startParts)
        return [];
    const startMs = new Date(args.start).getTime();
    const endIso = args.end ?? new Date(startMs + 24 * 3600_000).toISOString();
    const endMs = new Date(endIso).getTime();
    const endParts = (0, boardingBilling_1.boardingLocalParts)(endIso);
    if (!endParts || endMs < startMs)
        return [];
    const mealTimes = resolveMealSlotTimes(args.mealSlotTimes);
    const specs = [];
    const push = (ymd, hm, s) => {
        const iso = localDateTimeToIso(ymd, hm);
        const t = new Date(iso).getTime();
        if (t < startMs || t > endMs)
            return;
        specs.push({ ...s, scheduled_for: iso, task_date: ymd });
    };
    const { feeding, medications, recreation } = args.plan;
    let ymd = startParts.ymd;
    for (let i = 0; i <= MAX_TASK_DAYS && ymd <= endParts.ymd; i++, ymd = addDaysYmd(ymd, 1)) {
        if (feeding?.feeds_on_site !== false) {
            (feeding?.meals ?? []).forEach((meal) => {
                const anchor = mealTimes[meal.slot];
                push(ymd, anchor, {
                    kind: 'feeding',
                    title: exports.CARE_MEAL_SLOT_LABELS[meal.slot],
                    plan_key: `feeding:${meal.slot}`,
                    details: {
                        slot: meal.slot,
                        amount: meal.amount ?? null,
                        notes: meal.notes ?? null,
                        food_name: feeding?.food_name ?? null,
                        food_source: feeding?.food_source ?? null,
                        restrictions: feeding?.restrictions ?? null,
                    },
                });
            });
        }
        (medications ?? []).forEach((med, idx) => {
            for (const time of med.times ?? []) {
                push(ymd, time, {
                    kind: 'medication',
                    title: med.dose ? `${med.name} — ${med.dose}` : med.name,
                    plan_key: `medication:${idx}:${time}`,
                    details: { name: med.name, dose: med.dose ?? null, instructions: med.instructions ?? null },
                });
            }
        });
        // Atividades = recreação/janelas da unidade (sem passeios gerados do plano do tutor).
        if (recreation?.allowed) {
            const own = recreation.times ?? [];
            const times = own.length
                ? own.map((t) => ({ start: t, label: null }))
                : (args.recreationWindows ?? [])
                    .map((w) => ({ start: normalizeTime(w.start), label: w.label ?? null }))
                    .filter((w) => Boolean(w.start));
            for (const w of times) {
                push(ymd, w.start, {
                    kind: 'recreation',
                    title: w.label ? `Atividade — ${w.label}` : `Atividade das ${w.start}`,
                    plan_key: `recreation:${w.start}`,
                    details: {},
                });
            }
        }
    }
    return specs.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
}
/**
 * Reconciliação plano × tarefas existentes. Executadas nunca mudam.
 * Pendentes geradas pelo plano são atualizadas ou removidas quando o plano mudar.
 */
function diffPlanTasks(existing, desired) {
    const key = (k, d) => `${k}|${d}`;
    const byKey = new Map();
    for (const t of existing) {
        if (t.source === 'plan' && t.plan_key)
            byKey.set(key(t.plan_key, t.task_date), t);
    }
    const desiredKeys = new Set();
    const toInsert = [];
    const toUpdate = [];
    for (const spec of desired) {
        const k = key(spec.plan_key, spec.task_date);
        desiredKeys.add(k);
        const row = byKey.get(k);
        if (!row) {
            toInsert.push(spec);
            continue;
        }
        if (row.status !== 'pending')
            continue;
        const changed = row.title !== spec.title ||
            (row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null) !== spec.scheduled_for ||
            stableStringify(row.details ?? {}) !== stableStringify(spec.details);
        if (changed)
            toUpdate.push({ id: row.id, spec });
    }
    const toDelete = existing
        .filter((t) => t.source === 'plan' && t.status === 'pending' && t.plan_key)
        .filter((t) => !desiredKeys.has(key(t.plan_key, t.task_date)))
        .map((t) => t.id);
    return { toInsert, toUpdate, toDelete };
}
// ─── Execução ─────────────────────────────────────────────────────────────
exports.OUTCOMES_BY_KIND = {
    feeding: ['ate_all', 'ate_partial', 'refused'],
    medication: ['given', 'not_given'],
    walk: ['done', 'not_done'],
    recreation: ['done', 'not_done'],
    custom: ['done', 'not_done'],
};
exports.OUTCOME_LABELS = {
    ate_all: 'Comeu tudo',
    ate_partial: 'Comeu parte',
    refused: 'Recusou',
    given: 'Medicação dada',
    not_given: 'Medicação não dada',
    done: 'Feito',
    not_done: 'Não feito',
};
function isValidOutcome(kind, outcome) {
    return (exports.OUTCOMES_BY_KIND[kind] ?? []).includes(outcome);
}
/** Atividades coletivas aceitas no registro em lote. Alimentação e medicação são sempre individuais. */
exports.BATCH_TASK_KINDS = ['recreation', 'walk', 'custom'];
/** Resultado que merece atenção da equipe. */
function isConcerningOutcome(kind, outcome) {
    if (!outcome)
        return false;
    if (kind === 'feeding')
        return outcome === 'refused' || outcome === 'ate_partial';
    if (kind === 'medication')
        return outcome === 'not_given';
    return false;
}
/** Tolerância antes de uma tarefa pendente contar como atrasada. */
exports.TASK_OVERDUE_GRACE_MIN = 30;
function isTaskOverdue(t, nowMs = Date.now()) {
    if (t.status !== 'pending' || !t.scheduled_for)
        return false;
    return new Date(t.scheduled_for).getTime() + exports.TASK_OVERDUE_GRACE_MIN * 60_000 < nowMs;
}
/** Recreação coletiva exige manejo liberado. */
function canJoinGroupRecreation(handling) {
    if (!handling)
        return true;
    if (handling.group_play_allowed === false)
        return false;
    if (handling.sociability === 'isolated')
        return false;
    return true;
}
function computeAttention(args) {
    const now = args.nowMs ?? Date.now();
    const out = [];
    const active = args.stage === 'checked_in';
    const upcoming = args.stage === 'reserved';
    if (args.openIncidents.length) {
        const high = args.openIncidents.some((i) => i.severity === 'high');
        const n = args.openIncidents.length;
        out.push({
            key: 'incident',
            label: n === 1 ? 'Intercorrência aberta' : `${n} intercorrências abertas`,
            severity: high ? 'high' : 'medium',
        });
    }
    if (active) {
        const overdueMed = args.tasks.filter((t) => t.kind === 'medication' && isTaskOverdue(t, now)).length;
        const overdueOther = args.tasks.filter((t) => t.kind !== 'medication' && isTaskOverdue(t, now)).length;
        if (overdueMed)
            out.push({ key: 'medication_overdue', label: 'Medicação atrasada', severity: 'high' });
        if (overdueOther)
            out.push({
                key: 'task_overdue',
                label: overdueOther === 1 ? '1 tarefa atrasada' : `${overdueOther} tarefas atrasadas`,
                severity: 'medium',
            });
        if (args.tasks.some((t) => t.kind === 'medication' && t.outcome === 'not_given'))
            out.push({ key: 'medication_not_given', label: 'Medicação não dada', severity: 'high' });
        if (args.tasks.some((t) => t.kind === 'feeding' && t.outcome === 'refused'))
            out.push({ key: 'feeding_refused', label: 'Recusou refeição', severity: 'medium' });
        else if (args.tasks.some((t) => t.kind === 'feeding' && t.outcome === 'ate_partial'))
            out.push({ key: 'feeding_partial', label: 'Comeu parte', severity: 'low' });
        if (args.isLate)
            out.push({ key: 'late_checkout', label: 'Saída prevista passou', severity: 'medium' });
    }
    if (active || upcoming) {
        if (args.pendencies.length) {
            out.push({
                key: 'plan_pending',
                label: args.pendencies.length === 1
                    ? args.pendencies[0].label
                    : `${args.pendencies.length} cuidados sem confirmação`,
                severity: active ? 'medium' : 'low',
            });
        }
        if (args.tutorSubmissionPending)
            out.push({ key: 'tutor_submission', label: 'Tutor enviou cuidados para revisar', severity: 'low' });
    }
    if (args.missingBelongings)
        out.push({ key: 'belongings_missing', label: 'Pertence não encontrado na saída', severity: 'medium' });
    const rank = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
function hmFromIso(iso) {
    if (!iso)
        return '';
    const p = (0, boardingBilling_1.boardingLocalParts)(iso);
    if (!p)
        return '';
    const h = Math.floor(p.minutes / 60);
    const m = p.minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function brDate(ymd) {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}
function feedingLine(tasks) {
    const feeds = tasks.filter((t) => t.kind === 'feeding' && t.status === 'done');
    if (!feeds.length)
        return null;
    const all = feeds.filter((t) => t.outcome === 'ate_all').length;
    const partial = feeds.filter((t) => t.outcome === 'ate_partial').length;
    const refused = feeds.filter((t) => t.outcome === 'refused').length;
    if (all === feeds.length) {
        return feeds.length === 1 ? 'Alimentação: comeu tudo.' : `Alimentação: comeu tudo nas ${feeds.length} refeições.`;
    }
    const parts = [
        all ? `comeu tudo em ${all}` : null,
        partial ? `comeu parte em ${partial}` : null,
        refused ? `recusou ${refused}` : null,
    ].filter(Boolean);
    return `Alimentação: ${parts.join(', ')}.`;
}
/**
 * Texto do relatório ao tutor, derivado da operação (não é um formulário à parte).
 * Usa só o que foi registrado; tarefas pendentes não aparecem.
 */
function buildTutorReportText(args) {
    const tasks = args.reportDate ? args.tasks.filter((t) => t.task_date === args.reportDate) : args.tasks;
    const incidents = args.reportDate
        ? args.incidents.filter((i) => (0, boardingBilling_1.boardingLocalParts)(i.occurred_at)?.ymd === args.reportDate)
        : args.incidents;
    const lines = [];
    const hello = args.guardianFirstName ? `Olá, ${args.guardianFirstName}!` : 'Olá!';
    if (args.kind === 'pickup') {
        lines.push(`${hello} ${args.petName} está pronto(a) para voltar para casa.`);
    }
    else if (args.kind === 'stay_summary') {
        lines.push(`${hello} Segue o resumo da estadia do(a) ${args.petName}.`);
    }
    else {
        const when = args.reportDate ? ` de ${brDate(args.reportDate)}` : '';
        lines.push(`${hello} Como foi o dia${when} do(a) ${args.petName}:`);
    }
    const feed = feedingLine(tasks);
    if (feed)
        lines.push(feed);
    const meds = tasks.filter((t) => t.kind === 'medication' && t.status === 'done');
    if (meds.length) {
        const given = meds.filter((t) => t.outcome === 'given');
        const missed = meds.filter((t) => t.outcome === 'not_given');
        if (given.length) {
            const times = given.map((t) => hmFromIso(t.scheduled_for)).filter(Boolean);
            lines.push(`Medicação: dada${times.length ? ` às ${times.join(', ')}` : ''}.`);
        }
        if (missed.length) {
            const notes = missed.map((t) => t.last_notes).filter(Boolean);
            lines.push(`Medicação não dada${notes.length ? `: ${notes.join('; ')}` : ''}.`);
        }
    }
    const activities = tasks.filter((t) => (t.kind === 'recreation' || t.kind === 'walk') && t.outcome === 'done').length;
    if (activities) {
        lines.push(activities === 1 ? 'Atividades: participou de 1.' : `Atividades: participou de ${activities}.`);
    }
    for (const inc of incidents) {
        const text = inc.description.replace(/[.\s]+$/, '');
        const action = inc.action_taken ? ` — ${inc.action_taken.replace(/[.\s]+$/, '')}` : '';
        const status = inc.status === 'resolved' ? ' (resolvido)' : '';
        lines.push(`Observação: ${text}${action}${status}.`);
    }
    const photos = (args.photoUrls ?? []).slice(0, 6);
    if (photos.length)
        lines.push(`Fotos:\n${photos.join('\n')}`);
    if (args.extraNote?.trim())
        lines.push(args.extraNote.trim());
    if (lines.length === 1 && args.kind !== 'pickup')
        lines.push('Tudo tranquilo por aqui.');
    if (args.clinicName)
        lines.push(`— ${args.clinicName}`);
    return lines.join('\n');
}
function buildHandoffSnapshot(args) {
    const now = new Date(args.nowIso).getTime();
    const horizon = now + (args.horizonHours ?? 8) * 3600_000;
    return {
        generated_at: args.nowIso,
        present_count: args.stays.filter((s) => s.stage === 'checked_in').length,
        attention: args.stays
            .filter((s) => s.attention.length)
            .map((s) => ({ pet_name: s.pet_name, reasons: s.attention.map((a) => a.label) })),
        pending_tasks: args.tasks
            .filter((t) => t.status === 'pending')
            .filter((t) => !t.scheduled_for || new Date(t.scheduled_for).getTime() <= horizon)
            .map((t) => ({
            pet_name: t.pet_name,
            title: t.title,
            scheduled_for: t.scheduled_for,
            overdue: isTaskOverdue(t, now),
        }))
            .sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? '')),
        open_incidents: args.incidents
            .filter((i) => i.status === 'open')
            .map((i) => ({ pet_name: i.pet_name, description: i.description, severity: i.severity })),
    };
}
function buildBoardingTimeline(src) {
    const out = [];
    const r = src.reservation;
    const label = r.mode === 'daycare' ? 'creche' : 'hospedagem';
    if (r.created_at)
        out.push({ id: `res-created-${r.id}`, at: r.created_at, type: 'reservation', title: `Reserva de ${label} criada` });
    if (r.checked_in_at)
        out.push({ id: `res-in-${r.id}`, at: r.checked_in_at, type: 'reservation', title: 'Entrada (check-in)' });
    if (r.checked_out_at)
        out.push({ id: `res-out-${r.id}`, at: r.checked_out_at, type: 'reservation', title: 'Saída (check-out)' });
    for (const e of src.executions) {
        out.push({
            id: `exec-${e.id}`,
            at: e.executed_at,
            type: 'task',
            title: e.undone ? `${e.task_title}: registro desfeito` : `${e.task_title}: ${exports.OUTCOME_LABELS[e.outcome ?? ''] ?? 'registrado'}`,
            detail: e.notes ?? null,
            actor_user_id: e.executed_by_user_id ?? null,
        });
    }
    for (const i of src.incidents) {
        out.push({
            id: `inc-${i.id}`,
            at: i.occurred_at,
            type: 'incident',
            title: 'Intercorrência',
            detail: i.description,
            severity: i.severity,
            actor_user_id: i.created_by_user_id ?? null,
        });
        if (i.resolved_at) {
            out.push({
                id: `inc-res-${i.id}`,
                at: i.resolved_at,
                type: 'incident_resolved',
                title: 'Intercorrência resolvida',
                detail: i.resolution_notes ?? null,
            });
        }
    }
    for (const m of src.media) {
        out.push({
            id: `media-${m.id}`,
            at: m.created_at,
            type: 'photo',
            title: 'Foto',
            detail: m.caption ?? null,
            photo_url: m.url,
            actor_user_id: m.created_by_user_id ?? null,
        });
    }
    const reportTitle = {
        daily: 'Relatório do dia enviado ao tutor',
        stay_summary: 'Resumo da estadia enviado ao tutor',
        pickup: 'Tutor avisado para buscar',
    };
    for (const t of src.tutorReports) {
        out.push({
            id: `rep-${t.id}`,
            at: t.sent_at,
            type: 'tutor_report',
            title: reportTitle[t.kind] ?? 'Mensagem ao tutor',
            actor_user_id: t.sent_by_user_id ?? null,
        });
    }
    for (const b of src.belongings ?? []) {
        out.push({
            id: `bel-${b.id}`,
            at: b.created_at,
            type: 'belonging',
            title: 'Pertence recebido',
            detail: b.quantity > 1 ? `${b.quantity}× ${b.description}` : b.description,
        });
    }
    for (const l of src.legacyLogs ?? []) {
        out.push({
            id: `log-${l.id}`,
            at: l.created_at ?? `${l.log_date}T12:00:00-03:00`,
            type: 'legacy_log',
            title: `Relatório diário (${brDate(l.log_date)})`,
            detail: l.notes ?? null,
        });
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
