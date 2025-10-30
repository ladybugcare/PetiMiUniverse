import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import UnitSelector from './UnitSelector';
import SupportModal from './SupportModal';
import NotificationBell from './NotificationBell';
import { supportTicketsApi } from '../services/supportTicketsApi';

interface DashboardHeaderProps {
  onMenuClick: () => void;
  pageName: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onMenuClick,
  pageName,
}) => {
  const navigate = useNavigate();
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Verificar se é admin (admins não veem o botão de suporte)
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user?.user_metadata?.role || user?.role;
  const isAdmin = userRole === 'admin';
  const userId = user?.id;

  // Buscar contagem de tickets não lidos
  useEffect(() => {
    const loadUnreadCount = async () => {
      if (userId && !isAdmin) {
        try {
          const result = await supportTicketsApi.getUnreadCount(userId);
          setUnreadCount(result.unread_count);
        } catch (error) {
          console.error('Error loading unread count:', error);
        }
      }
    };

    loadUnreadCount();
    
    // Atualizar contagem a cada 30 segundos
    const interval = setInterval(loadUnreadCount, 30000);
    
    return () => clearInterval(interval);
  }, [userId, isAdmin]);

  const handleLogoClick = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = user?.user_metadata?.role || user?.role;

    // Navigate to respective dashboard based on user role
    if (userRole === 'admin') {
      navigate('/admin-dashboard');
    } else if (userRole === 'clinic') {
      navigate('/clinic-dashboard');
    } else if (userRole === 'vet') {
      navigate('/vet-dashboard');
    } else {
      navigate('/');
    }
  };

  const handleSupportClick = () => {
    if (unreadCount > 0) {
      // Se há tickets não lidos, navegar para página de tickets
      navigate('/my-support-tickets');
    } else {
      // Se não há tickets não lidos, abrir modal para nova mensagem
      setSupportModalOpen(true);
    }
  };

  return (
    <header style={styles.header}>
      <div style={styles.container}>
        {/* Left: Hamburger + Page Name */}
        <div style={styles.leftSection}>
          <button
            onClick={onMenuClick}
            style={styles.hamburger}
            aria-label="Toggle menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 style={styles.pageName}>{pageName}</h1>
        </div>

        {/* Center: Logo */}
        <div style={styles.centerSection}>
          <img
            src="/purple_logo.png"
            alt="PetiVet"
            style={styles.logo}
            onClick={handleLogoClick}
            title="Ir para o Dashboard"
          />
        </div>

        {/* Right: Unit Selector + Support Button + Notification Bell */}
        <div style={styles.rightSection}>
          <UnitSelector />
          
          {/* Support Button (apenas para clinic e vet) */}
          {!isAdmin && (
            <button
              onClick={handleSupportClick}
              style={styles.supportButton}
              aria-label="Suporte"
              title={unreadCount > 0 ? `Ver Respostas (${unreadCount} ${unreadCount === 1 ? 'nova' : 'novas'})` : 'Solicitar Suporte'}
            >
              <HelpCircle size={20} />
              {unreadCount > 0 && (
                <span style={styles.supportBadge}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
          
          {/* Notification Bell */}
          <NotificationBell />
        </div>
      </div>

      {/* Support Modal */}
      <SupportModal 
        isOpen={supportModalOpen} 
        onClose={() => setSupportModalOpen(false)} 
      />
    </header>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '64px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e5e5',
    zIndex: 100,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
    maxWidth: '100%',
    padding: '0 24px',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: '1',
  },
  hamburger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#525252',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease',
  },
  pageName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  centerSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  logo: {
    height: '40px',
    width: 'auto',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    flex: '1',
  },
  supportButton: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#7c3aed',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease',
  },
  supportBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '9999px',
    border: '2px solid #ffffff',
  },
};

export default DashboardHeader;

