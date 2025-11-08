import React, { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder = 'Selecione opções...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedValues.filter((v) => v !== value));
  };

  const getSelectedLabels = () => {
    return selectedValues
      .map((value) => options.find((opt) => opt.value === value)?.label)
      .filter(Boolean);
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          ...styles.trigger,
          ...(disabled ? styles.triggerDisabled : {}),
          ...(isOpen ? styles.triggerOpen : {}),
        }}
      >
        <div style={styles.selectedArea}>
          {selectedValues.length === 0 ? (
            <span style={styles.placeholder}>{placeholder}</span>
          ) : (
            <div style={styles.tagsContainer}>
              {getSelectedLabels().map((label, index) => (
                <span key={index} style={styles.tag}>
                  {label}
                  {!disabled && (
                    <button
                      onClick={(e) => handleRemove(selectedValues[index], e)}
                      style={styles.tagRemove}
                      type="button"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        {!disabled && (
          <span style={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
        )}
      </div>

      {isOpen && !disabled && (
        <div style={styles.dropdown}>
          {options.length === 0 ? (
            <div style={styles.emptyState}>Nenhuma opção disponível</div>
          ) : (
            options.map((option) => (
              <label key={option.value} style={styles.option}>
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={() => handleToggle(option.value)}
                  style={styles.checkbox}
                />
                <span style={styles.optionLabel}>{option.label}</span>
              </label>
            ))
          )}
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
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: '44px',
    transition: 'border-color 0.2s ease',
  },
  triggerOpen: {
    borderColor: '#7c3aed',
  },
  triggerDisabled: {
    backgroundColor: '#f5f5f5',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  selectedArea: {
    flex: 1,
    marginRight: '8px',
  },
  placeholder: {
    color: '#a3a3a3',
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
  },
  tagRemove: {
    marginLeft: '6px',
    border: 'none',
    background: 'none',
    color: '#7c3aed',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    padding: 0,
    lineHeight: 1,
  },
  arrow: {
    fontSize: '10px',
    color: '#737373',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    maxHeight: '240px',
    overflowY: 'auto',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    zIndex: 1000,
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
  },
  checkbox: {
    marginRight: '10px',
    cursor: 'pointer',
    width: '16px',
    height: '16px',
  },
  optionLabel: {
    flex: 1,
    color: '#404040',
  },
  emptyState: {
    padding: '20px',
    textAlign: 'center',
    color: '#a3a3a3',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
  },
};

export default MultiSelect;

