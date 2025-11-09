import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Search, Check } from 'lucide-react';
import colors from '../styles/colors';

interface MultiSelectDropdownProps {
  options: Array<{ id: string; name: string } | string>;
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  maxHeight?: number;
  disabled?: boolean;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options,
  selected,
  onChange,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  maxHeight = 300,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Normalizar opções para sempre ter formato { id, name }
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'string') {
      return { id: opt, name: opt };
    }
    return opt;
  });

  // Filtrar opções baseado na busca
  const filteredOptions = normalizedOptions.filter((opt) =>
    opt.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (optionId: string) => {
    if (disabled) return;

    if (selected.includes(optionId)) {
      onChange(selected.filter((id) => id !== optionId));
    } else {
      onChange([...selected, optionId]);
    }
  };

  const removeOption = (optionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(selected.filter((id) => id !== optionId));
  };

  const getOptionName = (id: string) => {
    const option = normalizedOptions.find((opt) => opt.id === id);
    return option?.name || id;
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      {/* Input/Botão */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          ...styles.dropdown,
          ...(disabled ? styles.disabled : {}),
          ...(isOpen ? styles.dropdownOpen : {}),
        }}
      >
        <div style={styles.selectedContainer}>
          {selected.length === 0 ? (
            <span style={styles.placeholder}>{placeholder}</span>
          ) : (
            <div style={styles.selectedTags}>
              {selected.slice(0, 2).map((id) => (
                <span key={id} style={styles.tag}>
                  {getOptionName(id)}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => removeOption(id, e)}
                      style={styles.tagRemove}
                    >
                      <X size={14} />
                    </button>
                  )}
                </span>
              ))}
              {selected.length > 2 && (
                <span style={styles.moreTags}>+{selected.length - 2} mais</span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          size={20}
          style={{
            ...styles.chevron,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </div>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div style={styles.menu}>
          {/* Busca */}
          <div style={styles.searchContainer}>
            <Search size={16} style={styles.searchIcon} />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
              autoFocus
            />
          </div>

          {/* Lista de opções */}
          <div style={{ ...styles.optionsList, maxHeight: `${maxHeight}px` }}>
            {filteredOptions.length === 0 ? (
              <div style={styles.noResults}>Nenhum resultado encontrado</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selected.includes(option.id);
                return (
                  <div
                    key={option.id}
                    onClick={() => toggleOption(option.id)}
                    style={{
                      ...styles.option,
                      ...(isSelected ? styles.optionSelected : {}),
                    }}
                  >
                    <div style={styles.optionContent}>
                      <span>{option.name}</span>
                      {isSelected && <Check size={16} style={styles.checkIcon} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  dropdown: {
    width: '100%',
    minHeight: '44px',
    padding: '10px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    backgroundColor: colors.surface,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'all 0.2s',
  },
  dropdownOpen: {
    borderColor: colors.primary,
    boxShadow: `0 0 0 3px ${colors.primaryLight}33`,
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
    backgroundColor: colors.neutral[50],
  },
  selectedContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  placeholder: {
    color: colors.textSecondary,
    fontSize: '14px',
  },
  selectedTags: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: colors.surface,
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
  },
  tagRemove: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    color: colors.primary,
  },
  moreTags: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  chevron: {
    color: colors.textSecondary,
    transition: 'transform 0.2s',
    flexShrink: 0,
  },
  menu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 1000,
    overflow: 'hidden',
  },
  searchContainer: {
    position: 'relative',
    padding: '12px',
    borderBottom: `1px solid ${colors.border}`,
  },
  searchIcon: {
    position: 'absolute',
    left: '20px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: colors.textSecondary,
  },
  searchInput: {
    width: '100%',
    padding: '8px 12px 8px 36px',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
  },
  optionsList: {
    overflowY: 'auto',
    maxHeight: '300px',
  },
  option: {
    padding: '12px 16px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
    borderBottom: `1px solid ${colors.neutral[50]}`,
    borderLeft: '1px solid transparent',
    borderRight: '1px solid transparent',
    borderTop: '1px solid transparent',
  },
  optionSelected: {
    backgroundColor: colors.surface,
    borderLeft: `1px solid ${colors.primary}`,
    borderRight: `1px solid ${colors.primary}`,
    borderTop: `1px solid ${colors.primary}`,
    borderBottom: `1px solid ${colors.primary}`,
  },
  optionContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '14px',
    color: colors.text,
  },
  checkIcon: {
    color: colors.primary,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  noResults: {
    padding: '16px',
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: '14px',
  },
};

export default MultiSelectDropdown;

