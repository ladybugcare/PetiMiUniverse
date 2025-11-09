import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import colors from '../../styles/colors';

interface CollapsibleSectionProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  count,
  icon,
  defaultOpen = false,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={styles.container}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={styles.header}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f9fafb';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#ffffff';
        }}
      >
        <div style={styles.headerLeft}>
          <div style={styles.iconContainer}>{icon}</div>
          <div>
            <h3 style={styles.title}>{title}</h3>
            <p style={styles.countText}>
              {count} {count === 1 ? 'cadastro pendente' : 'cadastros pendentes'}
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          {count > 0 && (
            <span style={styles.badge}>{count}</span>
          )}
          {isOpen ? (
            <ChevronUp size={20} color={colors.text} />
          ) : (
            <ChevronDown size={20} color={colors.text} />
          )}
        </div>
      </button>
      {isOpen && <div style={styles.content}>{children}</div>}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    marginBottom: '16px',
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: 1,
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  countText: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  badge: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    borderRadius: '12px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: '700',
  },
  content: {
    padding: '0 20px 20px 20px',
  },
};

export default CollapsibleSection;

