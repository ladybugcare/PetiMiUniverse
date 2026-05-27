import React from 'react';
import { NavLink } from 'react-router-dom';

const links: { to: string; label: string }[] = [
  { to: 'servicos', label: 'Serviços' },
  { to: 'configuracoes', label: 'Configurações' },
];

const HubServicosSubnav: React.FC = () => {
  return (
    <nav className="hub-clientes__tabs" aria-label="Secções de serviços">
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            ['hub-clientes__tab', isActive ? 'hub-clientes__tab--active' : ''].filter(Boolean).join(' ')
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
};

export default HubServicosSubnav;
