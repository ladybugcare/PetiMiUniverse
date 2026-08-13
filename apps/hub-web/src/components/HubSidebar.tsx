import React, { useMemo } from 'react';
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
import { usePermissions } from '@petimi/web-core';
import HubSidebarFooter from './HubSidebarFooter';
import { useHubCashSession } from '../contexts/HubCashSessionContext';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub-logo.png`;

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  /** Uma permissão ou qualquer uma da lista (OR). */
  permission: string | string[];
};

type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    items: [{ to: '/hub/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: 'hub.financial.read' }],
  },
  {
    id: 'atendimento',
    title: 'Atendimento',
    items: [
      { to: '/hub/appointments', label: 'Agenda', icon: CalendarDays, permission: 'hub.appointments.read' },
      { to: '/hub/orcamentos', label: 'Orçamento', icon: FileText, permission: ['hub.quotes.read', 'hub.prospects.read'] },
      { to: '/hub/clientes', label: 'Clientes', icon: Users, permission: 'hub.guardians.read' },
      { to: '/hub/pets', label: 'Pets', icon: Heart, permission: 'hub.pets.read' },
    ],
  },
  {
    id: 'operacao',
    title: 'Operação',
    items: [
      { to: '/hub/clinica', label: 'Clínica', icon: Stethoscope, permission: 'hub.clinic.read' },
      { to: '/hub/banho-tosa', label: 'Banho & Tosa', icon: Scissors, permission: 'grooming.queue.read' },
      { to: '/hub/hotel-creche', label: 'Hotel & Creche', icon: Hotel, permission: 'boarding.reservations.read' },
      { to: '/hub/leva-e-traz', label: 'Leva e Traz', icon: Car, permission: 'pickup.routes.read' },
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    items: [
      { to: '/hub/financeiro', label: 'Financeiro', icon: DollarSign, permission: 'hub.financial.read' },
      { to: '/hub/caixa', label: 'Caixa', icon: Wallet, permission: 'hub.financial.read' },
    ],
  },
  {
    id: 'gestao',
    title: 'Gestão',
    items: [
      { to: '/hub/estoque', label: 'Estoque', icon: Package, permission: 'hub.inventory.read' },
      { to: '/hub/servicos', label: 'Serviços', icon: Briefcase, permission: 'hub.service_types.read' },
      { to: '/hub/equipe', label: 'Equipe', icon: UserSquare2, permission: 'hub.staff.read' },
      { to: '/hub/relatorios', label: 'Relatórios', icon: BarChart3, permission: 'hub.financial.read' },
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
        permission: ['hub.service_types.read', 'hub.appointments.read', 'hub.financial.read'],
      },
    ],
  },
];

function itemAllowed(hasPermission: (p: string) => boolean, permission: string | string[]): boolean {
  if (Array.isArray(permission)) {
    return permission.some((p) => hasPermission(p));
  }
  return hasPermission(permission);
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'hub-sidebar__link',
    isActive ? 'hub-sidebar__link--active' : '',
  ].join(' ');

type HubSidebarProps = {
  isOpen?: boolean;
  isMobile?: boolean;
  onClose?: () => void;
};

const HubSidebar: React.FC<HubSidebarProps> = ({
  isOpen = true,
  isMobile = false,
  onClose,
}) => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { isOpen: caixaOpen, pendingBillingCount } = useHubCashSession();

  const visibleSections = useMemo(() => {
    if (permLoading) return navSections;
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => itemAllowed(hasPermission, item.permission)),
      }))
      .filter((section) => section.items.length > 0);
  }, [hasPermission, permLoading]);

  const handleNavClick = () => {
    if (isMobile && onClose) onClose();
  };

  return (
    <aside
      className={['hub-sidebar', isOpen ? 'hub-sidebar--open' : ''].filter(Boolean).join(' ')}
      aria-label="Navegação principal"
      aria-hidden={isMobile && !isOpen ? true : undefined}
    >
      <div className="hub-sidebar__brand">
        <div className="hub-sidebar__logo-wrap">
          <img src={logoSrc} alt="PetMi Hub" className="hub-sidebar__logo" decoding="async" />
        </div>
      </div>

      <div className="hub-sidebar__divider" />

      <nav className="hub-sidebar__nav">
        {visibleSections.map((section) => (
          <div key={section.id} className="hub-sidebar__section">
            <p className="hub-sidebar__section-title">{section.title}</p>
            <div className="hub-sidebar__section-items">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} className={linkClass} end={end} onClick={handleNavClick}>
                  <Icon size={18} strokeWidth={1.75} className="hub-sidebar__icon" aria-hidden />
                  <span>{label}</span>
                  {to === '/hub/caixa' && caixaOpen && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: 1,
                        padding: '2px 6px',
                        borderRadius: 10,
                        background: pendingBillingCount > 0 ? '#fde68a' : '#d1fae5',
                        color: pendingBillingCount > 0 ? '#92400e' : '#065f46',
                        flexShrink: 0,
                      }}
                      aria-label={`Caixa aberto${pendingBillingCount > 0 ? `, ${pendingBillingCount} pendente(s)` : ''}`}
                    >
                      {pendingBillingCount > 0 ? pendingBillingCount : 'Aberto'}
                    </span>
                  )}
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
