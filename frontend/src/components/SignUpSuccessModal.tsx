import React from 'react';
import { Heart, Mail } from 'lucide-react';
import IconWrapper from './IconWrapper';
import colors from '../styles/colors';

interface SignUpSuccessModalProps {
  email: string;
  loading: boolean;
  emailResent: boolean;
  onResendEmail: () => void;
}

const SignUpSuccessModal: React.FC<SignUpSuccessModalProps> = ({
  email,
  loading,
  emailResent,
  onResendEmail
}) => {
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {!emailResent ? (
          <>
            <h2 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <IconWrapper icon={Heart} size={32} color={colors.brand.primary[500]} />
                <span>Tudo pronto!</span>
              </div>
            </h2>

            <p style={styles.text}>
              Enviamos um e-mail de confirmação para <strong>{email}</strong>.
            </p>
            <p style={styles.text}>
              É só abrir sua caixa de entrada e seguir as instruções para ativar sua conta PetMi Vet.
            </p>
            <p style={styles.text}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Você pode fechar esta aba — o restante do processo é feito por e-mail.
                <IconWrapper icon={Mail} size={18} color={colors.brand.primary[500]} />
              </span>
            </p>

            <div style={styles.resendSection}>
              <p style={styles.resendText}>Não recebeu o e-mail?</p>
              <button
                onClick={onResendEmail}
                style={styles.resendButton}
                disabled={loading}
              >
                {loading ? 'Enviando...' : 'Reenviar e-mail'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <IconWrapper icon={Mail} size={32} color={colors.brand.primary[500]} />
                <span>E-mail reenviado!</span>
              </div>
            </h2>
            <p style={styles.text}>
              Verifique sua caixa de entrada (ou spam) e confirme seu cadastro para continuar.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '500px',
    width: '90%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '20px',
  },
  text: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  resendSection: {
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #e5e7eb',
  },
  resendText: {
    fontSize: '14px',
    color: '#9ca3af',
    marginBottom: '12px',
  },
  resendButton: {
    padding: '10px 24px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease-in-out',
  },
};

export default SignUpSuccessModal;
