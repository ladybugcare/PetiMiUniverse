import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import HubNotificationBell from './HubNotificationBell';
import HubHeaderUnitSelector from './HubHeaderUnitSelector';
import { hubPageTitleFromPath } from '../utils/hubPageTitle';

type HubTopHeaderProps = {
  onMenuClick?: () => void;
  isMenuOpen?: boolean;
  showMenuButton?: boolean;
};

const HubTopHeader: React.FC<HubTopHeaderProps> = ({
  onMenuClick,
  isMenuOpen = false,
  showMenuButton = false,
}) => {
  const { pathname } = useLocation();
  const pageTitle = hubPageTitleFromPath(pathname);

  return (
    <header className="hub-top-header">
      <div className="hub-top-header__inner">
        <div className="hub-top-header__left">
          {showMenuButton && (
            <button
              type="button"
              className="hub-top-header__menu-btn"
              onClick={onMenuClick}
              aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
            </button>
          )}
          <h1 className="hub-top-header__page">{pageTitle}</h1>
        </div>
        <div className="hub-top-header__right">
          <HubNotificationBell />
          <HubHeaderUnitSelector />
        </div>
      </div>
    </header>
  );
};

export default HubTopHeader;
