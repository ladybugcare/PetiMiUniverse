import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { uploadHubStaffPhotoToStorage } from '../../utils/hubStaffPhotoUpload';

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

/**
 * POST /api/hub/staff/photo?clinic_id=...
 * multipart field `photo` — `requirePermission` deve correr antes e ler `clinic_id` na query.
 */
export const postHubStaffPhoto = (req: Request, res: Response): void => {
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

    try {
      const uploaded = await uploadHubStaffPhotoToStorage(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        },
        clinicParsed.data
      );
      return res.status(201).json({ url: uploaded.url, path: uploaded.path });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
      console.error('[hub_staff] photo upload', e);
      return res.status(500).json({ error: msg });
    }
  });
};
