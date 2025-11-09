import type { Request, Response } from 'express';
import multer from 'multer';
import { uploadVetDocument } from '../../utils/vetDocumentUpload';

// Configurar multer para armazenar arquivo em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo inválido. Apenas PNG, JPG e PDF são permitidos.'));
    }
  },
}).single('crmv_file');

/**
 * Upload do arquivo CRMV
 */
export const uploadCrmvFile = async (req: Request, res: Response) => {
  return new Promise<void>((resolve, reject) => {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      try {
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        // Extrair token do header Authorization
        const authHeader = req.headers.authorization;
        const userToken = authHeader?.startsWith('Bearer ') 
          ? authHeader.split(' ')[1] 
          : undefined;

        // Fazer upload do arquivo (passar token para RLS funcionar)
        const uploaded = await uploadVetDocument(
          {
            buffer: req.file.buffer,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
          },
          userId,
          userToken
        );

        return res.json({
          success: true,
          url: uploaded.url,
          path: uploaded.path,
        });
      } catch (error: any) {
        console.error('Erro ao fazer upload do CRMV:', error);
        return res.status(500).json({ error: error.message || 'Erro ao fazer upload do arquivo' });
      }
    });
  });
};

