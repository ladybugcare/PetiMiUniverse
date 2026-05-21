import React from 'react';
import { useNavigate } from 'react-router-dom';
import colors from '../styles/colors';
import { Lock, Lightbulb } from 'lucide-react';
import IconWrapper from './IconWrapper';

// Helper function to convert hex to rgba
const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const DashboardBlockedOverlay: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <span style={styles.icon}>
            <IconWrapper icon={Lock} size={48} color={colors.brand.primary[500]} />
          </span>
        </div>
        
        <h2 style={styles.title}>Finalize seu cadastro</h2>
        
        <p style={styles.description}>
          Para acessar o dashboard e todas as funcionalidades da PetMi Vet, 
          você precisa cadastrar a primeira unidade da sua clínica.
        </p>

        <div style={styles.infoBox}>
          <span style={styles.infoIcon}>
            <IconWrapper icon={Lightbulb} size={20} color={colors.brand.primary[500]} />
          </span>
          <p style={styles.infoText}>
            Não se preocupe! O processo é rápido e nossa equipe irá revisar 
            suas informações para garantir a segurança de todos.
          </p>
        </div>

        <button
          onClick={() => navigate('/units/create-first')}
          style={styles.button}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.brand.primary[600];
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = `0 8px 20px ${hexToRgba(colors.brand.primary[500], 0.4)}`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = colors.brand.primary[500];
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = `0 4px 12px ${hexToRgba(colors.brand.primary[500], 0.3)}`;
          }}
        >
          Cadastrar Primeira Unidade
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    maxWidth: '500px',
    width: '100%',
    padding: '48px 40px',
    textAlign: 'center',
  },
  iconContainer: {
    marginBottom: '24px',
  },
  icon: {
    fontSize: '64px',
    display: 'inline-block',
    animation: 'pulse 2s ease-in-out infinite',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: colors.text,
    marginBottom: '16px',
  },
  description: {
    fontSize: '16px',
    color: colors.textSecondary,
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  infoBox: {
    backgroundColor: colors.brand.primary[50],
    borderLeft: `4px solid ${colors.brand.primary[500]}`,
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '32px',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  infoText: {
    fontSize: '14px',
    color: colors.text,
    lineHeight: '1.6',
    margin: 0,
  },
  button: {
    width: '100%',
    padding: '16px 32px',
    backgroundColor: colors.brand.primary[500],
    color: colors.surface,
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: `0 4px 12px ${hexToRgba(colors.brand.primary[500], 0.3)}`,
  },
};

export default DashboardBlockedOverlay;

