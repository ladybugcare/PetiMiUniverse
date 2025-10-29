import React, { useState, useMemo } from 'react';
import { Demand } from '../services/demandsApi';

interface CalendarViewProps {
  demands: Demand[];
  onDemandClick?: (demand: Demand) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ demands, onDemandClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Get demands grouped by date
  const demandsByDate = useMemo(() => {
    const grouped: { [key: string]: Demand[] } = {};
    
    demands.forEach((demand) => {
      const date = new Date(demand.demand_date).toISOString().split('T')[0];
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(demand);
    });
    
    return grouped;
  }, [demands]);

  // Calendar logic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();
  
  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDay(dateStr);
  };

  const getStatusColor = (status: string) => {
    const colors = {
      open: '#10b981',
      in_progress: '#f59e0b',
      closed: '#6b7280',
      cancelled: '#ef4444',
    };
    return colors[status as keyof typeof colors] || '#6b7280';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      open: 'Aberta',
      in_progress: 'Em Andamento',
      closed: 'Fechada',
      cancelled: 'Cancelada',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const renderCalendarDays = () => {
    const days = [];
    const totalCells = 42; // 6 weeks * 7 days

    // Empty cells before first day
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} style={styles.emptyDay} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDemands = demandsByDate[dateStr] || [];
      const isToday = dateStr === new Date().toISOString().split('T')[0];
      const isSelected = dateStr === selectedDay;

      days.push(
        <div
          key={day}
          style={{
            ...styles.dayCell,
            ...(isToday && styles.today),
            ...(isSelected && styles.selected),
            cursor: dayDemands.length > 0 ? 'pointer' : 'default',
          }}
          onClick={() => dayDemands.length > 0 && handleDayClick(day)}
        >
          <div style={styles.dayNumber}>{day}</div>
          
          {dayDemands.length > 0 && (
            <div style={styles.demandsBadge}>
              {dayDemands.length}
            </div>
          )}
          
          {dayDemands.length > 0 && (
            <div style={styles.statusIndicators}>
              {Array.from(new Set(dayDemands.map(d => d.status))).map((status) => (
                <div
                  key={status}
                  style={{
                    ...styles.statusDot,
                    backgroundColor: getStatusColor(status),
                  }}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // Fill remaining cells
    const remainingCells = totalCells - (startingDayOfWeek + daysInMonth);
    for (let i = 0; i < remainingCells; i++) {
      days.push(<div key={`empty-end-${i}`} style={styles.emptyDay} />);
    }

    return days;
  };

  const selectedDayDemands = selectedDay ? demandsByDate[selectedDay] || [] : [];

  return (
    <div style={styles.container}>
      {/* Calendar Header */}
      <div style={styles.header}>
        <button onClick={previousMonth} style={styles.navButton}>
          ◀
        </button>
        <h2 style={styles.monthYear}>
          {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={nextMonth} style={styles.navButton}>
          ▶
        </button>
      </div>

      {/* Weekday Headers */}
      <div style={styles.weekdaysHeader}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
          <div key={day} style={styles.weekday}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div style={styles.calendarGrid}>
        {renderCalendarDays()}
      </div>

      {/* Selected Day Panel */}
      {selectedDay && selectedDayDemands.length > 0 && (
        <div style={styles.selectedDayPanel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>
              Demandas de {new Date(selectedDay + 'T00:00:00').toLocaleDateString('pt-BR')}
            </h3>
            <button onClick={() => setSelectedDay(null)} style={styles.closeButton}>
              ✕
            </button>
          </div>
          
          <div style={styles.demandsList}>
            {selectedDayDemands
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((demand) => (
                <div
                  key={demand.id}
                  style={styles.demandCard}
                  onClick={() => onDemandClick?.(demand)}
                >
                  <div style={styles.demandTime}>
                    ⏰ {demand.start_time} ({demand.duration_hours}h)
                  </div>
                  <div style={styles.demandTitle}>{demand.title}</div>
                  <div
                    style={{
                      ...styles.statusBadge,
                      backgroundColor: getStatusColor(demand.status),
                    }}
                  >
                    {getStatusLabel(demand.status)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{...styles.legendDot, backgroundColor: '#10b981'}} />
          <span>Aberta</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{...styles.legendDot, backgroundColor: '#f59e0b'}} />
          <span>Em Andamento</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{...styles.legendDot, backgroundColor: '#6b7280'}} />
          <span>Fechada</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{...styles.legendDot, backgroundColor: '#ef4444'}} />
          <span>Cancelada</span>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  navButton: {
    padding: '8px 16px',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '18px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  monthYear: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    textTransform: 'capitalize',
  },
  weekdaysHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px',
    marginBottom: '8px',
  },
  weekday: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#737373',
    textAlign: 'center',
    padding: '8px',
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px',
    marginBottom: '24px',
  },
  dayCell: {
    aspectRatio: '1',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    padding: '8px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    transition: 'all 0.2s ease',
    backgroundColor: '#ffffff',
  },
  emptyDay: {
    aspectRatio: '1',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
  },
  dayNumber: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#262626',
  },
  today: {
    backgroundColor: '#ede9fe',
    borderColor: '#7c3aed',
    borderWidth: '2px',
  },
  selected: {
    backgroundColor: '#dcd4ff',
    borderColor: '#7c3aed',
    borderWidth: '2px',
  },
  demandsBadge: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
  },
  statusIndicators: {
    position: 'absolute',
    bottom: '4px',
    left: '4px',
    right: '4px',
    display: 'flex',
    gap: '2px',
    justifyContent: 'center',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  selectedDayPanel: {
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '24px',
    border: '1px solid #e5e5e5',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  panelTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    color: '#737373',
    cursor: 'pointer',
    padding: '4px',
    lineHeight: 1,
  },
  demandsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  demandCard: {
    backgroundColor: '#ffffff',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e5e5',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  demandTime: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
    marginBottom: '4px',
  },
  demandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '500',
    color: '#262626',
    marginBottom: '8px',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
  },
  legend: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingTop: '16px',
    borderTop: '1px solid #e5e5e5',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#525252',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
};

export default CalendarView;

