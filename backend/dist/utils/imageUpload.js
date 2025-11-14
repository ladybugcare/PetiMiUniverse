"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPathsFromUrls = exports.deleteMarketplaceImages = exports.uploadMarketplaceImages = void 0;
const supabase_1 = require("../config/supabase");
const fileValidation_js_1 = require("./fileValidation.js");
const logger_js_1 = require("./logger.js");
/**
 * Upload marketplace images to Supabase Storage
 * @param files - Array of file buffers with metadata
 * @param userId - User ID for organizing files
 * @returns Array of uploaded image URLs
 */
const uploadMarketplaceImages = async (files, userId) => {
    const uploadedImages = [];
    for (const file of files) {
        try {
            // Validação robusta usando magic numbers
            (0, fileValidation_js_1.validateFile)(file.buffer, file.mimetype, file.originalname, {
                allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
                maxSize: 5 * 1024 * 1024, // 5MB
                requireSignature: true,
            });
            // Sanitizar nome do arquivo
            const sanitizedName = (0, fileValidation_js_1.sanitizeFilename)(file.originalname);
            // Generate unique filename
            const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || 'jpg';
            const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            // Upload to Supabase Storage
            const { data, error } = await supabase_1.supabase.storage
                .from('marketplace-images')
                .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });
            if (error)
                throw error;
            // Get public URL
            const { data: { publicUrl }, } = supabase_1.supabase.storage.from('marketplace-images').getPublicUrl(fileName);
            uploadedImages.push({
                url: publicUrl,
                path: fileName,
            });
            logger_js_1.logger.info('Imagem do marketplace enviada com sucesso', {
                userId,
                fileName,
                fileSize: file.buffer.length,
            });
        }
        catch (error) {
            logger_js_1.logger.error('Erro ao fazer upload de imagem do marketplace', {
                userId,
                error: error.message,
                fileName: file.originalname,
            });
            throw error; // Re-throw para manter o tipo de erro (ValidationError, etc)
        }
    }
    return uploadedImages;
};
exports.uploadMarketplaceImages = uploadMarketplaceImages;
/**
 * Delete marketplace images from Supabase Storage
 * @param imagePaths - Array of file paths to delete
 */
const deleteMarketplaceImages = async (imagePaths) => {
    try {
        const { error } = await supabase_1.supabase.storage
            .from('marketplace-images')
            .remove(imagePaths);
        if (error)
            throw error;
        logger_js_1.logger.info('Imagens do marketplace deletadas', { imagePaths });
    }
    catch (error) {
        logger_js_1.logger.error('Erro ao deletar imagens do marketplace', {
            imagePaths,
            error: error.message,
        });
        throw new Error(`Image deletion failed: ${error.message}`);
    }
};
exports.deleteMarketplaceImages = deleteMarketplaceImages;
/**
 * Extract file paths from full URLs
 * @param urls - Array of full Supabase storage URLs
 * @returns Array of file paths
 */
const extractPathsFromUrls = (urls) => {
    return urls.map((url) => {
        // Extract path after '/marketplace-images/'
        const match = url.match(/marketplace-images\/(.+)/);
        return match ? match[1] : '';
    }).filter(Boolean);
};
exports.extractPathsFromUrls = extractPathsFromUrls;
