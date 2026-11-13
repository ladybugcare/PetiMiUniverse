import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  Users,
  Heart,
  Stethoscope,
  Scissors,
  Inbox,
  Hotel,
  Car,
  DollarSign,
  Wallet,
  Package,
  Briefcase,
  UserSquare2,
  BarChart3,
  CreditCard,
  Settings,
  MessageCircle,
  LifeBuoy,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import HubSidebarFooter from './HubSidebarFooter';
import { useHubCashSession } from '../contexts/HubCashSessionContext';
import { getHubSupportWhatsappHref } from '../constants/hubSupportWhatsapp';
import { useHubSupportUnread } from '../hooks/useHubSupportUnread';
import { useHubEntitlements } from '../hooks/useHubEntitlements';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub.svg`;
const logoCollapsedSrc = `${baseUrl}petmi-mark.svg`;

const EXPANDED_SECTIONS_KEY = 'hub.sidebar.expandedSections';

type NavItemBase = {
  label: string;
  icon: React.ElementType;
  /** Uma permissão ou qualquer uma da lista (OR). Omitido = sempre visível. */
  permission?: string | string[];
};

type InternalNavItem = NavItemBase & {
  to: string;
  end?: boolean;
  href?: never;
};

type ExternalNavItem = NavItemBase & {
  href: string;
  to?: never;
  end?: never;
};

type NavItem = InternalNavItem | ExternalNavItem;

type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    items: [
      {
        to: '/hub/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        end: true,
        permission: [
          'hub.appointments.read',
          'hub.clinic.read',
          'grooming.queue.read',
          'boarding.reservations.read',
          'pickup.routes.read',
          'hub.financial.read',
          'hub.inventory.read',
        ],
      },
    ],
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
      { to: '/hub/recepcao', label: 'Recepção', icon: Inbox, permission: 'reception.ops.read' },
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
      {
        to: '/hub/relatorios',
        label: 'Relatórios',
        icon: BarChart3,
        permission: [
          'hub.reports.read',
          'hub.financial.read',
          'hub.inventory.read',
          'hub.guardians.read',
          'hub.appointments.read',
          'boarding.reservations.read',
          'grooming.queue.read',
          'hub.clinic.read',
        ],
      },
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
        permission: [
          'hub.service_types.read',
          'hub.appointments.read',
          'hub.financial.read',
          'boarding.reservations.manage',
        ],
      },
      {
        to: '/hub/assinatura',
        label: 'Plano',
        icon: CreditCard,
        permission: 'hub.financial.write',
      },
    ],
  },
];

const HUB_SUPPORT_PATH = '/hub/suporte';

function buildNavSections(supportHref: string | null): NavSection[] {
  const helpItems: NavItem[] = [{ to: HUB_SUPPORT_PATH, label: 'Meus tickets', icon: LifeBuoy }];
  if (supportHref) {
    helpItems.push({ href: supportHref, label: 'Feedback beta', icon: MessageCircle });
  }
  return [...navSections, { id: 'ajuda', title: 'Ajuda', items: helpItems }];
}

function itemAllowed(
  hasPermission: (p: string) => boolean,
  permission: string | string[] | undefined,
): boolean {
  if (permission == null) return true;
  if (Array.isArray(permission)) {
    return permission.some((p) => hasPermission(p));
  }
  return hasPermission(permission);
}

function isInternalNavItem(item: NavItem): item is InternalNavItem {
  return typeof item.to === 'string';
}

function itemMatchesPath(item: NavItem, pathname: string): boolean {
  if (!isInternalNavItem(item)) return false;
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function sectionContainsPath(section: NavSection, pathname: string): boolean {
  return section.items.some((item) => itemMatchesPath(item, pathname));
}

function loadExpandedSections(sectionIds: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_SECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const allowed = new Set(sectionIds);
        const savedIds = parsed.filter((id): id is string => typeof id === 'string');
        const savedKnown = new Set(savedIds.filter((id) => allowed.has(id)));
        // Seções novas (ainda não persistidas) começam abertas.
        sectionIds.forEach((id) => {
          if (!savedIds.includes(id)) savedKnown.add(id);
        });
        return savedKnown;
      }
    }
  } catch {
    /* ignore */
  }
  return new Set(sectionIds);
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  ['hub-sidebar__link', isActive ? 'hub-sidebar__link--active' : ''].join(' ');

type HubSidebarProps = {
  isOpen?: boolean;
  isMobile?: boolean;
  collapsed?: boolean;
  onClose?: () => void;
  onToggleCollapsed?: () => void;
};

const HubSidebar: React.FC<HubSidebarProps> = ({
  isOpen = true,
  isMobile = false,
  collapsed = false,
  onClose,
  onToggleCollapsed,
}) => {
  const { pathname } = useLocation();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { navItemAllowed } = useHubEntitlements();
  const { isOpen: caixaOpen, pendingBillingCount } = useHubCashSession();
  const supportUnread = useHubSupportUnread();

  const allSections = useMemo(() => buildNavSections(getHubSupportWhatsappHref()), []);

  const visibleSections = useMemo(() => {
    if (permLoading) return allSections;
    return allSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            itemAllowed(hasPermission, item.permission) &&
            (!isInternalNavItem(item) || navItemAllowed(item.to)),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [allSections, hasPermission, permLoading, navItemAllowed]);

  const sectionIds = useMemo(() => visibleSections.map((s) => s.id), [visibleSections]);

  const activeSectionId = useMemo(() => {
    const match = visibleSections.find((section) => sectionContainsPath(section, pathname));
    return match?.id ?? null;
  }, [visibleSections, pathname]);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(() =>
    typeof window !== 'undefined'
      ? loadExpandedSections(allSections.map((s) => s.id))
      : new Set(allSections.map((s) => s.id)),
  );

  // Garante que a seção da rota atual fique aberta.
  useEffect(() => {
    if (!activeSectionId) return;
    setExpandedSections((prev) => {
      if (prev.has(activeSectionId)) return prev;
      const next = new Set(prev);
      next.add(activeSectionId);
      return next;
    });
  }, [activeSectionId]);

  // Remove ids de seções que o usuário não vê mais.
  useEffect(() => {
    setExpandedSections((prev) => {
      const allowed = new Set(sectionIds);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [sectionIds]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify(Array.from(expandedSections)));
  }, [expandedSections]);

  const toggleSection = useCallback(
    (sectionId: string) => {
      if (sectionId === activeSectionId) return;
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (next.has(sectionId)) next.delete(sectionId);
        else next.add(sectionId);
        return next;
      });
    },
    [activeSectionId],
  );

  const handleNavClick = () => {
    if (isMobile && onClose) onClose();
  };

  const showLabels = !collapsed || isMobile;

  return (
    <aside
      className={[
        'hub-sidebar',
        isOpen ? 'hub-sidebar--open' : '',
        collapsed && !isMobile ? 'hub-sidebar--collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Navegação principal"
      aria-hidden={isMobile && !isOpen ? true : undefined}
      data-collapsed={collapsed && !isMobile ? 'true' : undefined}
    >
      <div className="hub-sidebar__brand">
        <div className="hub-sidebar__logo-wrap">
          <img
            src={collapsed && !isMobile ? logoCollapsedSrc : logoSrc}
            alt="PetMi Hub"
            className={[
              'hub-sidebar__logo',
              collapsed && !isMobile ? 'hub-sidebar__logo--mark' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            decoding="async"
          />
          {showLabels ? (
            <p className="hub-sidebar__logo-tagline">
              Cuidado que conecta <span aria-hidden="true">♥</span>
            </p>
          ) : null}
        </div>
        {!isMobile && onToggleCollapsed && (
          <button
            type="button"
            className="hub-sidebar__collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? (
              <PanelLeft size={18} strokeWidth={1.75} aria-hidden />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        )}
      </div>

      <div className="hub-sidebar__divider" />

      <nav className="hub-sidebar__nav">
        {visibleSections.map((section) => {
          const isExpanded = collapsed && !isMobile ? true : expandedSections.has(section.id);
          const isActiveSection = section.id === activeSectionId;
          const panelId = `hub-sidebar-section-${section.id}`;

          return (
            <div
              key={section.id}
              className={[
                'hub-sidebar__section',
                isExpanded ? 'hub-sidebar__section--expanded' : '',
                isActiveSection ? 'hub-sidebar__section--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {showLabels && (
                <button
                  type="button"
                  className="hub-sidebar__section-toggle"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  disabled={isActiveSection && isExpanded}
                >
                  <span className="hub-sidebar__section-title">{section.title}</span>
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    className={[
                      'hub-sidebar__section-chevron',
                      isExpanded ? 'hub-sidebar__section-chevron--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden
                  />
                </button>
              )}

              <div
                id={panelId}
                className="hub-sidebar__section-items"
                role="group"
                aria-label={section.title}
                hidden={!isExpanded}
              >
                {section.items.map((item) => {
                  const { label, icon: Icon } = item;
                  const tip = !showLabels ? label : undefined;

                  if (!isInternalNavItem(item)) {
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className="hub-sidebar__link"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleNavClick}
                        title={
                          showLabels
                            ? 'Abre o WhatsApp para bugs, feedbacks ou elogios (beta)'
                            : tip
                        }
                        aria-label={`${label} (abre o WhatsApp em nova aba)`}
                      >
                        <Icon size={18} strokeWidth={1.75} className="hub-sidebar__icon" aria-hidden />
                        {showLabels && <span>{label}</span>}
                      </a>
                    );
                  }

                  const { to, end } = item;
                  const showSupportUnread = to === HUB_SUPPORT_PATH && supportUnread > 0;
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      className={linkClass}
                      end={end}
                      onClick={handleNavClick}
                      title={tip}
                      aria-label={!showLabels ? label : undefined}
                    >
                      <Icon size={18} strokeWidth={1.75} className="hub-sidebar__icon" aria-hidden />
                      {showLabels && <span>{label}</span>}
                      {showLabels && showSupportUnread && (
                        <span
                          className="hub-sidebar__badge hub-sidebar__badge--warn"
                          aria-label={`${supportUnread} resposta(s) do suporte não lida(s)`}
                        >
                          {supportUnread}
                        </span>
                      )}
                      {!showLabels && showSupportUnread && (
                        <span className="hub-sidebar__dot hub-sidebar__dot--warn" aria-hidden />
                      )}
                      {showLabels && to === '/hub/caixa' && caixaOpen && (
                        <span
                          className={[
                            'hub-sidebar__badge',
                            pendingBillingCount > 0 ? 'hub-sidebar__badge--warn' : 'hub-sidebar__badge--ok',
                          ].join(' ')}
                          aria-label={`Caixa aberto${pendingBillingCount > 0 ? `, ${pendingBillingCount} pendente(s)` : ''}`}
                        >
                          {pendingBillingCount > 0 ? pendingBillingCount : 'Aberto'}
                        </span>
                      )}
                      {!showLabels && to === '/hub/caixa' && caixaOpen && (
                        <span
                          className={[
                            'hub-sidebar__dot',
                            pendingBillingCount > 0 ? 'hub-sidebar__dot--warn' : 'hub-sidebar__dot--ok',
                          ].join(' ')}
                          aria-hidden
                        />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <HubSidebarFooter collapsed={collapsed && !isMobile} />
    </aside>
  );
};

export default HubSidebar;
