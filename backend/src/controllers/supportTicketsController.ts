import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Tipos
interface CreateTicketBody {
  user_id: string;
  user_role: 'clinic' | 'vet';
  message: string;
}

interface ReplyToTicketBody {
  admin_id: string;
  admin_reply: string;
}

interface UpdateStatusBody {
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
}

interface AddMessageBody {
  sender_id: string;
  sender_role: 'user' | 'admin';
  message: string;
}

interface CreateEvaluationBody {
  rating: number;
  comment?: string;
}

// ========================================
// CRIAR TICKET DE SUPORTE
// ========================================
export const createTicket = async (
  req: Request<{}, {}, CreateTicketBody>,
  res: Response
) => {
  try {
    const { user_id, user_role, message } = req.body;

    // Validação
    if (!user_id || !user_role || !message) {
      return res.status(400).json({ error: 'user_id, user_role e message são obrigatórios' });
    }

    if (message.trim().length < 10) {
      return res.status(400).json({ error: 'A mensagem deve ter pelo menos 10 caracteres' });
    }

    if (!['clinic', 'vet'].includes(user_role)) {
      return res.status(400).json({ error: 'user_role deve ser clinic ou vet' });
    }

    const now = new Date().toISOString();

    // Criar ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert([
        {
          user_id,
          user_role,
          message: message.trim(), // Manter por compatibilidade
          status: 'open',
          last_message_at: now,
          last_message_by: 'user',
        },
      ])
      .select()
      .single();

    if (ticketError) {
      console.error('Error creating support ticket:', ticketError);
      return res.status(400).json({ error: ticketError.message });
    }

    // Criar primeira mensagem na tabela de mensagens
    const { error: messageError } = await supabase
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
  } catch (error: any) {
    console.error('Error in createTicket:', error);
    res.status(500).json({ error: 'Erro ao criar ticket de suporte' });
  }
};

// ========================================
// OBTER TICKETS DO USUÁRIO
// ========================================
export const getUserTickets = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id é obrigatório' });
    }

    // Buscar tickets
    const { data: tickets, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user_id)
      .order('last_message_at', { ascending: false });

    if (ticketsError) {
      console.error('Error fetching user tickets:', ticketsError);
      return res.status(400).json({ error: ticketsError.message });
    }

    // Para cada ticket, buscar informações adicionais
    const ticketsWithDetails = await Promise.all(
      (tickets || []).map(async (ticket) => {
        // Buscar última mensagem
        const { data: lastMessage } = await supabase
          .from('ticket_messages')
          .select('*')
          .eq('ticket_id', ticket.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Buscar avaliação
        const { data: evaluation } = await supabase
          .from('ticket_evaluations')
          .select('*')
          .eq('ticket_id', ticket.id)
          .single();

        // Contar mensagens não lidas do admin
        const { data: unreadMessages } = await supabase
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
      })
    );

    res.json({ tickets: ticketsWithDetails });
  } catch (error: any) {
    console.error('Error in getUserTickets:', error);
    res.status(500).json({ error: 'Erro ao buscar tickets do usuário' });
  }
};

// ========================================
// OBTER TODOS OS TICKETS (ADMIN)
// ========================================
export const getAllTickets = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    // Filtrar por status se fornecido
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching all tickets:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ tickets: data });
  } catch (error: any) {
    console.error('Error in getAllTickets:', error);
    res.status(500).json({ error: 'Erro ao buscar todos os tickets' });
  }
};

// ========================================
// RESPONDER AO TICKET (ADMIN)
// ========================================
export const replyToTicket = async (
  req: Request<{ id: string }, {}, ReplyToTicketBody>,
  res: Response
) => {
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
    const { data, error } = await supabase
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
  } catch (error: any) {
    console.error('Error in replyToTicket:', error);
    res.status(500).json({ error: 'Erro ao responder ticket' });
  }
};

// ========================================
// ATUALIZAR STATUS DO TICKET (ADMIN)
// ========================================
export const updateTicketStatus = async (
  req: Request<{ id: string }, {}, UpdateStatusBody>,
  res: Response
) => {
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

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Se está marcando como resolvido, adicionar timestamp
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
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
  } catch (error: any) {
    console.error('Error in updateTicketStatus:', error);
    res.status(500).json({ error: 'Erro ao atualizar status do ticket' });
  }
};

// ========================================
// OBTER CONTAGEM DE TICKETS POR STATUS (ADMIN)
// ========================================
export const getTicketsCount = async (req: Request, res: Response) => {
  try {
    // Buscar contagem por status
    const { data: tickets, error } = await supabase
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
        counts[ticket.status as keyof typeof counts]++;
      }
    });

    res.json({ counts });
  } catch (error: any) {
    console.error('Error in getTicketsCount:', error);
    res.status(500).json({ error: 'Erro ao obter contagem de tickets' });
  }
};

// ========================================
// MARCAR TICKET COMO LIDO (USUÁRIO)
// ========================================
export const markTicketAsRead = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
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
  } catch (error: any) {
    console.error('Error in markTicketAsRead:', error);
    res.status(500).json({ error: 'Erro ao marcar ticket como lido' });
  }
};

// ========================================
// OBTER CONTAGEM DE MENSAGENS NÃO LIDAS (USUÁRIO)
// ========================================
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id é obrigatório' });
    }

    // Buscar tickets do usuário
    const { data: tickets, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('user_id', user_id);

    if (ticketsError) {
      console.error('Error fetching user tickets:', ticketsError);
      return res.status(400).json({ error: ticketsError.message });
    }

    if (!tickets || tickets.length === 0) {
      return res.json({ unread_count: 0 });
    }

    const ticketIds = tickets.map(t => t.id);

    // Contar mensagens não lidas de admins nos tickets do usuário
    const { data: unreadMessages, error: messagesError } = await supabase
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
  } catch (error: any) {
    console.error('Error in getUnreadCount:', error);
    res.status(500).json({ error: 'Erro ao obter contagem de não lidos' });
  }
};

// ========================================
// ADICIONAR MENSAGEM AO TICKET
// ========================================
export const addMessage = async (
  req: Request<{ id: string }, {}, AddMessageBody>,
  res: Response
) => {
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

    // Verificar se o ticket existe
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }

    // Verificar se o ticket já foi avaliado (não pode mais enviar mensagens)
    const { data: evaluation } = await supabase
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
    const { data: newMessage, error: messageError } = await supabase
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
    const updateData: any = {
      last_message_at: now,
      last_message_by: sender_role === 'admin' ? 'admin' : 'user',
      updated_at: now,
    };

    // Se admin está respondendo, atualizar status para in_progress
    if (sender_role === 'admin' && ticket.status === 'open') {
      updateData.status = 'in_progress';
    }

    const { error: updateError } = await supabase
      .from('support_tickets')
      .update(updateData)
      .eq('id', ticket_id);

    if (updateError) {
      console.error('Error updating ticket:', updateError);
    }

    res.status(201).json({ message: newMessage });
  } catch (error: any) {
    console.error('Error in addMessage:', error);
    res.status(500).json({ error: 'Erro ao adicionar mensagem' });
  }
};

// ========================================
// OBTER MENSAGENS DO TICKET
// ========================================
export const getTicketMessages = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const { id: ticket_id } = req.params;

    // Verificar se o ticket existe
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }

    // Buscar todas as mensagens do ticket
    const { data: messages, error: messagesError } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket_id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return res.status(400).json({ error: messagesError.message });
    }

    res.json({ messages: messages || [] });
  } catch (error: any) {
    console.error('Error in getTicketMessages:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens do ticket' });
  }
};

// ========================================
// MARCAR MENSAGENS COMO LIDAS
// ========================================
export const markMessagesAsRead = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const { id: ticket_id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id é obrigatório' });
    }

    // Marcar mensagens do admin como lidas (usuário está lendo)
    const { error } = await supabase
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
  } catch (error: any) {
    console.error('Error in markMessagesAsRead:', error);
    res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
  }
};

// ========================================
// CRIAR AVALIAÇÃO DO TICKET
// ========================================
export const createEvaluation = async (
  req: Request<{ id: string }, {}, CreateEvaluationBody>,
  res: Response
) => {
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

    // Verificar se o ticket existe
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }

    // Verificar se já existe avaliação
    const { data: existingEvaluation } = await supabase
      .from('ticket_evaluations')
      .select('id')
      .eq('ticket_id', ticket_id)
      .single();

    if (existingEvaluation) {
      return res.status(400).json({ error: 'Este ticket já foi avaliado' });
    }

    const now = new Date().toISOString();

    // Criar avaliação
    const { data: evaluation, error: evaluationError } = await supabase
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
    const { data: updatedTicket, error: updateError } = await supabase
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
  } catch (error: any) {
    console.error('Error in createEvaluation:', error);
    res.status(500).json({ error: 'Erro ao criar avaliação' });
  }
};

