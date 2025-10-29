import React, { useState } from 'react';

interface InlineCalendarProps {
  selectedDate: string; // Format: YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string; // Format: YYYY-MM-DD
}

const InlineCalendar: React.FC<InlineCalendarProps> = ({
  selectedDate,
  onChange,
  minDate = new Date().toISOString().split('T')[0],
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (selectedDate) {
      return new Date(selectedDate + 'T00:00:00');
    }
    return new Date();
  });

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const isDateDisabled = (day: number) => {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    return dateStr < minDate;
  };

  const isDateSelected = (day: number) => {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    return dateStr === selectedDate;
  };

  const handleDateClick = (day: number) => {
    if (!isDateDisabled(day)) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      onChange(dateStr);
    }
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Generate calendar grid
  const calendarDays: (number | null)[] = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add all days in the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <div style={styles.container}>
      {/* Header with month/year and navigation */}
      <div style={styles.header}>
        <button
          type="button"
          onClick={goToPreviousMonth}
          style={styles.navButton}
          title="Mês anterior"
        >
          ←
        </button>
        <div style={styles.monthYear}>
          {monthNames[month]} {year}
        </div>
        <button
          type="button"
          onClick={goToNextMonth}
          style={styles.navButton}
          title="Próximo mês"
        >
          →
        </button>
      </div>

      {/* Week days header */}
      <div style={styles.weekDaysRow}>
        {weekDays.map((day) => (
          <div key={day} style={styles.weekDay}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={styles.daysGrid}>
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} style={styles.emptyDay} />;
          }

          const disabled = isDateDisabled(day);
          const selected = isDateSelected(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => handleDateClick(day)}
              disabled={disabled}
              onMouseEnter={(e) => {
                if (!disabled && !selected) {
                  e.currentTarget.style.backgroundColor = '#ede9fe';
                  e.currentTarget.style.color = '#7c3aed';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !selected) {
                  e.currentTarget.style.backgroundColor = '#fafafa';
                  e.currentTarget.style.color = '#262626';
                }
              }}
              style={{
                ...styles.day,
                ...(disabled ? styles.dayDisabled : {}),
                ...(selected ? styles.daySelected : {}),
              }}
              title={disabled ? 'Data indisponível' : `Selecionar ${day}/${month + 1}/${year}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    padding: '10px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  navButton: {
    width: '24px',
    height: '24px',
    border: 'none',
    backgroundColor: '#fafafa',
    color: '#525252',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  } as React.CSSProperties & { ':hover'?: React.CSSProperties },
  monthYear: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#262626',
  },
  weekDaysRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
    marginBottom: '4px',
  },
  weekDay: {
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: '600',
    color: '#737373',
    padding: '4px 0',
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
  },
  emptyDay: {
    aspectRatio: '1',
  },
  day: {
    aspectRatio: '1',
    border: 'none',
    backgroundColor: '#fafafa',
    color: '#262626',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'Inter, sans-serif',
  },
  dayHoverable: {
    // Hover effect will be added via inline style in component
  },
  dayDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#a3a3a3',
    cursor: 'not-allowed',
    opacity: 0.5,
  },
  daySelected: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    fontWeight: '700',
    boxShadow: '0 1px 3px rgba(124, 58, 237, 0.3)',
  },
};

export default InlineCalendar;

