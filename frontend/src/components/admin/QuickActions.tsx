import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CheckCircle, FileText, Activity } from 'lucide-react';
import colors from '../../styles/colors';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  action: () => void;
}

interface QuickActionsProps {
  pendingCount?: number;
}

const QuickActions: React.FC<QuickActionsProps> = ({ pendingCount = 0 }) => {
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      id: 'specialty',
      title: 'Cadastrar Especialidade',
      description: 'Adicionar nova especialidade ao sistema',
      icon: <Plus size={24} />,
      color: colors.brand.primary[500],
      action: () => {
        navigate('/admin/settings?tab=cadastros');
      },
    },
    {
      id: 'pending',
      title: 'Revisar Pendentes',
      description: `${pendingCount} cadastros aguardando análise`,
      icon: <CheckCircle size={24} />,
      color: '#3b82f6',
      action: () => {
        navigate('/admin/pending-all');
      },
    },
    {
      id: 'report',
      title: 'Gerar Relatório',
      description: 'Exportar relatório mensal (CSV/PDF)',
      icon: <FileText size={24} />,
      color: '#10b981',
      action: () => {
        // TODO: Implementar geração de relatório
        alert('Funcionalidade em desenvolvimento');
      },
    },
    {
      id: 'logs',
      title: 'Ver Logs',
      description: 'Acessar logs do sistema',
      icon: <Activity size={24} />,
      color: '#f59e0b',
      action: () => {
        // TODO: Implementar visualização de logs
        alert('Funcionalidade em desenvolvimento');
      },
    },
  ];

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Ações Rápidas</h3>
      <div style={styles.grid}>
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={action.action}
            style={styles.actionButton}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(196, 108, 106, 0.18)';
              e.currentTarget.style.borderColor = colors.brand.primary[500];
              if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
              }
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(196, 108, 106, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
              }
            }}
          >
            <div className="action-icon-circle" style={styles.actionIconCircle}>
              {React.cloneElement(action.icon as React.ReactElement, { 
                size: 28, 
                strokeWidth: 1.5, 
                color: "white" 
              })}
            </div>
            <span style={styles.actionLabel}>{action.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    marginTop: '32px',
    marginBottom: '32px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '20px',
  },
  actionButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #d7c7ff',
    borderRadius: '16px',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(196, 108, 106, 0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  actionIconCircle: {
    width: '56px',
    height: '56px',
    background: 'linear-gradient(135deg, colors.brand.primary[500] 0%, colors.brand.primary[500] 100%)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
  },
  actionLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d1b69',
    textAlign: 'center',
  },
};

export default QuickActions;

