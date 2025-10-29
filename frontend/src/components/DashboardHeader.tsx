import React from 'react';
import { useNavigate } from 'react-router-dom';
import UnitSelector from './UnitSelector';

interface DashboardHeaderProps {
  onMenuClick: () => void;
  pageName: string;
  notificationCount?: number;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onMenuClick,
  pageName,
  notificationCount = 0,
}) => {
  const navigate = useNavigate();

  const handleLogoClick = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = user?.user_metadata?.role || user?.role;

    // Navigate to respective dashboard based on user role
    if (userRole === 'admin') {
      navigate('/admin-dashboard');
    } else if (userRole === 'clinic') {
      navigate('/clinic-dashboard');
    } else if (userRole === 'vet') {
      navigate('/vet-dashboard');
    } else {
      navigate('/');
    }
  };

  return (
    <header style={styles.header}>
      <div style={styles.container}>
        {/* Left: Hamburger + Page Name */}
        <div style={styles.leftSection}>
          <button
            onClick={onMenuClick}
            style={styles.hamburger}
            aria-label="Toggle menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 style={styles.pageName}>{pageName}</h1>
        </div>

        {/* Center: Logo */}
        <div style={styles.centerSection}>
          <img
            src="/purple_logo.png"
            alt="PetiVet"
            style={styles.logo}
            onClick={handleLogoClick}
            title="Ir para o Dashboard"
          />
        </div>

        {/* Right: Unit Selector + Notification Bell */}
        <div style={styles.rightSection}>
          <UnitSelector />
          <button
            style={styles.notificationButton}
            aria-label="Notifications"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {notificationCount > 0 && (
              <span style={styles.notificationBadge}>
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '64px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e5e5',
    zIndex: 100,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
    maxWidth: '100%',
    padding: '0 24px',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: '1',
  },
  hamburger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#525252',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease',
  },
  pageName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  centerSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  logo: {
    height: '40px',
    width: 'auto',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: '1',
  },
  notificationButton: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#525252',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease',
  },
  notificationBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '9999px',
    border: '2px solid #ffffff',
  },
};

export default DashboardHeader;

