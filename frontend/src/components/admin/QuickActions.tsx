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
      color: '#7c3aed',
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
          <div
            key={action.id}
            onClick={action.action}
            style={{
              ...styles.card,
              borderLeftColor: action.color,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = `0 10px 25px ${action.color}15`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
            }}
          >
            <div style={{ ...styles.icon, color: action.color }}>
              {action.icon}
            </div>
            <div style={styles.content}>
              <h4 style={styles.cardTitle}>{action.title}</h4>
              <p style={styles.cardDescription}>{action.description}</p>
            </div>
          </div>
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  icon: {
    flexShrink: 0,
  },
  content: {
    flex: 1,
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  cardDescription: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
};

export default QuickActions;

