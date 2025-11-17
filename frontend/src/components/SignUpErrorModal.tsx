import React from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, AlertTriangle, Info } from 'lucide-react';
import IconWrapper from './IconWrapper';
import { SignUpErrorType } from '../utils/signUpErrorHandler';
import colors from '../styles/colors';

interface SignUpErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorType: SignUpErrorType;
  onRetry?: () => void;
  onGoToLogin?: () => void;
  onOpenSupport?: () => void;
}

const SignUpErrorModal: React.FC<SignUpErrorModalProps> = ({
  isOpen,
  onClose,
  errorType,
  onRetry,
  onGoToLogin,
  onOpenSupport,
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const getErrorConfig = () => {
    switch (errorType) {
      case 'email_exists':
        return {
          icon: <IconWrapper icon={Info} size={32} />,
          color: '#7c3aed',
          bgColor: '#ede9fe',
          title: 'Email já cadastrado',
          message: 'Não foi possível criar a conta com esse e-mail. Se você já usa o PetiVet, tente fazer login.',
          buttonText: 'Entrar agora',
          onButtonClick: () => {
            if (onGoToLogin) {
              onGoToLogin();
            } else {
              navigate('/login');
            }
            onClose();
          },
        };
      case 'cnpj_exists':
      case 'cpf_exists':
        return {
          icon: <IconWrapper icon={AlertTriangle} size={32} />,
          color: '#f59e0b',
          bgColor: '#fef3c7',
          title: 'Documento já cadastrado',
          message: 'Não foi possível criar a conta com esses dados. Entre em contato com o suporte.',
          buttonText: 'Falar com o suporte',
          onButtonClick: () => {
            if (onOpenSupport) {
              onOpenSupport();
            }
            onClose();
          },
        };
      case 'network_error':
        return {
          icon: <IconWrapper icon={AlertTriangle} size={32} />,
          color: '#f59e0b',
          bgColor: '#fef3c7',
          title: 'Problema de conexão',
          message: 'Ops! Tivemos um probleminha na conexão. Pode tentar novamente em alguns instantes?',
          buttonText: 'Tentar novamente',
          onButtonClick: () => {
            if (onRetry) {
              onRetry();
            }
            onClose();
          },
        };
      case 'unexpected_error':
      default:
        return {
          icon: <IconWrapper icon={XCircle} size={32} />,
          color: '#ef4444',
          bgColor: '#fee2e2',
          title: 'Erro inesperado',
          message: 'Algo deu errado aqui. Nossa equipe já foi avisada e vai verificar. Tente novamente mais tarde.',
          buttonText: 'Entendi',
          onButtonClick: () => {
            onClose();
          },
        };
    }
  };

  const config = getErrorConfig();

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.content}>
          <div style={{ ...styles.iconContainer, backgroundColor: config.bgColor }}>
            <div style={{ color: config.color }}>
              {config.icon}
            </div>
          </div>
          
          <h2 style={styles.title}>{config.title}</h2>
          
          <p style={styles.message}>{config.message}</p>
          
          <div style={styles.actions}>
            <button
              type="button"
              onClick={config.onButtonClick}
              style={styles.button}
            >
              {config.buttonText}
            </button>
          </div>
        </div>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: '12px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  },
  content: {
    padding: '32px 24px',
    textAlign: 'center',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '12px',
    marginTop: 0,
  },
  message: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: '1.6',
    marginBottom: '24px',
    marginTop: 0,
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
  },
  button: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#ffffff',
    backgroundColor: colors.primary,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '120px',
  },
};

export default SignUpErrorModal;

