import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';

// ========================================
// TIPOS
// ========================================
interface CreateConversationBody {
  participant1_id: string;
  participant1_type: 'clinic' | 'vet' | 'freelancer';
  participant2_id: string;
  participant2_type: 'clinic' | 'vet' | 'freelancer';
  demand_id?: string;
  application_id?: string;
}

interface SendMessageBody {
  message: string;
}

interface ReportMessageBody {
  report_reason: string;
}

// ========================================
// VALIDAÇÃO DE PARES PERMITIDOS
// ========================================
export const validateConversationPair = (
  type1: string,
  type2: string
): { valid: boolean; error?: string } => {
  // Bloquear admin ↔ admin
  if (type1 === 'admin' && type2 === 'admin') {
    return {
      valid: false,
      error: 'Administradores não podem conversar entre si',
    };
  }

  // Admin pode conversar com qualquer tipo (clinic, vet, freelancer)
  if (type1 === 'admin' || type2 === 'admin') {
    return { valid: true };
  }

  // Bloquear vet ↔ freelancer
  if (
    (type1 === 'vet' && type2 === 'freelancer') ||
    (type1 === 'freelancer' && type2 === 'vet')
  ) {
    return {
      valid: false,
      error: 'Veterinários e freelancers não podem conversar entre si',
    };
  }

  // Permitir clinic ↔ vet e clinic ↔ freelancer
  if (
    (type1 === 'clinic' && (type2 === 'vet' || type2 === 'freelancer')) ||
    (type2 === 'clinic' && (type1 === 'vet' || type1 === 'freelancer'))
  ) {
    return { valid: true };
  }

  // Não permitir outros pares (ex: clinic ↔ clinic)
  return {
    valid: false,
    error: 'Tipo de conversa não permitido',
  };
};

// ========================================
// CRIAR CONVERSA
// ========================================
export const createConversation = async (
  req: Request<{}, {}, CreateConversationBody>,
  res: Response
) => {
  try {
    const { participant1_id, participant1_type, participant2_id, participant2_type, demand_id, application_id } = req.body;

    // Log inicial para debug
    console.log('[createConversation] Recebido:', {
      participant1_id,
      participant1_type,
      participant2_id,
      participant2_type,
      demand_id,
      application_id,
    });

    // Validações básicas
    if (!participant1_id || !participant1_type || !participant2_id || !participant2_type) {
      return res.status(400).json({ error: 'Todos os campos de participantes são obrigatórios' });
    }

    if (participant1_id === participant2_id) {
      return res.status(400).json({ error: 'Não é possível criar conversa consigo mesmo' });
    }

    // Normalizar tipos para lowercase (garantir consistência)
    const p1_type_normalized = String(participant1_type).toLowerCase().trim();
    const p2_type_normalized = String(participant2_type).toLowerCase().trim();
    
    console.log('[createConversation] Após normalização inicial:', {
      p1_type_normalized,
      p2_type_normalized,
    });

    // Validar par permitido (usar tipos normalizados)
    const validation = validateConversationPair(p1_type_normalized, p2_type_normalized);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Normalizar ordem conforme constraint check_participant_order:
    // A constraint permite APENAS estas combinações:
    // 1. (admin, clinic/vet/freelancer) - admin sempre primeiro
    // 2. (clinic, vet/freelancer) - clinic primeiro quando conversando com vet/freelancer
    // 3. (vet, clinic) - vet primeiro quando conversando com clinic
    // 4. (freelancer, clinic) - freelancer primeiro quando conversando com clinic
    let p1_id = participant1_id;
    let p1_type = p1_type_normalized;
    let p2_id = participant2_id;
    let p2_type = p2_type_normalized;

    // Caso 1: Se um participante é admin, admin SEMPRE será participant1
    if (p1_type_normalized === 'admin' || p2_type_normalized === 'admin') {
      if (p2_type_normalized === 'admin') {
        // Inverter: admin deve ser participant1
        console.log('[createConversation] Invertendo: admin estava em participant2');
        p1_id = participant2_id;
        p1_type = p2_type_normalized;
        p2_id = participant1_id;
        p2_type = p1_type_normalized;
      } else {
        // Se participant1 já é admin, manter como está
        console.log('[createConversation] Admin já está em participant1, mantendo ordem');
      }
      // Resultado: (admin, clinic/vet/freelancer) ✓
    }
    // Caso 2: Se não houver admin, aplicar regras de ordem
    else {
      // Se clinic está envolvida:
      if (p1_type_normalized === 'clinic' || p2_type_normalized === 'clinic') {
        // Se clinic é participant2 e participant1 é vet ou freelancer, manter como está
        // (vet, clinic) ou (freelancer, clinic) são válidos
        if (p1_type_normalized === 'clinic' && (p2_type_normalized === 'vet' || p2_type_normalized === 'freelancer')) {
          // (clinic, vet/freelancer) - já está correto, manter
        } else if ((p1_type_normalized === 'vet' || p1_type_normalized === 'freelancer') && p2_type_normalized === 'clinic') {
          // (vet/freelancer, clinic) - já está correto conforme constraint, manter
        } else if (p2_type_normalized === 'clinic' && p1_type_normalized !== 'clinic') {
          // Caso especial: se clinic é participant2 e participant1 não é clinic nem vet nem freelancer
          // (não deveria acontecer, mas por segurança inverter)
          p1_id = participant2_id;
          p1_type = p2_type_normalized;
          p2_id = participant1_id;
          p2_type = p1_type_normalized;
        }
      }
      // Se não há clinic, não deveria acontecer após validação
    }

    // Log após normalização de ordem
    console.log('[createConversation] Após normalização de ordem:', {
      original: { p1_type: participant1_type, p2_type: participant2_type },
      normalized_types: { p1_type_normalized, p2_type_normalized },
      final_order: { p1_id, p1_type, p2_id, p2_type },
    });

    // Verificar se já existe conversa entre esses participantes
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant1_id.eq.${p1_id},participant2_id.eq.${p2_id}),and(participant1_id.eq.${p2_id},participant2_id.eq.${p1_id})`
      )
      .maybeSingle();

    if (existing) {
      // Retornar conversa existente
      const { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', existing.id)
        .single();

      return res.json({ conversation });
    }

    // Validação final: garantir que a ordem está correta antes de inserir
    // A constraint check_participant_order permite APENAS:
    // 1. (admin, clinic/vet/freelancer)
    // 2. (clinic, vet/freelancer)
    // 3. (vet, clinic)
    // 4. (freelancer, clinic)
    
    // Garantir que os tipos estão exatamente como a constraint espera (lowercase, sem espaços)
    const final_p1_type = String(p1_type).toLowerCase().trim();
    const final_p2_type = String(p2_type).toLowerCase().trim();
    
    console.log('[createConversation] Validação final - tipos:', {
      final_p1_type,
      final_p2_type,
      p1_type_original: p1_type,
      p2_type_original: p2_type,
    });
    
    const isValidOrder =
      (final_p1_type === 'admin' && ['clinic', 'vet', 'freelancer'].includes(final_p2_type)) ||
      (final_p1_type === 'clinic' && ['vet', 'freelancer'].includes(final_p2_type)) ||
      (final_p1_type === 'vet' && final_p2_type === 'clinic') ||
      (final_p1_type === 'freelancer' && final_p2_type === 'clinic');

    console.log('[createConversation] Validação de ordem:', {
      isValidOrder,
      check1: final_p1_type === 'admin' && ['clinic', 'vet', 'freelancer'].includes(final_p2_type),
      check2: final_p1_type === 'clinic' && ['vet', 'freelancer'].includes(final_p2_type),
      check3: final_p1_type === 'vet' && final_p2_type === 'clinic',
      check4: final_p1_type === 'freelancer' && final_p2_type === 'clinic',
    });

    if (!isValidOrder) {
      console.error('[createConversation] ❌ ORDEM INVÁLIDA após normalização:', {
        original: { p1_type: participant1_type, p2_type: participant2_type },
        normalized: { p1_type, p2_type },
        final: { final_p1_type, final_p2_type },
        isValidOrder,
      });
      return res.status(400).json({
        error: `Ordem inválida de participantes: (${final_p1_type}, ${final_p2_type}). A constraint não permite esta combinação.`,
      });
    }
    
    console.log('[createConversation] ✅ Validação de ordem passou!');

    // Log detalhado antes de inserir
    console.log('[createConversation] Tentando inserir conversa:', {
      participant1_id: p1_id,
      participant1_type: final_p1_type,
      participant2_id: p2_id,
      participant2_type: final_p2_type,
      demand_id: demand_id || null,
      application_id: application_id || null,
    });

    // Criar nova conversa
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert([
        {
          participant1_id: p1_id,
          participant1_type: final_p1_type,
          participant2_id: p2_id,
          participant2_type: final_p2_type,
          demand_id: demand_id || null,
          application_id: application_id || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('[createConversation] Erro ao criar conversa:', error);
      console.error('[createConversation] Valores tentados:', {
        participant1_id: p1_id,
        participant1_type: final_p1_type,
        participant2_id: p2_id,
        participant2_type: final_p2_type,
        demand_id: demand_id || null,
        application_id: application_id || null,
      });
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ conversation });
  } catch (error: any) {
    console.error('Error in createConversation:', error);
    res.status(500).json({ error: 'Erro ao criar conversa' });
  }
};

// ========================================
// LISTAR MINHAS CONVERSAS
// ========================================
export const getMyConversations = async (req: Request, res: Response) => {
  try {
    const user_id = req.user?.id;
    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar conversas onde o usuário é participant1 ou participant2
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant1_id.eq.${user_id},participant2_id.eq.${user_id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      return res.status(400).json({ error: error.message });
    }

    // Enriquecer com informações dos participantes e contagem de não lidas
    const enrichedConversations = await Promise.all(
      (conversations || []).map(async (conv) => {
        const otherParticipantId =
          conv.participant1_id === user_id ? conv.participant2_id : conv.participant1_id;
        const otherParticipantType =
          conv.participant1_id === user_id ? conv.participant2_type : conv.participant1_type;

        // Buscar informações do outro participante
        let otherParticipant: any = null;
        if (otherParticipantType === 'clinic') {
          const { data } = await supabase.from('clinics').select('id, name, photo_url').eq('id', otherParticipantId).single();
          otherParticipant = data;
        } else if (otherParticipantType === 'vet') {
          const { data } = await supabase.from('vets').select('id, name, photo_url').eq('id', otherParticipantId).single();
          otherParticipant = data;
        } else if (otherParticipantType === 'freelancer') {
          const { data } = await supabase.from('freelancers').select('id, name, photo_url').eq('id', otherParticipantId).single();
          otherParticipant = data;
        } else if (otherParticipantType === 'admin') {
          // Admin não tem tabela própria, buscar de auth.users
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(otherParticipantId);
          otherParticipant = {
            id: otherParticipantId,
            name: userData?.user?.user_metadata?.name || userData?.user?.email?.split('@')[0] || 'Administrador',
            photo_url: userData?.user?.user_metadata?.photo_url || null,
          };
        }

        // Contar mensagens não lidas
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('sender_id', otherParticipantId)
          .is('read_at', null)
          .is('deleted_at', null);

        // Buscar última mensagem
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('message, created_at, sender_id')
          .eq('conversation_id', conv.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ...conv,
          other_participant: {
            id: otherParticipantId,
            type: otherParticipantType,
            name: otherParticipant?.name || 'Usuário',
            photo_url: otherParticipant?.photo_url || null,
          },
          unread_count: unreadCount || 0,
          last_message: lastMessage || null,
        };
      })
    );

    res.json({ conversations: enrichedConversations });
  } catch (error: any) {
    console.error('Error in getMyConversations:', error);
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
};

// ========================================
// OBTER CONVERSA ESPECÍFICA COM MENSAGENS
// ========================================
export const getConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar conversa
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar se usuário é participante
    if (conversation.participant1_id !== user_id && conversation.participant2_id !== user_id) {
      return res.status(403).json({ error: 'Você não tem acesso a esta conversa' });
    }

    // Buscar mensagens
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('Error fetching messages:', msgError);
      return res.status(400).json({ error: msgError.message });
    }

    // Enriquecer mensagens com informações do remetente
    const enrichedMessages = await Promise.all(
      (messages || []).map(async (msg) => {
        let sender: any = null;
        if (msg.sender_type === 'clinic') {
          const { data } = await supabase.from('clinics').select('id, name, photo_url').eq('id', msg.sender_id).single();
          sender = data;
        } else if (msg.sender_type === 'vet') {
          const { data } = await supabase.from('vets').select('id, name, photo_url').eq('id', msg.sender_id).single();
          sender = data;
        } else if (msg.sender_type === 'freelancer') {
          const { data } = await supabase.from('freelancers').select('id, name, photo_url').eq('id', msg.sender_id).single();
          sender = data;
        } else if (msg.sender_type === 'admin') {
          // Admin não tem tabela própria, buscar de auth.users
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(msg.sender_id);
          sender = {
            id: msg.sender_id,
            name: userData?.user?.user_metadata?.name || userData?.user?.email?.split('@')[0] || 'Administrador',
            photo_url: userData?.user?.user_metadata?.photo_url || null,
          };
        }

        return {
          ...msg,
          sender_name: sender?.name || 'Usuário',
          sender_photo_url: sender?.photo_url || null,
        };
      })
    );

    res.json({ conversation, messages: enrichedMessages });
  } catch (error: any) {
    console.error('Error in getConversation:', error);
    res.status(500).json({ error: 'Erro ao buscar conversa' });
  }
};

// ========================================
// ENVIAR MENSAGEM
// ========================================
export const sendMessage = async (
  req: Request<{ id: string }, {}, SendMessageBody>,
  res: Response
) => {
  try {
    const { id: conversationId } = req.params;
    const { message } = req.body;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Mensagem não pode estar vazia' });
    }

    if (message.length > 5000) {
      return res.status(400).json({ error: 'Mensagem muito longa (máximo 5000 caracteres)' });
    }

    // Verificar se conversa existe e usuário é participante
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    if (conversation.participant1_id !== user_id && conversation.participant2_id !== user_id) {
      return res.status(403).json({ error: 'Você não tem acesso a esta conversa' });
    }

    // Determinar sender_type
    const sender_type =
      conversation.participant1_id === user_id
        ? conversation.participant1_type
        : conversation.participant2_type;

    // Criar mensagem
    const { data: newMessage, error: msgError } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: conversationId,
          sender_id: user_id,
          sender_type,
          message: message.trim(),
        },
      ])
      .select()
      .single();

    if (msgError) {
      console.error('Error sending message:', msgError);
      return res.status(400).json({ error: msgError.message });
    }

    // last_message_at é atualizado automaticamente pelo trigger

    res.status(201).json({ message: newMessage });
  } catch (error: any) {
    console.error('Error in sendMessage:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

// ========================================
// MARCAR MENSAGENS COMO LIDAS
// ========================================
export const markAsRead = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se conversa existe e usuário é participante
    const { data: conversation } = await supabase
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const otherParticipantId =
      conversation.participant1_id === user_id
        ? conversation.participant2_id
        : conversation.participant1_id;

    // Marcar todas as mensagens do outro participante como lidas
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('sender_id', otherParticipantId)
      .is('read_at', null);

    if (error) {
      console.error('Error marking as read:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in markAsRead:', error);
    res.status(500).json({ error: 'Erro ao marcar como lido' });
  }
};

// ========================================
// ARQUIVAR CONVERSA
// ========================================
export const archiveConversation = async (
  req: Request<{ id: string }, {}, { archive: boolean }>,
  res: Response
) => {
  try {
    const { id: conversationId } = req.params;
    const { archive = true } = req.body;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se conversa existe e usuário é participante
    const { data: conversation } = await supabase
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const isParticipant1 = conversation.participant1_id === user_id;
    const field = isParticipant1 ? 'archived_by_participant1' : 'archived_by_participant2';

    const { error } = await supabase
      .from('conversations')
      .update({ [field]: archive })
      .eq('id', conversationId);

    if (error) {
      console.error('Error archiving conversation:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in archiveConversation:', error);
    res.status(500).json({ error: 'Erro ao arquivar conversa' });
  }
};

// ========================================
// DELETAR MENSAGEM (SOFT DELETE)
// ========================================
export const deleteMessage = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se mensagem existe e usuário é o remetente
    const { data: message } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (message.sender_id !== user_id) {
      return res.status(403).json({ error: 'Você só pode deletar suas próprias mensagens' });
    }

    // Soft delete
    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) {
      console.error('Error deleting message:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in deleteMessage:', error);
    res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
};

// ========================================
// REPORTAR MENSAGEM
// ========================================
export const reportMessage = async (
  req: Request<{ id: string }, {}, ReportMessageBody>,
  res: Response
) => {
  try {
    const { id: messageId } = req.params;
    const { report_reason } = req.body;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!report_reason || report_reason.trim().length < 10) {
      return res.status(400).json({ error: 'Motivo do reporte deve ter pelo menos 10 caracteres' });
    }

    // Verificar se mensagem existe
    const { data: message } = await supabase
      .from('messages')
      .select('id, sender_id')
      .eq('id', messageId)
      .single();

    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (message.sender_id === user_id) {
      return res.status(400).json({ error: 'Você não pode reportar suas próprias mensagens' });
    }

    // Criar reporte
    const { data: report, error } = await supabase
      .from('message_reports')
      .insert([
        {
          message_id: messageId,
          reported_by: user_id,
          report_reason: report_reason.trim(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating report:', error);
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ report });
  } catch (error: any) {
    console.error('Error in reportMessage:', error);
    res.status(500).json({ error: 'Erro ao reportar mensagem' });
  }
};

// ========================================
// OBTER METADADOS DA CONVERSA (SEM CONTEÚDO)
// ========================================
export const getConversationMetadata = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id: conversationId } = req.params;

    // Buscar apenas metadados (sem mensagens)
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('id, participant1_id, participant1_type, participant2_id, participant2_type, demand_id, application_id, last_message_at, created_at')
      .eq('id', conversationId)
      .single();

    if (error || !conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Contar mensagens (sem mostrar conteúdo)
    const { count: messageCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .is('deleted_at', null);

    res.json({
      conversation: {
        ...conversation,
        message_count: messageCount || 0,
      },
    });
  } catch (error: any) {
    console.error('Error in getConversationMetadata:', error);
    res.status(500).json({ error: 'Erro ao buscar metadados' });
  }
};

