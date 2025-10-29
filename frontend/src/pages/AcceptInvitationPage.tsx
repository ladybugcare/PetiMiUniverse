import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAlert } from '../hooks/useAlert';
import { clinicUsersApi } from '../services/clinicUsersApi';
import HomeHeader from '../components/HomeHeader';

const AcceptInvitationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      showError('Token de convite inválido');
      navigate('/login');
    }
  }, [token]);

  const handleAccept = async () => {
    if (!token) {
      showError('Token de convite não encontrado');
      return;
    }

    try {
      setAccepting(true);
      
      // Check if user is logged in
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.id) {
        // Redirect to login with token in URL
        navigate(`/login?invitation=${token}`);
        return;
      }

      // Accept invitation
      const result = await clinicUsersApi.acceptInvitation(token);
      
      // Save clinic_user to localStorage
      localStorage.setItem('clinic_user', JSON.stringify(result.clinic_user));
      
      showSuccess('Convite aceito com sucesso! Bem-vindo à equipe!');
      
      // Redirect to appropriate dashboard
      const userRole = user?.user_metadata?.role || user?.role;
      if (userRole === 'clinic') {
        navigate('/clinic-dashboard');
      } else if (userRole === 'vet') {
        navigate('/vet-dashboard');
      } else {
        navigate('/demands');
      }
    } catch (error: any) {
      showError('Erro ao aceitar convite: ' + (error.message || 'Token inválido ou expirado'));
    } finally {
      setAccepting(false);
    }
  };

  return (
    <>
      <HomeHeader />
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconCircle}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#7c3aed"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          
          <h1 style={styles.title}>Convite para Equipe</h1>
          <p style={styles.description}>
            Você foi convidado para se juntar a uma equipe no PetiVet!
          </p>
          <p style={styles.subdescription}>
            Ao aceitar este convite, você terá acesso à clínica e poderá colaborar
            com a equipe de acordo com suas permissões.
          </p>

          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{
              ...styles.button,
              opacity: accepting ? 0.7 : 1,
            }}
          >
            {accepting ? 'Aceitando...' : 'Aceitar Convite'}
          </button>

          <button
            onClick={() => navigate('/login')}
            style={styles.secondaryButton}
            disabled={accepting}
          >
            Voltar ao Login
          </button>
        </div>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
    padding: '24px',
    paddingTop: '104px', // Account for fixed header
    fontFamily: 'Inter, sans-serif',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '48px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    textAlign: 'center',
  },
  iconCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#f5f3ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    marginBottom: '16px',
  },
  description: {
    fontSize: '16px',
    color: '#525252',
    marginBottom: '12px',
    lineHeight: '1.6',
  },
  subdescription: {
    fontSize: '14px',
    color: '#737373',
    marginBottom: '32px',
    lineHeight: '1.5',
  },
  button: {
    width: '100%',
    padding: '14px 24px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    marginBottom: '12px',
  },
  secondaryButton: {
    width: '100%',
    padding: '14px 24px',
    backgroundColor: 'transparent',
    color: '#7c3aed',
    border: '2px solid #7c3aed',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

export default AcceptInvitationPage;

