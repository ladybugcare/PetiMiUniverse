import React, { useState, useMemo } from 'react';
import { Demand } from '../services/demandsApi';
import { Clock, MapPin, DollarSign, X } from 'lucide-react';

interface CalendarViewProps {
  demands: Demand[];
  onDemandClick?: (demand: Demand) => void;
  getClinicName?: (clinicId: string) => string;
}

const CalendarView: React.FC<CalendarViewProps> = ({ demands, onDemandClick, getClinicName }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const goToToday = () => {
    setCurrentDate(new Date());
    const today = new Date().toISOString().split('T')[0];
    const todayDemands = demands.filter(d => {
      const date = new Date(d.demand_date).toISOString().split('T')[0];
      return date === today;
    });
    if (todayDemands.length > 0) {
      setSelectedDay(today);
    }
  };

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
        <div style={styles.headerLeft}>
          <button onClick={previousMonth} style={styles.navButton} title="Mês anterior">
          ◀
        </button>
        <h2 style={styles.monthYear}>
          {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </h2>
          <button onClick={nextMonth} style={styles.navButton} title="Próximo mês">
          ▶
          </button>
        </div>
        <button onClick={goToToday} style={styles.todayButton} title="Ir para hoje">
          Hoje
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
              Demandas de {new Date(selectedDay + 'T00:00:00').toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </h3>
            <button onClick={() => setSelectedDay(null)} style={styles.closeButton} title="Fechar">
              <X size={20} />
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateX(4px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
                  }}
                >
                  <div style={styles.demandCardHeader}>
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
                  
                  {demand.description && (
                    <p style={styles.demandDescription}>{demand.description}</p>
                  )}
                  
                  <div style={styles.demandDetails}>
                    <div style={styles.detailItem}>
                      <Clock size={14} style={styles.detailIcon} />
                      <span style={styles.detailText}>
                        {demand.start_time} ({demand.duration_hours}h)
                      </span>
                    </div>
                    
                    {getClinicName && (
                      <div style={styles.detailItem}>
                        <MapPin size={14} style={styles.detailIcon} />
                        <span style={styles.detailText}>
                          {getClinicName(demand.clinic_id)}
                        </span>
                      </div>
                    )}
                    
                    {demand.payment && (
                      <div style={styles.detailItem}>
                        <DollarSign size={14} style={styles.detailIcon} />
                        <span style={styles.detailText}>
                          R$ {demand.payment.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {demand.required_specialties && demand.required_specialties.length > 0 && (
                    <div style={styles.specialtiesContainer}>
                      {demand.required_specialties.slice(0, 3).map((spec, idx) => (
                        <span key={idx} style={styles.specialtyBadge}>
                          {spec}
                        </span>
                      ))}
                      {demand.required_specialties.length > 3 && (
                        <span style={styles.specialtyBadge}>
                          +{demand.required_specialties.length - 3}
                        </span>
                      )}
                    </div>
                  )}
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
    flexWrap: 'wrap',
    gap: '12px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  navButton: {
    padding: '8px 16px',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '18px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  navButtonHover: {
    backgroundColor: '#e5e5e5',
  },
  todayButton: {
    padding: '10px 20px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
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
    maxHeight: '500px',
    overflowY: 'auto',
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
    color: '#737373',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
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
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  demandCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  demandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    flex: 1,
    margin: 0,
  },
  demandDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#525252',
    lineHeight: '1.5',
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  demandDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  detailItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  detailIcon: {
    color: '#737373',
  },
  detailText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#525252',
  },
  specialtiesContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  specialtyBadge: {
    padding: '4px 10px',
    backgroundColor: '#f3f4f6',
    color: '#525252',
    borderRadius: '12px',
    fontSize: '12px',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '500',
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

