import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HubLoading } from '../../components/HubLoading';
import { hubBoardingApi, type BoardingCalendarEvent } from '../../api/hubBoardingApi';
import { BOARDING_STAGE_LABELS } from './boardingStages';
import type { BoardingMode } from './boardingStages';

type Props = {
  clinicId: string;
  unitId?: string;
  mode?: BoardingMode;
  onSelectReservationId?: (id: string) => void;
};

function isoWeekStart(d: Date): Date {
  const day = d.getDay(); // 0 = dom
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' });
}

function eventSpansDay(event: BoardingCalendarEvent, dayYmd: string): boolean {
  const dayStart = new Date(`${dayYmd}T00:00:00`);
  const dayEnd = new Date(`${dayYmd}T23:59:59.999`);
  const eventStart = new Date(event.expected_check_in);
  const eventEnd = new Date(event.expected_check_out);
  return eventStart <= dayEnd && eventEnd >= dayStart;
}

const MODE_LABELS: Record<string, string> = { hotel: '🏨', daycare: '🐾' };

const BoardingCalendarView: React.FC<Props> = ({ clinicId, unitId, mode, onSelectReservationId }) => {
  const [weekStart, setWeekStart] = useState(() => isoWeekStart(new Date()));
  const [events, setEvents] = useState<BoardingCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const from = toYmd(days[0]);
  const to = toYmd(days[6]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubBoardingApi.getCalendar(clinicId, from, to, {
        unitId,
        mode: mode === 'all' ? undefined : mode,
      });
      setEvents(res.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, from, to, unitId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftWeek = (delta: number) => setWeekStart((w) => addDays(w, delta * 7));

  return (
    <div className="hub-boarding-calendar">
      <div className="hub-boarding-calendar__nav">
        <button
          type="button"
          className="hub-clientes__icon-btn"
          onClick={() => shiftWeek(-1)}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="hub-clientes__muted">
          {days[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} –{' '}
          {days[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <button
          type="button"
          className="hub-clientes__icon-btn"
          onClick={() => shiftWeek(1)}
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="hub-clientes__icon-btn"
          onClick={() => { setWeekStart(isoWeekStart(new Date())); }}
          title="Semana atual"
        >
          Hoje
        </button>
        <button
          type="button"
          className="hub-clientes__icon-btn"
          onClick={() => void load()}
          disabled={loading}
          title="Atualizar"
        >
          ↻
        </button>
      </div>

      {loading ? (
        <HubLoading variant="block" label="Carregando calendário…" />
      ) : (
        <div className="hub-boarding-calendar__grid" role="grid">
          {days.map((day) => {
            const ymd = toYmd(day);
            const dayEvents = events.filter((e) => eventSpansDay(e, ymd));
            return (
              <div key={ymd} className="hub-boarding-calendar__day" role="gridcell">
                <div className="hub-boarding-calendar__day-header">{formatDay(day)}</div>
                {dayEvents.length === 0 && (
                  <span className="hub-clientes__muted hub-boarding-calendar__empty">livre</span>
                )}
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`hub-boarding-calendar__event hub-boarding-calendar__event--${event.mode}`}
                    onClick={() => onSelectReservationId?.(event.id)}
                    title={`${event.pet?.name ?? '?'} · ${BOARDING_STAGE_LABELS[event.status as keyof typeof BOARDING_STAGE_LABELS] ?? event.status}`}
                  >
                    <span className="hub-boarding-calendar__event-mode">
                      {MODE_LABELS[event.mode] ?? event.mode}
                    </span>
                    <span className="hub-boarding-calendar__event-pet">
                      {event.pet?.name ?? '—'}
                    </span>
                    <span className="hub-clientes__muted hub-boarding-calendar__event-status">
                      {BOARDING_STAGE_LABELS[event.status as keyof typeof BOARDING_STAGE_LABELS] ?? event.status}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BoardingCalendarView;
