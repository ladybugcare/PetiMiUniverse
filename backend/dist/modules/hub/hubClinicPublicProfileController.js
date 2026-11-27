"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicClinicProfileBySlug = exports.postHubClinicPublicProfileLogo = exports.postHubClinicPublicProfileCover = exports.patchHubClinicPublicProfile = exports.getHubClinicPublicProfile = void 0;
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const supabase_js_1 = require("../../config/supabase.js");
const authMiddleware_js_1 = require("../../middleware/authMiddleware.js");
const errorHandler_js_1 = require("../../middleware/errorHandler.js");
const errors_js_1 = require("../../utils/errors.js");
const hubProfilePhotoUpload_js_1 = require("../../utils/hubProfilePhotoUpload.js");
const publicServicePricePolicy_js_1 = require("./publicServicePricePolicy.js");
const uuidStr = zod_1.z.string().uuid();
const CLINIC_EDIT_ROLES = new Set(['CADMIN', 'CMANAGER']);
/** 3–60 chars: começa/termina com alfanumérico; hífens no meio. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const themePresetSchema = zod_1.z.enum(['warm', 'clean', 'dark']);
const servicesDisplayModeSchema = zod_1.z.enum(['groups', 'services', 'both']);
const socialLinksSchema = zod_1.z
    .object({
    instagram: zod_1.z.string().trim().max(500).optional().nullable(),
    facebook: zod_1.z.string().trim().max(500).optional().nullable(),
    tiktok: zod_1.z.string().trim().max(500).optional().nullable(),
    youtube: zod_1.z.string().trim().max(500).optional().nullable(),
    site: zod_1.z.string().trim().max(500).optional().nullable(),
})
    .strict()
    .optional();
const dayHoursSchema = zod_1.z
    .object({
    closed: zod_1.z.boolean().optional(),
    open: zod_1.z.string().trim().max(8).optional().nullable(),
    close: zod_1.z.string().trim().max(8).optional().nullable(),
})
    .strict();
const businessHoursSchema = zod_1.z
    .object({
    '0': dayHoursSchema.optional(),
    '1': dayHoursSchema.optional(),
    '2': dayHoursSchema.optional(),
    '3': dayHoursSchema.optional(),
    '4': dayHoursSchema.optional(),
    '5': dayHoursSchema.optional(),
    '6': dayHoursSchema.optional(),
})
    .strict()
    .optional();
const servicePublicPatchSchema = zod_1.z
    .object({
    id: uuidStr,
    show_on_public_profile: zod_1.z.boolean().optional(),
    public_sort_order: zod_1.z.number().int().min(0).max(10_000).optional(),
    public_blurb: zod_1.z.string().trim().max(500).optional().nullable(),
    show_public_price: zod_1.z.boolean().optional(),
})
    .strict();
const staffPublicPatchSchema = zod_1.z
    .object({
    id: uuidStr,
    show_on_public_profile: zod_1.z.boolean().optional(),
    public_sort_order: zod_1.z.number().int().min(0).max(10_000).optional(),
    public_bio: zod_1.z.string().trim().max(2000).optional().nullable(),
})
    .strict();
const groupPublicPatchSchema = zod_1.z
    .object({
    id: uuidStr,
    show_on_public_profile: zod_1.z.boolean().optional(),
    public_sort_order: zod_1.z.number().int().min(0).max(10_000).optional(),
    public_blurb: zod_1.z.string().trim().max(500).optional().nullable(),
})
    .strict();
const patchPublicProfileBodySchema = zod_1.z
    .object({
    enabled: zod_1.z.boolean().optional(),
    public_slug: zod_1.z.string().trim().toLowerCase().max(60).optional().nullable(),
    headline: zod_1.z.string().trim().max(200).optional().nullable(),
    about: zod_1.z.string().trim().max(4000).optional().nullable(),
    accent_color: zod_1.z
        .string()
        .trim()
        .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor inválida (#RRGGBB)' })
        .optional()
        .nullable(),
    theme_preset: themePresetSchema.optional(),
    services_display_mode: servicesDisplayModeSchema.optional(),
    whatsapp_phone: zod_1.z.string().trim().max(30).optional().nullable(),
    show_phone: zod_1.z.boolean().optional(),
    show_address: zod_1.z.boolean().optional(),
    show_map: zod_1.z.boolean().optional(),
    cta_label: zod_1.z.string().trim().max(80).optional().nullable(),
    cta_url: zod_1.z.string().trim().max(2000).optional().nullable(),
    social_links: socialLinksSchema,
    business_hours: businessHoursSchema,
    seo_title: zod_1.z.string().trim().max(120).optional().nullable(),
    seo_description: zod_1.z.string().trim().max(320).optional().nullable(),
    cover_image_url: zod_1.z.string().trim().max(2000).optional().nullable(),
    logo_override_url: zod_1.z.string().trim().max(2000).optional().nullable(),
    services: zod_1.z.array(servicePublicPatchSchema).max(200).optional(),
    service_groups: zod_1.z.array(groupPublicPatchSchema).max(100).optional(),
    staff: zod_1.z.array(staffPublicPatchSchema).max(200).optional(),
})
    .strict();
async function userCanEditClinicProfile(userId, clinicId) {
    if (userId === clinicId)
        return true;
    const { data } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .select('role')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .maybeSingle();
    return !!data?.role && CLINIC_EDIT_ROLES.has(String(data.role).toUpperCase());
}
function emptyProfile(clinicId) {
    return {
        clinic_id: clinicId,
        enabled: false,
        public_slug: null,
        headline: null,
        about: null,
        cover_image_url: null,
        logo_override_url: null,
        accent_color: null,
        theme_preset: 'warm',
        services_display_mode: 'services',
        whatsapp_phone: null,
        show_phone: true,
        show_address: true,
        show_map: false,
        cta_label: null,
        cta_url: null,
        social_links: {},
        business_hours: {},
        seo_title: null,
        seo_description: null,
        published_at: null,
        created_at: null,
        updated_at: null,
    };
}
function normalizeSocialLinks(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const key of ['instagram', 'facebook', 'tiktok', 'youtube', 'site']) {
        const v = src[key];
        out[key] = typeof v === 'string' && v.trim() ? v.trim() : null;
    }
    return out;
}
async function loadEditorCatalog(clinicId) {
    const [servicesRes, groupsRes, staffRes] = await Promise.all([
        supabase_js_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, name, service_group, sale_amount, default_duration_minutes, active, description, show_on_public_profile, public_sort_order, public_blurb, show_public_price')
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .order('public_sort_order', { ascending: true })
            .order('name', { ascending: true }),
        supabase_js_1.supabaseAdmin
            .from('hub_service_groups')
            .select('id, name, slug, color, description, display_order, archived_at, show_on_public_profile, public_sort_order, public_blurb')
            .eq('clinic_id', clinicId)
            .is('archived_at', null)
            .order('public_sort_order', { ascending: true })
            .order('display_order', { ascending: true })
            .order('name', { ascending: true }),
        supabase_js_1.supabaseAdmin
            .from('hub_staff_members')
            .select('id, full_name, display_name, photo_url, job_title, professional_kind, specialties, active, show_on_public_profile, public_bio, public_sort_order')
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .order('public_sort_order', { ascending: true })
            .order('full_name', { ascending: true }),
    ]);
    return {
        services: servicesRes.data ?? [],
        service_groups: groupsRes.data ?? [],
        staff: staffRes.data ?? [],
    };
}
/** GET /api/hub/clinic/public-profile?clinic_id= */
exports.getHubClinicPublicProfile = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) {
        throw new errors_js_1.ValidationError('clinic_id inválido na query');
    }
    const clinicId = clinicParsed.data;
    const userId = req.user.id;
    const hasAccess = await (0, authMiddleware_js_1.checkClinicAccess)(userId, clinicId);
    if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    const { data: row, error } = await supabase_js_1.supabaseAdmin
        .from('hub_clinic_public_profiles')
        .select('*')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error) {
        console.error('[hub_public_profile] get', error);
        return res.status(500).json({ error: 'Erro ao carregar perfil público' });
    }
    const profile = row
        ? { ...row, social_links: normalizeSocialLinks(row.social_links) }
        : emptyProfile(clinicId);
    const catalog = await loadEditorCatalog(clinicId);
    const { data: clinic } = await supabase_js_1.supabaseAdmin
        .from('clinics')
        .select('id, name, phone, address, city, state, photo_url, description')
        .eq('id', clinicId)
        .maybeSingle();
    res.json({
        profile,
        clinic: clinic ?? null,
        services: catalog.services,
        service_groups: catalog.service_groups,
        staff: catalog.staff,
    });
});
/** PATCH /api/hub/clinic/public-profile?clinic_id= */
exports.patchHubClinicPublicProfile = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) {
        throw new errors_js_1.ValidationError('clinic_id inválido na query');
    }
    const bodyParsed = patchPublicProfileBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
        throw new errors_js_1.ValidationError(bodyParsed.error.issues.map((i) => i.message).join('; '));
    }
    const clinicId = clinicParsed.data;
    const userId = req.user.id;
    const hasAccess = await (0, authMiddleware_js_1.checkClinicAccess)(userId, clinicId);
    if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    const canEdit = await userCanEditClinicProfile(userId, clinicId);
    if (!canEdit) {
        return res.status(403).json({ error: 'Sem permissão para editar o perfil público.' });
    }
    const payload = bodyParsed.data;
    const { services: servicePatches, service_groups: groupPatches, staff: staffPatches, ...profileFields } = payload;
    const { data: existing } = await supabase_js_1.supabaseAdmin
        .from('hub_clinic_public_profiles')
        .select('*')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    const nextEnabled = profileFields.enabled ?? existing?.enabled ?? false;
    let nextSlug = profileFields.public_slug !== undefined
        ? profileFields.public_slug?.trim().toLowerCase() || null
        : existing?.public_slug ?? null;
    if (nextSlug === '')
        nextSlug = null;
    if (nextSlug && !SLUG_RE.test(nextSlug)) {
        if (nextEnabled) {
            throw new errors_js_1.ValidationError('Slug inválido: use 3–60 caracteres (a-z, 0-9, hífen).');
        }
        nextSlug = null;
    }
    if (nextEnabled && !nextSlug) {
        throw new errors_js_1.ValidationError('Defina um slug antes de publicar a página.');
    }
    if (nextSlug) {
        const { data: conflict } = await supabase_js_1.supabaseAdmin
            .from('hub_clinic_public_profiles')
            .select('clinic_id')
            .eq('public_slug', nextSlug)
            .neq('clinic_id', clinicId)
            .maybeSingle();
        if (conflict) {
            throw new errors_js_1.ValidationError('Este slug já está em uso. Escolha outro.');
        }
    }
    const update = {
        clinic_id: clinicId,
        updated_at: new Date().toISOString(),
    };
    if (profileFields.enabled !== undefined)
        update.enabled = profileFields.enabled;
    if (profileFields.public_slug !== undefined)
        update.public_slug = nextSlug;
    if (profileFields.headline !== undefined)
        update.headline = profileFields.headline?.trim() || null;
    if (profileFields.about !== undefined)
        update.about = profileFields.about?.trim() || null;
    if (profileFields.accent_color !== undefined)
        update.accent_color = profileFields.accent_color;
    if (profileFields.theme_preset !== undefined)
        update.theme_preset = profileFields.theme_preset;
    if (profileFields.services_display_mode !== undefined) {
        update.services_display_mode = profileFields.services_display_mode;
    }
    if (profileFields.whatsapp_phone !== undefined) {
        update.whatsapp_phone = profileFields.whatsapp_phone?.trim() || null;
    }
    if (profileFields.show_phone !== undefined)
        update.show_phone = profileFields.show_phone;
    if (profileFields.show_address !== undefined)
        update.show_address = profileFields.show_address;
    if (profileFields.show_map !== undefined)
        update.show_map = profileFields.show_map;
    if (profileFields.cta_label !== undefined)
        update.cta_label = profileFields.cta_label?.trim() || null;
    if (profileFields.cta_url !== undefined)
        update.cta_url = profileFields.cta_url?.trim() || null;
    if (profileFields.social_links !== undefined) {
        update.social_links = normalizeSocialLinks(profileFields.social_links);
    }
    if (profileFields.business_hours !== undefined)
        update.business_hours = profileFields.business_hours;
    if (profileFields.seo_title !== undefined)
        update.seo_title = profileFields.seo_title?.trim() || null;
    if (profileFields.seo_description !== undefined) {
        update.seo_description = profileFields.seo_description?.trim() || null;
    }
    if (profileFields.cover_image_url !== undefined) {
        update.cover_image_url = profileFields.cover_image_url?.trim() || null;
    }
    if (profileFields.logo_override_url !== undefined) {
        update.logo_override_url = profileFields.logo_override_url?.trim() || null;
    }
    const wasEnabled = !!existing?.enabled;
    if (nextEnabled && !wasEnabled) {
        update.published_at = new Date().toISOString();
    }
    if (!nextEnabled && wasEnabled && profileFields.enabled === false) {
        // keep published_at for history
    }
    const { data: saved, error: upsertErr } = await supabase_js_1.supabaseAdmin
        .from('hub_clinic_public_profiles')
        .upsert(update, { onConflict: 'clinic_id' })
        .select('*')
        .single();
    if (upsertErr || !saved) {
        console.error('[hub_public_profile] upsert', upsertErr);
        return res.status(500).json({ error: 'Erro ao salvar perfil público' });
    }
    if (servicePatches?.length) {
        const patchIds = servicePatches.map((s) => s.id);
        const { data: svcRows } = await supabase_js_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, service_group')
            .eq('clinic_id', clinicId)
            .in('id', patchIds)
            .is('deleted_at', null);
        const groupById = new Map((svcRows ?? []).map((r) => [
            r.id,
            r.service_group,
        ]));
        for (const s of servicePatches) {
            const svcUpdate = { updated_at: new Date().toISOString() };
            if (s.show_on_public_profile !== undefined)
                svcUpdate.show_on_public_profile = s.show_on_public_profile;
            if (s.public_sort_order !== undefined)
                svcUpdate.public_sort_order = s.public_sort_order;
            if (s.public_blurb !== undefined)
                svcUpdate.public_blurb = s.public_blurb?.trim() || null;
            if (s.show_public_price !== undefined) {
                const group = groupById.get(s.id);
                svcUpdate.show_public_price =
                    (0, publicServicePricePolicy_js_1.allowsPublicServicePrice)(group) && !!s.show_public_price;
            }
            if (Object.keys(svcUpdate).length <= 1)
                continue;
            const { error } = await supabase_js_1.supabaseAdmin
                .from('hub_service_types')
                .update(svcUpdate)
                .eq('id', s.id)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null);
            if (error) {
                console.error('[hub_public_profile] service patch', error);
                throw new errors_js_1.ValidationError('Erro ao atualizar visibilidade de serviços');
            }
        }
    }
    if (groupPatches?.length) {
        for (const g of groupPatches) {
            const gUpdate = { updated_at: new Date().toISOString() };
            if (g.show_on_public_profile !== undefined)
                gUpdate.show_on_public_profile = g.show_on_public_profile;
            if (g.public_sort_order !== undefined)
                gUpdate.public_sort_order = g.public_sort_order;
            if (g.public_blurb !== undefined)
                gUpdate.public_blurb = g.public_blurb?.trim() || null;
            if (Object.keys(gUpdate).length <= 1)
                continue;
            const { error } = await supabase_js_1.supabaseAdmin
                .from('hub_service_groups')
                .update(gUpdate)
                .eq('id', g.id)
                .eq('clinic_id', clinicId)
                .is('archived_at', null);
            if (error) {
                console.error('[hub_public_profile] group patch', error);
                throw new errors_js_1.ValidationError('Erro ao atualizar visibilidade dos grupos');
            }
        }
    }
    if (staffPatches?.length) {
        for (const s of staffPatches) {
            const stUpdate = { updated_at: new Date().toISOString() };
            if (s.show_on_public_profile !== undefined)
                stUpdate.show_on_public_profile = s.show_on_public_profile;
            if (s.public_sort_order !== undefined)
                stUpdate.public_sort_order = s.public_sort_order;
            if (s.public_bio !== undefined)
                stUpdate.public_bio = s.public_bio?.trim() || null;
            if (Object.keys(stUpdate).length <= 1)
                continue;
            const { error } = await supabase_js_1.supabaseAdmin
                .from('hub_staff_members')
                .update(stUpdate)
                .eq('id', s.id)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null);
            if (error) {
                console.error('[hub_public_profile] staff patch', error);
                throw new errors_js_1.ValidationError('Erro ao atualizar visibilidade da equipe');
            }
        }
    }
    const catalog = await loadEditorCatalog(clinicId);
    res.json({
        profile: { ...saved, social_links: normalizeSocialLinks(saved.social_links) },
        services: catalog.services,
        service_groups: catalog.service_groups,
        staff: catalog.staff,
    });
});
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
async function handlePublicAssetUpload(req, res, kind) {
    upload(req, res, async (err) => {
        if (err) {
            const msg = err instanceof Error ? err.message : 'Erro no upload';
            return res.status(400).json({ error: msg });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado (campo: photo)' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id inválido na query' });
        }
        const clinicId = clinicParsed.data;
        const userId = req.user.id;
        try {
            const hasAccess = await (0, authMiddleware_js_1.checkClinicAccess)(userId, clinicId);
            if (!hasAccess) {
                return res.status(403).json({ error: 'Acesso negado' });
            }
            const canEdit = await userCanEditClinicProfile(userId, clinicId);
            if (!canEdit) {
                return res.status(403).json({ error: 'Sem permissão para editar o perfil público.' });
            }
            const { url } = await (0, hubProfilePhotoUpload_js_1.uploadHubClinicPublicProfileAssetToStorage)({
                buffer: req.file.buffer,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
            }, clinicId, kind);
            const column = kind === 'cover' ? 'cover_image_url' : 'logo_override_url';
            const { data: saved, error } = await supabase_js_1.supabaseAdmin
                .from('hub_clinic_public_profiles')
                .upsert({
                clinic_id: clinicId,
                [column]: url,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'clinic_id' })
                .select('*')
                .single();
            if (error || !saved) {
                console.error('[hub_public_profile] asset upsert', error);
                return res.status(500).json({ error: 'Erro ao guardar imagem' });
            }
            return res.status(201).json({
                url,
                profile: { ...saved, social_links: normalizeSocialLinks(saved.social_links) },
            });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
            console.error('[hub_public_profile] upload', e);
            return res.status(500).json({ error: msg });
        }
    });
}
/** POST /api/hub/clinic/public-profile/cover?clinic_id= */
const postHubClinicPublicProfileCover = (req, res) => {
    void handlePublicAssetUpload(req, res, 'cover');
};
exports.postHubClinicPublicProfileCover = postHubClinicPublicProfileCover;
/** POST /api/hub/clinic/public-profile/logo?clinic_id= */
const postHubClinicPublicProfileLogo = (req, res) => {
    void handlePublicAssetUpload(req, res, 'logo');
};
exports.postHubClinicPublicProfileLogo = postHubClinicPublicProfileLogo;
function formatPublicPrice(amount) {
    if (typeof amount === 'number' && Number.isFinite(amount))
        return Math.round(amount * 100) / 100;
    if (typeof amount === 'string' && amount.trim()) {
        const n = Number(amount);
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    }
    return null;
}
/** GET /api/public/clinics/:slug — landing pública sanitizada */
exports.getPublicClinicProfileBySlug = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const slugRaw = String(req.params.slug || '')
        .trim()
        .toLowerCase();
    if (!slugRaw || !SLUG_RE.test(slugRaw)) {
        return res.status(404).json({ error: 'Página não encontrada' });
    }
    const { data: profile, error } = await supabase_js_1.supabaseAdmin
        .from('hub_clinic_public_profiles')
        .select('*')
        .eq('public_slug', slugRaw)
        .eq('enabled', true)
        .maybeSingle();
    if (error) {
        console.error('[hub_public_profile] public get', error);
        return res.status(500).json({ error: 'Erro ao carregar página' });
    }
    if (!profile) {
        return res.status(404).json({ error: 'Página não encontrada' });
    }
    const clinicId = profile.clinic_id;
    const { data: clinic } = await supabase_js_1.supabaseAdmin
        .from('clinics')
        .select('id, name, phone, address, city, state, photo_url, description')
        .eq('id', clinicId)
        .maybeSingle();
    if (!clinic) {
        return res.status(404).json({ error: 'Página não encontrada' });
    }
    const displayModeRaw = String(profile.services_display_mode || 'services');
    const displayMode = displayModeRaw === 'groups' || displayModeRaw === 'both' || displayModeRaw === 'services'
        ? displayModeRaw
        : 'services';
    const wantServices = displayMode === 'services' || displayMode === 'both';
    const wantGroups = displayMode === 'groups' || displayMode === 'both';
    const [servicesRes, groupsRes, staffRes, unitsRes] = await Promise.all([
        wantServices
            ? supabase_js_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, name, service_group, sale_amount, default_duration_minutes, description, public_blurb, show_public_price, public_sort_order')
                .eq('clinic_id', clinicId)
                .eq('show_on_public_profile', true)
                .eq('active', true)
                .is('deleted_at', null)
                .order('public_sort_order', { ascending: true })
                .order('name', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        wantGroups
            ? supabase_js_1.supabaseAdmin
                .from('hub_service_groups')
                .select('id, name, slug, color, description, public_blurb, public_sort_order, display_order')
                .eq('clinic_id', clinicId)
                .eq('show_on_public_profile', true)
                .is('archived_at', null)
                .order('public_sort_order', { ascending: true })
                .order('display_order', { ascending: true })
                .order('name', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        supabase_js_1.supabaseAdmin
            .from('hub_staff_members')
            .select('id, full_name, display_name, photo_url, job_title, professional_kind, specialties, public_bio, public_sort_order')
            .eq('clinic_id', clinicId)
            .eq('show_on_public_profile', true)
            .eq('active', true)
            .is('deleted_at', null)
            .order('public_sort_order', { ascending: true })
            .order('full_name', { ascending: true }),
        profile.show_address
            ? supabase_js_1.supabaseAdmin
                .from('units')
                .select('id, name, nickname, address, city, state, phone, is_main')
                .eq('clinic_id', clinicId)
                .eq('status', 'active')
                .order('is_main', { ascending: false })
                .order('name', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
    ]);
    const services = (servicesRes.data ?? []).map((s) => {
        const serviceGroup = s.service_group ?? null;
        const canShowPrice = (0, publicServicePricePolicy_js_1.allowsPublicServicePrice)(serviceGroup) && !!s.show_public_price;
        return {
            id: s.id,
            name: s.name,
            service_group: serviceGroup,
            default_duration_minutes: s.default_duration_minutes ?? null,
            blurb: (s.public_blurb || s.description || null),
            price: canShowPrice ? formatPublicPrice(s.sale_amount) : null,
            price_note: (0, publicServicePricePolicy_js_1.allowsPublicServicePrice)(serviceGroup) ? null : publicServicePricePolicy_js_1.PUBLIC_PRICE_EVALUATION_NOTE,
        };
    });
    const service_groups = (groupsRes.data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        color: g.color ?? null,
        blurb: (g.public_blurb || g.description || null),
    }));
    const staff = (staffRes.data ?? []).map((m) => ({
        id: m.id,
        name: m.display_name?.trim() || m.full_name,
        photo_url: m.photo_url ?? null,
        job_title: m.job_title,
        professional_kind: m.professional_kind,
        specialties: Array.isArray(m.specialties) ? m.specialties : [],
        bio: m.public_bio ?? null,
    }));
    const units = profile.show_address
        ? (unitsRes.data ?? []).map((u) => ({
            id: u.id,
            name: u.name ?? null,
            nickname: u.nickname ?? null,
            address: u.address ?? null,
            city: u.city ?? null,
            state: u.state ?? null,
            phone: profile.show_phone ? (u.phone ?? null) : null,
            is_main: !!u.is_main,
        }))
        : [];
    const social = normalizeSocialLinks(profile.social_links);
    res.json({
        profile: {
            slug: profile.public_slug,
            headline: profile.headline,
            about: profile.about || clinic.description || null,
            cover_image_url: profile.cover_image_url,
            logo_url: profile.logo_override_url || clinic.photo_url || null,
            accent_color: profile.accent_color,
            theme_preset: profile.theme_preset || 'warm',
            services_display_mode: displayMode,
            whatsapp_phone: profile.whatsapp_phone || null,
            phone: profile.show_phone ? clinic.phone || null : null,
            show_phone: !!profile.show_phone,
            show_address: !!profile.show_address,
            show_map: !!profile.show_map,
            address: profile.show_address
                ? {
                    line: clinic.address || null,
                    city: clinic.city || null,
                    state: clinic.state || null,
                }
                : null,
            cta_label: profile.cta_label,
            cta_url: profile.cta_url,
            social_links: social,
            business_hours: profile.business_hours || {},
            seo_title: profile.seo_title || clinic.name,
            seo_description: profile.seo_description || profile.headline || profile.about || null,
            clinic_name: clinic.name,
        },
        services,
        service_groups,
        staff,
        units,
    });
});
