import React from 'react';
import { Outlet } from 'react-router-dom';
import HubBoardingSubnav from './HubBoardingSubnav';
import '../clientes/clientes.css';
import '../clinica/clinica-page.css';
import '../grooming/grooming-page.css';
import './boarding-page.css';

/** Casco da operação Hotel & Creche: Painel (recepção), Minha fila (cuidador) e Configurações (gestor). */
const HubBoardingShell: React.FC = () => {
  return (
    <div className="hub-clinic-page hub-clientes hub-grooming-page hub-boarding-page">
      <div className="hub-clinic-shell hub-clinic-shell--tabs">
        <HubBoardingSubnav />
        <div className="hub-clinic-shell__main">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default HubBoardingShell;
