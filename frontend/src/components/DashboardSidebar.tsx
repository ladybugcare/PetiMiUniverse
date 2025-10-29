import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  action: 'navigate' | 'section' | 'logout';
  path?: string;
  sectionId?: string;
}

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  userName: string;
  userEmail: string;
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  isOpen,
  onClose,
  menuItems,
  userName,
  userEmail,
  activeSection,
  onSectionChange,
}) => {
  const navigate = useNavigate();

  const getInitials = (name: string) => {
    const names = name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.action === 'navigate' && item.path) {
      navigate(item.path);
      onClose();
    } else if (item.action === 'section' && item.sectionId) {
      onSectionChange?.(item.sectionId);
      onClose();
    } else if (item.action === 'logout') {
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      navigate('/login');
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          style={styles.overlay}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          ...styles.sidebar,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {/* User Profile Section */}
        <div style={styles.profileSection}>
          <div style={styles.avatarContainer}>
            <div style={styles.avatar}>
              <span style={styles.avatarText}>
                {getInitials(userName)}
              </span>
            </div>
          </div>
          <div style={styles.userInfo}>
            <h3 style={styles.userNameText}>{userName}</h3>
            <p style={styles.userEmailText}>{userEmail}</p>
          </div>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Menu Items */}
        <nav style={styles.menuNav}>
          <ul style={styles.menuList}>
            {menuItems.map((item) => (
              <li key={item.id} style={styles.menuItem}>
                <button
                  onClick={() => handleMenuItemClick(item)}
                  style={{
                    ...styles.menuButton,
                    ...(activeSection === item.sectionId && item.action === 'section'
                      ? styles.menuButtonActive
                      : {}),
                  }}
                >
                  <span style={styles.menuIcon}>{item.icon}</span>
                  <span style={styles.menuLabel}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: '64px', // Start below the header
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 98,
    transition: 'opacity 0.3s ease',
  },
  sidebar: {
    position: 'fixed',
    top: '64px', // Start below the header
    left: 0,
    bottom: 0,
    width: '280px',
    backgroundColor: '#ffffff',
    borderRight: '1px solid #e5e5e5',
    boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)',
    zIndex: 99,
    overflowY: 'auto',
    transition: 'transform 0.3s ease',
    paddingTop: '24px',
  },
  profileSection: {
    padding: '0 24px',
    marginBottom: '24px',
  },
  avatarContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#7c3aed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '3px solid #ede9fe',
  },
  avatarText: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '600',
    color: '#ffffff',
  },
  userInfo: {
    textAlign: 'center',
  },
  userNameText: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 4px 0',
  },
  userEmailText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    wordBreak: 'break-word',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e5e5',
    margin: '0 24px 16px 24px',
  },
  menuNav: {
    padding: '0 16px',
  },
  menuList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  menuItem: {
    marginBottom: '4px',
  },
  menuButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease',
    textAlign: 'left',
    fontFamily: 'Inter, sans-serif',
    fontSize: '15px',
    color: '#404040',
  },
  menuButtonActive: {
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
    fontWeight: '500',
  },
  menuIcon: {
    fontSize: '20px',
    minWidth: '24px',
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
  },
};

export default DashboardSidebar;

