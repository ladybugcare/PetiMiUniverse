import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';

export interface FABOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  color: string;
  disabled?: boolean;
}

interface FloatingActionButtonProps {
  options: FABOption[];
}

const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const fabRef = useRef<HTMLDivElement>(null);

  const handleOptionClick = (option: FABOption) => {
    if (option.disabled || !option.path) return;
    navigate(option.path);
    setIsOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  return (
    <>
      <style>
        {`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .fab-option-wrapper {
            animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          }
        `}
      </style>

      <div ref={fabRef} style={styles.container}>
        {/* Backdrop */}
        {isOpen && (
          <div
            style={styles.backdrop}
            onClick={() => setIsOpen(false)}
          />
        )}

        {/* Options Menu */}
        {isOpen && (
          <div style={styles.optionsContainer}>
            {options.map((option, index) => (
              <div
                key={option.id}
                className="fab-option-wrapper"
                style={{
                  ...styles.optionWrapper,
                  animationDelay: `${index * 50}ms`,
                }}
              >
                <span style={styles.optionLabel}>{option.label}</span>
                <button
                  onClick={() => handleOptionClick(option)}
                  disabled={option.disabled || !option.path}
                  style={{
                    ...styles.optionButton,
                    backgroundColor: 'transparent',
                    ...(option.disabled || !option.path ? styles.optionButtonDisabled : {}),
                  }}
                  onMouseEnter={(e) => {
                    if (!option.disabled && option.path) {
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  aria-label={option.label}
                  title={option.disabled ? 'Ação desabilitada' : option.label}
                >
                  <div style={{
                    ...styles.optionIcon,
                    backgroundColor: option.color,
                  }}>
                    {option.icon}
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main FAB Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            ...styles.mainButton,
            transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          }}
          onMouseEnter={(e) => {
            if (!isOpen) {
              e.currentTarget.style.transform = 'scale(1.1) rotate(0deg)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(196, 108, 106, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isOpen) {
              e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(196, 108, 106, 0.4)';
            }
          }}
          aria-label={isOpen ? 'Fechar menu' : 'Abrir menu de ações'}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <X size={28} color="#ffffff" strokeWidth={2.5} />
          ) : (
            <Plus size={28} color="#ffffff" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 999,
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: -1,
    transition: 'opacity 0.3s ease',
  },
  mainButton: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, colors.brand.primary[500] 0%, colors.brand.primary[500] 100%)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(196, 108, 106, 0.4)',
    transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease',
  },
  mainIcon: {
    fontSize: '32px',
    color: '#ffffff',
    fontWeight: '300',
    lineHeight: 1,
  },
  optionsContainer: {
    position: 'absolute',
    bottom: '80px',
    right: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  optionWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    opacity: 0,
  },
  optionLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#262626',
    backgroundColor: '#ffffff',
    padding: '8px 16px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    whiteSpace: 'nowrap',
  },
  optionButton: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'none',
    transition: 'transform 0.2s ease',
    padding: 0,
  },
  optionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    color: '#ffffff',
    flexShrink: 0,
  },
  optionButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

// Media query for mobile
if (typeof window !== 'undefined' && window.innerWidth < 768) {
  styles.mainButton = {
    ...styles.mainButton,
    width: '56px',
    height: '56px',
  };
  styles.optionButton = {
    ...styles.optionButton,
    width: '48px',
    height: '48px',
  };
  styles.container = {
    ...styles.container,
    bottom: '16px',
    right: '16px',
  };
}

export default FloatingActionButton;

