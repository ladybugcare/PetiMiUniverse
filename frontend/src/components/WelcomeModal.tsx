import React, { useState } from 'react';
import colors from '../styles/colors';
import { Sparkles, Stethoscope } from 'lucide-react';
import IconWrapper from './IconWrapper';

interface WelcomeModalProps {
  isOpen: boolean;
  onStart: () => void;
  onLater: () => void;
  onDontShowAgainChange?: (checked: boolean) => void;
  /** Espaço extra no topo do backdrop (ex.: header fixo da página) em px */
  backdropTopPaddingPx?: number;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onStart,
  onLater,
  onDontShowAgainChange,
  backdropTopPaddingPx = 0,
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
    <div
      style={{
        ...styles.backdrop,
        ...(backdropTopPaddingPx > 0
          ? {
              paddingTop: backdropTopPaddingPx,
              alignItems: 'flex-start' as const,
              justifyContent: 'center',
              overflowY: 'auto' as const,
            }
          : {}),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          ...styles.container,
          ...(backdropTopPaddingPx > 0 ? { marginTop: '16px' } : {}),
        }}
        role="dialog"
        aria-labelledby="welcome-modal-title"
        aria-modal="true"
      >
        <div style={styles.accentBar} aria-hidden />

        <div style={styles.header}>
          <h1 id="welcome-modal-title" style={styles.title}>
            Boas-vindas à PetMi Vet!
          </h1>
          <p style={styles.subtitle}>
            Cadastre sua clínica e a primeira unidade para ativar a conta. É rápido e libera todas as
            funcionalidades.
          </p>
        </div>

        <div style={styles.body}>
          <p style={styles.lead}>
            Antes de abrirmos as portas da sua clínica no PetMi Vet, precisamos saber onde ela fica e quem é o
            responsável técnico.
          </p>
          <p style={styles.text}>
            Esse passo mantém tudo seguro e organizado, e facilita a conexão com veterinários e tutores.
          </p>

          <div style={styles.howItWorks}>
            <div style={styles.sectionHeader}>
              <div style={styles.iconBadge}>
                <IconWrapper icon={Sparkles} size={22} color={colors.brand.primary[600]} />
              </div>
              <h2 style={styles.sectionTitle}>Como funciona</h2>
            </div>
            <ol style={styles.steps}>
              <li style={styles.step}>
                <span style={styles.stepNum}>1</span>
                <span style={styles.stepBody}>Cadastre sua primeira unidade (ex.: PetMi Vet – Cotia).</span>
              </li>
              <li style={styles.step}>
                <span style={styles.stepNum}>2</span>
                <span style={styles.stepBody}>Nossa equipe revisa as informações.</span>
              </li>
              <li style={styles.step}>
                <span style={styles.stepNum}>3</span>
                <span style={styles.stepBody}>
                  Após aprovação, você cria demandas, anúncios e convida a equipe.
                </span>
              </li>
            </ol>
          </div>

          <div style={styles.ctaSection}>
            <div style={styles.ctaIconWrap} aria-hidden>
              <IconWrapper icon={Stethoscope} size={26} color={colors.brand.primary[600]} />
            </div>
            <p style={styles.ctaKicker}>Pronto para começar?</p>
            <p style={styles.ctaText}>
              Toque em <strong style={styles.ctaStrong}>Começar</strong> e preencha os dados da primeira unidade.
            </p>
          </div>
        </div>

        <div style={styles.bottomBar}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={handleDontShowChange}
              style={styles.checkbox}
            />
            <span style={styles.checkboxText}>Não mostrar novamente</span>
          </label>
          <div style={styles.footerButtons}>
            <button
              type="button"
              onClick={handleLater}
              style={styles.laterButton}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.neutral[100];
                e.currentTarget.style.borderColor = colors.neutral[300];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.surface;
                e.currentTarget.style.borderColor = colors.border;
              }}
            >
              Depois
            </button>
            <button
              type="button"
              onClick={onStart}
              style={styles.startButton}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.brand.primary[600];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.brand.primary[500];
              }}
            >
              Começar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: colors.overlay,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
  },
  container: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderRadius: '16px',
    border: `1px solid ${colors.border}`,
    boxShadow: '0 24px 64px rgba(42, 39, 38, 0.12), 0 8px 24px rgba(42, 39, 38, 0.08)',
    maxWidth: '560px',
    width: '100%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 0 20px',
    overflow: 'hidden',
  },
  accentBar: {
    height: '4px',
    width: '100%',
    background: `linear-gradient(90deg, ${colors.brand.primary[400]} 0%, ${colors.brand.primary[600]} 55%, ${colors.accent.sage[400]} 100%)`,
    flexShrink: 0,
  },
  header: {
    textAlign: 'center',
    padding: '22px 28px 8px',
    flexShrink: 0,
  },
  title: {
    fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
    fontWeight: 700,
    color: colors.text,
    margin: '0 0 10px',
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
  },
  subtitle: {
    fontSize: '15px',
    color: colors.textSecondary,
    lineHeight: 1.55,
    margin: 0,
    maxWidth: '440px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    flex: '1 1 auto',
    overflowY: 'auto',
    padding: '8px 28px 4px',
    textAlign: 'left',
  },
  lead: {
    fontSize: '15px',
    color: colors.text,
    lineHeight: 1.55,
    margin: 0,
    fontWeight: 500,
  },
  text: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
  howItWorks: {
    marginTop: '4px',
    backgroundColor: colors.brand.primary[50],
    border: `1px solid ${colors.brand.primary[200]}`,
    borderLeft: `4px solid ${colors.brand.primary[500]}`,
    borderRadius: '12px',
    padding: '18px 18px 18px 16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px',
  },
  iconBadge: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.brand.primary[200]}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 1px 2px rgba(42, 39, 38, 0.04)',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: colors.brand.primary[800],
    margin: 0,
    letterSpacing: '-0.01em',
  },
  steps: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  step: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr',
    gap: '12px',
    alignItems: 'start',
    fontSize: '14px',
    lineHeight: 1.5,
    color: colors.text,
  },
  stepNum: {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    backgroundColor: colors.brand.primary[500],
    color: colors.surface,
    fontSize: '13px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1,
  },
  stepBody: {
    paddingTop: '2px',
  },
  ctaSection: {
    textAlign: 'center',
    padding: '20px 18px',
    marginTop: '2px',
    background: `linear-gradient(180deg, ${colors.neutral[50]} 0%, ${colors.brand.primary[50]} 100%)`,
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
  },
  ctaIconWrap: {
    width: '52px',
    height: '52px',
    margin: '0 auto 12px',
    borderRadius: '50%',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.brand.primary[200]}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(196, 108, 106, 0.12)',
  },
  ctaKicker: {
    fontSize: '17px',
    fontWeight: 700,
    color: colors.text,
    margin: '0 0 6px',
    letterSpacing: '-0.02em',
  },
  ctaText: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: 1.55,
    margin: 0,
    maxWidth: '360px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  ctaStrong: {
    color: colors.brand.primary[700],
    fontWeight: 700,
  },
  bottomBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    marginTop: '12px',
    padding: '16px 28px 0',
    borderTop: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: 0,
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: colors.brand.primary[500],
    flexShrink: 0,
  },
  checkboxText: {
    fontSize: '13px',
    color: colors.textSecondary,
    lineHeight: 1.35,
  },
  footerButtons: {
    display: 'flex',
    gap: '10px',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  laterButton: {
    padding: '11px 20px',
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
  },
  startButton: {
    padding: '11px 22px',
    backgroundColor: colors.brand.primary[500],
    color: colors.surface,
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    boxShadow: '0 2px 8px rgba(196, 108, 106, 0.35)',
  },
};

export default WelcomeModal;
