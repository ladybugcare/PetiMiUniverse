import { supabase } from '../config/supabase';

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
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw new Error(`Image upload failed: ${error.message}`);
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
  } catch (error: any) {
    console.error('Error deleting images:', error);
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

