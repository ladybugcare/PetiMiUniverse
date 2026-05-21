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
      title: 'Cadastrar especialidade',
      description: 'Adicionar nova especialidade ao sistema',
      icon: <Plus size={24} />,
      color: colors.brand.primary[500],
      action: () => {
        navigate('/admin/settings?tab=cadastros');
      },
    },
    {
      id: 'pending',
      title: 'Revisar pendentes',
      description:
        pendingCount === 0
          ? 'Nenhum item aguardando revisão'
          : `${pendingCount} ${pendingCount === 1 ? 'item nas filas' : 'itens nas filas'} de aprovação`,
      icon: <CheckCircle size={24} />,
      color: colors.info[500],
      action: () => {
        navigate('/admin/pending-all');
      },
    },
    {
      id: 'report',
      title: 'Gerar relatório',
      description: 'Exportar visão mensal (em breve)',
      icon: <FileText size={24} />,
      color: colors.accent.sage[500],
      action: () => {
        // TODO: Implementar geração de relatório
        alert('Funcionalidade em desenvolvimento');
      },
    },
    {
      id: 'logs',
      title: 'Ver logs',
      description: 'Auditoria e diagnóstico (em breve)',
      icon: <Activity size={24} />,
      color: colors.warning[500],
      action: () => {
        // TODO: Implementar visualização de logs
        alert('Funcionalidade em desenvolvimento');
      },
    },
  ];

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Ações rápidas</h3>
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
              e.currentTarget.style.borderColor = colors.brand.primary[300];
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
            <span style={styles.actionDesc}>{action.description}</span>
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
    fontSize: 'clamp(1.05rem, 2.5vw, 1.2rem)',
    fontWeight: 700,
    color: colors.text,
    marginBottom: '16px',
    letterSpacing: '-0.02em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))',
    gap: '14px',
  },
  actionButton: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '14px',
    padding: '22px 14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
    boxShadow: '0 2px 8px rgba(42, 39, 38, 0.05)',
    position: 'relative',
    overflow: 'hidden',
  },
  actionIconCircle: {
    width: '52px',
    height: '52px',
    background: `linear-gradient(135deg, ${colors.brand.primary[500]} 0%, ${colors.brand.primary[600]} 100%)`,
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s ease',
    boxShadow: '0 4px 14px rgba(196, 108, 106, 0.28)',
  },
  actionLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 1.3,
  },
  actionDesc: {
    fontSize: '11px',
    fontWeight: 500,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 1.35,
    maxWidth: '140px',
  },
};

export default QuickActions;

