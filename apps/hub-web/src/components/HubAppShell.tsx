import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { HubCaixaExitGuard } from './HubCaixaExitGuard';
import HubSidebar from './HubSidebar';
import HubTopHeader from './HubTopHeader';
import HubUnitIncompleteBanner from './HubUnitIncompleteBanner';
import HubCashOpenBanner from './HubCashOpenBanner';

const MOBILE_MQ = '(max-width: 900px)';
const COLLAPSED_KEY = 'hub.sidebar.collapsed';

/**
 * Shell visual do Hub.
 * Providers (unidade / sessão de caixa) ficam em App (`HubAuthenticatedLayout`).
 */
const HubAppShell: React.FC = () => {
  const { pathname } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false,
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

  return (
    <div
      className={['hub-app-shell', desktopCollapsed ? 'hub-app-shell--sidebar-collapsed' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <HubCaixaExitGuard />
      {isMobile && isSidebarOpen && (
        <button
          type="button"
          className="hub-sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={handleCloseSidebar}
        />
      )}
      <HubSidebar
        isOpen={sidebarOpen}
        isMobile={isMobile}
        collapsed={desktopCollapsed}
        onClose={handleCloseSidebar}
        onToggleCollapsed={handleToggleCollapsed}
      />
      <div className="hub-app-shell__column">
        <HubTopHeader
          onMenuClick={handleMenuToggle}
          isMenuOpen={isSidebarOpen}
          showMenuButton={isMobile}
        />
        <div className="hub-app-shell__outlet">
          <HubUnitIncompleteBanner />
          <HubCashOpenBanner />
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default HubAppShell;
