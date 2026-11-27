"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHubClinicalTermTemplate = exports.patchHubClinicalTermTemplate = exports.uploadHubClinicalTermTemplate = exports.listHubClinicalTermTemplates = void 0;
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubClinicalTermUpload_js_1 = require("../../utils/hubClinicalTermUpload.js");
const supabaseSchemaErrors_js_1 = require("../../utils/supabaseSchemaErrors.js");
const uuidStr = zod_1.z.string().uuid();
const TERM_CATEGORIES = ['castracao', 'anestesia', 'internacao', 'eutanasia', 'outro'];
const categorySchema = zod_1.z.enum(TERM_CATEGORIES);
const MIGRATION_HINT = 'Tabela hub_clinical_term_templates ausente. Execute a migration 168_create_hub_clinical_term_templates.sql.';
const SELECT_COLS = 'id, clinic_id, title, category, description, file_name, storage_path, mime_type, file_size_bytes, is_active, sort_order, uploaded_by, created_at, updated_at';
const patchSchema = zod_1.z.object({
    clinic_id: uuidStr,
    title: zod_1.z.string().trim().min(1).max(200).optional(),
    category: categorySchema.optional(),
    description: zod_1.z.string().trim().max(2000).optional().nullable(),
    is_active: zod_1.z.boolean().optional(),
    sort_order: zod_1.z.number().int().min(0).max(9999).optional(),
});
const termUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf')
            cb(null, true);
        else
            cb(new Error('Apenas arquivos PDF são permitidos.'));
    },
}).single('file');
const listHubClinicalTermTemplates = async (req, res) => {
    try {
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic_id.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        const includeInactive = req.query.include_inactive === 'true';
        let q = supabase_1.supabaseAdmin
            .from('hub_clinical_term_templates')
            .select(SELECT_COLS)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .order('sort_order', { ascending: true })
            .order('title', { ascending: true });
        if (!includeInactive)
            q = q.eq('is_active', true);
        const { data, error } = await q;
        if (error) {
            if ((0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
                return res.json({ term_templates: [], schema_ready: false, migration_hint: MIGRATION_HINT });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ term_templates: data ?? [], schema_ready: true });
    }
    catch (e) {
        console.error('[clinical_term_templates] list', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubClinicalTermTemplates = listHubClinicalTermTemplates;
/** POST /api/hub/clinical/term-templates/upload — multipart: file + clinic_id, title, category, description? */
const uploadHubClinicalTermTemplate = (req, res) => {
    termUpload(req, res, async (err) => {
        if (err) {
            const msg = err instanceof Error ? err.message : 'Erro no upload';
            return res.status(400).json({ error: msg });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado (campo: file)' });
        }
        const parsed = zod_1.z
            .object({
            clinic_id: uuidStr,
            title: zod_1.z.string().trim().min(1).max(200),
            category: categorySchema,
            description: zod_1.z.string().trim().max(2000).optional().nullable(),
            sort_order: zod_1.z.coerce.number().int().min(0).max(9999).optional(),
            is_active: zod_1.z
                .union([zod_1.z.boolean(), zod_1.z.enum(['true', 'false'])])
                .optional()
                .transform((v) => (v === undefined ? true : v === true || v === 'true')),
        })
            .safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const b = parsed.data;
        try {
            const { url } = await (0, hubClinicalTermUpload_js_1.uploadHubClinicalTermToStorage)({
                buffer: req.file.buffer,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
            }, b.clinic_id);
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_clinical_term_templates')
                .insert({
                clinic_id: b.clinic_id,
                title: b.title,
                category: b.category,
                description: b.description?.trim() || null,
                file_name: req.file.originalname,
                storage_path: url,
                mime_type: req.file.mimetype,
                file_size_bytes: req.file.size,
                is_active: b.is_active ?? true,
                sort_order: b.sort_order ?? 0,
                uploaded_by: req.user?.id ?? null,
            })
                .select(SELECT_COLS)
                .single();
            if (error) {
                if ((0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
                    return res.status(503).json({ error: MIGRATION_HINT });
                }
                return res.status(500).json({ error: error.message });
            }
            return res.status(201).json({ term_template: data });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao enviar termo';
            return res.status(500).json({ error: msg });
        }
    });
};
exports.uploadHubClinicalTermTemplate = uploadHubClinicalTermTemplate;
const patchHubClinicalTermTemplate = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const body = patchSchema.safeParse(req.body);
        if (!idParsed.success || !body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
        }
        const { clinic_id, ...fields } = body.data;
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'Nada para atualizar' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_term_templates')
            .update(fields)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .select(SELECT_COLS)
            .single();
        if (error) {
            if ((0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
                return res.status(503).json({ error: MIGRATION_HINT });
            }
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Termo não encontrado' });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ term_template: data });
    }
    catch (e) {
        console.error('[clinical_term_templates] patch', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubClinicalTermTemplate = patchHubClinicalTermTemplate;
const deleteHubClinicalTermTemplate = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id ?? req.body?.clinic_id);
        if (!idParsed.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_term_templates')
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .select('id')
            .single();
        if (error) {
            if ((0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
                return res.status(503).json({ error: MIGRATION_HINT });
            }
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Termo não encontrado' });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ ok: true, id: data.id });
    }
    catch (e) {
        console.error('[clinical_term_templates] delete', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteHubClinicalTermTemplate = deleteHubClinicalTermTemplate;
