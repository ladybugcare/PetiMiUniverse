import React, { useState, ReactNode } from 'react';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar, { MenuItem } from './DashboardSidebar';

interface DashboardLayoutProps {
  children: ReactNode;
  pageName: string;
  menuItems: MenuItem[];
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  notificationCount?: number;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  pageName,
  menuItems,
  activeSection,
  onSectionChange,
  notificationCount = 0,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Get user info from localStorage
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';

  const handleMenuToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <DashboardHeader
        onMenuClick={handleMenuToggle}
        pageName={pageName}
        notificationCount={notificationCount}
      />

      {/* Sidebar */}
      <DashboardSidebar
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
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
        {children}
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
};

export default DashboardLayout;

