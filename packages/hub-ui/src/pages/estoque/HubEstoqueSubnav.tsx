import React from 'react';
import { NavLink } from 'react-router-dom';

const links: { to: string; label: string }[] = [
  { to: 'produtos', label: 'Produtos' },
  { to: 'medicamentos', label: 'Medicamentos' },
  { to: 'vacinas', label: 'Vacinas' },
  { to: 'entradas', label: 'Entradas' },
  { to: 'saidas', label: 'Saídas' },
  { to: 'validade', label: 'Validade' },
  { to: 'alertas', label: 'Alertas' },
  { to: 'inventario', label: 'Inventário' },
];

const HubEstoqueSubnav: React.FC = () => {
  return (
    <nav className="hub-clientes__tabs" aria-label="Secções de estoque">
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

export default HubEstoqueSubnav;
