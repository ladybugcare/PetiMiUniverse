import type { Request, Response } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../../config/supabase';
import { validateFile, sanitizeFilename } from '../../utils/fileValidation.js';
import { BOARDING_MIGRATION_HINT, loadReservation, missingTable } from './boardingCareService';
import { resolveServicePriceForPet, todayYmdSaoPaulo } from './boardingPricing';
import { UUID_RE } from './hubBoardingDrawerController';
import { syncOpenComandasAfterBoardingCheckedOut } from './hubComandasController';
import {
  createBelongingSchema,
  createExtraSchema,
  createIncidentSchema,
  patchBelongingSchema,
  patchIncidentSchema,
  uuidStr,
} from './hubBoardingSchemas';

function clinicFrom(req: Request): string | null {
  const raw = (req.body?.clinic_id as string | undefined) ?? (req.query as { clinic_id?: string }).clinic_id;
  const p = uuidStr.safeParse(raw);
  return p.success ? p.data : null;
}

function badId(id: string | undefined): boolean {
  return !id || !UUID_RE.test(id);
}

function dbError(res: Response, error: { message?: string; code?: string }) {
  if (missingTable(error)) return res.status(503).json({ error: BOARDING_MIGRATION_HINT });
  return res.status(500).json({ error: error.message });
}

async function listByReservation(req: Request, res: Response, table: string, order: string, ascending: boolean, key: string) {
  try {
    const clinicId = clinicFrom(req);
    const { id } = req.params;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id inválido' });
    if (badId(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('hub_boarding_reservation_id', id)
      .is('deleted_at', null)
      .order(order, { ascending });
    if (error) {
      if (missingTable(error)) return res.json({ [key]: [], migrations_ready: false });
      return res.status(500).json({ error: error.message });
    }
    return res.json({ [key]: data ?? [] });
  } catch (e: unknown) {
    console.error(`list ${table}`, e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar' });
  }
}

// ─── Intercorrências ──────────────────────────────────────────────────────

export const getHubBoardingIncidents = (req: Request, res: Response) =>
  listByReservation(req, res, 'hub_boarding_incidents', 'occurred_at', false, 'incidents');

export const postHubBoardingIncident = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (badId(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const parsed = createIncidentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, tutor_notified, ...rest } = parsed.data;
    const reservation = await loadReservation(clinic_id, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const { data, error } = await supabaseAdmin
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
    if (error) return dbError(res, error);
    return res.status(201).json({ incident: data });
  } catch (e: unknown) {
    console.error('postHubBoardingIncident', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao registrar intercorrência' });
  }
};

export const patchHubBoardingIncident = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (badId(id)) return res.status(400).json({ error: 'Intercorrência inválida' });
    const parsed = patchIncidentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, status, tutor_notified, ...rest } = parsed.data;

    const update: Record<string, unknown> = { ...rest };
    if (status) {
      update.status = status;
      if (status === 'resolved') {
        update.resolved_at = new Date().toISOString();
        update.resolved_by_user_id = req.user?.id ?? null;
      } else {
        update.resolved_at = null;
        update.resolved_by_user_id = null;
      }
    }
    if (tutor_notified !== undefined) update.tutor_notified_at = tutor_notified ? new Date().toISOString() : null;

    const { data, error } = await supabaseAdmin
      .from('hub_boarding_incidents')
      .update(update)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'Intercorrência não encontrada' });
    return res.json({ incident: data });
  } catch (e: unknown) {
    console.error('patchHubBoardingIncident', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar intercorrência' });
  }
};

// ─── Pertences ────────────────────────────────────────────────────────────

export const getHubBoardingBelongings = (req: Request, res: Response) =>
  listByReservation(req, res, 'hub_boarding_belongings', 'created_at', true, 'belongings');

export const postHubBoardingBelonging = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (badId(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const parsed = createBelongingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, ...rest } = parsed.data;
    const reservation = await loadReservation(clinic_id, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const { data, error } = await supabaseAdmin
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
    if (error) return dbError(res, error);
    return res.status(201).json({ belonging: data });
  } catch (e: unknown) {
    console.error('postHubBoardingBelonging', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao registrar pertence' });
  }
};

export const patchHubBoardingBelonging = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (badId(id)) return res.status(400).json({ error: 'Pertence inválido' });
    const parsed = patchBelongingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, checkout_status, ...rest } = parsed.data;
    const update: Record<string, unknown> = { ...rest };
    if (checkout_status) {
      update.checkout_status = checkout_status;
      update.checkout_checked_at = checkout_status === 'pending' ? null : new Date().toISOString();
      update.checkout_checked_by_user_id = checkout_status === 'pending' ? null : req.user?.id ?? null;
    }
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_belongings')
      .update(update)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'Pertence não encontrado' });
    return res.json({ belonging: data });
  } catch (e: unknown) {
    console.error('patchHubBoardingBelonging', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar pertence' });
  }
};

async function softDelete(req: Request, res: Response, table: string, label: string) {
  try {
    const clinicId = clinicFrom(req);
    const { id } = req.params;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id inválido' });
    if (badId(id)) return res.status(400).json({ error: `${label} inválido` });
    const { data, error } = await supabaseAdmin
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: `${label} não encontrado` });
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error(`delete ${table}`, e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao remover' });
  }
}

export const deleteHubBoardingBelonging = (req: Request, res: Response) =>
  softDelete(req, res, 'hub_boarding_belongings', 'Pertence');

// ─── Adicionais (cobrados na comanda) ─────────────────────────────────────

export const getHubBoardingExtras = (req: Request, res: Response) =>
  listByReservation(req, res, 'hub_boarding_extras', 'created_at', true, 'extras');

export const postHubBoardingExtra = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (badId(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const parsed = createExtraSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, hub_service_type_id, quantity, service_date } = parsed.data;
    const reservation = await loadReservation(clinic_id, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status === 'cancelled' || reservation.status === 'no_show') {
      return res.status(422).json({ error: 'Reserva cancelada não recebe adicionais' });
    }

    let description = parsed.data.description?.trim() ?? '';
    let unitCents = parsed.data.unit_amount_cents ?? null;
    if (hub_service_type_id) {
      const priced = await resolveServicePriceForPet({
        clinicId: clinic_id,
        petId: reservation.pet_id,
        serviceTypeId: hub_service_type_id,
        refYmd: service_date ?? todayYmdSaoPaulo(),
      });
      if (!priced) return res.status(404).json({ error: 'Serviço não encontrado' });
      if (!description) description = String(priced.service.name ?? 'Adicional');
      if (unitCents == null) unitCents = Math.round(priced.sale * 100);
    }

    const { data, error } = await supabaseAdmin
      .from('hub_boarding_extras')
      .insert({
        clinic_id,
        hub_boarding_reservation_id: id,
        hub_service_type_id: hub_service_type_id ?? null,
        description,
        quantity,
        unit_amount_cents: unitCents ?? 0,
        service_date: service_date ?? todayYmdSaoPaulo(),
        created_by_user_id: req.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) return dbError(res, error);
    void syncOpenComandasAfterBoardingCheckedOut(clinic_id, id);
    return res.status(201).json({ extra: data });
  } catch (e: unknown) {
    console.error('postHubBoardingExtra', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao lançar adicional' });
  }
};

export const deleteHubBoardingExtra = async (req: Request, res: Response) => {
  try {
    const clinicId = clinicFrom(req);
    const { id } = req.params;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id inválido' });
    if (badId(id)) return res.status(400).json({ error: 'Adicional inválido' });
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_extras')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .select('id, hub_boarding_reservation_id')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'Adicional não encontrado' });
    const reservationId = data.hub_boarding_reservation_id as string | null;
    if (reservationId) void syncOpenComandasAfterBoardingCheckedOut(clinicId, reservationId);
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('deleteHubBoardingExtra', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao remover' });
  }
};

// ─── Fotos ────────────────────────────────────────────────────────────────

const MEDIA_BUCKET = 'hub-boarding-media';
const MEDIA_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MEDIA_MAX = 10 * 1024 * 1024;

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX },
  fileFilter: (_req, file, cb) => {
    if (MEDIA_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Envie uma foto em JPG, PNG ou WEBP.'));
  },
}).single('file');

async function ensureMediaBucket(): Promise<void> {
  const { error } = await supabaseAdmin.storage.createBucket(MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: MEDIA_MAX,
    allowedMimeTypes: MEDIA_MIMES,
  });
  if (!error) return;
  const m = (error.message ?? '').toLowerCase();
  if (m.includes('already exists') || m.includes('duplicate') || m.includes('already taken')) return;
  throw new Error(`Não foi possível preparar o armazenamento de fotos (${error.message}). ${BOARDING_MIGRATION_HINT}`);
}

export const getHubBoardingMedia = (req: Request, res: Response) =>
  listByReservation(req, res, 'hub_boarding_media', 'created_at', false, 'media');

/** POST multipart: file + caption?, task_id?, incident_id?. clinic_id vai na query (permissão). */
export const uploadHubBoardingMedia = (req: Request, res: Response): void => {
  mediaUpload(req, res, async (err: unknown) => {
    if (err) return res.status(400).json({ error: err instanceof Error ? err.message : 'Erro no upload' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
    const clinicId = clinicFrom(req);
    const { id } = req.params;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id inválido' });
    if (badId(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    try {
      const reservation = await loadReservation(clinicId, id);
      if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

      validateFile(req.file.buffer, req.file.mimetype, req.file.originalname, {
        maxSize: MEDIA_MAX,
        allowedTypes: MEDIA_MIMES,
        requireSignature: true,
      });
      await ensureMediaBucket();
      const safe = sanitizeFilename(req.file.originalname);
      const ext = safe.includes('.') ? safe.split('.').pop() : 'jpg';
      const path = `${clinicId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from(MEDIA_BUCKET)
        .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      if (upErr) return res.status(500).json({ error: upErr.message || 'Erro ao enviar foto' });
      const { data: pub } = supabaseAdmin.storage.from(MEDIA_BUCKET).getPublicUrl(path);

      const taskId = uuidStr.safeParse(req.body?.task_id);
      const incidentId = uuidStr.safeParse(req.body?.incident_id);
      const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, 300) : '';
      const { data, error } = await supabaseAdmin
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
      if (error) return dbError(res, error);
      return res.status(201).json({ media: data });
    } catch (e: unknown) {
      console.error('uploadHubBoardingMedia', e);
      return res.status(500).json({ error: (e as Error)?.message || 'Erro ao enviar foto' });
    }
  });
};

export const deleteHubBoardingMedia = async (req: Request, res: Response) => {
  try {
    const clinicId = clinicFrom(req);
    const { id } = req.params;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id inválido' });
    if (badId(id)) return res.status(400).json({ error: 'Foto inválida' });
    const { data, error } = await supabaseAdmin
      .from('hub_boarding_media')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .select('storage_path')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'Foto não encontrada' });
    void supabaseAdmin.storage.from(MEDIA_BUCKET).remove([data.storage_path as string]);
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('deleteHubBoardingMedia', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao remover foto' });
  }
};
