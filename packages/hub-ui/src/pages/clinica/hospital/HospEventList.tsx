import React from 'react';
import { Activity, Droplets, HeartPulse, Pill, StickyNote, UtensilsCrossed } from 'lucide-react';
import type { HubHospitalizationEvent, HubHospitalizationEventKind } from '../../../api/hubClinicalApi';
import { formatHospDateTime, hospEventView } from './hospDisplay';

type HospEventListProps = {
  events: HubHospitalizationEvent[];
};

const KIND_ICON: Record<HubHospitalizationEventKind, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  vital: Activity,
  medication: Pill,
  feeding: UtensilsCrossed,
  fluid: Droplets,
  nursing: HeartPulse,
  note: StickyNote,
};

const HospEventList: React.FC<HospEventListProps> = ({ events }) => {
  if (events.length === 0) {
    return <p className="hub-clientes__muted">Nenhum evento registrado.</p>;
  }

  return (
    <ol className="hub-hosp-timeline">
      {events.map((ev) => {
        const view = hospEventView(ev);
        const Icon = KIND_ICON[ev.kind] ?? StickyNote;
        return (
          <li key={ev.id} className={`hub-hosp-tl-item hub-hosp-tl-item--${ev.kind}`}>
            <span className="hub-hosp-tl-item__rail" aria-hidden>
              <span className="hub-hosp-tl-item__dot" />
            </span>
            <article className="hub-hosp-tl-card">
              <header className="hub-hosp-tl-card__head">
                <span className="hub-hosp-tl-card__kind">
                  <Icon size={13} aria-hidden />
                  {view.kindLabel}
                </span>
                <time className="hub-hosp-tl-card__time" dateTime={ev.recorded_at}>
                  {formatHospDateTime(ev.recorded_at)}
                </time>
              </header>

              {view.title ? <h3 className="hub-hosp-tl-card__title">{view.title}</h3> : null}
              {view.summary ? <p className="hub-hosp-tl-card__summary">{view.summary}</p> : null}

              {view.metrics.length > 0 ? (
                <dl className="hub-hosp-tl-metrics">
                  {view.metrics.map((m) => (
                    <div key={m.key} className="hub-hosp-tl-metrics__cell">
                      <dt>{m.label}</dt>
                      <dd>
                        {m.value}
                        {m.unit ? <span className="hub-hosp-tl-metrics__unit">{m.unit}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {view.chips.length > 0 ? (
                <div className="hub-cws-chips hub-hosp-tl-chips" aria-label="Avaliação">
                  {view.chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`hub-cws-chip hub-cws-chip--on hub-cws-chip--${chip.tone ?? 'info'}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}

              {view.note ? <p className="hub-hosp-tl-card__note">{view.note}</p> : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
};

export default HospEventList;
