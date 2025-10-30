import React, { useState } from 'react';
import colors from '../styles/colors';
import { Sparkles } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onStart: () => void;
  onLater: () => void;
  onDontShowAgainChange?: (checked: boolean) => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onStart,
  onLater,
  onDontShowAgainChange,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleDontShowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDontShowAgain(checked);
    onDontShowAgainChange?.(checked);
  };

  const handleLater = () => {
    if (dontShowAgain) {
      localStorage.setItem('hideWelcomeModal', 'true');
    }
    onLater();
  };

  return (
    <>
      <div style={styles.backdrop} onClick={(e) => e.stopPropagation()}>
        <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Boas-vindas à PetiVet!</h1>
          <p style={styles.subtitle}>
            Cadastre sua clínica e primeira unidade para ativar sua conta.
            É rápido e necessário para liberar todas as funcionalidades.
          </p>
        </div>

        <div style={styles.body}>

          <p style={styles.text}>
            Antes de abrirmos as portas da sua clínica no PetiVet, precisamos conhecer 
            onde ela fica e quem é o responsável técnico.
          </p>
          <p style={styles.text}>
            Esse processo ajuda a manter tudo seguro, organizado e facilita a conexão 
            com veterinários e tutores.
          </p>


          <div style={styles.howItWorks}>
            <div style={styles.sectionHeader}>
              <span style={styles.emoji}>
                <Sparkles size={24} color={colors.primary} />
              </span>
              <h3 style={styles.sectionTitle}>Como funciona:</h3>
            </div>

            <ul style={styles.list}>
              <li style={styles.listItem}>
                <span style={styles.bullet}>1.</span>
                Cadastre sua primeira unidade (ex: PetiVet – Cotia).
              </li>
              <li style={styles.listItem}>
                <span style={styles.bullet}>2.</span>
                Nossa equipe revisa suas informações.
              </li>
              <li style={styles.listItem}>
                <span style={styles.bullet}>3.</span>
                Assim que aprovada, você pode criar demandas, anúncios e adicionar outros usuários.
              </li>
            </ul>
          </div>

          <div style={styles.ctaSection}>
            <span style={styles.emoji}>🩺</span>
            <p style={styles.ctaText}>
              <strong>Vamos nessa?</strong>
              <br />
              Clique em "Começar" e cadastre sua primeira unidade!
            </p>
          </div>
        </div>

        <div style={styles.checkboxContainer}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={handleDontShowChange}
              style={styles.checkbox}
            />
            <span style={styles.checkboxText}>Não mostrar novamente</span>
          </label>
        </div>

        <div style={styles.footer}>
          <button
            onClick={handleLater}
            style={styles.laterButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.neutral[50];
              e.currentTarget.style.borderColor = colors.neutral[400];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.surface;
              e.currentTarget.style.borderColor = colors.border;
            }}
          >
            Depois
          </button>
          <button
            onClick={onStart}
            style={styles.startButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.primaryDark;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.primary;
            }}
          >
            Começar
          </button>
        </div>
      </div>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  backdrop: {
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
    zIndex: 9999,
    padding: '16px',
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    maxWidth: '650px',
    width: '90%',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: colors.text,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: '1.5',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    flex: '1 1 auto',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  section: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  emoji: {
    fontSize: '20px',
    flexShrink: 0,
  },
  text: {
    fontSize: '14px',
    color: colors.text,
    lineHeight: '1.5',
    margin: 0,
  },
  howItWorks: {
    backgroundColor: colors.primaryBg,
    borderLeft: `3px solid ${colors.primary}`,
    padding: '14px 16px',
    borderRadius: '6px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
    margin: 0,
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  listItem: {
    fontSize: '13px',
    color: colors.text,
    lineHeight: '1.5',
    display: 'flex',
    gap: '10px',
  },
  bullet: {
    fontWeight: '700',
    color: colors.primary,
    flexShrink: 0,
    minWidth: '18px',
  },
  ctaSection: {
    textAlign: 'center',
    padding: '14px',
    backgroundColor: colors.neutral[50],
    borderRadius: '6px',
  },
  ctaText: {
    fontSize: '14px',
    color: colors.text,
    lineHeight: '1.5',
    margin: 0,
  },
  checkboxContainer: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: colors.primary,
  },
  checkboxText: {
    fontSize: '13px',
    color: colors.textSecondary,
  },
  footer: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    marginTop: '16px',
    flexShrink: 0,
  },
  laterButton: {
    padding: '10px 20px',
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    border: `2px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  startButton: {
    padding: '10px 24px',
    backgroundColor: colors.primary,
    color: colors.surface,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default WelcomeModal;

