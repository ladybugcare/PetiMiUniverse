import React from 'react';
import { Outlet } from 'react-router-dom';
import HubPickupSubnav from './HubPickupSubnav';
import '../clientes/clientes.css';
import '../clinica/clinica-page.css';
import '../grooming/grooming-page.css';
import './pickup-page.css';

/** Casco da operação Leva e Traz: abas Rotas do dia (gestão) e Minha rota (motorista). */
const HubPickupShell: React.FC = () => {
  return (
    <div className="hub-clinic-page hub-clientes hub-grooming-page hub-pickup-page">
      <div className="hub-clinic-shell hub-clinic-shell--tabs">
        <HubPickupSubnav />
        <div className="hub-clinic-shell__main">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default HubPickupShell;
