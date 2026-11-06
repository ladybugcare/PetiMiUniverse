import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar, { MenuItem } from './DashboardSidebar';

const MOBILE_MQ = '(max-width: 900px)';
const COLLAPSED_KEY = 'shift.sidebar.collapsed';

interface DashboardLayoutProps {
  children: ReactNode;
  pageName: string;
  menuItems: MenuItem[];
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  /** Mantido por compatibilidade. No desktop a sidebar fica fixa, como no Hub. */
  persistentClinicNav?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  pageName,
  menuItems,
  activeSection,
  onSectionChange,
}) => {
  const { pathname } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false
  );
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  });

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isMobile && isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, isSidebarOpen]);

  const handleMenuToggle = useCallback(() => {
    setIsSidebarOpen((open) => !open);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleToggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const sidebarOpen = !isMobile || isSidebarOpen;
  const desktopCollapsed = !isMobile && isCollapsed;
  const hasNav = menuItems.length > 0;

  return (
    <div
      className={[
        'shift-app-shell',
        desktopCollapsed ? 'shift-app-shell--sidebar-collapsed' : '',
        hasNav ? '' : 'shift-app-shell--no-nav',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {hasNav && isMobile && isSidebarOpen && (
        <button
          type="button"
          className="shift-sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={handleCloseSidebar}
        />
      )}

      {hasNav && (
        <DashboardSidebar
          isOpen={sidebarOpen}
          isMobile={isMobile}
          collapsed={desktopCollapsed}
          onClose={handleCloseSidebar}
          onToggleCollapsed={handleToggleCollapsed}
          menuItems={menuItems}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
      )}

      <div className="shift-app-shell__column">
        <DashboardHeader
          onMenuClick={handleMenuToggle}
          isMenuOpen={isSidebarOpen}
          showMenuButton={isMobile && hasNav}
          pageName={pageName}
        />
        <main className="shift-app-shell__outlet">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
