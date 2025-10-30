"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPathsFromUrls = exports.deleteMarketplaceImages = exports.uploadMarketplaceImages = void 0;
const supabase_1 = require("../config/supabase");
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
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.mimetype)) {
                throw new Error(`Invalid file type: ${file.mimetype}`);
            }
            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024; // 5MB in bytes
            if (file.buffer.length > maxSize) {
                throw new Error('File size exceeds 5MB limit');
            }
            // Generate unique filename
            const fileExt = file.originalname.split('.').pop();
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
        }
        catch (error) {
            console.error('Error uploading image:', error);
            throw new Error(`Image upload failed: ${error.message}`);
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
    }
    catch (error) {
        console.error('Error deleting images:', error);
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
