import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Heart,
  DollarSign,
  LayoutGrid,
  Hotel,
  Droplets,
  Package,
  UserSquare2,
  BarChart3,
  ShoppingCart,
} from 'lucide-react';
import HubSidebarClinicCard from './HubSidebarClinicCard';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub-logo.png`;

type NavItem = { to: string; label: string; icon: React.ElementType };

const navItems: NavItem[] = [
  { to: '/hub/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/hub/appointments', label: 'Agenda', icon: CalendarDays },
  { to: '/hub/clientes', label: 'Clientes', icon: Users },
  { to: '/hub/pets', label: 'Pets', icon: Heart },
  { to: '/hub/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/hub/servicos', label: 'Serviços', icon: LayoutGrid },
  { to: '/hub/hotel-creche', label: 'Hotel & Creche', icon: Hotel },
  { to: '/hub/banho-tosa', label: 'Banho & Tosa', icon: Droplets },
  { to: '/hub/estoque', label: 'Estoque', icon: Package },
  { to: '/hub/equipe', label: 'Equipe', icon: UserSquare2 },
  { to: '/hub/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/hub/marketplace', label: 'Marketplace', icon: ShoppingCart },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'hub-sidebar__link',
    isActive ? 'hub-sidebar__link--active' : '',
  ].join(' ');

const HubSidebar: React.FC = () => {
  return (
    <aside className="hub-sidebar" aria-label="Navegação principal">
      <div className="hub-sidebar__brand">
        <div className="hub-sidebar__logo-wrap">
          <img src={logoSrc} alt="PetMi Hub" className="hub-sidebar__logo" decoding="async" />
        </div>
      </div>

      <div className="hub-sidebar__divider" />

      <HubSidebarClinicCard />

      <nav className="hub-sidebar__nav">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} end={to === '/hub/dashboard'}>
            <Icon size={20} strokeWidth={1.75} className="hub-sidebar__icon" aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default HubSidebar;
