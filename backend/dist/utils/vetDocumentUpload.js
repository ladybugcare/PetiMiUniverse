"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVetDocument = exports.uploadVetDocument = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase_1 = require("../config/supabase");
/**
 * Upload de documentos de veterinário (CRMV) para Supabase Storage
 * @param file - Buffer do arquivo com metadata
 * @param userId - ID do veterinário para organizar arquivos
 * @param userToken - Token de autenticação do usuário (opcional, necessário para RLS)
 * @returns URL do arquivo enviado
 */
const uploadVetDocument = async (file, userId, userToken) => {
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
        const fileName = `${userId}/crmv-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        // Criar cliente Supabase com token do usuário se fornecido, senão usar admin
        // O token do usuário permite que o RLS funcione corretamente
        let supabaseClient = supabase_1.supabaseAdmin;
        if (userToken && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
            // Criar cliente com anon key e passar token via header customizado
            supabaseClient = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
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
        if (error)
            throw error;
        // Obter URL pública (usar admin para garantir acesso)
        const { data: { publicUrl }, } = supabase_1.supabaseAdmin.storage.from('vet-documents').getPublicUrl(fileName);
        return {
            url: publicUrl,
            path: fileName,
        };
    }
    catch (error) {
        console.error('Erro ao fazer upload de documento:', error);
        throw new Error(`Falha no upload do documento: ${error.message}`);
    }
};
exports.uploadVetDocument = uploadVetDocument;
/**
 * Deletar documento de veterinário do Supabase Storage
 * @param filePath - Caminho do arquivo a ser deletado
 */
const deleteVetDocument = async (filePath) => {
    try {
        const { error } = await supabase.storage.from('vet-documents').remove([filePath]);
        if (error)
            throw error;
    }
    catch (error) {
        console.error('Erro ao deletar documento:', error);
        throw new Error(`Falha ao deletar documento: ${error.message}`);
    }
};
exports.deleteVetDocument = deleteVetDocument;
