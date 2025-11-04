import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, User, LogOut } from 'lucide-react';
import UnitSelector from './UnitSelector';
import SupportModal from './SupportModal';
import NotificationBell from './NotificationBell';
import { supportTicketsApi } from '../services/supportTicketsApi';
import { useAuth } from '../AuthContext'; // ✅ Importa o contexto

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user, role, logout, isLoggingOut } = useAuth(); // ✅ Usa logout e role globais

  // Verificar se é admin (admins não veem o botão de suporte)
  const isAdmin = role === 'ADMIN';
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
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [userId, isAdmin]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoClick = () => {
    if (role === 'ADMIN') navigate('/admin-dashboard');
    else if (role === 'CADMIN' || role === 'CMANAGER')
      navigate('/clinic-dashboard');
    else if (role === 'VET') navigate('/vet-dashboard');
    else navigate('/');
  };

  const handleSupportClick = () => {
    if (unreadCount > 0) navigate('/my-support-tickets');
    else setSupportModalOpen(true);
  };

  const handleViewProfile = () => {
    if (role === 'ADMIN') navigate('/admin-profile');
    else if (role === 'VET') navigate('/vet-profile');
    else navigate('/clinic-profile');
    setDropdownOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    setDropdownOpen(false);
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

        {/* Right: Unit Selector + Support + Notifications + Avatar */}
        <div style={styles.rightSection}>
          <UnitSelector />

          {!isAdmin && (
            <button
              onClick={handleSupportClick}
              style={styles.supportButton}
              aria-label="Suporte"
              title={
                unreadCount > 0
                  ? `Ver Respostas (${unreadCount} ${unreadCount === 1 ? 'nova' : 'novas'})`
                  : 'Solicitar Suporte'
              }
            >
              <HelpCircle size={20} />
              {unreadCount > 0 && (
                <span style={styles.supportBadge}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          <NotificationBell />

          {/* Profile Dropdown */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={styles.avatarButton}
              aria-label="Menu do usuário"
            >
              <img
                src={user?.user_metadata?.avatar_url || '/default_avatar.png'}
                alt="Avatar"
                style={styles.avatarImage}
              />
            </button>

            {dropdownOpen && (
              <div style={styles.dropdownMenu}>
                <button onClick={handleViewProfile} style={styles.dropdownItem}>
                  <User size={16} />
                  <span>Ver Perfil</span>
                </button>

                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  style={{
                    ...styles.dropdownItem,
                    color: isLoggingOut ? '#aaa' : '#ef4444',
                    cursor: isLoggingOut ? 'not-allowed' : 'pointer',
                  }}
                >
                  <LogOut size={16} />
                  <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
                </button>
              </div>
            )}
          </div>
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

/* 🎨 Estilos */
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
    padding: '0 24px',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: '1',
  },
  hamburger: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#525252',
  },
  pageName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
  },
  centerSection: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  logo: {
    height: '40px',
    cursor: 'pointer',
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
  },
  supportBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    backgroundColor: '#ef4444',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 600,
    borderRadius: '9999px',
    padding: '2px 5px',
    border: '2px solid #fff',
  },
  avatarButton: {
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '50%',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '50px',
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    width: '160px',
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 0',
    zIndex: 200,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    color: '#374151',
    fontSize: '14px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
};

export default DashboardHeader;
