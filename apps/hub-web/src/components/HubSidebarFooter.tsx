import React from 'react';
import HubSidebarUserMenu from './HubSidebarUserMenu';

const HubSidebarFooter: React.FC = () => {
  return (
    <div className="hub-sidebar__footer">
      <HubSidebarUserMenu />
    </div>
  );
};

export default HubSidebarFooter;
