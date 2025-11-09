import React from 'react';
import colors from '../../styles/colors';

export type PeriodType = 'today' | '7d' | '30d' | 'custom';

interface PeriodFilterProps {
  selectedPeriod: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
}

const PeriodFilter: React.FC<PeriodFilterProps> = ({ selectedPeriod, onPeriodChange }) => {
  const periods: { value: PeriodType; label: string }[] = [
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: 'custom', label: 'Personalizado' },
  ];

  return (
    <div style={styles.container}>
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onPeriodChange(period.value)}
          style={{
            ...styles.button,
            ...(selectedPeriod === period.value ? styles.buttonActive : {}),
          }}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    backgroundColor: '#ffffff',
    color: colors.text,
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  buttonActive: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    borderColor: colors.primary,
  },
};

export default PeriodFilter;

