import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';

export interface UploadedDocument {
  url: string;
  path: string;
}

/**
 * Upload de certificações de freelancer para Supabase Storage
 * @param file - Buffer do arquivo com metadata
 * @param userId - ID do freelancer para organizar arquivos
 * @param userToken - Token de autenticação do usuário (opcional, necessário para RLS)
 * @returns URL do arquivo enviado
 */
export const uploadFreelancerCertification = async (
  file: { buffer: Buffer; originalname: string; mimetype: string },
  userId: string,
  userToken?: string
): Promise<UploadedDocument> => {
  try {
    // Validar tipo de arquivo
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`Tipo de arquivo inválido: ${file.mimetype}. Tipos permitidos: PNG, JPG, PDF`);
    }

    // Validar tamanho (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB em bytes
    if (file.buffer.length > maxSize) {
      throw new Error('Tamanho do arquivo excede o limite de 5MB');
    }

    // Gerar nome único do arquivo
    const fileExt = file.originalname.split('.').pop()?.toLowerCase() || 'pdf';
    const fileName = `${userId}/certification-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Criar cliente Supabase com token do usuário se fornecido, senão usar admin
    // O token do usuário permite que o RLS funcione corretamente
    let supabaseClient = supabaseAdmin;
    
    if (userToken && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      // Criar cliente com anon key e passar token via header customizado
      supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        },
      });
    }

    // Upload para Supabase Storage (bucket: freelancer-certifications)
    // Se o bucket não existir, usar vet-documents como fallback temporário
    const bucketName = 'freelancer-certifications';
    const { data, error } = await supabaseClient.storage
      .from(bucketName)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      // Se o bucket não existir, tentar criar ou usar fallback
      if (error.message.includes('not found') || error.message.includes('Bucket')) {
        console.warn(`Bucket ${bucketName} não encontrado. Usando vet-documents como fallback.`);
        const { data: fallbackData, error: fallbackError } = await supabaseClient.storage
          .from('vet-documents')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });
        
        if (fallbackError) throw fallbackError;
        
        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from('vet-documents').getPublicUrl(fileName);
        
        return {
          url: publicUrl,
          path: fileName,
        };
      }
      throw error;
    }

    // Obter URL pública (usar admin para garantir acesso)
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(bucketName).getPublicUrl(fileName);

    return {
      url: publicUrl,
      path: fileName,
    };
  } catch (error: any) {
    console.error('Erro ao fazer upload de certificação:', error);
    throw new Error(`Falha no upload da certificação: ${error.message}`);
  }
};

/**
 * Deletar certificação de freelancer do Supabase Storage
 * @param filePath - Caminho do arquivo a ser deletado
 */
export const deleteFreelancerCertification = async (filePath: string): Promise<void> => {
  try {
    // Tentar deletar do bucket de certificações primeiro
    const bucketName = 'freelancer-certifications';
    const { error } = await supabaseAdmin.storage.from(bucketName).remove([filePath]);
    
    if (error && (error.message.includes('not found') || error.message.includes('Bucket'))) {
      // Se o bucket não existir, tentar deletar do vet-documents (fallback)
      const { error: fallbackError } = await supabaseAdmin.storage.from('vet-documents').remove([filePath]);
      if (fallbackError) throw fallbackError;
    } else if (error) {
      throw error;
    }
  } catch (error: any) {
    console.error('Erro ao deletar certificação:', error);
    throw new Error(`Falha ao deletar certificação: ${error.message}`);
  }
};

