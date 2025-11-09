"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFreelancerDocument = void 0;
const supabase_1 = require("../../config/supabase");
// Helper function to normalize document number (remove formatting)
const normalizeDocument = (doc) => {
    return doc.replace(/[^\d]/g, '');
};
// Timeout helper para evitar requisições que demoram muito
const withTimeout = (promise, timeoutMs) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: requisição demorou muito')), timeoutMs)),
    ]);
};
const checkFreelancerDocument = async (req, res) => {
    const { document_number } = req.params;
    try {
        // Validar parâmetro
        if (!document_number) {
            return res.status(400).json({
                exists: false,
                error: 'Documento não fornecido'
            });
        }
        // Normalizar o documento (remover formatação)
        const normalizedDocument = normalizeDocument(document_number);
        if (!normalizedDocument || (normalizedDocument.length !== 11 && normalizedDocument.length !== 14)) {
            return res.status(400).json({
                exists: false,
                error: 'Documento inválido. Deve ter 11 (CPF) ou 14 (CNPJ) dígitos.'
            });
        }
        // Verificar se a coluna existe antes de fazer a query
        // Se não existir, retorna false (documento não existe)
        // Timeout de 10 segundos para evitar que o servidor trave
        const { data, error } = await withTimeout(supabase_1.supabase
            .from('freelancers')
            .select('id')
            .eq('document_number', normalizedDocument)
            .maybeSingle(), 10000 // 10 segundos
        );
        if (error) {
            // Se o erro for porque a coluna não existe, retorna false
            if (error.message?.includes('column') || error.message?.includes('does not exist')) {
                console.warn('Coluna document_number não encontrada na tabela freelancers');
                return res.json({ exists: false });
            }
            // Log do erro para debug
            console.error('Erro ao consultar Supabase:', {
                message: error.message,
                code: error.code,
                details: error.details,
            });
            throw error;
        }
        return res.json({ exists: !!data });
    }
    catch (error) {
        console.error('Erro ao verificar documento:', {
            document: document_number,
            error: error.message,
            stack: error.stack,
        });
        // Se for timeout, retornar erro específico
        if (error.message?.includes('Timeout')) {
            return res.status(504).json({
                exists: false,
                error: 'Timeout: A verificação demorou muito. Tente novamente.'
            });
        }
        return res.status(500).json({
            exists: false,
            error: 'Erro ao verificar documento. Tente novamente mais tarde.'
        });
    }
};
exports.checkFreelancerDocument = checkFreelancerDocument;
