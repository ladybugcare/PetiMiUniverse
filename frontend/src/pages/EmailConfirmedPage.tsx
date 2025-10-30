import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

const EmailConfirmedPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Obter sessão atual do Supabase
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setStatus('error');
          return;
        }

        if (session && session.user) {
          // Salvar dados do usuário e token no localStorage
          const userData = {
            id: session.user.id,
            email: session.user.email,
            user_metadata: session.user.user_metadata,
            access_token: session.access_token,
            token: session.access_token,
          };
          localStorage.setItem('user', JSON.stringify(userData));
          
          // Marcar como primeiro acesso
          localStorage.setItem('isFirstAccess', 'true');
          
          setStatus('success');
          
          // Aguardar 2 segundos antes de redirecionar
          setTimeout(() => {
            navigate('/units/create-first');
          }, 2000);
        } else {
          setStatus('error');
        }
      } catch (err) {
        console.error('Error confirming email:', err);
        setStatus('error');
      }
    };
    
    handleEmailConfirmation();
  }, [navigate]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status === 'loading' && (
          <>
            <div style={styles.spinner}></div>
            <h2 style={styles.title}>Confirmando seu e-mail...</h2>
            <p style={styles.message}>Aguarde um momento.</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.title}>E-mail confirmado com sucesso! 🎉</h2>
            <p style={styles.message}>
              Redirecionando você para cadastrar sua primeira unidade...
            </p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div style={styles.errorIcon}>✕</div>
            <h2 style={styles.title}>Erro ao confirmar e-mail</h2>
            <p style={styles.message}>
              Não foi possível confirmar seu e-mail. Por favor, tente fazer login.
            </p>
            <button 
              onClick={() => navigate('/login')} 
              style={styles.button}
            >
              Ir para Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    padding: '20px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '48px 32px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '16px',
  },
  message: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    margin: '0 auto 24px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    color: '#ffffff',
    borderRadius: '50%',
    fontSize: '36px',
    fontWeight: '700',
  },
  errorIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    borderRadius: '50%',
    fontSize: '36px',
    fontWeight: '700',
  },
  button: {
    padding: '12px 32px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease-in-out',
  },
};

// Adicionar animação de spinner via CSS global (ou use styled-components)
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default EmailConfirmedPage;

