import React from 'react';
import { Outlet } from 'react-router-dom';
import HubGroomingSubnav from './HubGroomingSubnav';
import '../clientes/clientes.css';
import '../clinica/clinica-page.css';
import './grooming-page.css';

/** Casco da operação Banho & Tosa: abas Fila do dia (gestão) e Minha fila (chão). */
const HubGroomingShell: React.FC = () => {
  return (
    <div className="hub-clinic-page hub-clientes hub-grooming-page">
      <div className="hub-clinic-shell hub-clinic-shell--tabs">
        <HubGroomingSubnav />
        <div className="hub-clinic-shell__main">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default HubGroomingShell;
