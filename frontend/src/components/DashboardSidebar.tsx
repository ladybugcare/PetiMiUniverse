import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import colors from '../styles/colors';
import { UnreadBadge } from './UnreadBadge';
import Avatar from './Avatar';
import { getUserPhotoUrl, getUserTypeForAvatar } from '../utils/userPhotoHelper';

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
  userName: string;
  userEmail: string;
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  /** Se false, não mostra overlay semitransparente (ex.: menu fixo em desktop). */
  showBackdrop?: boolean;
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  isOpen,
  onClose,
  menuItems,
  userName,
  userEmail,
  activeSection,
  onSectionChange,
  showBackdrop = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Get user from localStorage to access photo
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

  // Carregar estado de expansão do localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebarExpandedItems');
    if (saved) {
      try {
        setExpandedItems(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error('Error loading expanded items:', e);
      }
    }
  }, []);

  // Salvar estado de expansão no localStorage
  useEffect(() => {
    if (expandedItems.size > 0) {
      localStorage.setItem('sidebarExpandedItems', JSON.stringify(Array.from(expandedItems)));
    }
  }, [expandedItems]);

  // Expandir automaticamente itens que contêm a rota ativa
  useEffect(() => {
    const activePath = location.pathname;
    const newExpanded = new Set(expandedItems);
    
    menuItems.forEach(item => {
      if (item.subItems) {
        const hasActiveChild = item.subItems.some(subItem => 
          subItem.path === activePath || 
          (subItem.sectionId && subItem.sectionId === activeSection)
        );
        if (hasActiveChild) {
          newExpanded.add(item.id);
        }
      }
    });
    
    if (newExpanded.size !== expandedItems.size) {
      setExpandedItems(newExpanded);
    }
  }, [location.pathname, activeSection, menuItems]);

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const isItemActive = (item: MenuItem, checkChildren: boolean = true): boolean => {
    // Se o item tem subitens e algum deles tem o mesmo path, não considerar o pai como ativo
    if (checkChildren && item.subItems && item.subItems.length > 0) {
      const hasChildWithSamePath = item.subItems.some(subItem => 
        subItem.path === item.path && subItem.path === location.pathname
      );
      // Se um filho tem o mesmo path e está ativo, o pai não deve estar ativo
      if (hasChildWithSamePath) {
        return false;
      }
    }
    
    // Verificar se a rota atual corresponde ao path do item
    if (item.path && location.pathname === item.path) {
      return true;
    }
    
    // Verificar se é uma seção ativa
    if (item.sectionId && activeSection === item.sectionId) {
      return true;
    }
    
    return false;
  };

  const hasActiveChild = (item: MenuItem): boolean => {
    // Verificar se algum subitem está ativo (mas não o próprio item)
    if (item.subItems) {
      return item.subItems.some(subItem => {
        // Verificar se o subitem está ativo (sem verificar filhos para evitar recursão)
        const subItemActive = isItemActive(subItem, false);
        // Verificar recursivamente se tem filhos ativos
        return subItemActive || hasActiveChild(subItem);
      });
    }
    return false;
  };

  const handleMenuItemClick = (item: MenuItem, e?: React.MouseEvent) => {
    // Se tem subitens, toggle expansão ao invés de navegar
    if (item.subItems && item.subItems.length > 0) {
      e?.stopPropagation();
      toggleExpanded(item.id);
      return;
    }

    // Verificar se o item está desabilitado
    if (item.disabled) {
      return;
    }
    
    if (item.action === 'navigate' && item.path) {
      if (/^https?:\/\//i.test(item.path)) {
        window.location.href = item.path;
      } else {
        navigate(item.path);
      }
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

  const handleKeyDown = (item: MenuItem, e: React.KeyboardEvent) => {
    // Se o item está desabilitado, não fazer nada
    if (item.disabled) {
      return;
    }

    // Enter ou Space para ativar item
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      
      // Se tem subitens, alternar expansão
      if (item.subItems && item.subItems.length > 0) {
        toggleExpanded(item.id);
      } else {
        // Simular clique
        handleMenuItemClick(item);
      }
    }
    
    // ArrowRight para expandir subitens
    if (e.key === 'ArrowRight' && item.subItems && item.subItems.length > 0) {
      e.preventDefault();
      if (!expandedItems.has(item.id)) {
        toggleExpanded(item.id);
      }
    }
    
    // ArrowLeft para colapsar subitens
    if (e.key === 'ArrowLeft' && item.subItems && item.subItems.length > 0) {
      e.preventDefault();
      if (expandedItems.has(item.id)) {
        toggleExpanded(item.id);
      }
    }
  };

  const renderMenuItem = (item: MenuItem, level: number = 0): React.ReactNode => {
    const isExpanded = expandedItems.has(item.id);
    const isActive = isItemActive(item);
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isDisabled = item.disabled;
    const hasActiveChildItem = hasActiveChild(item);
    // Item pai tem estilo especial quando apenas um filho está ativo
    const isParentWithActiveChild = level === 0 && hasActiveChildItem && !isActive;

    return (
      <li key={item.id} style={styles.menuItem}>
        <button
          onClick={(e) => handleMenuItemClick(item, e)}
          onKeyDown={(e) => handleKeyDown(item, e)}
          disabled={isDisabled}
          title={isDisabled && item.tooltip ? item.tooltip : item.tooltip || undefined}
          aria-label={item.label}
          aria-disabled={isDisabled}
          aria-expanded={hasSubItems ? expandedItems.has(item.id) : undefined}
          aria-describedby={isDisabled && item.tooltip ? `${item.id}-tooltip` : undefined}
          role="menuitem"
          tabIndex={isDisabled ? -1 : 0}
          style={{
            ...styles.menuButton,
            ...(level > 0 ? styles.menuButtonSubItem : {}),
            ...(isActive ? styles.menuButtonActive : {}),
            ...(isParentWithActiveChild ? styles.menuButtonParentActive : {}),
            ...(isDisabled ? styles.menuButtonDisabled : {}),
            paddingLeft: isParentWithActiveChild 
              ? `${13 + (level * 16)}px` // Ajustar para compensar a borda de 3px
              : `${16 + (level * 16)}px`,
          }}
        >
          <span style={styles.menuIcon}>{item.icon}</span>
          <span style={styles.menuLabel}>{item.label}</span>
          <span style={styles.menuRight}>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <UnreadBadge count={item.badge} />
            )}
            {hasSubItems && (
              <span style={styles.menuChevron}>
                {isExpanded ? (
                  <ChevronDown size={16} color={colors.brand.primary[500]} />
                ) : (
                  <ChevronRight size={16} color={colors.brand.primary[500]} />
                )}
              </span>
            )}
          </span>
        </button>
        {hasSubItems && isExpanded && (
          <ul style={styles.subMenuList} role="menu" aria-label={`Submenu de ${item.label}`}>
            {item.subItems!.map(subItem => renderMenuItem(subItem, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  // Agrupar itens por grupo
  const groupedItems = menuItems.reduce((acc, item) => {
    const group = item.group || 'Outros';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const groupOrder = ['Principal', 'Gerenciamento', 'Operacional', 'Suporte', 'Perfil', 'Outros'];

  return (
    <>
      {/* Overlay */}
      {isOpen && showBackdrop && (
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
            <Avatar
              src={getUserPhotoUrl(user)}
              name={userName}
              size={80}
              userType={getUserTypeForAvatar(user)}
            />
          </div>
          <div style={styles.userInfo}>
            <h3 style={styles.userNameText}>{userName}</h3>
            <p style={styles.userEmailText}>{userEmail}</p>
          </div>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Menu Items */}
        <nav style={styles.menuNav} role="menu" aria-label="Menu de navegação principal">
          {groupOrder.map((groupName, groupIndex) => {
            const items = groupedItems[groupName];
            if (!items || items.length === 0) return null;

            return (
              <React.Fragment key={groupName}>
                {groupIndex > 0 && <div style={styles.groupSeparator} />}
                <ul style={styles.menuList}>
                  {items.map((item) => renderMenuItem(item))}
                </ul>
              </React.Fragment>
            );
          })}
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
    backgroundColor: colors.brand.primary[100],
    color: colors.brand.primary[500],
    fontWeight: '500',
  },
  menuButtonParentActive: {
    backgroundColor: 'transparent',
    color: colors.brand.primary[500],
    fontWeight: '500',
    borderLeft: `3px solid ${colors.brand.primary[500]}`,
  },
  menuIcon: {
    fontSize: '20px',
    minWidth: '24px',
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
  },
  menuRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  menuChevron: {
    display: 'flex',
    alignItems: 'center',
    transition: 'transform 0.2s ease',
  },
  menuButtonSubItem: {
    fontSize: '14px',
    padding: '8px 16px',
  },
  menuButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  subMenuList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    overflow: 'hidden',
    animation: 'slideDown 0.2s ease',
  },
  groupSeparator: {
    height: '1px',
    backgroundColor: '#e5e5e5',
    margin: '12px 16px',
  },
};

// Adicionar animação CSS para subitens
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideDown {
    from {
      max-height: 0;
      opacity: 0;
    }
    to {
      max-height: 500px;
      opacity: 1;
    }
  }
`;
if (!document.head.querySelector('style[data-sidebar-animations]')) {
  styleSheet.setAttribute('data-sidebar-animations', 'true');
  document.head.appendChild(styleSheet);
}

export default DashboardSidebar;

