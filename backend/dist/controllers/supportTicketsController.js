"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvaluation = exports.markMessagesAsRead = exports.getTicketMessages = exports.addMessage = exports.getUnreadCount = exports.markTicketAsRead = exports.getTicketsCount = exports.updateTicketStatus = exports.replyToTicket = exports.getAllTickets = exports.getUserTickets = exports.createPublicTicket = exports.createTicket = void 0;
const supabase_1 = require("../config/supabase");
// Acesso: o banco é compartilhado por todos os produtos e as tabelas de suporte
// são lidas/escritas com service role, então o escopo é validado aqui.
const isPlatformAdmin = (req) => req.user?.role?.toLowerCase() === 'admin';
const canActAsUser = (req, userId) => typeof userId === 'string' && (req.user?.id === userId || isPlatformAdmin(req));
/** Carrega o ticket se o requisitante for o dono ou admin; senão responde 404/403 e retorna null. */
async function loadAccessibleTicket(req, res, ticketId) {
    const { data: ticket, error } = await supabase_1.supabaseAdmin
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();
    if (error || !ticket) {
        res.status(404).json({ error: 'Ticket não encontrado' });
        return null;
    }
    if (!isPlatformAdmin(req) && ticket.user_id !== req.user?.id) {
        res.status(403).json({ error: 'Acesso negado a este ticket' });
        return null;
    }
    return ticket;
}
const SUPPORT_PRODUCTS = ['hub', 'shift'];
const isSupportProduct = (value) => typeof value === 'string' && SUPPORT_PRODUCTS.includes(value);
// ========================================
// CRIAR TICKET DE SUPORTE
// ========================================
const createTicket = async (req, res) => {
    try {
        const { user_id, user_role, message } = req.body;
        // Validação
        if (!user_id || !user_role || !message) {
            return res.status(400).json({ error: 'user_id, user_role e message são obrigatórios' });
        }
        if (req.user?.id !== user_id) {
            return res.status(403).json({ error: 'Não é possível abrir ticket em nome de outro usuário' });
        }
        if (message.trim().length < 10) {
            return res.status(400).json({ error: 'A mensagem deve ter pelo menos 10 caracteres' });
        }
        if (!['clinic', 'vet', 'freelancer', 'admin'].includes(user_role)) {
            return res.status(400).json({ error: 'user_role deve ser clinic, vet, freelancer ou admin' });
        }
        const product = req.body.product ?? 'shift';
        if (!isSupportProduct(product)) {
            return res.status(400).json({ error: 'product deve ser hub ou shift' });
        }
        const now = new Date().toISOString();
        // Criar ticket
        const { data: ticket, error: ticketError } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .insert([
            {
                user_id,
                user_role,
                message: message.trim(), // Manter por compatibilidade
                status: 'open',
                last_message_at: now,
                last_message_by: 'user',
                category: req.body.category || 'outro',
                priority: req.body.priority || 'normal',
                attachments: req.body.attachments || [],
                product,
                clinic_id: req.body.clinic_id || null,
            },
        ])
            .select()
            .single();
        if (ticketError) {
            console.error('Error creating support ticket:', ticketError);
            return res.status(400).json({ error: ticketError.message });
        }
        // Criar primeira mensagem na tabela de mensagens
        const { error: messageError } = await supabase_1.supabaseAdmin
            .from('ticket_messages')
            .insert([
            {
                ticket_id: ticket.id,
                sender_id: user_id,
                sender_role: 'user',
                message: message.trim(),
                read_by_receiver: true, // Admin ainda não leu, mas vamos marcar como true por padrão
            },
        ]);
        if (messageError) {
            console.error('Error creating first message:', messageError);
            // Não falhamos o ticket se a mensagem falhar, mas logamos o erro
        }
        res.status(201).json({ ticket });
    }
    catch (error) {
        console.error('Error in createTicket:', error);
        res.status(500).json({ error: 'Erro ao criar ticket de suporte' });
    }
};
exports.createTicket = createTicket;
const createPublicTicket = async (req, res) => {
    try {
        const { name, email, message } = req.body;
        // Validações
        if (!name || typeof name !== 'string' || name.trim().length < 3) {
            return res.status(400).json({ error: 'Nome é obrigatório e deve ter pelo menos 3 caracteres' });
        }
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Email é obrigatório' });
        }
        // Validação básica de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({ error: 'Email inválido' });
        }
        if (!message || typeof message !== 'string' || message.trim().length < 10) {
            return res.status(400).json({ error: 'Mensagem é obrigatória e deve ter pelo menos 10 caracteres' });
        }
        const now = new Date().toISOString();
        // Criar mensagem formatada incluindo informações do guest
        const formattedMessage = `[TICKET PÚBLICO]\nNome: ${name.trim()}\nEmail: ${email.trim()}\n\nMensagem:\n${message.trim()}`;
        // Criar ticket com user_id null e user_role 'guest'
        const { data: ticket, error: ticketError } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .insert([
            {
                user_id: null,
                user_role: 'guest',
                message: formattedMessage,
                status: 'open',
                last_message_at: now,
                last_message_by: 'user',
                category: 'conta_perfil',
                priority: 'normal',
                attachments: [],
            },
        ])
            .select()
            .single();
        if (ticketError) {
            console.error('Error creating public support ticket:', ticketError);
            return res.status(400).json({ error: ticketError.message });
        }
        // Criar primeira mensagem na tabela de mensagens
        // Para tickets públicos, sender_id pode ser null ou usar um ID especial
        const { error: messageError } = await supabase_1.supabaseAdmin
            .from('ticket_messages')
            .insert([
            {
                ticket_id: ticket.id,
                sender_id: null, // null para tickets públicos
                sender_role: 'user',
                message: formattedMessage,
                read_by_receiver: false,
            },
        ]);
        if (messageError) {
            console.error('Error creating first message for public ticket:', messageError);
            // Não falhamos o ticket se a mensagem falhar, mas logamos o erro
        }
        res.status(201).json({ ticket });
    }
    catch (error) {
        console.error('Error in createPublicTicket:', error);
        res.status(500).json({ error: 'Erro ao criar ticket de suporte' });
    }
};
exports.createPublicTicket = createPublicTicket;
// ========================================
// OBTER TICKETS DO USUÁRIO
// ========================================
const getUserTickets = async (req, res) => {
    try {
        const { user_id, product } = req.query;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id é obrigatório' });
        }
        if (!canActAsUser(req, user_id)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        // Buscar tickets
        let ticketsQuery = supabase_1.supabaseAdmin
            .from('support_tickets')
            .select('*')
            .eq('user_id', user_id);
        if (isSupportProduct(product)) {
            ticketsQuery = ticketsQuery.eq('product', product);
        }
        const { data: tickets, error: ticketsError } = await ticketsQuery
            .order('last_message_at', { ascending: false });
        if (ticketsError) {
            console.error('Error fetching user tickets:', ticketsError);
            return res.status(400).json({ error: ticketsError.message });
        }
        // Para cada ticket, buscar informações adicionais
        const ticketsWithDetails = await Promise.all((tickets || []).map(async (ticket) => {
            // Buscar última mensagem
            const { data: lastMessage } = await supabase_1.supabaseAdmin
                .from('ticket_messages')
                .select('*')
                .eq('ticket_id', ticket.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            // Buscar avaliação
            const { data: evaluation } = await supabase_1.supabaseAdmin
                .from('ticket_evaluations')
                .select('*')
                .eq('ticket_id', ticket.id)
                .single();
            // Contar mensagens não lidas do admin
            const { data: unreadMessages } = await supabase_1.supabaseAdmin
                .from('ticket_messages')
                .select('id')
                .eq('ticket_id', ticket.id)
                .eq('sender_role', 'admin')
                .eq('read_by_receiver', false);
            return {
                ...ticket,
                last_message: lastMessage,
                evaluation: evaluation || null,
                unread_count: unreadMessages?.length || 0,
            };
        }));
        res.json({ tickets: ticketsWithDetails });
    }
    catch (error) {
        console.error('Error in getUserTickets:', error);
        res.status(500).json({ error: 'Erro ao buscar tickets do usuário' });
    }
};
exports.getUserTickets = getUserTickets;
// ========================================
// OBTER TODOS OS TICKETS (ADMIN)
// ========================================
const getAllTickets = async (req, res) => {
    try {
        const { status, category, priority, product } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('support_tickets')
            .select('*');
        if (isSupportProduct(product)) {
            query = query.eq('product', product);
        }
        // Filtrar por status se fornecido
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }
        // Filtrar por categoria se fornecido
        if (category && category !== 'all') {
            query = query.eq('category', category);
        }
        // Filtrar por prioridade se fornecido
        if (priority && priority !== 'all') {
            query = query.eq('priority', priority);
        }
        // Ordenar por prioridade (urgente > alta > normal > baixa) e depois por data
        query = query.order('priority', { ascending: false })
            .order('created_at', { ascending: false });
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching all tickets:', error);
            return res.status(400).json({ error: error.message });
        }
        // Buscar nome do usuário para cada ticket
        const ticketsWithNames = await Promise.all((data || []).map(async (ticket) => {
            let userName = 'Usuário';
            let clinicName = null;
            try {
                if (ticket.product === 'hub') {
                    // Staff Hub: user_id é auth.users; a clínica vem de clinic_id
                    if (ticket.user_id) {
                        const { data: authUser } = await supabase_1.supabaseAdmin.auth.admin.getUserById(ticket.user_id);
                        userName = authUser?.user?.user_metadata?.name ||
                            authUser?.user?.user_metadata?.full_name ||
                            authUser?.user?.email?.split('@')[0] ||
                            'Usuário Hub';
                    }
                    if (ticket.clinic_id) {
                        const { data: clinic } = await supabase_1.supabaseAdmin
                            .from('clinics')
                            .select('name')
                            .eq('id', ticket.clinic_id)
                            .maybeSingle();
                        clinicName = clinic?.name || null;
                    }
                }
                else if (ticket.user_role === 'clinic') {
                    // Buscar nome na tabela clinics
                    const { data: clinic } = await supabase_1.supabaseAdmin
                        .from('clinics')
                        .select('name')
                        .eq('id', ticket.user_id)
                        .single();
                    userName = clinic?.name || 'Clínica';
                }
                else if (ticket.user_role === 'vet') {
                    // Buscar nome na tabela vets
                    const { data: vet } = await supabase_1.supabaseAdmin
                        .from('vets')
                        .select('name')
                        .eq('id', ticket.user_id)
                        .single();
                    userName = vet?.name || 'Veterinário';
                }
                else if (ticket.user_role === 'freelancer') {
                    // Buscar nome na tabela freelancers
                    const { data: freelancer } = await supabase_1.supabaseAdmin
                        .from('freelancers')
                        .select('name')
                        .eq('id', ticket.user_id)
                        .single();
                    userName = freelancer?.name || 'Freelancer';
                }
                else if (ticket.user_role === 'admin') {
                    // Buscar nome no auth.users
                    const { data: authUser } = await supabase_1.supabaseAdmin.auth.admin.getUserById(ticket.user_id);
                    userName = authUser?.user?.user_metadata?.name ||
                        authUser?.user?.email?.split('@')[0] ||
                        'Administrador';
                }
            }
            catch (err) {
                console.warn(`Error fetching name for user ${ticket.user_id}:`, err);
            }
            return {
                ...ticket,
                user_name: userName,
                clinic_name: clinicName,
            };
        }));
        res.json({ tickets: ticketsWithNames });
    }
    catch (error) {
        console.error('Error in getAllTickets:', error);
        res.status(500).json({ error: 'Erro ao buscar todos os tickets' });
    }
};
exports.getAllTickets = getAllTickets;
// ========================================
// RESPONDER AO TICKET (ADMIN)
// ========================================
const replyToTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_id, admin_reply } = req.body;
        if (!admin_id || !admin_reply) {
            return res.status(400).json({ error: 'admin_id e admin_reply são obrigatórios' });
        }
        if (admin_reply.trim().length < 10) {
            return res.status(400).json({ error: 'A resposta deve ter pelo menos 10 caracteres' });
        }
        // Atualizar ticket com resposta do admin e marcar como não lido pelo usuário
        const { data, error } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .update({
            admin_reply: admin_reply.trim(),
            admin_id,
            status: 'in_progress',
            user_read: false, // Marca como não lido quando admin responde
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            console.error('Error replying to ticket:', error);
            return res.status(400).json({ error: error.message });
        }
        res.json({ ticket: data });
    }
    catch (error) {
        console.error('Error in replyToTicket:', error);
        res.status(500).json({ error: 'Erro ao responder ticket' });
    }
};
exports.replyToTicket = replyToTicket;
// ========================================
// ATUALIZAR STATUS DO TICKET (ADMIN)
// ========================================
const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'status é obrigatório' });
        }
        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            return res.status(400).json({
                error: 'status deve ser open, in_progress, resolved ou closed'
            });
        }
        const updateData = {
            status,
            updated_at: new Date().toISOString(),
        };
        // Se está marcando como resolvido, adicionar timestamp
        if (status === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        if (error) {
            console.error('Error updating ticket status:', error);
            return res.status(400).json({ error: error.message });
        }
        res.json({ ticket: data });
    }
    catch (error) {
        console.error('Error in updateTicketStatus:', error);
        res.status(500).json({ error: 'Erro ao atualizar status do ticket' });
    }
};
exports.updateTicketStatus = updateTicketStatus;
// ========================================
// OBTER CONTAGEM DE TICKETS POR STATUS (ADMIN)
// ========================================
const getTicketsCount = async (req, res) => {
    try {
        // Buscar contagem por status
        const { data: tickets, error } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .select('status');
        if (error) {
            console.error('Error fetching tickets count:', error);
            return res.status(400).json({ error: error.message });
        }
        // Contar por status
        const counts = {
            open: 0,
            in_progress: 0,
            resolved: 0,
            closed: 0,
            total: tickets?.length || 0,
        };
        tickets?.forEach((ticket) => {
            if (ticket.status in counts) {
                counts[ticket.status]++;
            }
        });
        res.json({ counts });
    }
    catch (error) {
        console.error('Error in getTicketsCount:', error);
        res.status(500).json({ error: 'Erro ao obter contagem de tickets' });
    }
};
exports.getTicketsCount = getTicketsCount;
// ========================================
// MARCAR TICKET COMO LIDO (USUÁRIO)
// ========================================
const markTicketAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const ticket = await loadAccessibleTicket(req, res, id);
        if (!ticket)
            return;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .update({
            user_read: true,
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            console.error('Error marking ticket as read:', error);
            return res.status(400).json({ error: error.message });
        }
        res.json({ ticket: data });
    }
    catch (error) {
        console.error('Error in markTicketAsRead:', error);
        res.status(500).json({ error: 'Erro ao marcar ticket como lido' });
    }
};
exports.markTicketAsRead = markTicketAsRead;
// ========================================
// OBTER CONTAGEM DE MENSAGENS NÃO LIDAS (USUÁRIO)
// ========================================
const getUnreadCount = async (req, res) => {
    try {
        const { user_id, product } = req.query;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id é obrigatório' });
        }
        if (!canActAsUser(req, user_id)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        // Buscar tickets do usuário
        let ticketsQuery = supabase_1.supabaseAdmin
            .from('support_tickets')
            .select('id')
            .eq('user_id', user_id);
        if (isSupportProduct(product)) {
            ticketsQuery = ticketsQuery.eq('product', product);
        }
        const { data: tickets, error: ticketsError } = await ticketsQuery;
        if (ticketsError) {
            console.error('Error fetching user tickets:', ticketsError);
            return res.status(400).json({ error: ticketsError.message });
        }
        if (!tickets || tickets.length === 0) {
            return res.json({ unread_count: 0 });
        }
        const ticketIds = tickets.map(t => t.id);
        // Contar mensagens não lidas de admins nos tickets do usuário
        const { data: unreadMessages, error: messagesError } = await supabase_1.supabaseAdmin
            .from('ticket_messages')
            .select('id')
            .in('ticket_id', ticketIds)
            .eq('sender_role', 'admin')
            .eq('read_by_receiver', false);
        if (messagesError) {
            console.error('Error fetching unread count:', messagesError);
            return res.status(400).json({ error: messagesError.message });
        }
        res.json({ unread_count: unreadMessages?.length || 0 });
    }
    catch (error) {
        console.error('Error in getUnreadCount:', error);
        res.status(500).json({ error: 'Erro ao obter contagem de não lidos' });
    }
};
exports.getUnreadCount = getUnreadCount;
// ========================================
// ADICIONAR MENSAGEM AO TICKET
// ========================================
const addMessage = async (req, res) => {
    try {
        const { id: ticket_id } = req.params;
        const { sender_id, sender_role, message } = req.body;
        // Validação
        if (!sender_id || !sender_role || !message) {
            return res.status(400).json({ error: 'sender_id, sender_role e message são obrigatórios' });
        }
        if (message.trim().length < 5) {
            return res.status(400).json({ error: 'A mensagem deve ter pelo menos 5 caracteres' });
        }
        if (message.trim().length > 1000) {
            return res.status(400).json({ error: 'A mensagem deve ter no máximo 1000 caracteres' });
        }
        if (!['user', 'admin'].includes(sender_role)) {
            return res.status(400).json({ error: 'sender_role deve ser user ou admin' });
        }
        if (sender_id !== req.user?.id) {
            return res.status(403).json({ error: 'Não é possível enviar mensagem em nome de outro usuário' });
        }
        if (sender_role === 'admin' && !isPlatformAdmin(req)) {
            return res.status(403).json({ error: 'Somente administradores podem responder como suporte' });
        }
        const ticket = await loadAccessibleTicket(req, res, ticket_id);
        if (!ticket)
            return;
        // Verificar se o ticket já foi avaliado (não pode mais enviar mensagens)
        const { data: evaluation } = await supabase_1.supabaseAdmin
            .from('ticket_evaluations')
            .select('id')
            .eq('ticket_id', ticket_id)
            .single();
        if (evaluation) {
            return res.status(400).json({
                error: 'Este ticket já foi avaliado e encerrado. Crie um novo ticket se precisar de ajuda.'
            });
        }
        const now = new Date().toISOString();
        // Criar mensagem
        const { data: newMessage, error: messageError } = await supabase_1.supabaseAdmin
            .from('ticket_messages')
            .insert([
            {
                ticket_id,
                sender_id,
                sender_role,
                message: message.trim(),
                read_by_receiver: false, // Nova mensagem ainda não foi lida
            },
        ])
            .select()
            .single();
        if (messageError) {
            console.error('Error creating message:', messageError);
            return res.status(400).json({ error: messageError.message });
        }
        // Atualizar ticket com informações da última mensagem
        const updateData = {
            last_message_at: now,
            last_message_by: sender_role === 'admin' ? 'admin' : 'user',
            updated_at: now,
        };
        // Se admin está respondendo, atualizar status para in_progress
        if (sender_role === 'admin' && ticket.status === 'open') {
            updateData.status = 'in_progress';
        }
        const { error: updateError } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .update(updateData)
            .eq('id', ticket_id);
        if (updateError) {
            console.error('Error updating ticket:', updateError);
        }
        // Notifica o usuário quando o suporte responde (guest não tem conta para receber)
        if (sender_role === 'admin' && ticket.user_id) {
            const { error: notifyError } = await supabase_1.supabaseAdmin.from('notifications').insert([
                {
                    user_id: ticket.user_id,
                    type: 'support_reply',
                    title: 'Resposta do suporte',
                    message: message.trim().length > 120 ? `${message.trim().slice(0, 117)}…` : message.trim(),
                    link: ticket.product === 'hub'
                        ? `/hub/suporte?ticket=${encodeURIComponent(ticket_id)}`
                        : '/my-support-tickets',
                    entity_type: 'ticket',
                    entity_id: ticket_id,
                    read: false,
                },
            ]);
            if (notifyError) {
                console.error('Error creating support_reply notification:', notifyError);
            }
        }
        res.status(201).json({ message: newMessage });
    }
    catch (error) {
        console.error('Error in addMessage:', error);
        res.status(500).json({ error: 'Erro ao adicionar mensagem' });
    }
};
exports.addMessage = addMessage;
// ========================================
// OBTER MENSAGENS DO TICKET
// ========================================
const getTicketMessages = async (req, res) => {
    try {
        const { id: ticket_id } = req.params;
        const ticket = await loadAccessibleTicket(req, res, ticket_id);
        if (!ticket)
            return;
        // Buscar todas as mensagens do ticket
        const { data: messages, error: messagesError } = await supabase_1.supabaseAdmin
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticket_id)
            .order('created_at', { ascending: true });
        if (messagesError) {
            console.error('Error fetching messages:', messagesError);
            return res.status(400).json({ error: messagesError.message });
        }
        res.json({ messages: messages || [] });
    }
    catch (error) {
        console.error('Error in getTicketMessages:', error);
        res.status(500).json({ error: 'Erro ao buscar mensagens do ticket' });
    }
};
exports.getTicketMessages = getTicketMessages;
// ========================================
// MARCAR MENSAGENS COMO LIDAS
// ========================================
const markMessagesAsRead = async (req, res) => {
    try {
        const { id: ticket_id } = req.params;
        const { user_id } = req.query;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id é obrigatório' });
        }
        if (!canActAsUser(req, user_id)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const ticket = await loadAccessibleTicket(req, res, ticket_id);
        if (!ticket)
            return;
        // Marcar mensagens do admin como lidas (usuário está lendo)
        const { error } = await supabase_1.supabaseAdmin
            .from('ticket_messages')
            .update({ read_by_receiver: true })
            .eq('ticket_id', ticket_id)
            .eq('sender_role', 'admin')
            .eq('read_by_receiver', false);
        if (error) {
            console.error('Error marking messages as read:', error);
            return res.status(400).json({ error: error.message });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error in markMessagesAsRead:', error);
        res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
    }
};
exports.markMessagesAsRead = markMessagesAsRead;
// ========================================
// CRIAR AVALIAÇÃO DO TICKET
// ========================================
const createEvaluation = async (req, res) => {
    try {
        const { id: ticket_id } = req.params;
        const { rating, comment } = req.body;
        // Validação
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'rating deve ser um número entre 1 e 5' });
        }
        if (comment && comment.length > 500) {
            return res.status(400).json({ error: 'Comentário deve ter no máximo 500 caracteres' });
        }
        const ticket = await loadAccessibleTicket(req, res, ticket_id);
        if (!ticket)
            return;
        // Verificar se já existe avaliação
        const { data: existingEvaluation } = await supabase_1.supabaseAdmin
            .from('ticket_evaluations')
            .select('id')
            .eq('ticket_id', ticket_id)
            .single();
        if (existingEvaluation) {
            return res.status(400).json({ error: 'Este ticket já foi avaliado' });
        }
        const now = new Date().toISOString();
        // Criar avaliação
        const { data: evaluation, error: evaluationError } = await supabase_1.supabaseAdmin
            .from('ticket_evaluations')
            .insert([
            {
                ticket_id,
                rating,
                comment: comment?.trim() || null,
            },
        ])
            .select()
            .single();
        if (evaluationError) {
            console.error('Error creating evaluation:', evaluationError);
            return res.status(400).json({ error: evaluationError.message });
        }
        // AUTOMATICAMENTE marcar ticket como resolved
        const { data: updatedTicket, error: updateError } = await supabase_1.supabaseAdmin
            .from('support_tickets')
            .update({
            status: 'resolved',
            resolved_at: now,
            updated_at: now,
        })
            .eq('id', ticket_id)
            .select()
            .single();
        if (updateError) {
            console.error('Error updating ticket status:', updateError);
            return res.status(400).json({ error: updateError.message });
        }
        res.status(201).json({
            evaluation,
            ticket: updatedTicket,
            message: 'Ticket avaliado e marcado como resolvido'
        });
    }
    catch (error) {
        console.error('Error in createEvaluation:', error);
        res.status(500).json({ error: 'Erro ao criar avaliação' });
    }
};
exports.createEvaluation = createEvaluation;
