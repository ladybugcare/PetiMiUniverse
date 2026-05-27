import React from 'react';
import { Outlet } from 'react-router-dom';
import HubEstoqueSubnav from './HubEstoqueSubnav';
import '../clientes/clientes.css';
import './estoque.css';

const HubEstoqueShell: React.FC = () => {
  return (
    <div className="hub-estoque-shell hub-estoque-shell--tabs">
      <HubEstoqueSubnav />
      <Outlet />
    </div>
  );
};

export default HubEstoqueShell;
