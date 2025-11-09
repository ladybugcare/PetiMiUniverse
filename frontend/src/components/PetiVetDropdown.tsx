import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import colors from '../styles/colors';

interface PetiVetDropdownProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const PetiVetDropdown: React.FC<PetiVetDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Inject custom scrollbar styles
  useEffect(() => {
    const styleId = 'petivet-dropdown-styles';
    if (!document.getElementById(styleId)) {
      const styleSheet = document.createElement('style');
      styleSheet.id = styleId;
      styleSheet.textContent = `
        .petivet-dropdown-options::-webkit-scrollbar {
          width: 8px;
        }
        .petivet-dropdown-options::-webkit-scrollbar-track {
          background: #f5f5f5;
        }
        .petivet-dropdown-options::-webkit-scrollbar-thumb {
          background: #d4d4d4;
          border-radius: 4px;
        }
        .petivet-dropdown-options::-webkit-scrollbar-thumb:hover {
          background: #a3a3a3;
        }
      `;
      document.head.appendChild(styleSheet);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHoveredIndex(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Scroll to selected option when opening
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const selectedElement = dropdownRef.current.querySelector('[data-selected="true"]');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [isOpen, value]);

  const selectedIndex = options.findIndex(opt => opt === value);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setHoveredIndex(null);
  };

  return (
    <div ref={dropdownRef} style={styles.container}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          ...styles.trigger,
          ...(isOpen ? styles.triggerOpen : {}),
          ...(disabled ? styles.triggerDisabled : {}),
        }}
      >
        <span style={styles.triggerText}>
          {value || <span style={styles.placeholder}>{placeholder}</span>}
        </span>
        <ChevronDown
          size={18}
          style={{
            ...styles.chevron,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div style={styles.dropdown}>
          <div className="petivet-dropdown-options" style={styles.optionsList}>
            {options.map((option, index) => {
              const isSelected = option === value;
              const isHovered = hoveredIndex === index;
              
              return (
                <div
                  key={option}
                  data-selected={isSelected}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    ...styles.option,
                    ...(isHovered ? styles.optionHovered : {}),
                    ...(isSelected ? styles.optionSelected : {}),
                  }}
                >
                  <span style={{
                    ...styles.optionText,
                    ...(isHovered ? { color: '#ffffff' } : {}),
                  }}>{option}</span>
                  {isSelected && (
                    <Check size={16} style={{
                      ...styles.checkIcon,
                      ...(isHovered ? { color: '#ffffff' } : {}),
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
    width: '100%',
  },
  trigger: {
    width: '100%',
    minHeight: '44px',
    padding: '12px 16px',
    backgroundColor: '#ffffff', // Light background
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    color: '#262626',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'all 0.2s ease',
    fontFamily: 'Inter, sans-serif',
  },
  triggerOpen: {
    borderColor: '#7c3aed',
    boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.1)',
  },
  triggerDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
    backgroundColor: '#f5f5f5',
  },
  triggerText: {
    flex: 1,
    textAlign: 'left',
  },
  placeholder: {
    color: '#a3a3a3',
  },
  chevron: {
    color: '#737373',
    transition: 'transform 0.2s ease',
    flexShrink: 0,
    marginLeft: '12px',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff', // Light background
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
    zIndex: 1000,
    overflow: 'hidden',
    maxHeight: '300px',
  },
  optionsList: {
    maxHeight: '300px',
    overflowY: 'auto',
    padding: '4px 0',
    // Custom scrollbar styling
    scrollbarWidth: 'thin',
    scrollbarColor: '#d4d4d4 #ffffff',
  },
  option: {
    padding: '10px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: '#262626',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.15s ease',
    fontFamily: 'Inter, sans-serif',
  },
  optionHovered: {
    backgroundColor: '#3b82f6', // Blue highlight on hover
    color: '#ffffff',
  },
  optionSelected: {
    backgroundColor: 'transparent',
  },
  optionText: {
    flex: 1,
  },
  checkIcon: {
    color: '#262626',
    flexShrink: 0,
    marginLeft: '12px',
  },
};

export default PetiVetDropdown;

