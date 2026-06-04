import React, { useState, useEffect, ReactNode } from 'react';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar, { MenuItem } from './DashboardSidebar';

const CLINIC_DESKTOP_SIDEBAR_MQ = '(min-width: 1024px)';

interface DashboardLayoutProps {
  children: ReactNode;
  pageName: string;
  menuItems: MenuItem[];
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  /** Em desktop, abre o menu por defeito e sem overlay escuro (layout tipo backoffice clínica). */
  persistentClinicNav?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  pageName,
  menuItems,
  activeSection,
  onSectionChange,
  persistentClinicNav = false,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (persistentClinicNav && window.matchMedia(CLINIC_DESKTOP_SIDEBAR_MQ).matches) {
      return true;
    }
    return false;
  });

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(CLINIC_DESKTOP_SIDEBAR_MQ).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(CLINIC_DESKTOP_SIDEBAR_MQ);
    const onMq = () => setIsDesktop(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  useEffect(() => {
    if (!persistentClinicNav) return;
    const mq = window.matchMedia(CLINIC_DESKTOP_SIDEBAR_MQ);
    const onShrink = () => {
      if (!mq.matches) setIsSidebarOpen(false);
    };
    mq.addEventListener('change', onShrink);
    return () => mq.removeEventListener('change', onShrink);
  }, [persistentClinicNav]);

  // Get user info from localStorage
  const getUserFromStorage = () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return null;
      return JSON.parse(userStr);
    } catch (error) {
      console.warn('Failed to parse user from localStorage:', error);
      return null;
    }
  };

  const user = getUserFromStorage();
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';

  const handleMenuToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  const showSidebarBackdrop = !(persistentClinicNav && isDesktop);

  return (
    <div style={styles.container}>
      {/* Header */}
      <DashboardHeader
        onMenuClick={handleMenuToggle}
        pageName={pageName}
      />

      {/* Sidebar */}
      <DashboardSidebar
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        showBackdrop={showSidebarBackdrop}
        menuItems={menuItems}
        userName={userName}
        userEmail={userEmail}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />

      {/* Main Content */}
      <main
        style={{
          ...styles.mainContent,
          marginLeft: isSidebarOpen ? '280px' : '0',
        }}
      >
        <div style={styles.contentWrapper}>
        {children}
        </div>
      </main>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#fafafa',
  },
  mainContent: {
    paddingTop: '64px', // Height of header
    transition: 'margin-left 0.3s ease',
    minHeight: '100vh',
  },
  contentWrapper: {
    width: '100%',
  },
};

export default DashboardLayout;

