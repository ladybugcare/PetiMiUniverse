import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, Settings } from 'lucide-react';
import { useAuth, usePermissions } from '@petimi/web-core';
import HubAvatar from './HubAvatar';
import HubNotificationBell from './HubNotificationBell';
import { getHubUserDisplayName, getHubUserPhotoUrl } from '../utils/hubUserDisplay';
import { hubPageTitleFromPath } from '../utils/hubPageTitle';
import { hubAccessTypeLabel } from '../utils/hubAccessLabel';

const HubTopHeader: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout, isLoggingOut, role: authRole } = useAuth();
  const { role: clinicRole } = usePermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pageTitle = hubPageTitleFromPath(pathname);
  const displayName = getHubUserDisplayName(user);
  const photoUrl = getHubUserPhotoUrl(user);
  const accessLabel = hubAccessTypeLabel(clinicRole, authRole);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const goHub = (to: string) => {
    setMenuOpen(false);
    navigate(to);
  };

  return (
    <header className="hub-top-header">
      <div className="hub-top-header__inner">
        <div className="hub-top-header__left">
          <h1 className="hub-top-header__page">{pageTitle}</h1>
        </div>
        <div className="hub-top-header__right">
          <HubNotificationBell />
          <div className="hub-top-header__profile" ref={menuRef}>
            <button
              type="button"
              className="hub-top-header__user-trigger"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`Menu do usuário: ${displayName}`}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <HubAvatar src={photoUrl} name={displayName} size={40} />
              <span className="hub-top-header__user-text">
                <span className="hub-top-header__user-name">{displayName}</span>
                <span className="hub-top-header__user-role">{accessLabel}</span>
              </span>
              <ChevronDown
                size={18}
                strokeWidth={2}
                className={`hub-top-header__chevron${menuOpen ? ' hub-top-header__chevron--open' : ''}`}
                aria-hidden
              />
            </button>
            {menuOpen && (
              <div className="hub-top-header__dropdown" role="menu">
                <button
                  type="button"
                  className="hub-top-header__dropdown-item"
                  role="menuitem"
                  onClick={() => goHub('/hub/meu-perfil')}
                >
                  <User size={16} aria-hidden />
                  <span>Meu Perfil</span>
                </button>
                <button
                  type="button"
                  className="hub-top-header__dropdown-item"
                  role="menuitem"
                  onClick={() => goHub('/hub/configuracoes-sistema')}
                >
                  <Settings size={16} aria-hidden />
                  <span>Configurações</span>
                </button>
                <div className="hub-top-header__dropdown-divider" aria-hidden />
                <button
                  type="button"
                  className="hub-top-header__dropdown-item hub-top-header__dropdown-item--danger"
                  role="menuitem"
                  disabled={isLoggingOut}
                  onClick={() => void logout().then(() => setMenuOpen(false))}
                >
                  <LogOut size={16} aria-hidden />
                  <span>{isLoggingOut ? 'A sair…' : 'Sair'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default HubTopHeader;
