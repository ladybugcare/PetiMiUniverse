import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Menu, X } from 'lucide-react';
import HubNotificationBell from './HubNotificationBell';
import HubHeaderUnitSelector from './HubHeaderUnitSelector';
import { hubPageCrumbsFromPath } from '../utils/hubPageTitle';

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
  const crumbs = hubPageCrumbsFromPath(pathname);
  const current = crumbs[crumbs.length - 1];
  const parents = crumbs.slice(0, -1);

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
          <nav className="hub-top-header__crumbs" aria-label="Localização">
            {parents.map((crumb, index) => (
              <React.Fragment key={`${crumb.label}-${index}`}>
                {crumb.to ? (
                  <Link to={crumb.to} className="hub-top-header__crumb hub-top-header__crumb--link">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="hub-top-header__crumb">{crumb.label}</span>
                )}
                <ChevronRight
                  size={14}
                  strokeWidth={2.25}
                  className="hub-top-header__crumb-sep"
                  aria-hidden
                />
              </React.Fragment>
            ))}
            <h1 className="hub-top-header__page" aria-current="page">
              {current?.label ?? 'PetMi Hub'}
            </h1>
          </nav>
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
