"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHubBoardingMedia = exports.uploadHubBoardingMedia = exports.getHubBoardingMedia = exports.deleteHubBoardingExtra = exports.postHubBoardingExtra = exports.getHubBoardingExtras = exports.deleteHubBoardingBelonging = exports.patchHubBoardingBelonging = exports.postHubBoardingBelonging = exports.getHubBoardingBelongings = exports.patchHubBoardingIncident = exports.postHubBoardingIncident = exports.getHubBoardingIncidents = void 0;
const multer_1 = __importDefault(require("multer"));
const supabase_1 = require("../../config/supabase");
const fileValidation_js_1 = require("../../utils/fileValidation.js");
const boardingCareService_1 = require("./boardingCareService");
const boardingPricing_1 = require("./boardingPricing");
const hubBoardingDrawerController_1 = require("./hubBoardingDrawerController");
const hubComandasController_1 = require("./hubComandasController");
const hubBoardingSchemas_1 = require("./hubBoardingSchemas");
function clinicFrom(req) {
    const raw = req.body?.clinic_id ?? req.query.clinic_id;
    const p = hubBoardingSchemas_1.uuidStr.safeParse(raw);
    return p.success ? p.data : null;
}
function badId(id) {
    return !id || !hubBoardingDrawerController_1.UUID_RE.test(id);
}
function dbError(res, error) {
    if ((0, boardingCareService_1.missingTable)(error))
        return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
    return res.status(500).json({ error: error.message });
}
async function listByReservation(req, res, table, order, ascending, key) {
    try {
        const clinicId = clinicFrom(req);
        const { id } = req.params;
        if (!clinicId)
            return res.status(400).json({ error: 'clinic_id inválido' });
        if (badId(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from(table)
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .is('deleted_at', null)
            .order(order, { ascending });
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error))
                return res.json({ [key]: [], migrations_ready: false });
            return res.status(500).json({ error: error.message });
        }
        return res.json({ [key]: data ?? [] });
    }
    catch (e) {
        console.error(`list ${table}`, e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar' });
    }
}
// ─── Intercorrências ──────────────────────────────────────────────────────
const getHubBoardingIncidents = (req, res) => listByReservation(req, res, 'hub_boarding_incidents', 'occurred_at', false, 'incidents');
exports.getHubBoardingIncidents = getHubBoardingIncidents;
const postHubBoardingIncident = async (req, res) => {
    try {
        const { id } = req.params;
        if (badId(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const parsed = hubBoardingSchemas_1.createIncidentSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, tutor_notified, ...rest } = parsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_incidents')
            .insert({
            clinic_id,
            hub_boarding_reservation_id: id,
            pet_id: reservation.pet_id,
            ...rest,
            description: rest.description.trim(),
            action_taken: rest.action_taken?.trim() || null,
            occurred_at: rest.occurred_at ?? new Date().toISOString(),
            tutor_notified_at: tutor_notified ? new Date().toISOString() : null,
            created_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error)
            return dbError(res, error);
        return res.status(201).json({ incident: data });
    }
    catch (e) {
        console.error('postHubBoardingIncident', e);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar intercorrência' });
    }
};
exports.postHubBoardingIncident = postHubBoardingIncident;
const patchHubBoardingIncident = async (req, res) => {
    try {
        const { id } = req.params;
        if (badId(id))
            return res.status(400).json({ error: 'Intercorrência inválida' });
        const parsed = hubBoardingSchemas_1.patchIncidentSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, status, tutor_notified, ...rest } = parsed.data;
        const update = { ...rest };
        if (status) {
            update.status = status;
            if (status === 'resolved') {
                update.resolved_at = new Date().toISOString();
                update.resolved_by_user_id = req.user?.id ?? null;
            }
            else {
                update.resolved_at = null;
                update.resolved_by_user_id = null;
            }
        }
        if (tutor_notified !== undefined)
            update.tutor_notified_at = tutor_notified ? new Date().toISOString() : null;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_incidents')
            .update(update)
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .select('*')
            .maybeSingle();
        if (error)
            return dbError(res, error);
        if (!data)
            return res.status(404).json({ error: 'Intercorrência não encontrada' });
        return res.json({ incident: data });
    }
    catch (e) {
        console.error('patchHubBoardingIncident', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar intercorrência' });
    }
};
exports.patchHubBoardingIncident = patchHubBoardingIncident;
// ─── Pertences ────────────────────────────────────────────────────────────
const getHubBoardingBelongings = (req, res) => listByReservation(req, res, 'hub_boarding_belongings', 'created_at', true, 'belongings');
exports.getHubBoardingBelongings = getHubBoardingBelongings;
const postHubBoardingBelonging = async (req, res) => {
    try {
        const { id } = req.params;
        if (badId(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const parsed = hubBoardingSchemas_1.createBelongingSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, ...rest } = parsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_belongings')
            .insert({
            clinic_id,
            hub_boarding_reservation_id: id,
            ...rest,
            description: rest.description.trim(),
            notes: rest.notes?.trim() || null,
            created_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error)
            return dbError(res, error);
        return res.status(201).json({ belonging: data });
    }
    catch (e) {
        console.error('postHubBoardingBelonging', e);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar pertence' });
    }
};
exports.postHubBoardingBelonging = postHubBoardingBelonging;
const patchHubBoardingBelonging = async (req, res) => {
    try {
        const { id } = req.params;
        if (badId(id))
            return res.status(400).json({ error: 'Pertence inválido' });
        const parsed = hubBoardingSchemas_1.patchBelongingSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, checkout_status, ...rest } = parsed.data;
        const update = { ...rest };
        if (checkout_status) {
            update.checkout_status = checkout_status;
            update.checkout_checked_at = checkout_status === 'pending' ? null : new Date().toISOString();
            update.checkout_checked_by_user_id = checkout_status === 'pending' ? null : req.user?.id ?? null;
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_belongings')
            .update(update)
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .select('*')
            .maybeSingle();
        if (error)
            return dbError(res, error);
        if (!data)
            return res.status(404).json({ error: 'Pertence não encontrado' });
        return res.json({ belonging: data });
    }
    catch (e) {
        console.error('patchHubBoardingBelonging', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar pertence' });
    }
};
exports.patchHubBoardingBelonging = patchHubBoardingBelonging;
async function softDelete(req, res, table, label) {
    try {
        const clinicId = clinicFrom(req);
        const { id } = req.params;
        if (!clinicId)
            return res.status(400).json({ error: 'clinic_id inválido' });
        if (badId(id))
            return res.status(400).json({ error: `${label} inválido` });
        const { data, error } = await supabase_1.supabaseAdmin
            .from(table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .select('id')
            .maybeSingle();
        if (error)
            return dbError(res, error);
        if (!data)
            return res.status(404).json({ error: `${label} não encontrado` });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error(`delete ${table}`, e);
        return res.status(500).json({ error: e?.message || 'Erro ao remover' });
    }
}
const deleteHubBoardingBelonging = (req, res) => softDelete(req, res, 'hub_boarding_belongings', 'Pertence');
exports.deleteHubBoardingBelonging = deleteHubBoardingBelonging;
// ─── Adicionais (cobrados na comanda) ─────────────────────────────────────
const getHubBoardingExtras = (req, res) => listByReservation(req, res, 'hub_boarding_extras', 'created_at', true, 'extras');
exports.getHubBoardingExtras = getHubBoardingExtras;
const postHubBoardingExtra = async (req, res) => {
    try {
        const { id } = req.params;
        if (badId(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const parsed = hubBoardingSchemas_1.createExtraSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, hub_service_type_id, quantity, service_date } = parsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (reservation.status === 'cancelled' || reservation.status === 'no_show') {
            return res.status(422).json({ error: 'Reserva cancelada não recebe adicionais' });
        }
        let description = parsed.data.description?.trim() ?? '';
        let unitCents = parsed.data.unit_amount_cents ?? null;
        if (hub_service_type_id) {
            const priced = await (0, boardingPricing_1.resolveServicePriceForPet)({
                clinicId: clinic_id,
                petId: reservation.pet_id,
                serviceTypeId: hub_service_type_id,
                refYmd: service_date ?? (0, boardingPricing_1.todayYmdSaoPaulo)(),
            });
            if (!priced)
                return res.status(404).json({ error: 'Serviço não encontrado' });
            if (!description)
                description = String(priced.service.name ?? 'Adicional');
            if (unitCents == null)
                unitCents = Math.round(priced.sale * 100);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_extras')
            .insert({
            clinic_id,
            hub_boarding_reservation_id: id,
            hub_service_type_id: hub_service_type_id ?? null,
            description,
            quantity,
            unit_amount_cents: unitCents ?? 0,
            service_date: service_date ?? (0, boardingPricing_1.todayYmdSaoPaulo)(),
            created_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error)
            return dbError(res, error);
        void (0, hubComandasController_1.syncOpenComandasAfterBoardingCheckedOut)(clinic_id, id);
        return res.status(201).json({ extra: data });
    }
    catch (e) {
        console.error('postHubBoardingExtra', e);
        return res.status(500).json({ error: e?.message || 'Erro ao lançar adicional' });
    }
};
exports.postHubBoardingExtra = postHubBoardingExtra;
const deleteHubBoardingExtra = async (req, res) => {
    try {
        const clinicId = clinicFrom(req);
        const { id } = req.params;
        if (!clinicId)
            return res.status(400).json({ error: 'clinic_id inválido' });
        if (badId(id))
            return res.status(400).json({ error: 'Adicional inválido' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_extras')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .select('id, hub_boarding_reservation_id')
            .maybeSingle();
        if (error)
            return dbError(res, error);
        if (!data)
            return res.status(404).json({ error: 'Adicional não encontrado' });
        const reservationId = data.hub_boarding_reservation_id;
        if (reservationId)
            void (0, hubComandasController_1.syncOpenComandasAfterBoardingCheckedOut)(clinicId, reservationId);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('deleteHubBoardingExtra', e);
        return res.status(500).json({ error: e?.message || 'Erro ao remover' });
    }
};
exports.deleteHubBoardingExtra = deleteHubBoardingExtra;
// ─── Fotos ────────────────────────────────────────────────────────────────
const MEDIA_BUCKET = 'hub-boarding-media';
const MEDIA_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MEDIA_MAX = 10 * 1024 * 1024;
const mediaUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MEDIA_MAX },
    fileFilter: (_req, file, cb) => {
        if (MEDIA_MIMES.includes(file.mimetype))
            cb(null, true);
        else
            cb(new Error('Envie uma foto em JPG, PNG ou WEBP.'));
    },
}).single('file');
async function ensureMediaBucket() {
    const { error } = await supabase_1.supabaseAdmin.storage.createBucket(MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: MEDIA_MAX,
        allowedMimeTypes: MEDIA_MIMES,
    });
    if (!error)
        return;
    const m = (error.message ?? '').toLowerCase();
    if (m.includes('already exists') || m.includes('duplicate') || m.includes('already taken'))
        return;
    throw new Error(`Não foi possível preparar o armazenamento de fotos (${error.message}). ${boardingCareService_1.BOARDING_MIGRATION_HINT}`);
}
const getHubBoardingMedia = (req, res) => listByReservation(req, res, 'hub_boarding_media', 'created_at', false, 'media');
exports.getHubBoardingMedia = getHubBoardingMedia;
/** POST multipart: file + caption?, task_id?, incident_id?. clinic_id vai na query (permissão). */
const uploadHubBoardingMedia = (req, res) => {
    mediaUpload(req, res, async (err) => {
        if (err)
            return res.status(400).json({ error: err instanceof Error ? err.message : 'Erro no upload' });
        if (!req.file)
            return res.status(400).json({ error: 'Nenhuma foto enviada' });
        const clinicId = clinicFrom(req);
        const { id } = req.params;
        if (!clinicId)
            return res.status(400).json({ error: 'clinic_id inválido' });
        if (badId(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        try {
            const reservation = await (0, boardingCareService_1.loadReservation)(clinicId, id);
            if (!reservation)
                return res.status(404).json({ error: 'Reserva não encontrada' });
            (0, fileValidation_js_1.validateFile)(req.file.buffer, req.file.mimetype, req.file.originalname, {
                maxSize: MEDIA_MAX,
                allowedTypes: MEDIA_MIMES,
                requireSignature: true,
            });
            await ensureMediaBucket();
            const safe = (0, fileValidation_js_1.sanitizeFilename)(req.file.originalname);
            const ext = safe.includes('.') ? safe.split('.').pop() : 'jpg';
            const path = `${clinicId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
            const { error: upErr } = await supabase_1.supabaseAdmin.storage
                .from(MEDIA_BUCKET)
                .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
            if (upErr)
                return res.status(500).json({ error: upErr.message || 'Erro ao enviar foto' });
            const { data: pub } = supabase_1.supabaseAdmin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
            const taskId = hubBoardingSchemas_1.uuidStr.safeParse(req.body?.task_id);
            const incidentId = hubBoardingSchemas_1.uuidStr.safeParse(req.body?.incident_id);
            const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, 300) : '';
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_boarding_media')
                .insert({
                clinic_id: clinicId,
                hub_boarding_reservation_id: id,
                hub_boarding_task_id: taskId.success ? taskId.data : null,
                hub_boarding_incident_id: incidentId.success ? incidentId.data : null,
                storage_path: path,
                url: pub.publicUrl,
                mime_type: req.file.mimetype,
                caption: caption || null,
                created_by_user_id: req.user?.id ?? null,
            })
                .select('*')
                .single();
            if (error)
                return dbError(res, error);
            return res.status(201).json({ media: data });
        }
        catch (e) {
            console.error('uploadHubBoardingMedia', e);
            return res.status(500).json({ error: e?.message || 'Erro ao enviar foto' });
        }
    });
};
exports.uploadHubBoardingMedia = uploadHubBoardingMedia;
const deleteHubBoardingMedia = async (req, res) => {
    try {
        const clinicId = clinicFrom(req);
        const { id } = req.params;
        if (!clinicId)
            return res.status(400).json({ error: 'clinic_id inválido' });
        if (badId(id))
            return res.status(400).json({ error: 'Foto inválida' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_media')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .select('storage_path')
            .maybeSingle();
        if (error)
            return dbError(res, error);
        if (!data)
            return res.status(404).json({ error: 'Foto não encontrada' });
        void supabase_1.supabaseAdmin.storage.from(MEDIA_BUCKET).remove([data.storage_path]);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('deleteHubBoardingMedia', e);
        return res.status(500).json({ error: e?.message || 'Erro ao remover foto' });
    }
};
exports.deleteHubBoardingMedia = deleteHubBoardingMedia;
