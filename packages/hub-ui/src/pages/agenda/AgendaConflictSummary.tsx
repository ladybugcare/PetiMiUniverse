import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatHm, type AgendaAppointment } from './agendaModel';

export type AgendaConflictSummaryProps = {
  conflictIds: Set<string>;
  appointments: AgendaAppointment[];
  onSelect: (appointmentId: string) => void;
};

/** Contador de sobreposições clicável → lista e abre o painel do atendimento. */
export function AgendaConflictSummary({
  conflictIds,
  appointments,
  onSelect,
}: AgendaConflictSummaryProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const conflictAppts = useMemo(() => {
    return appointments
      .filter((a) => conflictIds.has(a.id))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [appointments, conflictIds]);

  const count = conflictIds.size;

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

  if (count === 0) return null;

  return (
    <div className="hub-agenda-conflict-summary" ref={rootRef}>
      <button
        type="button"
        className="hub-agenda__view-metrics--warn hub-agenda-conflict-summary__btn"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        {count} conflito{count !== 1 ? 's' : ''}
      </button>
      {open ? (
        <div
          id={listId}
          className="hub-agenda-conflict-summary__popover"
          role="listbox"
          aria-label="Sobreposições na coluna"
        >
          <p className="hub-agenda-conflict-summary__hint">
            Sobreposição na mesma coluna da vista (não é o aviso de staff/recurso ao remarcar).
          </p>
          <ul className="hub-agenda-conflict-summary__list">
            {conflictAppts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  className="hub-agenda-conflict-summary__item"
                  onClick={() => {
                    setOpen(false);
                    onSelect(a.id);
                  }}
                >
                  <span className="hub-agenda-conflict-summary__time">{formatHm(a.start)}</span>
                  <span className="hub-agenda-conflict-summary__pet">{a.petName}</span>
                  <span className="hub-agenda-conflict-summary__svc">
                    {a.displayServiceLabel ?? a.serviceName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
