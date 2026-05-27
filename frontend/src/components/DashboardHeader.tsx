import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, User, LogOut } from 'lucide-react';
import IconWrapper from './IconWrapper';
import UnitSelector from './UnitSelector';
import SupportModal from './SupportModal';
import NotificationBell from './NotificationBell';
import { supportTicketsApi } from '../services/supportTicketsApi';
import { useAuth } from '../AuthContext'; // ✅ Importa o contexto
import Avatar from './Avatar';
import { colors } from '../styles/colors';
import { getUserPhotoUrl, getUserDisplayName, getUserTypeForAvatar } from '../utils/userPhotoHelper';

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
  const userId = useMemo(() => user?.id, [user?.id]);
  const isLoadingRef = useRef(false);
  const lastRequestTimeRef = useRef(0);
  const errorCountRef = useRef(0);

  // Buscar contagem de tickets não lidos com throttling
  const loadUnreadCount = useCallback(async () => {
    if (!userId || isAdmin) return;
    
    // Throttle: não fazer requisição se a última foi há menos de 2 segundos
    const now = Date.now();
    if (now - lastRequestTimeRef.current < 2000) {
      return;
    }
    
    // Se já está carregando, não fazer nova requisição
    if (isLoadingRef.current) {
      return;
    }
    
    // Se houve muitos erros (429), aumentar o throttle
    if (errorCountRef.current > 3) {
      if (now - lastRequestTimeRef.current < 10000) {
        return;
      }
      // Reset error count após 10 segundos
      errorCountRef.current = 0;
    }
    
    isLoadingRef.current = true;
    lastRequestTimeRef.current = now;
    
    try {
      const result = await supportTicketsApi.getUnreadCount(userId);
      setUnreadCount(result.unread_count);
      errorCountRef.current = 0; // Reset error count em caso de sucesso
    } catch (error: any) {
      console.error('Error loading unread count:', error);
      
      // Se for erro 429, incrementar contador de erros
      if (error?.message?.includes('429') || error?.status === 429) {
        errorCountRef.current += 1;
        // Se muitos erros, parar polling temporariamente
        if (errorCountRef.current > 5) {
          console.warn('[DashboardHeader] Muitos erros 429, pausando polling temporariamente');
        }
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!userId || isAdmin) return;
    
    // Carregar imediatamente apenas uma vez
    loadUnreadCount();
    
    // Polling a cada 60 segundos (aumentado para reduzir carga)
    const interval = setInterval(() => {
      // Só fazer polling se a página estiver visível
      if (document.visibilityState === 'visible') {
        loadUnreadCount();
      }
    }, 60000);
    
    // Pausar polling quando a página não estiver visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadUnreadCount();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, isAdmin, loadUnreadCount]);

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
            src="/logo_texto_lado.png"
            alt="PetMi Vet"
            style={styles.logo}
            onClick={handleLogoClick}
            title="Ir para o Dashboard"
          />
        </div>

        {/* Right: Unit Selector + Support + Notifications + Avatar */}
        <div style={styles.rightSection}>
          {role !== 'CADMIN' && <UnitSelector />}

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
              <IconWrapper icon={HelpCircle} size={20} />
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
              <Avatar
                src={getUserPhotoUrl(user)}
                name={getUserDisplayName(user)}
                size={40}
                userType={getUserTypeForAvatar(user)}
              />
            </button>

            {dropdownOpen && (
              <div style={styles.dropdownMenu}>
                <button onClick={handleViewProfile} style={styles.dropdownItem}>
                  <IconWrapper icon={User} size={16} />
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
                  <IconWrapper icon={LogOut} size={16} />
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
    // `hidden` recortava o menu do avatar (dropdown fica abaixo dos 64px do header).
    overflow: 'visible',
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
    top: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    height: '110px',
    cursor: 'pointer',
    objectFit: 'contain',
    display: 'block',
    marginTop: '-25px',
    marginBottom: '-25px',
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
    color: colors.brand.primary[500],
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
    minWidth: '40px',
    minHeight: '40px',
    maxWidth: '40px',
    maxHeight: '40px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
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

