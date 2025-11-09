"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVetDocument = void 0;
const supabase_1 = require("../../config/supabase");
/**
 * Servir documento CRMV de veterinário (apenas para admins)
 * GET /admin/vets/:vetId/document
 */
const getVetDocument = async (req, res) => {
    try {
        const { vetId } = req.params;
        const { path } = req.query;
        // Verificar se é admin
        const user = req.user;
        const userRole = user?.user_metadata?.role || user?.role;
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
        }
        if (!path || typeof path !== 'string') {
            return res.status(400).json({ error: 'Parâmetro "path" é obrigatório' });
        }
        // Buscar o arquivo no Supabase Storage usando admin client
        const { data, error } = await supabase_1.supabaseAdmin.storage
            .from('vet-documents')
            .download(path);
        if (error) {
            console.error('Erro ao baixar documento do Supabase:', {
                error: error.message,
                code: error.statusCode,
                path,
                vetId,
            });
            // Erro específico para arquivo não encontrado
            if (error.statusCode === '404' || error.message?.includes('not found') || error.message?.includes('No such key')) {
                return res.status(404).json({ error: 'Documento não encontrado no storage' });
            }
            return res.status(500).json({ error: 'Erro ao acessar documento no storage' });
        }
        if (!data) {
            console.warn('Documento retornado vazio do Supabase:', { path, vetId });
            return res.status(404).json({ error: 'Documento não encontrado ou vazio' });
        }
        // Converter blob para buffer
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // Determinar content-type baseado na extensão do arquivo
        const fileExt = path.split('.').pop()?.toLowerCase();
        let contentType = 'application/octet-stream';
        if (fileExt === 'pdf') {
            contentType = 'application/pdf';
        }
        else if (fileExt === 'jpg' || fileExt === 'jpeg') {
            contentType = 'image/jpeg';
        }
        else if (fileExt === 'png') {
            contentType = 'image/png';
        }
        // Extrair nome do arquivo do path
        const fileName = path.split('/').pop() || 'documento.pdf';
        // Retornar o arquivo como download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', buffer.length.toString());
        res.send(buffer);
    }
    catch (error) {
        console.error('Erro ao servir documento:', {
            error: error.message,
            stack: error.stack,
            vetId: req.params.vetId,
            path: req.query.path,
        });
        res.status(500).json({
            error: 'Erro interno ao processar documento',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};
exports.getVetDocument = getVetDocument;
