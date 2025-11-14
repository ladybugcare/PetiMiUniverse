"use strict";
/**
 * Validação robusta de arquivos usando magic numbers (assinaturas de arquivo)
 * Baseado no plano de implementação do projeto
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeFilename = sanitizeFilename;
exports.validateFile = validateFile;
exports.detectMimeType = detectMimeType;
const errors_js_1 = require("./errors.js");
/**
 * Magic numbers (assinaturas de arquivo) para validação
 * Estes são os primeiros bytes que identificam o tipo real do arquivo
 */
const FILE_SIGNATURES = {
    // JPEG: FF D8 FF
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    // GIF: 47 49 46 38 (GIF8)
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    // WebP: RIFF...WEBP
    'image/webp': [
        [0x52, 0x49, 0x46, 0x46], // RIFF
        // WebP tem estrutura mais complexa, verificar após RIFF
    ],
    // PDF: %PDF
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF em ASCII
};
/**
 * Valida se o buffer corresponde à assinatura esperada
 */
function validateFileSignature(buffer, expectedMimeType) {
    const signatures = FILE_SIGNATURES[expectedMimeType];
    if (!signatures || signatures.length === 0) {
        // Se não temos assinatura para este tipo, confiar no MIME type
        return true;
    }
    // Verificar cada possível assinatura
    for (const signature of signatures) {
        if (buffer.length < signature.length) {
            continue;
        }
        let matches = true;
        for (let i = 0; i < signature.length; i++) {
            if (buffer[i] !== signature[i]) {
                matches = false;
                break;
            }
        }
        if (matches) {
            // Para WebP, verificar se tem "WEBP" após RIFF
            if (expectedMimeType === 'image/webp' && buffer.length >= 12) {
                const webpHeader = buffer.toString('ascii', 8, 12);
                return webpHeader === 'WEBP';
            }
            return true;
        }
    }
    return false;
}
/**
 * Sanitiza nome de arquivo removendo caracteres perigosos
 */
function sanitizeFilename(filename) {
    // Remove caracteres perigosos e normaliza
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Substitui caracteres especiais por underscore
        .replace(/_{2,}/g, '_') // Remove underscores múltiplos
        .replace(/^\.+|\.+$/g, '') // Remove pontos no início/fim
        .substring(0, 255); // Limita tamanho
}
/**
 * Valida arquivo usando magic numbers e outras verificações
 */
function validateFile(buffer, mimetype, originalname, options = {}) {
    const { allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'], maxSize = 5 * 1024 * 1024, // 5MB padrão
    requireSignature = true, } = options;
    // 1. Validar tipo MIME
    if (!allowedTypes.includes(mimetype)) {
        throw new errors_js_1.ValidationError(`Tipo de arquivo não permitido: ${mimetype}. Tipos permitidos: ${allowedTypes.join(', ')}`);
    }
    // 2. Validar tamanho
    if (buffer.length === 0) {
        throw new errors_js_1.ValidationError('Arquivo vazio');
    }
    if (buffer.length > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
        throw new errors_js_1.ValidationError(`Tamanho do arquivo (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) excede o limite de ${maxSizeMB}MB`);
    }
    // 3. Validar assinatura de arquivo (magic numbers)
    if (requireSignature) {
        if (!validateFileSignature(buffer, mimetype)) {
            throw new errors_js_1.ValidationError(`Assinatura de arquivo não corresponde ao tipo MIME declarado (${mimetype}). Arquivo pode estar corrompido ou ser malicioso.`);
        }
    }
    // 4. Validações adicionais por tipo
    if (mimetype.startsWith('image/')) {
        // Verificar se é realmente uma imagem válida
        if (buffer.length < 10) {
            throw new errors_js_1.ValidationError('Arquivo de imagem muito pequeno ou corrompido');
        }
    }
    if (mimetype === 'application/pdf') {
        // Verificar se tem estrutura básica de PDF
        const pdfHeader = buffer.toString('ascii', 0, Math.min(1024, buffer.length));
        if (!pdfHeader.includes('%PDF')) {
            throw new errors_js_1.ValidationError('Arquivo PDF inválido ou corrompido');
        }
    }
    // 5. Sanitizar nome do arquivo
    const sanitizedName = sanitizeFilename(originalname);
    if (sanitizedName !== originalname) {
        // Log warning mas não falha (nome será sanitizado no upload)
        console.warn(`Nome de arquivo sanitizado: "${originalname}" -> "${sanitizedName}"`);
    }
}
/**
 * Detecta tipo MIME real do arquivo baseado na assinatura
 */
function detectMimeType(buffer) {
    if (buffer.length < 4) {
        return null;
    }
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    // PNG
    if (buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47) {
        return 'image/png';
    }
    // GIF
    if (buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38) {
        return 'image/gif';
    }
    // PDF
    if (buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46) {
        return 'application/pdf';
    }
    // WebP (precisa verificar após RIFF)
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }
    return null;
}
