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
    <nav className="hub-estoque-subnav" aria-label="Secções de estoque">
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            ['hub-estoque-subnav__link', isActive ? 'hub-estoque-subnav__link--active' : ''].join(' ')
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
};

export default HubEstoqueSubnav;
