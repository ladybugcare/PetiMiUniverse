import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { Message } from '../services/messagesApi';
import MessageBubble from './MessageBubble';
import Avatar from './Avatar';
import colors from '../styles/colors';

interface ConversationThreadProps {
  messages: Message[];
  currentUserId: string;
  otherParticipantName?: string;
  otherParticipantPhoto?: string;
  otherParticipantType?: 'clinic' | 'vet' | 'freelancer' | 'admin';
  onSendMessage: (message: string) => Promise<void>;
  loading?: boolean;
}

export const ConversationThread: React.FC<ConversationThreadProps> = ({
  messages,
  currentUserId,
  otherParticipantName,
  otherParticipantPhoto,
  otherParticipantType,
  onSendMessage,
  loading = false,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para última mensagem
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      await onSendMessage(newMessage.trim());
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  // Agrupar mensagens por data
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    
    messages.forEach((msg) => {
      const date = new Date(msg.created_at);
      const dateKey = date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });
    
    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div style={styles.container}>
      {/* Área de mensagens */}
      <div ref={messagesContainerRef} style={styles.messagesContainer}>
        {Object.entries(messageGroups).map(([date, dateMessages]) => (
          <div key={date}>
            {/* Separador de data */}
            <div style={styles.dateSeparator}>
              <span style={styles.dateText}>{date}</span>
            </div>
            
            {/* Mensagens do dia */}
            {dateMessages.map((message) => {
              const isOwn = message.sender_id === currentUserId;
              return (
                <div
                  key={message.id}
                  style={{
                    ...styles.messageWrapper,
                    justifyContent: isOwn ? 'flex-end' : 'flex-start',
                  }}
                >
                  {!isOwn && (
                    <Avatar
                      src={message.sender_photo_url}
                      name={message.sender_name}
                      size={32}
                      style={styles.avatar}
                      userType={otherParticipantType || message.sender_type}
                    />
                  )}
                  <MessageBubble
                    message={message.message}
                    isOwn={isOwn}
                    senderName={isOwn ? undefined : message.sender_name}
                    timestamp={message.created_at}
                    read={!!message.read_at}
                  />
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de envio */}
      <form onSubmit={handleSend} style={styles.inputContainer}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Digite sua mensagem..."
          style={styles.input}
          disabled={sending || loading}
          maxLength={5000}
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending || loading}
          style={{
            ...styles.sendButton,
            ...((!newMessage.trim() || sending || loading) ? styles.sendButtonDisabled : {}),
          }}
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#f9fafb',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  messageWrapper: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    width: '100%',
  },
  avatar: {
    flexShrink: 0,
  },
  dateSeparator: {
    display: 'flex',
    justifyContent: 'center',
    margin: '16px 0',
  },
  dateText: {
    fontSize: '12px',
    color: colors.textSecondary,
    backgroundColor: '#ffffff',
    padding: '4px 12px',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
  },
  inputContainer: {
    display: 'flex',
    gap: '8px',
    padding: '16px',
    backgroundColor: '#ffffff',
    borderTop: `1px solid ${colors.border}`,
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    border: `1px solid ${colors.border}`,
    borderRadius: '24px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
  },
  sendButton: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

export default ConversationThread;

