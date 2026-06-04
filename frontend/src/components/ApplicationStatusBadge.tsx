import React from 'react';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  UserPlus, 
  LogIn, 
  LogOut, 
  FileText, 
  CheckCircle2,
  X
} from 'lucide-react';
import colors from '../styles/colors';

interface ApplicationStatusBadgeProps {
  status: string;
  showIcon?: boolean;
}

const ApplicationStatusBadge: React.FC<ApplicationStatusBadgeProps> = ({ 
  status, 
  showIcon = true 
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'invited':
        return {
          label: 'Convidado',
          color: '#3b82f6', // azul
          bgColor: '#dbeafe',
          icon: UserPlus,
        };
      case 'applied':
        return {
          label: 'Candidatado',
          color: '#f59e0b', // amarelo
          bgColor: '#fef3c7',
          icon: Clock,
        };
      case 'approved':
        return {
          label: 'Aprovado',
          color: '#10b981', // verde
          bgColor: '#d1fae5',
          icon: CheckCircle,
        };
      case 'rejected':
        return {
          label: 'Rejeitado',
          color: '#ef4444', // vermelho
          bgColor: '#fee2e2',
          icon: XCircle,
        };
      case 'rejected_by_vet':
        return {
          label: 'Recusado pelo Vet',
          color: '#f97316', // laranja
          bgColor: '#fed7aa',
          icon: X,
        };
      case 'check_in':
        return {
          label: 'Check-in Realizado',
          color: '#f59e0b', // laranja
          bgColor: '#fef3c7',
          icon: LogIn,
        };
      case 'check_out':
        return {
          label: 'Check-out Realizado',
          color: colors.brand.primary[500], // roxo
          bgColor: '#ede9fe',
          icon: LogOut,
        };
      case 'report_sent':
        return {
          label: 'Relatório Enviado',
          color: '#06b6d4', // ciano
          bgColor: '#cffafe',
          icon: FileText,
        };
      case 'report_approved':
        return {
          label: 'Relatório Aprovado',
          color: '#059669', // verde escuro
          bgColor: '#d1fae5',
          icon: CheckCircle2,
        };
      case 'canceled_by_vet':
        return {
          label: 'Cancelado',
          color: '#6b7280', // cinza
          bgColor: '#f3f4f6',
          icon: XCircle,
        };
      // 'pending' e 'accepted' são mantidos apenas para compatibilidade com dados legados
      // O status correto é 'applied' e 'approved'
      case 'pending':
        return {
          label: 'Pendente',
          color: '#f59e0b',
          bgColor: '#fef3c7',
          icon: Clock,
        };
      case 'accepted':
        // Mapear 'accepted' para 'approved' visualmente
        return {
          label: 'Aprovado',
          color: '#10b981',
          bgColor: '#d1fae5',
          icon: CheckCircle,
        };
      default:
        return {
          label: status,
          color: '#6b7280',
          bgColor: '#f3f4f6',
          icon: Clock,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.color}20`,
      }}
      title={config.label}
    >
      {showIcon && <Icon size={14} />}
      {config.label}
    </span>
  );
};

export default ApplicationStatusBadge;

