import React from 'react';
import { Outlet } from 'react-router-dom';
import { HubUnitProvider } from '../contexts/HubUnitContext';
import HubSidebar from './HubSidebar';
import HubTopHeader from './HubTopHeader';

const HubAppShell: React.FC = () => {
  return (
    <HubUnitProvider>
      <div className="hub-app-shell">
        <HubSidebar />
        <div className="hub-app-shell__column">
          <HubTopHeader />
          <div className="hub-app-shell__outlet">
            <Outlet />
          </div>
        </div>
      </div>
    </HubUnitProvider>
  );
};

export default HubAppShell;
