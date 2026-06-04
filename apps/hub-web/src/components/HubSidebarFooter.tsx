import React from 'react';
import HubSidebarSupportCard from './HubSidebarSupportCard';
import HubSidebarUserMenu from './HubSidebarUserMenu';

const HubSidebarFooter: React.FC = () => {
  return (
    <div className="hub-sidebar__footer">
      <HubSidebarSupportCard />
      <HubSidebarUserMenu />
    </div>
  );
};

export default HubSidebarFooter;
