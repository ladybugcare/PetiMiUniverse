import React from 'react';

interface SearchBarProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder, value, onChange, onClear }) => {
  return (
    <div style={styles.container}>
      <div style={styles.searchIcon}>🔍</div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
      />
      {value && (
        <button
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          style={styles.clearButton}
          title="Limpar busca"
        >
          ✕
        </button>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '500px',
  },
  searchIcon: {
    position: 'absolute',
    left: '16px',
    fontSize: '18px',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 16px 12px 48px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    outline: 'none',
    transition: 'all 0.2s',
  },
  clearButton: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    color: '#737373',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s',
  },
};

export default SearchBar;

