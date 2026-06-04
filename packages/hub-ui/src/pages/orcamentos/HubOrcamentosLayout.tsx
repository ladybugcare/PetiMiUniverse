import React from 'react';
import { Outlet } from 'react-router-dom';
import { HubTabs } from '../../components/HubTabs';
import '../clientes/clientes.css';
import './orcamentos-page.css';

const HubOrcamentosLayout: React.FC = () => {
  return (
    <div className="hub-clientes hub-orcamentos">
      <div className="hub-clientes__main hub-orcamentos-shell hub-orcamentos-shell--tabs">
        <HubTabs
          ariaLabel="Orçamentos"
          items={[
            { to: '/hub/orcamentos', label: 'Orçamentos', end: true },
            { to: '/hub/orcamentos/contatos', label: 'Contatos' },
          ]}
        />
        <Outlet />
      </div>
    </div>
  );
};

export default HubOrcamentosLayout;
