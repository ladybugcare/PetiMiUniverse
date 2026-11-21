import React from 'react';
import { Outlet } from 'react-router-dom';
import HubSystemSettingsSubnav from './HubSystemSettingsSubnav';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-system-settings.css';

const HubSystemSettingsShell: React.FC = () => {
  return (
    <div className="hub-clientes hub-servicos-shell hub-servicos-shell--tabs hub-config-shell">
      <HubSystemSettingsSubnav />
      <Outlet />
    </div>
  );
};

export default HubSystemSettingsShell;
