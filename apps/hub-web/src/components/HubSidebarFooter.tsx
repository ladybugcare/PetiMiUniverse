import React from 'react';
import HubSidebarUserMenu from './HubSidebarUserMenu';

type HubSidebarFooterProps = {
  collapsed?: boolean;
};

const HubSidebarFooter: React.FC<HubSidebarFooterProps> = ({ collapsed = false }) => {
  return (
    <div className={['hub-sidebar__footer', collapsed ? 'hub-sidebar__footer--collapsed' : ''].filter(Boolean).join(' ')}>
      <HubSidebarUserMenu collapsed={collapsed} />
    </div>
  );
};

export default HubSidebarFooter;
