import React from 'react';
import colors from '../styles/colors';

interface MessageBubbleProps {
  message: string;
  isOwn: boolean;
  senderName?: string;
  timestamp: string;
  read?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  senderName,
  timestamp,
  read,
}) => {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  return (
    <div
      style={{
        ...styles.bubble,
        ...(isOwn ? styles.ownBubble : styles.otherBubble),
      }}
    >
      {!isOwn && senderName && (
        <div style={styles.senderName}>{senderName}</div>
      )}
      <div style={styles.messageText}>{message}</div>
      <div style={styles.timestampContainer}>
        <span style={styles.timestamp}>{formatTime(timestamp)}</span>
        {isOwn && (
          <span style={styles.readIndicator}>
            {read ? '✓✓' : '✓'}
          </span>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  bubble: {
    maxWidth: '70%',
    padding: '12px 16px',
    borderRadius: '12px',
    marginBottom: '8px',
    wordWrap: 'break-word',
  },
  ownBubble: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    alignSelf: 'flex-end',
    marginLeft: 'auto',
  },
  otherBubble: {
    backgroundColor: '#ffffff',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: '12px',
    fontWeight: '600',
    opacity: 0.8,
    marginBottom: '4px',
  },
  messageText: {
    fontSize: '14px',
    lineHeight: '1.5',
    margin: '4px 0',
  },
  timestampContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: '11px',
    opacity: 0.7,
  },
  readIndicator: {
    fontSize: '11px',
    opacity: 0.7,
  },
};

export default MessageBubble;




