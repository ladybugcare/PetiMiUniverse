import React from 'react';
import { useLocation } from 'react-router-dom';
import HubNotificationBell from './HubNotificationBell';
import HubHeaderUnitSelector from './HubHeaderUnitSelector';
import { hubPageTitleFromPath } from '../utils/hubPageTitle';

const HubTopHeader: React.FC = () => {
  const { pathname } = useLocation();
  const pageTitle = hubPageTitleFromPath(pathname);

  return (
    <header className="hub-top-header">
      <div className="hub-top-header__inner">
        <div className="hub-top-header__left">
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
