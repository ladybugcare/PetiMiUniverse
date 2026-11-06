import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, HelpCircle, LogOut, Menu, User, X } from 'lucide-react';
import SupportModal from './SupportModal';
import NotificationBell from './NotificationBell';
import { supportTicketsApi } from '../services/supportTicketsApi';
import { useAuth } from '../AuthContext';
import Avatar from './Avatar';
import { getUserPhotoUrl, getUserDisplayName, getUserTypeForAvatar } from '../utils/userPhotoHelper';
import { usePermissions } from '../hooks/usePermissions';

interface DashboardHeaderProps {
  onMenuClick?: () => void;
  pageName: string;
  isMenuOpen?: boolean;
  showMenuButton?: boolean;
}

function shiftAccessLabel(clinicRole: string | null, authRole: string): string {
  const key = String(clinicRole || authRole || '').toUpperCase();
  const labels: Record<string, string> = {
    ADMIN: 'Administrador',
    CADMIN: 'Administrador da Clínica',
    CMANAGER: 'Gestor de Unidade',
    CASSISTANT: 'Assistente',
    CVET_INTERNAL: 'Veterinário Interno',
    VET: 'Veterinário',
    FREELANCER: 'Freelancer',
  };
  return labels[key] || 'Conta';
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onMenuClick,
  pageName,
  isMenuOpen = false,
  showMenuButton = false,
}) => {
  const navigate = useNavigate();
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user, role, logout, isLoggingOut } = useAuth();
  const { role: clinicRole } = usePermissions();

  const isAdmin = role === 'ADMIN';
  const userId = useMemo(() => user?.id, [user?.id]);
  const isLoadingRef = useRef(false);
  const lastRequestTimeRef = useRef(0);
  const errorCountRef = useRef(0);
  const displayName = getUserDisplayName(user);
  const accessLabel = shiftAccessLabel(clinicRole, role);

  const loadUnreadCount = useCallback(async () => {
    if (!userId || isAdmin) return;

    const now = Date.now();
    if (now - lastRequestTimeRef.current < 2000) {
      return;
    }

    if (isLoadingRef.current) {
      return;
    }

    if (errorCountRef.current > 3) {
      if (now - lastRequestTimeRef.current < 10000) {
        return;
      }
      errorCountRef.current = 0;
    }

    isLoadingRef.current = true;
    lastRequestTimeRef.current = now;

    try {
      const result = await supportTicketsApi.getUnreadCount(userId);
      setUnreadCount(result.unread_count);
      errorCountRef.current = 0;
    } catch (error: any) {
      console.error('Error loading unread count:', error);

      if (error?.message?.includes('429') || error?.status === 429) {
        errorCountRef.current += 1;
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

    loadUnreadCount();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadUnreadCount();
      }
    }, 60000);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    <header className="shift-top-header">
      <div className="shift-top-header__inner">
        <div className="shift-top-header__left">
          {showMenuButton && (
            <button
              type="button"
              className="shift-top-header__menu-btn"
              onClick={onMenuClick}
              aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
            </button>
          )}
          <nav className="shift-top-header__crumbs" aria-label="Localização">
            <h1 className="shift-top-header__page" aria-current="page">
              {pageName}
            </h1>
          </nav>
        </div>

        <div className="shift-top-header__right">
          {!isAdmin && (
            <button
              type="button"
              onClick={handleSupportClick}
              className="shift-top-header__icon-btn"
              aria-label="Suporte"
              title={
                unreadCount > 0
                  ? `Ver respostas (${unreadCount} ${unreadCount === 1 ? 'nova' : 'novas'})`
                  : 'Solicitar suporte'
              }
            >
              <HelpCircle size={20} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="shift-top-header__support-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          <NotificationBell />

          <div className="shift-top-header__profile" ref={dropdownRef}>
            <button
              type="button"
              className="shift-top-header__user-trigger"
              onClick={() => setDropdownOpen((open) => !open)}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
              aria-label={`Menu do usuário: ${displayName}`}
            >
              <Avatar
                src={getUserPhotoUrl(user)}
                name={displayName}
                size={36}
                userType={getUserTypeForAvatar(user)}
              />
              <span className="shift-top-header__user-text">
                <span className="shift-top-header__user-name">{displayName}</span>
                <span className="shift-top-header__user-role">{accessLabel}</span>
              </span>
              <ChevronDown
                size={18}
                strokeWidth={2}
                className={`shift-top-header__chevron${dropdownOpen ? ' shift-top-header__chevron--open' : ''}`}
                aria-hidden
              />
            </button>

            {dropdownOpen && (
              <div className="shift-top-header__dropdown" role="menu">
                <button
                  type="button"
                  className="shift-top-header__dropdown-item"
                  role="menuitem"
                  onClick={handleViewProfile}
                >
                  <User size={16} aria-hidden />
                  <span>Ver perfil</span>
                </button>
                <button
                  type="button"
                  className="shift-top-header__dropdown-item shift-top-header__dropdown-item--danger"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                >
                  <LogOut size={16} aria-hidden />
                  <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SupportModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
    </header>
  );
};

export default DashboardHeader;
