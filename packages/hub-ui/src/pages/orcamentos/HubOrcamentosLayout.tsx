import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../clientes/clientes.css';
import './orcamentos-page.css';

const HubOrcamentosLayout: React.FC = () => {
  return (
    <div className="hub-clientes hub-orcamentos hub-pets-page">
      <div className="hub-clientes__main hub-orcamentos-shell hub-orcamentos-shell--tabs">
        <nav className="hub-clientes__tabs" aria-label="Orçamentos">
          <NavLink
            to="/hub/orcamentos"
            end
            className={({ isActive }) =>
              ['hub-clientes__tab', isActive ? 'hub-clientes__tab--active' : ''].filter(Boolean).join(' ')
            }
          >
            Orçamentos
          </NavLink>
          <NavLink
            to="/hub/orcamentos/contatos"
            className={({ isActive }) =>
              ['hub-clientes__tab', isActive ? 'hub-clientes__tab--active' : ''].filter(Boolean).join(' ')
            }
          >
            Contatos
          </NavLink>
        </nav>
        <Outlet />
      </div>
    </div>
  );
};

export default HubOrcamentosLayout;
