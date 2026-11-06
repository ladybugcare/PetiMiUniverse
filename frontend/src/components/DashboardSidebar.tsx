import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, PanelLeft, PanelLeftClose } from 'lucide-react';
import { UnreadBadge } from './UnreadBadge';
import UnitSelector from './UnitSelector';
import { useAuth } from '../AuthContext';

export interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: 'navigate' | 'section' | 'logout';
  path?: string;
  sectionId?: string;
  subItems?: MenuItem[];
  badge?: number | (() => Promise<number>);
  permission?: string;
  disabled?: boolean;
  tooltip?: string;
  group?: string;
  order?: number;
}

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  userName?: string;
  userEmail?: string;
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  /** Se false, não mostra overlay semitransparente (o layout desenha o backdrop). */
  showBackdrop?: boolean;
  isMobile?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const EXPANDED_ITEMS_KEY = 'sidebarExpandedItems';
const EXPANDED_SECTIONS_KEY = 'shift.sidebar.expandedSections';
/** Mesma ordem da sidebar anterior — grupos fora desta lista não aparecem. */
const GROUP_ORDER = ['Principal', 'Gerenciamento', 'Operacional', 'Suporte', 'Perfil', 'Outros'];

function loadExpandedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_SECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((id): id is string => typeof id === 'string'));
      }
    }
  } catch {
    /* ignore */
  }
  return new Set(GROUP_ORDER);
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  isOpen,
  onClose,
  menuItems,
  activeSection,
  onSectionChange,
  isMobile = false,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() =>
    typeof window !== 'undefined' ? loadExpandedSections() : new Set(GROUP_ORDER)
  );

  useEffect(() => {
    const saved = localStorage.getItem(EXPANDED_ITEMS_KEY);
    if (saved) {
      try {
        setExpandedItems(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error('Error loading expanded items:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (expandedItems.size > 0) {
      localStorage.setItem(EXPANDED_ITEMS_KEY, JSON.stringify(Array.from(expandedItems)));
    }
  }, [expandedItems]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify(Array.from(expandedSections)));
  }, [expandedSections]);

  const groupedItems = useMemo(() => {
    return menuItems.reduce((acc, item) => {
      const group = item.group || 'Outros';
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    }, {} as Record<string, MenuItem[]>);
  }, [menuItems]);

  const groupNames = useMemo(
    () => GROUP_ORDER.filter((name) => groupedItems[name]?.length),
    [groupedItems]
  );

  const isItemActive = useCallback(
    (item: MenuItem, checkChildren: boolean = true): boolean => {
      if (checkChildren && item.subItems && item.subItems.length > 0) {
        const hasChildWithSamePath = item.subItems.some(
          (subItem) => subItem.path === item.path && subItem.path === location.pathname
        );
        if (hasChildWithSamePath) return false;
      }

      if (item.path && location.pathname === item.path) return true;
      if (item.sectionId && activeSection === item.sectionId) return true;
      return false;
    },
    [location.pathname, activeSection]
  );

  const hasActiveChild = useCallback(
    (item: MenuItem): boolean => {
      if (!item.subItems) return false;
      return item.subItems.some((subItem) => isItemActive(subItem, false) || hasActiveChild(subItem));
    },
    [isItemActive]
  );

  const activeGroup = useMemo(() => {
    return (
      groupNames.find((name) =>
        (groupedItems[name] || []).some((item) => isItemActive(item) || hasActiveChild(item))
      ) ?? null
    );
  }, [groupNames, groupedItems, isItemActive, hasActiveChild]);

  useEffect(() => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      let changed = false;
      menuItems.forEach((item) => {
        if (!item.subItems) return;
        const childActive = item.subItems.some(
          (subItem) =>
            subItem.path === location.pathname || (subItem.sectionId && subItem.sectionId === activeSection)
        );
        if (childActive && !next.has(item.id)) {
          next.add(item.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [location.pathname, activeSection, menuItems]);

  useEffect(() => {
    if (!activeGroup) return;
    setExpandedSections((prev) => {
      if (prev.has(activeGroup)) return prev;
      const next = new Set(prev);
      next.add(activeGroup);
      return next;
    });
  }, [activeGroup]);

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSection = (sectionId: string) => {
    if (sectionId === activeGroup) return;
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.subItems && item.subItems.length > 0) {
      if (collapsed && !isMobile) {
        onToggleCollapsed?.();
        setExpandedItems((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        return;
      }
      toggleExpanded(item.id);
      return;
    }

    if (item.disabled) return;

    if (item.action === 'navigate' && item.path) {
      if (/^https?:\/\//i.test(item.path)) {
        window.location.href = item.path;
      } else {
        navigate(item.path);
      }
      if (isMobile) onClose();
    } else if (item.action === 'section' && item.sectionId) {
      onSectionChange?.(item.sectionId);
      if (isMobile) onClose();
    } else if (item.action === 'logout') {
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      navigate('/login');
    }
  };

  const handleKeyDown = (item: MenuItem, e: React.KeyboardEvent) => {
    if (item.disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleMenuItemClick(item);
    }

    if (e.key === 'ArrowRight' && item.subItems && item.subItems.length > 0) {
      e.preventDefault();
      if (!expandedItems.has(item.id)) toggleExpanded(item.id);
    }

    if (e.key === 'ArrowLeft' && item.subItems && item.subItems.length > 0) {
      e.preventDefault();
      if (expandedItems.has(item.id)) toggleExpanded(item.id);
    }
  };

  const handleLogoClick = () => {
    if (role === 'ADMIN') navigate('/admin-dashboard');
    else if (role === 'CADMIN' || role === 'CMANAGER') navigate('/clinic-dashboard');
    else if (role === 'VET') navigate('/vet-dashboard');
    else navigate('/');
  };

  const showLabels = !collapsed || isMobile;

  const renderMenuItem = (item: MenuItem, level: number = 0): React.ReactNode => {
    const isExpanded = expandedItems.has(item.id);
    const isActive = isItemActive(item);
    const hasSubItems = Boolean(item.subItems && item.subItems.length > 0);
    const isDisabled = item.disabled;
    const isParentWithActiveChild = level === 0 && hasActiveChild(item) && !isActive;

    const className = [
      'shift-sidebar__link',
      level > 0 ? 'shift-sidebar__link--sub' : '',
      isActive ? 'shift-sidebar__link--active' : '',
      isParentWithActiveChild ? 'shift-sidebar__link--parent' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div key={item.id}>
        <button
          type="button"
          onClick={() => handleMenuItemClick(item)}
          onKeyDown={(e) => handleKeyDown(item, e)}
          disabled={isDisabled}
          title={!showLabels ? item.label : isDisabled && item.tooltip ? item.tooltip : item.tooltip || undefined}
          aria-label={item.label}
          aria-disabled={isDisabled}
          aria-expanded={hasSubItems ? isExpanded : undefined}
          aria-current={isActive ? 'page' : undefined}
          className={className}
        >
          <span className="shift-sidebar__icon">{item.icon}</span>
          {showLabels && <span className="shift-sidebar__label">{item.label}</span>}
          {showLabels && typeof item.badge === 'number' && item.badge > 0 && <UnreadBadge count={item.badge} />}
          {showLabels && hasSubItems && (
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={['shift-sidebar__chevron', isExpanded ? 'shift-sidebar__chevron--open' : '']
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            />
          )}
        </button>
        {hasSubItems && isExpanded && showLabels && (
          <div className="shift-sidebar__sub" role="group" aria-label={`Submenu de ${item.label}`}>
            {item.subItems!.map((subItem) => renderMenuItem(subItem, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={[
        'shift-sidebar',
        isOpen ? 'shift-sidebar--open' : '',
        collapsed && !isMobile ? 'shift-sidebar--collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Navegação principal"
      aria-hidden={isMobile && !isOpen ? true : undefined}
    >
      <div className="shift-sidebar__brand">
        <button type="button" className="shift-sidebar__logo-btn" onClick={handleLogoClick} title="Ir para o painel">
          <img
            src={collapsed && !isMobile ? '/petmi-shift-mark.svg' : '/petmi-shift.svg'}
            alt="PetMi Shift"
            className={[
              'shift-sidebar__logo',
              collapsed && !isMobile ? 'shift-sidebar__logo--mark' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            decoding="async"
          />
          {showLabels && (
            <p className="shift-sidebar__logo-tagline">
              Cuidado que conecta <span aria-hidden="true">♥</span>
            </p>
          )}
        </button>
        {!isMobile && onToggleCollapsed && (
          <button
            type="button"
            className="shift-sidebar__collapse-btn"
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

      <div className="shift-sidebar__divider" />

      <nav className="shift-sidebar__nav">
        {groupNames.map((groupName) => {
          const items = groupedItems[groupName];
          if (!items || items.length === 0) return null;
          const isExpanded = collapsed && !isMobile ? true : expandedSections.has(groupName);
          const isActiveSection = groupName === activeGroup;
          const panelId = `shift-sidebar-section-${groupName.replace(/\s+/g, '-').toLowerCase()}`;

          return (
            <div
              key={groupName}
              className={['shift-sidebar__section', isExpanded ? 'shift-sidebar__section--expanded' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {showLabels && (
                <button
                  type="button"
                  className="shift-sidebar__section-toggle"
                  onClick={() => toggleSection(groupName)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  disabled={isActiveSection && isExpanded}
                >
                  <span className="shift-sidebar__section-title">{groupName}</span>
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    className={[
                      'shift-sidebar__section-chevron',
                      isExpanded ? 'shift-sidebar__section-chevron--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden
                  />
                </button>
              )}
              <div
                id={panelId}
                className="shift-sidebar__section-items"
                role="group"
                aria-label={groupName}
                hidden={!isExpanded}
              >
                {items.map((item) => renderMenuItem(item))}
              </div>
            </div>
          );
        })}
      </nav>

      {role !== 'CADMIN' && (
        <div
          className={[
            'shift-sidebar__footer',
            collapsed && !isMobile ? 'shift-sidebar__footer--collapsed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <UnitSelector collapsed={collapsed && !isMobile} />
        </div>
      )}
    </aside>
  );
};

export default DashboardSidebar;
