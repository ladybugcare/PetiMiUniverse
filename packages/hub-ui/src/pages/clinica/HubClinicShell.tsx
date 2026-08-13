import React from 'react';
import { Outlet } from 'react-router-dom';
import HubClinicSubnav from './HubClinicSubnav';
import '../clientes/clientes.css';
import './clinica-page.css';

/**
 * Casco único da Clínica: abas do módulo sempre visíveis
 * (Consultório, Operação clínica, Pacientes, …), inclusive no consultório.
 */
const HubClinicShell: React.FC = () => {
  return (
    <div className="hub-clinic-page hub-clientes">
      <div className="hub-clinic-shell hub-clinic-shell--tabs">
        <HubClinicSubnav />
        <div className="hub-clinic-shell__main">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default HubClinicShell;
