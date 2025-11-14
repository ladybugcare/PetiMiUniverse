"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAdminAccess = exports.adminDeleteMessage = exports.getConversationForAudit = exports.getConversationForSupport = exports.reviewReport = exports.getReportedMessages = void 0;
const supabase_1 = require("../config/supabase");
// ========================================
// LISTAR MENSAGENS REPORTADAS (ADMIN)
// ========================================
const getReportedMessages = async (req, res) => {
    try {
        const { status } = req.query;
        let query = supabase_1.supabase
            .from('message_reports')
            .select(`
        *,
        messages!inner(
          id,
          conversation_id,
          sender_id,
          sender_type,
          message,
          created_at,
          conversations!inner(
            id,
            participant1_id,
            participant1_type,
            participant2_id,
            participant2_type
          )
        )
      `)
            .order('created_at', { ascending: false });
        // Filtrar por status (padrão: apenas pendentes)
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }
        else {
            query = query.eq('status', 'pending');
        }
        const { data: reports, error } = await query;
        if (error) {
            console.error('Error fetching reported messages:', error);
            return res.status(400).json({ error: error.message });
        }
        // Enriquecer com informações do remetente e reportador
        const enrichedReports = await Promise.all((reports || []).map(async (report) => {
            const message = report.messages;
            const conversation = message.conversations;
            // Buscar informações do remetente da mensagem
            let sender = null;
            if (message.sender_type === 'clinic') {
                const { data } = await supabase_1.supabase
                    .from('clinics')
                    .select('id, name, photo_url')
                    .eq('id', message.sender_id)
                    .single();
                sender = data;
            }
            else if (message.sender_type === 'vet') {
                const { data } = await supabase_1.supabase
                    .from('vets')
                    .select('id, name, photo_url')
                    .eq('id', message.sender_id)
                    .single();
                sender = data;
            }
            else if (message.sender_type === 'freelancer') {
                const { data } = await supabase_1.supabase
                    .from('freelancers')
                    .select('id, name, photo_url')
                    .eq('id', message.sender_id)
                    .single();
                sender = data;
            }
            // Buscar informações de quem reportou
            let reporter = null;
            const { data: reporterData } = await supabase_1.supabase
                .from('auth.users')
                .select('id, email')
                .eq('id', report.reported_by)
                .single();
            reporter = reporterData;
            return {
                ...report,
                message: {
                    ...message,
                    sender_name: sender?.name || 'Usuário',
                    sender_photo_url: sender?.photo_url || null,
                },
                reporter_email: reporter?.email || 'Email não disponível',
            };
        }));
        res.json({ reports: enrichedReports });
    }
    catch (error) {
        console.error('Error in getReportedMessages:', error);
        res.status(500).json({ error: 'Erro ao buscar mensagens reportadas' });
    }
};
exports.getReportedMessages = getReportedMessages;
// ========================================
// REVISAR E RESOLVER REPORTE (ADMIN)
// ========================================
const reviewReport = async (req, res) => {
    try {
        const { id: reportId } = req.params;
        const { status, reviewed_by } = req.body;
        if (!status || !reviewed_by) {
            return res.status(400).json({ error: 'status e reviewed_by são obrigatórios' });
        }
        if (!['reviewed', 'resolved'].includes(status)) {
            return res.status(400).json({ error: 'status deve ser reviewed ou resolved' });
        }
        const { data: report, error } = await supabase_1.supabase
            .from('message_reports')
            .update({
            status,
            reviewed_by,
            reviewed_at: new Date().toISOString(),
        })
            .eq('id', reportId)
            .select()
            .single();
        if (error) {
            console.error('Error reviewing report:', error);
            return res.status(400).json({ error: error.message });
        }
        res.json({ report });
    }
    catch (error) {
        console.error('Error in reviewReport:', error);
        res.status(500).json({ error: 'Erro ao revisar reporte' });
    }
};
exports.reviewReport = reviewReport;
// ========================================
// OBTER CONVERSA PARA SUPORTE (ADMIN)
// ========================================
const getConversationForSupport = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const admin_id = req.user?.id;
        const { ticket_id } = req.query;
        if (!admin_id) {
            return res.status(401).json({ error: 'Admin não autenticado' });
        }
        // Registrar acesso no log
        await (0, exports.logAdminAccess)(admin_id, conversationId, 'support_ticket', ticket_id);
        // Buscar conversa e mensagens
        const { data: conversation, error: convError } = await supabase_1.supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();
        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversa não encontrada' });
        }
        // Buscar mensagens
        const { data: messages, error: msgError } = await supabase_1.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });
        if (msgError) {
            console.error('Error fetching messages:', msgError);
            return res.status(400).json({ error: msgError.message });
        }
        res.json({ conversation, messages: messages || [] });
    }
    catch (error) {
        console.error('Error in getConversationForSupport:', error);
        res.status(500).json({ error: 'Erro ao buscar conversa' });
    }
};
exports.getConversationForSupport = getConversationForSupport;
// ========================================
// OBTER CONVERSA PARA AUDITORIA (ADMIN)
// ========================================
const getConversationForAudit = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const admin_id = req.user?.id;
        if (!admin_id) {
            return res.status(401).json({ error: 'Admin não autenticado' });
        }
        // Registrar acesso no log
        await (0, exports.logAdminAccess)(admin_id, conversationId, 'audit');
        // Buscar conversa e mensagens
        const { data: conversation, error: convError } = await supabase_1.supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();
        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversa não encontrada' });
        }
        // Buscar mensagens
        const { data: messages, error: msgError } = await supabase_1.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });
        if (msgError) {
            console.error('Error fetching messages:', msgError);
            return res.status(400).json({ error: msgError.message });
        }
        res.json({ conversation, messages: messages || [] });
    }
    catch (error) {
        console.error('Error in getConversationForAudit:', error);
        res.status(500).json({ error: 'Erro ao buscar conversa' });
    }
};
exports.getConversationForAudit = getConversationForAudit;
// ========================================
// ADMIN DELETAR MENSAGEM PERMANENTEMENTE
// ========================================
const adminDeleteMessage = async (req, res) => {
    try {
        const { id: messageId } = req.params;
        const admin_id = req.user?.id;
        if (!admin_id) {
            return res.status(401).json({ error: 'Admin não autenticado' });
        }
        // Verificar se mensagem existe
        const { data: message } = await supabase_1.supabase
            .from('messages')
            .select('id, conversation_id')
            .eq('id', messageId)
            .single();
        if (!message) {
            return res.status(404).json({ error: 'Mensagem não encontrada' });
        }
        // Deletar permanentemente (hard delete)
        const { error } = await supabase_1.supabase.from('messages').delete().eq('id', messageId);
        if (error) {
            console.error('Error deleting message:', error);
            return res.status(400).json({ error: error.message });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error in adminDeleteMessage:', error);
        res.status(500).json({ error: 'Erro ao deletar mensagem' });
    }
};
exports.adminDeleteMessage = adminDeleteMessage;
// ========================================
// REGISTRAR ACESSO ADMIN (AUDITORIA)
// ========================================
const logAdminAccess = async (admin_id, conversation_id, access_reason, related_ticket_id) => {
    try {
        await supabase_1.supabase.from('admin_conversation_access_logs').insert([
            {
                admin_id,
                conversation_id,
                access_reason,
                related_ticket_id: related_ticket_id || null,
            },
        ]);
    }
    catch (error) {
        console.error('Error logging admin access:', error);
        // Não falhar a operação principal se o log falhar
    }
};
exports.logAdminAccess = logAdminAccess;
