import React from 'react';
import { Outlet } from 'react-router-dom';
import HubEstoqueSubnav from './HubEstoqueSubnav';

const HubEstoqueShell: React.FC = () => {
  return (
    <div className="hub-estoque-shell">
      <HubEstoqueSubnav />
      <Outlet />
    </div>
  );
};

export default HubEstoqueShell;
