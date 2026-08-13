import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { HubUnitProvider } from '../contexts/HubUnitContext';
import { HubCashSessionProvider } from '../contexts/HubCashSessionContext';
import { useCaixaExitGuard } from '../hooks/useCaixaExitGuard';
import HubSidebar from './HubSidebar';
import HubTopHeader from './HubTopHeader';
import HubUnitIncompleteBanner from './HubUnitIncompleteBanner';
import HubCashOpenBanner from './HubCashOpenBanner';

const MOBILE_MQ = '(max-width: 900px)';

const HubAppShellInner: React.FC = () => {
  const { pathname } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false,
  );

  const { ExitGuardModal } = useCaixaExitGuard();

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

  const sidebarOpen = !isMobile || isSidebarOpen;

  return (
    <div className="hub-app-shell">
      <ExitGuardModal />
      {isMobile && isSidebarOpen && (
        <button
          type="button"
          className="hub-sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={handleCloseSidebar}
        />
      )}
      <HubSidebar isOpen={sidebarOpen} isMobile={isMobile} onClose={handleCloseSidebar} />
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

const HubAppShell: React.FC = () => (
  <HubUnitProvider>
    <HubCashSessionProvider>
      <HubAppShellInner />
    </HubCashSessionProvider>
  </HubUnitProvider>
);

export default HubAppShell;
