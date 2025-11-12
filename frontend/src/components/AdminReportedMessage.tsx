import React from 'react';
import { Eye, Trash2, CheckCircle } from 'lucide-react';
import Avatar from './Avatar';
import colors from '../styles/colors';

interface AdminReportedMessageProps {
  report: {
    id: string;
    report_reason: string;
    status: string;
    created_at: string;
    reporter_email?: string;
    message?: {
      id: string;
      message: string;
      sender_name?: string;
      sender_photo_url?: string;
      created_at: string;
      conversations?: {
        id: string;
      };
    };
  };
  onViewConversation: (conversationId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onResolveReport: (reportId: string) => void;
}

export const AdminReportedMessage: React.FC<AdminReportedMessageProps> = ({
  report,
  onViewConversation,
  onDeleteMessage,
  onResolveReport,
}) => {
  const conversationId = report.message?.conversations?.id;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.senderInfo}>
          <Avatar
            src={report.message?.sender_photo_url}
            name={report.message?.sender_name || 'Usuário'}
            size={40}
          />
          <div style={styles.senderDetails}>
            <span style={styles.senderName}>{report.message?.sender_name || 'Usuário'}</span>
            <span style={styles.reporterInfo}>
              Reportado por: {report.reporter_email || 'Email não disponível'}
            </span>
          </div>
        </div>
        <span style={styles.statusBadge}>
          {report.status === 'pending' ? 'Pendente' : 
           report.status === 'reviewed' ? 'Revisado' : 'Resolvido'}
        </span>
      </div>

      <div style={styles.messagePreview}>
        <p style={styles.messageText}>
          {report.message?.message?.substring(0, 200)}
          {report.message?.message && report.message.message.length > 200 ? '...' : ''}
        </p>
      </div>

      <div style={styles.reasonSection}>
        <strong style={styles.reasonLabel}>Motivo do reporte:</strong>
        <p style={styles.reasonText}>{report.report_reason}</p>
      </div>

      <div style={styles.actions}>
        {conversationId && (
          <button
            onClick={() => onViewConversation(conversationId)}
            style={styles.viewButton}
          >
            <Eye size={16} />
            Ver Conversa
          </button>
        )}
        <button
          onClick={() => report.message && onDeleteMessage(report.message.id)}
          style={styles.deleteButton}
        >
          <Trash2 size={16} />
          Deletar Mensagem
        </button>
        {report.status === 'pending' && (
          <button
            onClick={() => onResolveReport(report.id)}
            style={styles.resolveButton}
          >
            <CheckCircle size={16} />
            Resolver Reporte
          </button>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    backgroundColor: '#ffffff',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  senderInfo: {
    display: 'flex',
    gap: '12px',
    flex: 1,
  },
  senderDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  senderName: {
    fontSize: '15px',
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'Poppins, sans-serif',
  },
  reporterInfo: {
    fontSize: '12px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    backgroundColor: colors.warningLight,
    color: colors.warning,
  },
  messagePreview: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
  },
  messageText: {
    fontSize: '14px',
    color: colors.text,
    fontFamily: 'Inter, sans-serif',
    margin: 0,
    lineHeight: '1.5',
  },
  reasonSection: {
    marginBottom: '16px',
  },
  reasonLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'Inter, sans-serif',
    display: 'block',
    marginBottom: '4px',
  },
  reasonText: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
    margin: 0,
    lineHeight: '1.5',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  viewButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: colors.danger,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  resolveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: colors.success,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default AdminReportedMessage;

