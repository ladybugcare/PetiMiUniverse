import React, { useState, ReactNode } from 'react';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar, { MenuItem } from './DashboardSidebar';

interface DashboardLayoutProps {
  children: ReactNode;
  pageName: string;
  menuItems: MenuItem[];
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  pageName,
  menuItems,
  activeSection,
  onSectionChange,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

