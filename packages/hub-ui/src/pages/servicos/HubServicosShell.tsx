import React from 'react';
import { Outlet } from 'react-router-dom';
import HubServicosSubnav from './HubServicosSubnav';
import '../clientes/clientes.css';
import './servicos-page.css';

const HubServicosShell: React.FC = () => {
  return (
    <div className="hub-clientes hub-servicos-shell hub-servicos-shell--tabs">
      <HubServicosSubnav />
      <Outlet />
    </div>
  );
};

export default HubServicosShell;
