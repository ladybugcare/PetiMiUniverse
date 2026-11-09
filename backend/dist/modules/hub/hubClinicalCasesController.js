"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REOPEN_REASON_MIN = exports.CaseReopenRequiredError = exports.CaseSelectionRequiredError = exports.deleteHubClinicalCase = exports.patchHubClinicalCase = exports.createHubClinicalCase = exports.getHubClinicalCase = exports.listHubClinicalCases = void 0;
exports.isGenericClinicalCaseTitle = isGenericClinicalCaseTitle;
exports.resolveAutoCaseTitle = resolveAutoCaseTitle;
exports.maybePromoteGenericCaseTitle = maybePromoteGenericCaseTitle;
exports.assertReopenReason = assertReopenReason;
exports.reopenClosedClinicalCase = reopenClosedClinicalCase;
exports.resolveOrCreateClinicalCase = resolveOrCreateClinicalCase;
exports.ensureCaseAndAdmissionEncounter = ensureCaseAndAdmissionEncounter;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const uuidStr = zod_1.z.string().uuid();
const caseStatusSchema = zod_1.z.enum(['active', 'monitoring', 'resolved', 'cancelled']);
const createCaseSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    pet_id: uuidStr,
    guardian_id_snapshot: uuidStr.optional().nullable(),
    primary_veterinarian_id: uuidStr.optional().nullable(),
    title: zod_1.z.string().trim().min(1).max(500),
    summary: zod_1.z.string().trim().max(4000).optional().nullable(),
    status: caseStatusSchema.optional().default('active'),
    tags: zod_1.z.array(zod_1.z.string().trim().max(100)).optional().default([]),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().default({}),
    opened_at: zod_1.z.string().datetime({ offset: true }).optional(),
})
    .strict();
const patchCaseSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    title: zod_1.z.string().trim().min(1).max(500).optional(),
    summary: zod_1.z.string().trim().max(4000).optional().nullable(),
    status: caseStatusSchema.optional(),
    tags: zod_1.z.array(zod_1.z.string().trim().max(100)).optional(),
    primary_veterinarian_id: uuidStr.optional().nullable(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    /** Obrigatório ao reabrir caso resolvido/cancelado (status → active/monitoring). */
    reopen_reason: zod_1.z.string().trim().min(8).max(1000).optional(),
})
    .strict();
const CASE_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id_snapshot, primary_veterinarian_id,
  title, summary, status, tags, metadata, opened_at, closed_at, created_at, updated_at
`;
const GENERIC_CASE_TITLE_RE = /^(atendimento avulso|caso avulso|consulta|caso clínico|atendimento clínico)(\s*[—–-]\s*\d{2}\/\d{2}\/\d{4})?$/i;
function isGenericClinicalCaseTitle(title) {
    const t = (title ?? '').trim();
    return t.length === 0 || GENERIC_CASE_TITLE_RE.test(t);
}
function formatCaseTitleDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime()))
        return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
}
/** Título do auto-caso: queixa/título explícito, senão consulta datada (nunca "Atendimento avulso"). */
function resolveAutoCaseTitle(opts) {
    for (const raw of [opts.case_title, opts.chief_complaint, opts.appointment_title]) {
        const t = raw?.trim();
        if (t && !isGenericClinicalCaseTitle(t))
            return t.slice(0, 500);
    }
    const dateLabel = formatCaseTitleDate(opts.started_at);
    return dateLabel ? `Consulta — ${dateLabel}` : 'Consulta';
}
/** Se o caso ainda tem título genérico e há uma queixa útil, promove o título. */
async function maybePromoteGenericCaseTitle(opts) {
    const next = opts.candidate?.trim();
    if (!opts.case_id || !next || isGenericClinicalCaseTitle(next))
        return;
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .select('id, title')
        .eq('id', opts.case_id)
        .eq('clinic_id', opts.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
    if (!data || !isGenericClinicalCaseTitle(data.title))
        return;
    await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .update({ title: next.slice(0, 500) })
        .eq('id', opts.case_id)
        .eq('clinic_id', opts.clinic_id);
}
async function enrichCase(row) {
    const petId = row.pet_id;
    const vetId = row.primary_veterinarian_id;
    const guardianId = row.guardian_id_snapshot;
    const [petRes, vetRes, guardianRes] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id, name, species, breed, birth_date')
            .eq('id', petId)
            .maybeSingle(),
        vetId
            ? supabase_1.supabaseAdmin.from('hub_staff_members').select('id, full_name').eq('id', vetId).maybeSingle()
            : Promise.resolve({ data: null }),
        guardianId
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').eq('id', guardianId).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    return {
        ...row,
        pet: petRes.data,
        primary_veterinarian: vetRes.data,
        guardian_snapshot: guardianRes.data,
    };
}
/** GET /clinical/cases — lista casos de uma clínica, filtros opcionais por pet_id e status. */
const listHubClinicalCases = async (req, res) => {
    try {
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic_id.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
        const status = req.query.status ? caseStatusSchema.safeParse(req.query.status) : null;
        let q = supabase_1.supabaseAdmin
            .from('hub_clinical_cases')
            .select(CASE_SELECT)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .order('opened_at', { ascending: false })
            .limit(200);
        if (pet_id?.success)
            q = q.eq('pet_id', pet_id.data);
        if (status?.success)
            q = q.eq('status', status.data);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ cases: data ?? [] });
    }
    catch (e) {
        console.error('listHubClinicalCases', e);
        return res.status(500).json({ error: e?.message || 'Erro ao listar casos clínicos' });
    }
};
exports.listHubClinicalCases = listHubClinicalCases;
/** GET /clinical/cases/:id */
const getHubClinicalCase = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_cases')
            .select(CASE_SELECT)
            .eq('id', id.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Caso clínico não encontrado' });
        const enriched = await enrichCase(data);
        return res.json({ case: enriched });
    }
    catch (e) {
        console.error('getHubClinicalCase', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar caso clínico' });
    }
};
exports.getHubClinicalCase = getHubClinicalCase;
/** POST /clinical/cases */
const createHubClinicalCase = async (req, res) => {
    try {
        const parsed = createCaseSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const { data: pet } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id')
            .eq('id', b.pet_id)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!pet)
            return res.status(400).json({ error: 'Pet inválido para esta clínica' });
        const insert = {
            clinic_id: b.clinic_id,
            unit_id: b.unit_id ?? null,
            pet_id: b.pet_id,
            guardian_id_snapshot: b.guardian_id_snapshot ?? null,
            primary_veterinarian_id: b.primary_veterinarian_id ?? null,
            title: b.title,
            summary: b.summary ?? null,
            status: b.status,
            tags: b.tags,
            metadata: b.metadata,
            opened_at: b.opened_at ?? new Date().toISOString(),
        };
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_cases')
            .insert(insert)
            .select(CASE_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        const enriched = await enrichCase(data);
        return res.status(201).json({ case: enriched });
    }
    catch (e) {
        console.error('createHubClinicalCase', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar caso clínico' });
    }
};
exports.createHubClinicalCase = createHubClinicalCase;
/** PATCH /clinical/cases/:id — edita título/summary/status/tags/primary_vet. */
const patchHubClinicalCase = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const parsed = patchCaseSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const patch = {};
        if (b.title !== undefined)
            patch.title = b.title;
        if (b.summary !== undefined)
            patch.summary = b.summary;
        if (b.tags !== undefined)
            patch.tags = b.tags;
        if (b.primary_veterinarian_id !== undefined)
            patch.primary_veterinarian_id = b.primary_veterinarian_id;
        if (b.metadata !== undefined)
            patch.metadata = b.metadata;
        if (b.status !== undefined) {
            const { data: current } = await supabase_1.supabaseAdmin
                .from('hub_clinical_cases')
                .select('status, closed_at')
                .eq('id', id.data)
                .eq('clinic_id', b.clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (!current)
                return res.status(404).json({ error: 'Caso clínico não encontrado' });
            const opening = b.status === 'active' || b.status === 'monitoring';
            const wasClosed = current.status === 'resolved' || current.status === 'cancelled';
            if (wasClosed && opening) {
                try {
                    await reopenClosedClinicalCase({
                        case_id: id.data,
                        clinic_id: b.clinic_id,
                        reason: assertReopenReason(b.reopen_reason),
                        reopened_by: req.user?.id ?? null,
                        allowCancelled: true,
                        nextStatus: b.status === 'monitoring' ? 'monitoring' : 'active',
                    });
                }
                catch (reopenErr) {
                    return res.status(400).json({ error: reopenErr?.message || 'Erro ao reabrir caso' });
                }
            }
            else {
                patch.status = b.status;
                if (b.status === 'resolved' || b.status === 'cancelled') {
                    patch.closed_at = new Date().toISOString();
                }
                else {
                    patch.closed_at = null;
                }
            }
        }
        if (Object.keys(patch).length === 0 && b.status === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        if (Object.keys(patch).length === 0) {
            const { data: afterReopen } = await supabase_1.supabaseAdmin
                .from('hub_clinical_cases')
                .select(CASE_SELECT)
                .eq('id', id.data)
                .eq('clinic_id', b.clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (!afterReopen)
                return res.status(404).json({ error: 'Caso clínico não encontrado' });
            const enriched = await enrichCase(afterReopen);
            return res.json({ case: enriched });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_cases')
            .update(patch)
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .select(CASE_SELECT)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Caso clínico não encontrado' });
        const enriched = await enrichCase(data);
        return res.json({ case: enriched });
    }
    catch (e) {
        console.error('patchHubClinicalCase', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar caso clínico' });
    }
};
exports.patchHubClinicalCase = patchHubClinicalCase;
/** DELETE /clinical/cases/:id — soft-delete. */
const deleteHubClinicalCase = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        }
        const { data: enc } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('id')
            .eq('hub_case_id', id.data)
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();
        if (enc) {
            return res.status(409).json({ error: 'Caso possui atendimentos vinculados e não pode ser removido' });
        }
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_cases')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(204).send();
    }
    catch (e) {
        console.error('deleteHubClinicalCase', e);
        return res.status(500).json({ error: e?.message || 'Erro ao remover caso clínico' });
    }
};
exports.deleteHubClinicalCase = deleteHubClinicalCase;
/**
 * Erro lançado quando um pet tem caso(s) ativo(s) mas nenhuma escolha explícita foi feita.
 * Permite que o caller retorne 409 com código tipado para a UI exibir o seletor de caso.
 */
class CaseSelectionRequiredError extends Error {
    code = 'CASE_SELECTION_REQUIRED';
    constructor() {
        super('Este pet possui caso(s) clínico(s) ativo(s). Associe a um caso existente ou crie um novo.');
        this.name = 'CaseSelectionRequiredError';
    }
}
exports.CaseSelectionRequiredError = CaseSelectionRequiredError;
class CaseReopenRequiredError extends Error {
    code = 'CASE_REOPEN_REQUIRED';
    constructor() {
        super('Este caso está resolvido. Informe o motivo para reabri-lo e continuar.');
        this.name = 'CaseReopenRequiredError';
    }
}
exports.CaseReopenRequiredError = CaseReopenRequiredError;
exports.REOPEN_REASON_MIN = 8;
function assertReopenReason(reason) {
    const t = reason?.trim() ?? '';
    if (t.length < exports.REOPEN_REASON_MIN) {
        throw new Error(`Informe o motivo da reabertura do caso (mínimo ${exports.REOPEN_REASON_MIN} caracteres).`);
    }
    return t;
}
/**
 * Reabre caso resolvido (ou cancelado, se `allowCancelled`).
 * Preserva o fechamento original em `metadata.first_closed_at` + `reopen_history`.
 */
async function reopenClosedClinicalCase(opts) {
    const reason = assertReopenReason(opts.reason);
    const { data: row } = await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .select('id, pet_id, status, closed_at, metadata')
        .eq('id', opts.case_id)
        .eq('clinic_id', opts.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
    if (!row)
        throw new Error('Caso clínico não encontrado');
    const status = row.status;
    if (status === 'active' || status === 'monitoring')
        return;
    if (status === 'cancelled' && !opts.allowCancelled) {
        throw new Error('Caso cancelado não pode ser reaberto. Abra um caso novo.');
    }
    if (status !== 'resolved' && status !== 'cancelled') {
        throw new Error('Este caso não pode ser reaberto.');
    }
    const now = new Date().toISOString();
    const prevMeta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {});
    const history = Array.isArray(prevMeta.reopen_history) ? [...prevMeta.reopen_history] : [];
    const record = {
        at: now,
        previous_status: status,
        previous_closed_at: row.closed_at ?? null,
        reason,
        reopened_by: opts.reopened_by ?? null,
    };
    history.push(record);
    const metadata = {
        ...prevMeta,
        first_closed_at: prevMeta.first_closed_at ?? row.closed_at ?? null,
        last_reopened_at: now,
        last_reopen_reason: reason,
        reopen_history: history,
    };
    const { error } = await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .update({
        status: opts.nextStatus ?? 'active',
        closed_at: null,
        metadata,
    })
        .eq('id', opts.case_id)
        .eq('clinic_id', opts.clinic_id);
    if (error)
        throw new Error(`Erro ao reabrir caso: ${error.message}`);
    const petId = row.pet_id;
    if (petId) {
        const closedLabel = record.previous_closed_at
            ? new Date(record.previous_closed_at).toLocaleDateString('pt-BR')
            : 'sem data';
        void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
            clinic_id: opts.clinic_id,
            pet_id: petId,
            hub_case_id: opts.case_id,
            event_type: 'note',
            ref_type: 'case',
            ref_id: opts.case_id,
            title: 'Caso reaberto',
            body: `Status anterior: ${status === 'resolved' ? 'resolvido' : 'cancelado'} (fechado em ${closedLabel}). Motivo: ${reason}`,
            created_by: opts.reopened_by ?? null,
        });
    }
}
/**
 * Utilitário interno: retorna ou cria um caso clínico para o encounter.
 * Chamado por hubEncountersController e hubClinicalModulesController.
 *
 * Lógica:
 * - Se hub_case_id foi explicitamente enviado → valida que pertence ao pet/clínica e está ativo/monitoring.
 * - Se create_new_case=true  → cria novo caso.
 * - Se nenhum e existir ≥1 caso active/monitoring → lança CaseSelectionRequiredError (UI deve perguntar).
 * - Se nenhum caso ativo → cria auto-caso.
 */
async function resolveOrCreateClinicalCase(opts) {
    const { clinic_id, unit_id, pet_id, guardian_id, primary_veterinarian_id, chief_complaint, started_at, hub_case_id, create_new_case, new_case_title, appointment_title, reopen_reason, reopened_by, } = opts;
    // Caso fornecido explicitamente: validar
    if (hub_case_id) {
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_clinical_cases')
            .select('id, status')
            .eq('id', hub_case_id)
            .eq('clinic_id', clinic_id)
            .eq('pet_id', pet_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!existing) {
            throw new Error('Caso clínico não encontrado ou não pertence a este pet/clínica');
        }
        if (existing.status === 'cancelled') {
            throw new Error('Caso cancelado não pode receber atendimento. Abra um caso novo.');
        }
        if (existing.status === 'resolved') {
            if (!reopen_reason?.trim()) {
                throw new CaseReopenRequiredError();
            }
            await reopenClosedClinicalCase({
                case_id: existing.id,
                clinic_id,
                reason: reopen_reason,
                reopened_by: reopened_by ?? null,
            });
        }
        return existing.id;
    }
    // Criar novo caso explicitamente
    if (create_new_case) {
        return createAutoCase({
            clinic_id,
            unit_id,
            pet_id,
            guardian_id,
            primary_veterinarian_id,
            chief_complaint,
            started_at,
            case_title: new_case_title ?? null,
            appointment_title,
        });
    }
    // Sem indicação explícita: verificar casos ativos
    const { data: activeCases } = await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .select('id, status')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', pet_id)
        .in('status', ['active', 'monitoring'])
        .is('deleted_at', null)
        .order('opened_at', { ascending: false })
        .limit(1);
    if (activeCases && activeCases.length > 0) {
        throw new CaseSelectionRequiredError();
    }
    // Sem caso ativo → cria auto-caso
    return createAutoCase({
        clinic_id,
        unit_id,
        pet_id,
        guardian_id,
        primary_veterinarian_id,
        chief_complaint,
        started_at,
        case_title: new_case_title ?? null,
        appointment_title,
    });
}
/**
 * Garante que uma internação/cirurgia tenha caso clínico e atendimento de referência.
 * Se não houver `hub_encounter_id`, cria um encounter de admissão automaticamente.
 * Retorna os IDs resolvidos.
 */
async function ensureCaseAndAdmissionEncounter(opts) {
    const { clinic_id, unit_id, pet_id, guardian_id, hub_encounter_id, hub_case_id, create_new_case, new_case_title, encounter_chief_complaint, reopen_reason, reopened_by, hub_staff_member_id, hub_service_type_id, } = opts;
    // Encounter fornecido: validar e extrair case_id dele
    if (hub_encounter_id) {
        const { data: enc } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('id, hub_case_id, hub_staff_member_id, hub_service_type_id')
            .eq('id', hub_encounter_id)
            .eq('clinic_id', clinic_id)
            .eq('pet_id', pet_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!enc)
            throw new Error('Atendimento não encontrado ou não pertence a este pet/clínica');
        const encPatch = {};
        if (hub_staff_member_id && !enc.hub_staff_member_id) {
            encPatch.hub_staff_member_id = hub_staff_member_id;
        }
        if (hub_service_type_id && !enc.hub_service_type_id) {
            encPatch.hub_service_type_id = hub_service_type_id;
        }
        if (Object.keys(encPatch).length > 0) {
            await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .update(encPatch)
                .eq('id', hub_encounter_id)
                .eq('clinic_id', clinic_id);
        }
        const caseId = enc.hub_case_id ?? null;
        // Se o encounter já tem case, usar; se não, criar/resolver
        const finalCaseId = caseId ?? await resolveOrCreateClinicalCase({
            clinic_id, unit_id, pet_id, guardian_id, hub_case_id, create_new_case, new_case_title,
            chief_complaint: encounter_chief_complaint,
            reopen_reason, reopened_by,
        });
        return { case_id: finalCaseId, encounter_id: hub_encounter_id };
    }
    // Sem encounter: resolver/criar caso primeiro
    const finalCaseId = await resolveOrCreateClinicalCase({
        clinic_id,
        unit_id,
        pet_id,
        guardian_id,
        hub_case_id,
        create_new_case,
        new_case_title,
        chief_complaint: encounter_chief_complaint,
        reopen_reason,
        reopened_by,
    });
    // Criar encounter de admissão
    const { data: enc, error: encErr } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .insert({
        clinic_id,
        unit_id: unit_id ?? null,
        pet_id,
        guardian_id: guardian_id ?? null,
        hub_case_id: finalCaseId,
        encounter_type: 'procedure',
        status: 'in_progress',
        chief_complaint: encounter_chief_complaint,
        started_at: new Date().toISOString(),
        hub_staff_member_id: hub_staff_member_id ?? null,
        hub_service_type_id: hub_service_type_id ?? null,
    })
        .select('id')
        .single();
    if (encErr || !enc)
        throw new Error(`Erro ao criar atendimento de admissão: ${encErr?.message}`);
    return { case_id: finalCaseId, encounter_id: enc.id };
}
async function createAutoCase(opts) {
    const title = resolveAutoCaseTitle({
        case_title: opts.case_title,
        chief_complaint: opts.chief_complaint,
        appointment_title: opts.appointment_title,
        started_at: opts.started_at,
    });
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .insert({
        clinic_id: opts.clinic_id,
        unit_id: opts.unit_id ?? null,
        pet_id: opts.pet_id,
        guardian_id_snapshot: opts.guardian_id ?? null,
        primary_veterinarian_id: opts.primary_veterinarian_id ?? null,
        title,
        status: 'active',
        opened_at: opts.started_at ?? new Date().toISOString(),
    })
        .select('id')
        .single();
    if (error)
        throw new Error(`Erro ao criar caso clínico automático: ${error.message}`);
    return data.id;
}
