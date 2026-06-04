import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { validateFile, sanitizeFilename } from './fileValidation.js';
import { logger } from './logger.js';

export interface UploadedDocument {
  url: string;
  path: string;
}

/**
 * Upload de documentos de veterinário (CRMV) para Supabase Storage
 * @param file - Buffer do arquivo com metadata
 * @param userId - ID do veterinário para organizar arquivos
 * @param userToken - Token de autenticação do usuário (opcional, necessário para RLS)
 * @returns URL do arquivo enviado
 */
export const uploadVetDocument = async (
  file: { buffer: Buffer; originalname: string; mimetype: string },
  userId: string,
  userToken?: string
): Promise<UploadedDocument> => {
  try {
    // Validação robusta usando magic numbers
    validateFile(file.buffer, file.mimetype, file.originalname, {
      allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
      maxSize: 5 * 1024 * 1024, // 5MB
      requireSignature: true,
    });

    // Sanitizar nome do arquivo
    const sanitizedName = sanitizeFilename(file.originalname);
    
    // Gerar nome único do arquivo
    const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || 'pdf';
    const fileName = `${userId}/crmv-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

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

    // Upload para Supabase Storage (bucket: vet-documents)
    const { data, error } = await supabaseClient.storage
      .from('vet-documents')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) throw error;

    // Obter URL pública (usar admin para garantir acesso)
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from('vet-documents').getPublicUrl(fileName);

    logger.info('Documento CRMV enviado com sucesso', {
      userId,
      fileName,
      fileSize: file.buffer.length,
    });

    return {
      url: publicUrl,
      path: fileName,
    };
  } catch (error: any) {
    logger.error('Erro ao fazer upload de documento CRMV', {
      userId,
      error: error.message,
      fileName: file.originalname,
    });
    throw error; // Re-throw para manter o tipo de erro (ValidationError, etc)
  }
};

/**
 * Deletar documento de veterinário do Supabase Storage
 * @param filePath - Caminho do arquivo a ser deletado
 */
export const deleteVetDocument = async (filePath: string): Promise<void> => {
  try {
    const { error } = await supabaseAdmin.storage.from('vet-documents').remove([filePath]);
    if (error) throw error;
    
    logger.info('Documento CRMV deletado', { filePath });
  } catch (error: any) {
    logger.error('Erro ao deletar documento CRMV', {
      filePath,
      error: error.message,
    });
    throw new Error(`Falha ao deletar documento: ${error.message}`);
  }
};

