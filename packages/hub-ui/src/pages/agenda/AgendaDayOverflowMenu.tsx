import React, { useEffect, useId, useRef, useState } from 'react';
import { formatHm, type AgendaAppointment } from './agendaModel';

export type AgendaDayOverflowMenuProps = {
  appointments: AgendaAppointment[];
  hiddenCount: number;
  hasConflict?: boolean;
  label?: string;
  onSelect: (appointmentId: string) => void;
  onViewDay?: () => void;
  className?: string;
};

/** Chip +N com popover listando todos os atendimentos do cluster (ou da célula). */
export function AgendaDayOverflowMenu({
  appointments,
  hiddenCount,
  hasConflict = false,
  label,
  onSelect,
  onViewDay,
  className,
}: AgendaDayOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const chipLabel = label ?? `+${hiddenCount}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`hub-agenda-overflow${className ? ` ${className}` : ''}${hasConflict ? ' hub-agenda-overflow--conflict' : ''}`}
    >
      <button
        type="button"
        className="hub-agenda-overflow__chip"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        title={`${appointments.length} atendimento(s) neste horário`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }
        }}
      >
        {chipLabel}
      </button>
      {open ? (
        <div
          id={listId}
          className="hub-agenda-overflow__popover"
          role="listbox"
          aria-label="Atendimentos neste horário"
        >
          <ul className="hub-agenda-overflow__list">
            {appointments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  className={`hub-agenda-overflow__item${a.conflict ? ' hub-agenda-overflow__item--conflict' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onSelect(a.id);
                  }}
                >
                  <span className="hub-agenda-overflow__item-time">{formatHm(a.start)}</span>
                  <span className="hub-agenda-overflow__item-pet">{a.petName}</span>
                  <span className="hub-agenda-overflow__item-svc">
                    {a.displayServiceLabel ?? a.serviceName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {onViewDay ? (
            <button
              type="button"
              className="hub-agenda-overflow__view-day"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onViewDay();
              }}
            >
              Ver no dia
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
