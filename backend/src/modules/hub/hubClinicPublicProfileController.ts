import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { checkClinicAccess } from '../../middleware/authMiddleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError } from '../../utils/errors.js';
import { uploadHubClinicPublicProfileAssetToStorage } from '../../utils/hubProfilePhotoUpload.js';
import {
  allowsPublicServicePrice,
  PUBLIC_PRICE_EVALUATION_NOTE,
} from './publicServicePricePolicy.js';

const uuidStr = z.string().uuid();

const CLINIC_EDIT_ROLES = new Set(['CADMIN', 'CMANAGER']);

/** 3–60 chars: começa/termina com alfanumérico; hífens no meio. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

const themePresetSchema = z.enum(['warm', 'clean', 'dark']);
const servicesDisplayModeSchema = z.enum(['groups', 'services', 'both']);

const socialLinksSchema = z
  .object({
    instagram: z.string().trim().max(500).optional().nullable(),
    facebook: z.string().trim().max(500).optional().nullable(),
    tiktok: z.string().trim().max(500).optional().nullable(),
    youtube: z.string().trim().max(500).optional().nullable(),
    site: z.string().trim().max(500).optional().nullable(),
  })
  .strict()
  .optional();

const dayHoursSchema = z
  .object({
    closed: z.boolean().optional(),
    open: z.string().trim().max(8).optional().nullable(),
    close: z.string().trim().max(8).optional().nullable(),
  })
  .strict();

const businessHoursSchema = z
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

const servicePublicPatchSchema = z
  .object({
    id: uuidStr,
    show_on_public_profile: z.boolean().optional(),
    public_sort_order: z.number().int().min(0).max(10_000).optional(),
    public_blurb: z.string().trim().max(500).optional().nullable(),
    show_public_price: z.boolean().optional(),
  })
  .strict();

const staffPublicPatchSchema = z
  .object({
    id: uuidStr,
    show_on_public_profile: z.boolean().optional(),
    public_sort_order: z.number().int().min(0).max(10_000).optional(),
    public_bio: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const groupPublicPatchSchema = z
  .object({
    id: uuidStr,
    show_on_public_profile: z.boolean().optional(),
    public_sort_order: z.number().int().min(0).max(10_000).optional(),
    public_blurb: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

const patchPublicProfileBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    public_slug: z.string().trim().toLowerCase().max(60).optional().nullable(),
    headline: z.string().trim().max(200).optional().nullable(),
    about: z.string().trim().max(4000).optional().nullable(),
    accent_color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor inválida (#RRGGBB)' })
      .optional()
      .nullable(),
    theme_preset: themePresetSchema.optional(),
    services_display_mode: servicesDisplayModeSchema.optional(),
    whatsapp_phone: z.string().trim().max(30).optional().nullable(),
    show_phone: z.boolean().optional(),
    show_address: z.boolean().optional(),
    show_map: z.boolean().optional(),
    cta_label: z.string().trim().max(80).optional().nullable(),
    cta_url: z.string().trim().max(2000).optional().nullable(),
    social_links: socialLinksSchema,
    business_hours: businessHoursSchema,
    seo_title: z.string().trim().max(120).optional().nullable(),
    seo_description: z.string().trim().max(320).optional().nullable(),
    cover_image_url: z.string().trim().max(2000).optional().nullable(),
    logo_override_url: z.string().trim().max(2000).optional().nullable(),
    services: z.array(servicePublicPatchSchema).max(200).optional(),
    service_groups: z.array(groupPublicPatchSchema).max(100).optional(),
    staff: z.array(staffPublicPatchSchema).max(200).optional(),
  })
  .strict();

async function userCanEditClinicProfile(userId: string, clinicId: string): Promise<boolean> {
  if (userId === clinicId) return true;
  const { data } = await supabaseAdmin
    .from('clinic_users')
    .select('role')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .maybeSingle();
  return !!data?.role && CLINIC_EDIT_ROLES.has(String(data.role).toUpperCase());
}

function emptyProfile(clinicId: string) {
  return {
    clinic_id: clinicId,
    enabled: false,
    public_slug: null as string | null,
    headline: null as string | null,
    about: null as string | null,
    cover_image_url: null as string | null,
    logo_override_url: null as string | null,
    accent_color: null as string | null,
    theme_preset: 'warm' as const,
    services_display_mode: 'services' as const,
    whatsapp_phone: null as string | null,
    show_phone: true,
    show_address: true,
    show_map: false,
    cta_label: null as string | null,
    cta_url: null as string | null,
    social_links: {} as Record<string, string | null>,
    business_hours: {} as Record<string, unknown>,
    seo_title: null as string | null,
    seo_description: null as string | null,
    published_at: null as string | null,
    created_at: null as string | null,
    updated_at: null as string | null,
  };
}

function normalizeSocialLinks(raw: unknown): Record<string, string | null> {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string | null> = {};
  for (const key of ['instagram', 'facebook', 'tiktok', 'youtube', 'site'] as const) {
    const v = src[key];
    out[key] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return out;
}

async function loadEditorCatalog(clinicId: string) {
  const [servicesRes, groupsRes, staffRes] = await Promise.all([
    supabaseAdmin
      .from('hub_service_types')
      .select(
        'id, name, service_group, sale_amount, default_duration_minutes, active, description, show_on_public_profile, public_sort_order, public_blurb, show_public_price',
      )
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('public_sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('hub_service_groups')
      .select(
        'id, name, slug, color, description, display_order, archived_at, show_on_public_profile, public_sort_order, public_blurb',
      )
      .eq('clinic_id', clinicId)
      .is('archived_at', null)
      .order('public_sort_order', { ascending: true })
      .order('display_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('hub_staff_members')
      .select(
        'id, full_name, display_name, photo_url, job_title, professional_kind, specialties, active, show_on_public_profile, public_bio, public_sort_order',
      )
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
export const getHubClinicPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
  if (!clinicParsed.success) {
    throw new ValidationError('clinic_id inválido na query');
  }
  const clinicId = clinicParsed.data;
  const userId = req.user!.id;

  const hasAccess = await checkClinicAccess(userId, clinicId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data: row, error } = await supabaseAdmin
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

  const { data: clinic } = await supabaseAdmin
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
export const patchHubClinicPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
  if (!clinicParsed.success) {
    throw new ValidationError('clinic_id inválido na query');
  }

  const bodyParsed = patchPublicProfileBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw new ValidationError(bodyParsed.error.issues.map((i) => i.message).join('; '));
  }

  const clinicId = clinicParsed.data;
  const userId = req.user!.id;

  const hasAccess = await checkClinicAccess(userId, clinicId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const canEdit = await userCanEditClinicProfile(userId, clinicId);
  if (!canEdit) {
    return res.status(403).json({ error: 'Sem permissão para editar o perfil público.' });
  }

  const payload = bodyParsed.data;
  const {
    services: servicePatches,
    service_groups: groupPatches,
    staff: staffPatches,
    ...profileFields
  } = payload;

  const { data: existing } = await supabaseAdmin
    .from('hub_clinic_public_profiles')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  const nextEnabled = profileFields.enabled ?? existing?.enabled ?? false;
  let nextSlug =
    profileFields.public_slug !== undefined
      ? profileFields.public_slug?.trim().toLowerCase() || null
      : (existing?.public_slug as string | null | undefined) ?? null;

  if (nextSlug === '') nextSlug = null;

  if (nextSlug && !SLUG_RE.test(nextSlug)) {
    if (nextEnabled) {
      throw new ValidationError('Slug inválido: use 3–60 caracteres (a-z, 0-9, hífen).');
    }
    nextSlug = null;
  }
  if (nextEnabled && !nextSlug) {
    throw new ValidationError('Defina um slug antes de publicar a página.');
  }

  if (nextSlug) {
    const { data: conflict } = await supabaseAdmin
      .from('hub_clinic_public_profiles')
      .select('clinic_id')
      .eq('public_slug', nextSlug)
      .neq('clinic_id', clinicId)
      .maybeSingle();
    if (conflict) {
      throw new ValidationError('Este slug já está em uso. Escolha outro.');
    }
  }

  const update: Record<string, unknown> = {
    clinic_id: clinicId,
    updated_at: new Date().toISOString(),
  };

  if (profileFields.enabled !== undefined) update.enabled = profileFields.enabled;
  if (profileFields.public_slug !== undefined) update.public_slug = nextSlug;
  if (profileFields.headline !== undefined) update.headline = profileFields.headline?.trim() || null;
  if (profileFields.about !== undefined) update.about = profileFields.about?.trim() || null;
  if (profileFields.accent_color !== undefined) update.accent_color = profileFields.accent_color;
  if (profileFields.theme_preset !== undefined) update.theme_preset = profileFields.theme_preset;
  if (profileFields.services_display_mode !== undefined) {
    update.services_display_mode = profileFields.services_display_mode;
  }
  if (profileFields.whatsapp_phone !== undefined) {
    update.whatsapp_phone = profileFields.whatsapp_phone?.trim() || null;
  }
  if (profileFields.show_phone !== undefined) update.show_phone = profileFields.show_phone;
  if (profileFields.show_address !== undefined) update.show_address = profileFields.show_address;
  if (profileFields.show_map !== undefined) update.show_map = profileFields.show_map;
  if (profileFields.cta_label !== undefined) update.cta_label = profileFields.cta_label?.trim() || null;
  if (profileFields.cta_url !== undefined) update.cta_url = profileFields.cta_url?.trim() || null;
  if (profileFields.social_links !== undefined) {
    update.social_links = normalizeSocialLinks(profileFields.social_links);
  }
  if (profileFields.business_hours !== undefined) update.business_hours = profileFields.business_hours;
  if (profileFields.seo_title !== undefined) update.seo_title = profileFields.seo_title?.trim() || null;
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

  const { data: saved, error: upsertErr } = await supabaseAdmin
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
    const { data: svcRows } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, service_group')
      .eq('clinic_id', clinicId)
      .in('id', patchIds)
      .is('deleted_at', null);
    const groupById = new Map(
      ((svcRows ?? []) as Array<{ id: string; service_group: string | null }>).map((r) => [
        r.id,
        r.service_group,
      ]),
    );

    for (const s of servicePatches) {
      const svcUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (s.show_on_public_profile !== undefined) svcUpdate.show_on_public_profile = s.show_on_public_profile;
      if (s.public_sort_order !== undefined) svcUpdate.public_sort_order = s.public_sort_order;
      if (s.public_blurb !== undefined) svcUpdate.public_blurb = s.public_blurb?.trim() || null;
      if (s.show_public_price !== undefined) {
        const group = groupById.get(s.id);
        svcUpdate.show_public_price =
          allowsPublicServicePrice(group) && !!s.show_public_price;
      }
      if (Object.keys(svcUpdate).length <= 1) continue;
      const { error } = await supabaseAdmin
        .from('hub_service_types')
        .update(svcUpdate)
        .eq('id', s.id)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
      if (error) {
        console.error('[hub_public_profile] service patch', error);
        throw new ValidationError('Erro ao atualizar visibilidade de serviços');
      }
    }
  }

  if (groupPatches?.length) {
    for (const g of groupPatches) {
      const gUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (g.show_on_public_profile !== undefined) gUpdate.show_on_public_profile = g.show_on_public_profile;
      if (g.public_sort_order !== undefined) gUpdate.public_sort_order = g.public_sort_order;
      if (g.public_blurb !== undefined) gUpdate.public_blurb = g.public_blurb?.trim() || null;
      if (Object.keys(gUpdate).length <= 1) continue;
      const { error } = await supabaseAdmin
        .from('hub_service_groups')
        .update(gUpdate)
        .eq('id', g.id)
        .eq('clinic_id', clinicId)
        .is('archived_at', null);
      if (error) {
        console.error('[hub_public_profile] group patch', error);
        throw new ValidationError('Erro ao atualizar visibilidade dos grupos');
      }
    }
  }

  if (staffPatches?.length) {
    for (const s of staffPatches) {
      const stUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (s.show_on_public_profile !== undefined) stUpdate.show_on_public_profile = s.show_on_public_profile;
      if (s.public_sort_order !== undefined) stUpdate.public_sort_order = s.public_sort_order;
      if (s.public_bio !== undefined) stUpdate.public_bio = s.public_bio?.trim() || null;
      if (Object.keys(stUpdate).length <= 1) continue;
      const { error } = await supabaseAdmin
        .from('hub_staff_members')
        .update(stUpdate)
        .eq('id', s.id)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
      if (error) {
        console.error('[hub_public_profile] staff patch', error);
        throw new ValidationError('Erro ao atualizar visibilidade da equipe');
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas PNG, JPG ou WEBP são permitidos.'));
    }
  },
}).single('photo');

async function handlePublicAssetUpload(
  req: Request,
  res: Response,
  kind: 'cover' | 'logo',
): Promise<void> {
  upload(req, res, async (err: unknown) => {
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
    const userId = req.user!.id;

    try {
      const hasAccess = await checkClinicAccess(userId, clinicId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      const canEdit = await userCanEditClinicProfile(userId, clinicId);
      if (!canEdit) {
        return res.status(403).json({ error: 'Sem permissão para editar o perfil público.' });
      }

      const { url } = await uploadHubClinicPublicProfileAssetToStorage(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        },
        clinicId,
        kind,
      );

      const column = kind === 'cover' ? 'cover_image_url' : 'logo_override_url';
      const { data: saved, error } = await supabaseAdmin
        .from('hub_clinic_public_profiles')
        .upsert(
          {
            clinic_id: clinicId,
            [column]: url,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'clinic_id' },
        )
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
      console.error('[hub_public_profile] upload', e);
      return res.status(500).json({ error: msg });
    }
  });
}

/** POST /api/hub/clinic/public-profile/cover?clinic_id= */
export const postHubClinicPublicProfileCover = (req: Request, res: Response): void => {
  void handlePublicAssetUpload(req, res, 'cover');
};

/** POST /api/hub/clinic/public-profile/logo?clinic_id= */
export const postHubClinicPublicProfileLogo = (req: Request, res: Response): void => {
  void handlePublicAssetUpload(req, res, 'logo');
};

function formatPublicPrice(amount: unknown): number | null {
  if (typeof amount === 'number' && Number.isFinite(amount)) return Math.round(amount * 100) / 100;
  if (typeof amount === 'string' && amount.trim()) {
    const n = Number(amount);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

/** GET /api/public/clinics/:slug — landing pública sanitizada */
export const getPublicClinicProfileBySlug = asyncHandler(async (req: Request, res: Response) => {
  const slugRaw = String(req.params.slug || '')
    .trim()
    .toLowerCase();
  if (!slugRaw || !SLUG_RE.test(slugRaw)) {
    return res.status(404).json({ error: 'Página não encontrada' });
  }

  const { data: profile, error } = await supabaseAdmin
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

  const clinicId = profile.clinic_id as string;

  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('id, name, phone, address, city, state, photo_url, description')
    .eq('id', clinicId)
    .maybeSingle();

  if (!clinic) {
    return res.status(404).json({ error: 'Página não encontrada' });
  }

  const displayModeRaw = String(profile.services_display_mode || 'services');
  const displayMode =
    displayModeRaw === 'groups' || displayModeRaw === 'both' || displayModeRaw === 'services'
      ? displayModeRaw
      : 'services';
  const wantServices = displayMode === 'services' || displayMode === 'both';
  const wantGroups = displayMode === 'groups' || displayMode === 'both';

  const [servicesRes, groupsRes, staffRes, unitsRes] = await Promise.all([
    wantServices
      ? supabaseAdmin
          .from('hub_service_types')
          .select(
            'id, name, service_group, sale_amount, default_duration_minutes, description, public_blurb, show_public_price, public_sort_order',
          )
          .eq('clinic_id', clinicId)
          .eq('show_on_public_profile', true)
          .eq('active', true)
          .is('deleted_at', null)
          .order('public_sort_order', { ascending: true })
          .order('name', { ascending: true })
      : Promise.resolve({ data: [] as unknown[], error: null }),
    wantGroups
      ? supabaseAdmin
          .from('hub_service_groups')
          .select('id, name, slug, color, description, public_blurb, public_sort_order, display_order')
          .eq('clinic_id', clinicId)
          .eq('show_on_public_profile', true)
          .is('archived_at', null)
          .order('public_sort_order', { ascending: true })
          .order('display_order', { ascending: true })
          .order('name', { ascending: true })
      : Promise.resolve({ data: [] as unknown[], error: null }),
    supabaseAdmin
      .from('hub_staff_members')
      .select(
        'id, full_name, display_name, photo_url, job_title, professional_kind, specialties, public_bio, public_sort_order',
      )
      .eq('clinic_id', clinicId)
      .eq('show_on_public_profile', true)
      .eq('active', true)
      .is('deleted_at', null)
      .order('public_sort_order', { ascending: true })
      .order('full_name', { ascending: true }),
    profile.show_address
      ? supabaseAdmin
          .from('units')
          .select('id, name, nickname, address, city, state, phone, is_main')
          .eq('clinic_id', clinicId)
          .eq('status', 'active')
          .order('is_main', { ascending: false })
          .order('name', { ascending: true })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const services = ((servicesRes.data ?? []) as Array<Record<string, unknown>>).map((s) => {
    const serviceGroup = (s.service_group as string | null) ?? null;
    const canShowPrice = allowsPublicServicePrice(serviceGroup) && !!s.show_public_price;
    return {
      id: s.id as string,
      name: s.name as string,
      service_group: serviceGroup,
      default_duration_minutes: (s.default_duration_minutes as number | null) ?? null,
      blurb: ((s.public_blurb as string | null) || (s.description as string | null) || null) as
        | string
        | null,
      price: canShowPrice ? formatPublicPrice(s.sale_amount) : null,
      price_note: allowsPublicServicePrice(serviceGroup) ? null : PUBLIC_PRICE_EVALUATION_NOTE,
    };
  });

  const service_groups = ((groupsRes.data ?? []) as Array<Record<string, unknown>>).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    slug: g.slug as string,
    color: (g.color as string | null) ?? null,
    blurb: ((g.public_blurb as string | null) || (g.description as string | null) || null) as
      | string
      | null,
  }));

  const staff = (staffRes.data ?? []).map((m) => ({
    id: m.id,
    name: (m.display_name as string | null)?.trim() || m.full_name,
    photo_url: m.photo_url ?? null,
    job_title: m.job_title,
    professional_kind: m.professional_kind,
    specialties: Array.isArray(m.specialties) ? m.specialties : [],
    bio: m.public_bio ?? null,
  }));

  const units = profile.show_address
    ? (unitsRes.data ?? []).map((u) => ({
        id: (u as { id: string }).id,
        name: (u as { name?: string | null }).name ?? null,
        nickname: (u as { nickname?: string | null }).nickname ?? null,
        address: (u as { address?: string | null }).address ?? null,
        city: (u as { city?: string | null }).city ?? null,
        state: (u as { state?: string | null }).state ?? null,
        phone: profile.show_phone ? ((u as { phone?: string | null }).phone ?? null) : null,
        is_main: !!(u as { is_main?: boolean }).is_main,
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
