import React from 'react';
import { Outlet } from 'react-router-dom';
import HubSidebar from './HubSidebar';
import HubTopHeader from './HubTopHeader';

const HubAppShell: React.FC = () => {
  return (
    <div className="hub-app-shell">
      <HubSidebar />
      <div className="hub-app-shell__column">
        <HubTopHeader />
        <div className="hub-app-shell__outlet">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default HubAppShell;
