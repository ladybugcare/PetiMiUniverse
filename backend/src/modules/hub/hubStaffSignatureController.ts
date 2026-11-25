import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  uploadHubStaffPhotoToStorage,
  type HubStaffImageKind,
} from '../../utils/hubStaffPhotoUpload';
import { resolveStaffIdForUser } from './hubStaffResolve';

const uuidStr = z.string().uuid();

const STAFF_STAMP_SELECT =
  'id, clinic_id, full_name, display_name, photo_url, signature_image_url, stamp_image_url, crmv, crmv_uf, job_title, professional_kind, clinic_user_id';

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

type StampKind = 'signature' | 'stamp';

const KIND_COLUMN: Record<StampKind, 'signature_image_url' | 'stamp_image_url'> = {
  signature: 'signature_image_url',
  stamp: 'stamp_image_url',
};

type UploadedImageFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

function runMulter(req: Request, res: Response): Promise<UploadedImageFile> {
  return new Promise((resolve, reject) => {
    upload(req, res, (err: unknown) => {
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

async function uploadKindImage(
  file: UploadedImageFile,
  clinicId: string,
  kind: HubStaffImageKind,
  staffId?: string | null,
): Promise<{ url: string; path: string }> {
  return uploadHubStaffPhotoToStorage(
    {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
    },
    clinicId,
    { kind, staffId },
  );
}

/**
 * POST /api/hub/staff/signature|stamp?clinic_id=...
 * multipart field `photo` — exige hub.staff.write (admin/gerente).
 * Devolve URL pública; a UI grava no PATCH do staff.
 */
export const postHubStaffStampImage = (kind: StampKind) => (req: Request, res: Response): void => {
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
      const status = /arquivo|permitidos|inválido/i.test(msg) ? 400 : 500;
      if (status === 500) console.error(`[hub_staff] ${kind} upload`, e);
      res.status(status).json({ error: msg });
    }
  })();
};

/**
 * GET /api/hub/staff/me?clinic_id=...
 * Staff vinculado ao usuário logado (assinatura/carimbo para Meu perfil).
 */
export const getHubStaffMe = async (req: Request, res: Response): Promise<void> => {
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
    const staffId = await resolveStaffIdForUser(clinicParsed.data, userId);
    if (!staffId) {
      res.status(200).json({ staff: null, linked: false });
      return;
    }
    const { data, error } = await supabaseAdmin
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao carregar perfil da equipe';
    console.error('[hub_staff] me get', e);
    res.status(500).json({ error: msg });
  }
};

/**
 * POST /api/hub/staff/me/signature|stamp?clinic_id=...
 * Upload self-service: grava a URL no próprio hub_staff_members.
 */
export const postHubStaffMeStampImage = (kind: StampKind) => (req: Request, res: Response): void => {
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
      const staffId = await resolveStaffIdForUser(clinicParsed.data, userId);
      if (!staffId) {
        res.status(404).json({
          error:
            'Seu usuário não está vinculado a um profissional na Equipe. Peça à clínica para vincular o acesso.',
        });
        return;
      }
      const uploaded = await uploadKindImage(file, clinicParsed.data, kind, staffId);
      const column = KIND_COLUMN[kind];
      const { data, error } = await supabaseAdmin
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
      const status = /arquivo|permitidos|vinculado/i.test(msg) ? 400 : 500;
      if (status === 500) console.error(`[hub_staff] me ${kind} upload`, e);
      res.status(status).json({ error: msg });
    }
  })();
};

/**
 * PATCH /api/hub/staff/me?clinic_id=...
 * Body: { signature_image_url?: string|null, stamp_image_url?: string|null }
 * Permite limpar imagens no Meu perfil.
 */
export const patchHubStaffMe = async (req: Request, res: Response): Promise<void> => {
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
    const staffId = await resolveStaffIdForUser(clinicParsed.data, userId);
    if (!staffId) {
      res.status(404).json({
        error:
          'Seu usuário não está vinculado a um profissional na Equipe. Peça à clínica para vincular o acesso.',
      });
      return;
    }

    const schema = z
      .object({
        signature_image_url: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
        stamp_image_url: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
      })
      .strict();
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
      return;
    }
    const patch: Record<string, string | null> = {};
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

    const { data, error } = await supabaseAdmin
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao atualizar perfil';
    console.error('[hub_staff] me patch', e);
    res.status(500).json({ error: msg });
  }
};
