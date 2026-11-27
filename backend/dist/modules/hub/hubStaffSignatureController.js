"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchHubStaffMe = exports.postHubStaffMeStampImage = exports.getHubStaffMe = exports.postHubStaffStampImage = void 0;
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubStaffPhotoUpload_1 = require("../../utils/hubStaffPhotoUpload");
const hubStaffResolve_1 = require("./hubStaffResolve");
const uuidStr = zod_1.z.string().uuid();
const STAFF_STAMP_SELECT = 'id, clinic_id, full_name, display_name, photo_url, signature_image_url, stamp_image_url, crmv, crmv_uf, job_title, professional_kind, clinic_user_id';
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Apenas PNG, JPG ou WEBP são permitidos.'));
        }
    },
}).single('photo');
const KIND_COLUMN = {
    signature: 'signature_image_url',
    stamp: 'stamp_image_url',
};
function runMulter(req, res) {
    return new Promise((resolve, reject) => {
        upload(req, res, (err) => {
            if (err) {
                reject(err instanceof Error ? err : new Error('Erro no upload'));
                return;
            }
            if (!req.file) {
                reject(new Error('Nenhum arquivo enviado (campo: photo)'));
                return;
            }
            resolve(req.file);
        });
    });
}
async function uploadKindImage(file, clinicId, kind, staffId) {
    return (0, hubStaffPhotoUpload_1.uploadHubStaffPhotoToStorage)({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
    }, clinicId, { kind, staffId });
}
/**
 * POST /api/hub/staff/signature|stamp?clinic_id=...
 * multipart field `photo` — exige hub.staff.write (admin/gerente).
 * Devolve URL pública; a UI grava no PATCH do staff.
 */
const postHubStaffStampImage = (kind) => (req, res) => {
    void (async () => {
        try {
            const file = await runMulter(req, res);
            const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
            if (!clinicParsed.success) {
                res.status(400).json({ error: 'clinic_id inválido na query' });
                return;
            }
            const staffIdRaw = typeof req.query.staff_id === 'string' ? req.query.staff_id : null;
            const staffId = staffIdRaw && uuidStr.safeParse(staffIdRaw).success ? staffIdRaw : null;
            const uploaded = await uploadKindImage(file, clinicParsed.data, kind, staffId);
            res.status(201).json({ url: uploaded.url, path: uploaded.path, kind });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
            const status = /arquivo|permitidos|inválido/i.test(msg) ? 400 : 500;
            if (status === 500)
                console.error(`[hub_staff] ${kind} upload`, e);
            res.status(status).json({ error: msg });
        }
    })();
};
exports.postHubStaffStampImage = postHubStaffStampImage;
/**
 * GET /api/hub/staff/me?clinic_id=...
 * Staff vinculado ao usuário logado (assinatura/carimbo para Meu perfil).
 */
const getHubStaffMe = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            res.status(400).json({ error: 'clinic_id inválido na query' });
            return;
        }
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Não autenticado' });
            return;
        }
        const staffId = await (0, hubStaffResolve_1.resolveStaffIdForUser)(clinicParsed.data, userId);
        if (!staffId) {
            res.status(200).json({ staff: null, linked: false });
            return;
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_staff_members')
            .select(STAFF_STAMP_SELECT)
            .eq('id', staffId)
            .eq('clinic_id', clinicParsed.data)
            .is('deleted_at', null)
            .maybeSingle();
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        res.status(200).json({ staff: data ?? null, linked: Boolean(data) });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao carregar perfil da equipe';
        console.error('[hub_staff] me get', e);
        res.status(500).json({ error: msg });
    }
};
exports.getHubStaffMe = getHubStaffMe;
/**
 * POST /api/hub/staff/me/signature|stamp?clinic_id=...
 * Upload self-service: grava a URL no próprio hub_staff_members.
 */
const postHubStaffMeStampImage = (kind) => (req, res) => {
    void (async () => {
        try {
            const file = await runMulter(req, res);
            const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
            if (!clinicParsed.success) {
                res.status(400).json({ error: 'clinic_id inválido na query' });
                return;
            }
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Não autenticado' });
                return;
            }
            const staffId = await (0, hubStaffResolve_1.resolveStaffIdForUser)(clinicParsed.data, userId);
            if (!staffId) {
                res.status(404).json({
                    error: 'Seu usuário não está vinculado a um profissional na Equipe. Peça à clínica para vincular o acesso.',
                });
                return;
            }
            const uploaded = await uploadKindImage(file, clinicParsed.data, kind, staffId);
            const column = KIND_COLUMN[kind];
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_staff_members')
                .update({ [column]: uploaded.url })
                .eq('id', staffId)
                .eq('clinic_id', clinicParsed.data)
                .is('deleted_at', null)
                .select(STAFF_STAMP_SELECT)
                .single();
            if (error || !data) {
                res.status(500).json({ error: error?.message || 'Erro ao salvar imagem no perfil' });
                return;
            }
            res.status(201).json({ url: uploaded.url, path: uploaded.path, kind, staff: data });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
            const status = /arquivo|permitidos|vinculado/i.test(msg) ? 400 : 500;
            if (status === 500)
                console.error(`[hub_staff] me ${kind} upload`, e);
            res.status(status).json({ error: msg });
        }
    })();
};
exports.postHubStaffMeStampImage = postHubStaffMeStampImage;
/**
 * PATCH /api/hub/staff/me?clinic_id=...
 * Body: { signature_image_url?: string|null, stamp_image_url?: string|null }
 * Permite limpar imagens no Meu perfil.
 */
const patchHubStaffMe = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id ?? req.body?.clinic_id);
        if (!clinicParsed.success) {
            res.status(400).json({ error: 'clinic_id inválido' });
            return;
        }
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Não autenticado' });
            return;
        }
        const staffId = await (0, hubStaffResolve_1.resolveStaffIdForUser)(clinicParsed.data, userId);
        if (!staffId) {
            res.status(404).json({
                error: 'Seu usuário não está vinculado a um profissional na Equipe. Peça à clínica para vincular o acesso.',
            });
            return;
        }
        const schema = zod_1.z
            .object({
            signature_image_url: zod_1.z.union([zod_1.z.string().url().max(2000), zod_1.z.literal(''), zod_1.z.null()]).optional(),
            stamp_image_url: zod_1.z.union([zod_1.z.string().url().max(2000), zod_1.z.literal(''), zod_1.z.null()]).optional(),
        })
            .strict();
        const parsed = schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
            return;
        }
        const patch = {};
        if (parsed.data.signature_image_url !== undefined) {
            const v = parsed.data.signature_image_url;
            patch.signature_image_url = v === '' || v === null ? null : v;
        }
        if (parsed.data.stamp_image_url !== undefined) {
            const v = parsed.data.stamp_image_url;
            patch.stamp_image_url = v === '' || v === null ? null : v;
        }
        if (Object.keys(patch).length === 0) {
            res.status(400).json({ error: 'Nenhum campo para atualizar' });
            return;
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_staff_members')
            .update(patch)
            .eq('id', staffId)
            .eq('clinic_id', clinicParsed.data)
            .is('deleted_at', null)
            .select(STAFF_STAMP_SELECT)
            .single();
        if (error || !data) {
            res.status(500).json({ error: error?.message || 'Erro ao atualizar perfil' });
            return;
        }
        res.status(200).json({ staff: data });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao atualizar perfil';
        console.error('[hub_staff] me patch', e);
        res.status(500).json({ error: msg });
    }
};
exports.patchHubStaffMe = patchHubStaffMe;
