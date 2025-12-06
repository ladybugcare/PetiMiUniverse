import React, { useState } from 'react';
import { Search, Archive, Shield } from 'lucide-react';
import { Conversation } from '../services/messagesApi';
import Avatar from './Avatar';
import UnreadBadge from './UnreadBadge';
import Timestamp from './Timestamp';
import colors from '../styles/colors';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelectConversation: (conversation: Conversation) => void;
  showArchived?: boolean;
  onToggleArchived?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  showArchived = false,
  onToggleArchived,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter((conv) => {
    if (showArchived) {
      const isArchived =
        (conv.participant1_id === conv.other_participant?.id && conv.archived_by_participant1) ||
        (conv.participant2_id === conv.other_participant?.id && conv.archived_by_participant2);
      if (!isArchived) return false;
    } else {
      const isArchived =
        (conv.participant1_id === conv.other_participant?.id && conv.archived_by_participant1) ||
        (conv.participant2_id === conv.other_participant?.id && conv.archived_by_participant2);
      if (isArchived) return false;
    }

    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      conv.other_participant?.name?.toLowerCase().includes(query) ||
      conv.last_message?.message?.toLowerCase().includes(query)
    );
  });

  return (
    <div style={styles.container}>
      {/* Header com busca */}
      <div style={styles.header}>
        <div style={styles.searchContainer}>
          <Search size={18} color={colors.neutral[500]} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        {onToggleArchived && (
          <button
            onClick={onToggleArchived}
            style={{
              ...styles.archiveButton,
              ...(showArchived ? styles.archiveButtonActive : {}),
            }}
          >
            <Archive size={16} />
            {showArchived ? 'Ativas' : 'Arquivadas'}
          </button>
        )}
      </div>

      {/* Lista de conversas */}
      <div style={styles.list}>
        {filteredConversations.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>
              {showArchived ? 'Nenhuma conversa arquivada' : 'Nenhuma conversa encontrada'}
            </p>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const isSelected = conversation.id === selectedConversationId;
            const otherParticipant = conversation.other_participant;

            return (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                style={{
                  ...styles.conversationItem,
                  ...(isSelected ? styles.conversationItemSelected : {}),
                }}
              >
                <Avatar
                  src={otherParticipant?.photo_url}
                  name={otherParticipant?.name}
                  size={48}
                  userType={otherParticipant?.type}
                />
                <div style={styles.conversationContent}>
                  <div style={styles.conversationHeader}>
                    <div style={styles.nameContainer}>
                      <span style={styles.conversationName}>
                        {otherParticipant?.name || 'Usuário'}
                      </span>
                      {otherParticipant?.type === 'admin' && (
                        <Shield size={14} color={colors.brand.primary[500]} style={styles.adminBadge} />
                      )}
                    </div>
                    {conversation.last_message_at && (
                      <Timestamp
                        date={conversation.last_message_at}
                        format="short"
                        style={styles.conversationTime}
                      />
                    )}
                  </div>
                  <div style={styles.conversationPreview}>
                    <span style={styles.lastMessage}>
                      {conversation.last_message?.message || 'Nenhuma mensagem ainda'}
                    </span>
                    {conversation.unread_count && conversation.unread_count > 0 && (
                      <UnreadBadge count={conversation.unread_count} />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#ffffff',
    borderRight: `1px solid ${colors.border}`,
  },
  header: {
    padding: '16px',
    borderBottom: `1px solid ${colors.border}`,
  },
  searchContainer: {
    position: 'relative',
    marginBottom: '12px',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 40px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
  },
  archiveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    color: colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  archiveButtonActive: {
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    borderColor: colors.brand.primary[500],
  },
  list: {
    flex: 1,
    overflowY: 'auto',
  },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '14px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
  },
  conversationItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px 16px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    borderBottom: `1px solid ${colors.border}`,
  },
  conversationItemSelected: {
    backgroundColor: colors.brand.primary[500],
    borderLeft: `3px solid ${colors.brand.primary[500]}`,
  },
  conversationContent: {
    flex: 1,
    minWidth: 0,
  },
  conversationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  nameContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: 0,
  },
  conversationName: {
    fontSize: '15px',
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'Poppins, sans-serif',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  adminBadge: {
    flexShrink: 0,
  },
  conversationTime: {
    fontSize: '12px',
    flexShrink: 0,
    marginLeft: '8px',
  },
  conversationPreview: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  lastMessage: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
};

export default ConversationList;

