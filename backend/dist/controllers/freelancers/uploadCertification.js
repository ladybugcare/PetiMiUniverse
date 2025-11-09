"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadCertification = void 0;
const multer_1 = __importDefault(require("multer"));
const freelancerDocumentUpload_1 = require("../../utils/freelancerDocumentUpload");
// Configurar multer para armazenar arquivo em memória
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Tipo de arquivo inválido. Apenas PNG, JPG e PDF são permitidos.'));
        }
    },
}).single('certification_file');
/**
 * Upload de certificação de freelancer
 */
const uploadCertification = async (req, res) => {
    return new Promise((resolve, reject) => {
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
                const uploaded = await (0, freelancerDocumentUpload_1.uploadFreelancerCertification)({
                    buffer: req.file.buffer,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                }, userId, userToken);
                return res.json({
                    success: true,
                    url: uploaded.url,
                    path: uploaded.path,
                });
            }
            catch (error) {
                console.error('Erro ao fazer upload da certificação:', error);
                return res.status(500).json({ error: error.message || 'Erro ao fazer upload do arquivo' });
            }
        });
    });
};
exports.uploadCertification = uploadCertification;
