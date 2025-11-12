import { supabase } from '../config/supabase';
import { validateFile, sanitizeFilename } from './fileValidation.js';
import { logger } from './logger.js';

export interface UploadedImage {
  url: string;
  path: string;
}

/**
 * Upload marketplace images to Supabase Storage
 * @param files - Array of file buffers with metadata
 * @param userId - User ID for organizing files
 * @returns Array of uploaded image URLs
 */
export const uploadMarketplaceImages = async (
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
  userId: string
): Promise<UploadedImage[]> => {
  const uploadedImages: UploadedImage[] = [];

  for (const file of files) {
    try {
      // Validação robusta usando magic numbers
      validateFile(file.buffer, file.mimetype, file.originalname, {
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        maxSize: 5 * 1024 * 1024, // 5MB
        requireSignature: true,
      });

      // Sanitizar nome do arquivo
      const sanitizedName = sanitizeFilename(file.originalname);

      // Generate unique filename
      const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('marketplace-images')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('marketplace-images').getPublicUrl(fileName);

      uploadedImages.push({
        url: publicUrl,
        path: fileName,
      });

      logger.info('Imagem do marketplace enviada com sucesso', {
        userId,
        fileName,
        fileSize: file.buffer.length,
      });
    } catch (error: any) {
      logger.error('Erro ao fazer upload de imagem do marketplace', {
        userId,
        error: error.message,
        fileName: file.originalname,
      });
      throw error; // Re-throw para manter o tipo de erro (ValidationError, etc)
    }
  }

  return uploadedImages;
};

/**
 * Delete marketplace images from Supabase Storage
 * @param imagePaths - Array of file paths to delete
 */
export const deleteMarketplaceImages = async (
  imagePaths: string[]
): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from('marketplace-images')
      .remove(imagePaths);

    if (error) throw error;

    logger.info('Imagens do marketplace deletadas', { imagePaths });
  } catch (error: any) {
    logger.error('Erro ao deletar imagens do marketplace', {
      imagePaths,
      error: error.message,
    });
    throw new Error(`Image deletion failed: ${error.message}`);
  }
};

/**
 * Extract file paths from full URLs
 * @param urls - Array of full Supabase storage URLs
 * @returns Array of file paths
 */
export const extractPathsFromUrls = (urls: string[]): string[] => {
  return urls.map((url) => {
    // Extract path after '/marketplace-images/'
    const match = url.match(/marketplace-images\/(.+)/);
    return match ? match[1] : '';
  }).filter(Boolean);
};

