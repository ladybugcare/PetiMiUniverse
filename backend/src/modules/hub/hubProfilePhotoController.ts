import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { checkClinicAccess } from '../../middleware/authMiddleware.js';
import {
  uploadHubClinicProfilePhotoToStorage,
  uploadHubUserProfilePhotoToStorage,
} from '../../utils/hubProfilePhotoUpload.js';

const uuidStr = z.string().uuid();

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

const CLINIC_PHOTO_ROLES = new Set(['CADMIN', 'CMANAGER']);

async function userCanEditClinicPhoto(userId: string, clinicId: string): Promise<boolean> {
  if (userId === clinicId) return true;
  const { data } = await supabaseAdmin
    .from('clinic_users')
    .select('role')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .maybeSingle();
  return !!data?.role && CLINIC_PHOTO_ROLES.has(String(data.role).toUpperCase());
}

/** POST /api/hub/profile/me/photo — foto do utilizador (user_metadata.photo_url) */
export const postHubUserProfilePhoto = (req: Request, res: Response): void => {
  upload(req, res, async (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado (campo: photo)' });
    }

    const userId = req.user!.id;

    try {
      const { url } = await uploadHubUserProfilePhotoToStorage(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        },
        userId,
      );

      const { data: authUser, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (getErr || !authUser?.user) {
        return res.status(500).json({ error: 'Erro ao carregar utilizador' });
      }

      const meta = (authUser.user.user_metadata || {}) as Record<string, unknown>;
      const { data: updated, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...meta,
          photo_url: url,
          avatar_url: url,
        },
      });

      if (updateErr || !updated.user) {
        console.error('[hub_profile_photo] update user metadata', updateErr);
        return res.status(500).json({ error: 'Erro ao guardar foto no perfil' });
      }

      return res.status(201).json({
        url,
        user: updated.user,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
      console.error('[hub_profile_photo] user', e);
      return res.status(500).json({ error: msg });
    }
  });
};

/** POST /api/hub/clinic/profile/photo?clinic_id=... — logótipo da clínica (clinics.photo_url) */
export const postHubClinicProfilePhoto = (req: Request, res: Response): void => {
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

      const canEdit = await userCanEditClinicPhoto(userId, clinicId);
      if (!canEdit) {
        return res.status(403).json({ error: 'Sem permissão para alterar a foto da clínica.' });
      }

      const { url } = await uploadHubClinicProfilePhotoToStorage(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        },
        clinicId,
      );

      const { data: clinic, error: clinicErr } = await supabaseAdmin
        .from('clinics')
        .update({ photo_url: url, updated_at: new Date().toISOString() })
        .eq('id', clinicId)
        .select('*')
        .maybeSingle();

      if (clinicErr || !clinic) {
        console.error('[hub_profile_photo] clinic update', clinicErr);
        return res.status(500).json({ error: 'Erro ao guardar foto da clínica' });
      }

      return res.status(201).json({ url, clinic });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
      console.error('[hub_profile_photo] clinic', e);
      return res.status(500).json({ error: msg });
    }
  });
};
