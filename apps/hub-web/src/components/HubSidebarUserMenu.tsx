import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, Settings } from 'lucide-react';
import { useAuth, usePermissions } from '@petimi/web-core';
import HubAvatar from './HubAvatar';
import { getHubUserDisplayName, getHubUserPhotoUrl } from '../utils/hubUserDisplay';
import { hubAccessTypeLabel } from '../utils/hubAccessLabel';

const HubSidebarUserMenu: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isLoggingOut, role: authRole } = useAuth();
  const { role: clinicRole } = usePermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className="hub-sidebar__user" ref={menuRef}>
      <button
        type="button"
        className="hub-sidebar__user-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`Menu do usuário: ${displayName}`}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <HubAvatar src={photoUrl} name={displayName} size={40} />
        <span className="hub-sidebar__user-text">
          <span className="hub-sidebar__user-name">{displayName}</span>
          <span className="hub-sidebar__user-role">{accessLabel}</span>
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`hub-sidebar__user-chevron${menuOpen ? ' hub-sidebar__user-chevron--open' : ''}`}
          aria-hidden
        />
      </button>
      {menuOpen && (
        <div className="hub-sidebar__user-dropdown" role="menu">
          <button
            type="button"
            className="hub-sidebar__user-dropdown-item"
            role="menuitem"
            onClick={() => goHub('/hub/meu-perfil')}
          >
            <User size={16} aria-hidden />
            <span>Meu Perfil</span>
          </button>
          <button
            type="button"
            className="hub-sidebar__user-dropdown-item"
            role="menuitem"
            onClick={() => goHub('/hub/configuracoes-sistema')}
          >
            <Settings size={16} aria-hidden />
            <span>Configurações</span>
          </button>
          <div className="hub-sidebar__user-dropdown-divider" aria-hidden />
          <button
            type="button"
            className="hub-sidebar__user-dropdown-item hub-sidebar__user-dropdown-item--danger"
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
  );
};

export default HubSidebarUserMenu;
