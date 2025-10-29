import React from 'react';
import { useUnit } from '../contexts/UnitContext';

const UnitSelector: React.FC = () => {
  const { selectedUnit, units, setSelectedUnit, loading } = useUnit();

  // Don't show if only 1 unit or loading
  if (loading || units.length <= 1) return null;

  return (
    <div style={styles.selector}>
      <label style={styles.label}>Unidade:</label>
      <select
        value={selectedUnit?.id || ''}
        onChange={(e) => {
          const unit = units.find((u) => u.id === e.target.value);
          if (unit) setSelectedUnit(unit);
        }}
        style={styles.select}
      >
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.is_main && '⭐ '}
            {unit.name}
          </option>
        ))}
      </select>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  selector: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginRight: '16px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
    fontFamily: 'Inter, sans-serif',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #e5e5e5',
    backgroundColor: '#ffffff',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    color: '#262626',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    minWidth: '180px',
  },
};

export default UnitSelector;

