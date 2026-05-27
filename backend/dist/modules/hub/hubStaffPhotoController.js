"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubStaffPhoto = void 0;
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const hubStaffPhotoUpload_1 = require("../../utils/hubStaffPhotoUpload");
const uuidStr = zod_1.z.string().uuid();
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
/**
 * POST /api/hub/staff/photo?clinic_id=...
 * multipart field `photo` — `requirePermission` deve correr antes e ler `clinic_id` na query.
 */
const postHubStaffPhoto = (req, res) => {
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
        try {
            const uploaded = await (0, hubStaffPhotoUpload_1.uploadHubStaffPhotoToStorage)({
                buffer: req.file.buffer,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
            }, clinicParsed.data);
            return res.status(201).json({ url: uploaded.url, path: uploaded.path });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao enviar imagem';
            console.error('[hub_staff] photo upload', e);
            return res.status(500).json({ error: msg });
        }
    });
};
exports.postHubStaffPhoto = postHubStaffPhoto;
