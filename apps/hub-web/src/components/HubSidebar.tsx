import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  Users,
  Heart,
  Stethoscope,
  Scissors,
  Hotel,
  Car,
  DollarSign,
  Wallet,
  Package,
  Briefcase,
  UserSquare2,
  BarChart3,
  Settings,
} from 'lucide-react';
import HubSidebarFooter from './HubSidebarFooter';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub-logo.png`;

type NavItem = { to: string; label: string; icon: React.ElementType; end?: boolean };

type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    items: [{ to: '/hub/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    id: 'atendimento',
    title: 'Atendimento',
    items: [
      { to: '/hub/appointments', label: 'Agenda', icon: CalendarDays },
      { to: '/hub/orcamentos', label: 'Orçamento', icon: FileText },
      { to: '/hub/clientes', label: 'Clientes', icon: Users },
      { to: '/hub/pets', label: 'Pets', icon: Heart },
    ],
  },
  {
    id: 'operacao',
    title: 'Operação',
    items: [
      { to: '/hub/clinica', label: 'Clínica', icon: Stethoscope },
      { to: '/hub/banho-tosa', label: 'Banho & Tosa', icon: Scissors },
      { to: '/hub/hotel-creche', label: 'Hotel & Creche', icon: Hotel },
      { to: '/hub/leva-e-traz', label: 'Leva e Traz', icon: Car },
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    items: [
      { to: '/hub/financeiro', label: 'Financeiro', icon: DollarSign },
      { to: '/hub/caixa', label: 'Caixa', icon: Wallet },
    ],
  },
  {
    id: 'gestao',
    title: 'Gestão',
    items: [
      { to: '/hub/estoque', label: 'Estoque', icon: Package },
      { to: '/hub/servicos', label: 'Serviços', icon: Briefcase },
      { to: '/hub/equipe', label: 'Equipe', icon: UserSquare2 },
      { to: '/hub/relatorios', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    items: [
      {
        to: '/hub/configuracoes-sistema',
        label: 'Configurações do Sistema',
        icon: Settings,
      },
    ],
  },
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

      <nav className="hub-sidebar__nav">
        {navSections.map((section) => (
          <div key={section.id} className="hub-sidebar__section">
            <p className="hub-sidebar__section-title">{section.title}</p>
            <div className="hub-sidebar__section-items">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} className={linkClass} end={end}>
                  <Icon size={18} strokeWidth={1.75} className="hub-sidebar__icon" aria-hidden />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <HubSidebarFooter />
    </aside>
  );
};

export default HubSidebar;
