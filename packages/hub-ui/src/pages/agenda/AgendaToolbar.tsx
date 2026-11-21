import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Printer, Search } from 'lucide-react';
import { HubDateField } from '../../components/HubDateField';
import { AgendaNewEntryMenu } from './AgendaNewEntryMenu';
import type { AgendaDensity, AgendaView } from './agendaModel';

export type AgendaToolbarProps = {
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
  cursorYmd: string;
  onCursorYmd: (iso: string) => void;
  onShiftPrev: () => void;
  onShiftNext: () => void;
  onToday: () => void;
  onNow: () => void;
  density: AgendaDensity;
  onDensityChange: (d: AgendaDensity) => void;
  searchQ: string;
  onSearchQ: (q: string) => void;
  canWrite: boolean;
  onNewAppointment: () => void;
  onWalkIn: () => void;
  printHref: string | null;
  prevLabel: string;
  nextLabel: string;
};

const DENSITY_OPTIONS: { value: AgendaDensity; label: string }[] = [
  { value: 'compact', label: 'Compacta' },
  { value: 'comfortable', label: 'Confortável' },
  { value: 'spacious', label: 'Espaçosa' },
];

export function AgendaToolbar({
  view,
  onViewChange,
  cursorYmd,
  onCursorYmd,
  onShiftPrev,
  onShiftNext,
  onToday,
  onNow,
  density,
  onDensityChange,
  searchQ,
  onSearchQ,
  canWrite,
  onNewAppointment,
  onWalkIn,
  printHref,
  prevLabel,
  nextLabel,
}: AgendaToolbarProps) {
  return (
    <div className="hub-agenda__toolbar">
      <div className="hub-agenda__view-switch" role="tablist" aria-label="Tipo de vista">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`hub-agenda__view-btn ${view === v ? 'hub-agenda__view-btn--active' : ''}`}
            onClick={() => onViewChange(v)}
          >
            {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
          </button>
        ))}
      </div>

      <div className="hub-agenda__nav-cluster">
        <button type="button" className="hub-agenda__icon-btn" aria-label={prevLabel} onClick={onShiftPrev}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="hub-agenda__icon-btn" aria-label={nextLabel} onClick={onShiftNext}>
          <ChevronRight size={18} />
        </button>
        <HubDateField
          id="hub-agenda-date"
          className="hub-agenda__date-field"
          valueIso={cursorYmd}
          showTodayButton={false}
          onChangeIso={(iso) => {
            if (iso) onCursorYmd(iso);
          }}
        />
        <button type="button" className="hub-agenda__today-btn" onClick={onToday}>
          Hoje
        </button>
        <button type="button" className="hub-agenda__now-btn" onClick={onNow}>
          Agora
        </button>
      </div>

      <div className="hub-agenda__density" role="group" aria-label="Densidade da grade">
        {DENSITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`hub-agenda__density-btn${density === opt.value ? ' hub-agenda__density-btn--on' : ''}`}
            aria-pressed={density === opt.value}
            title={opt.label}
            onClick={() => onDensityChange(opt.value)}
          >
            {opt.value === 'compact' ? 'C' : opt.value === 'comfortable' ? 'M' : 'A'}
          </button>
        ))}
      </div>

      {canWrite ? (
        <div className="hub-agenda__new-btn-group">
          <AgendaNewEntryMenu onNewAppointment={onNewAppointment} onWalkIn={onWalkIn} />
        </div>
      ) : null}

      <div className="hub-agenda__search">
        <label htmlFor="hub-agenda-search" className="hub-agenda__sr-only">
          Busca global
        </label>
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }}
          />
          <input
            id="hub-agenda-search"
            placeholder="Pet, tutor, serviço…"
            value={searchQ}
            onChange={(e) => onSearchQ(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>

      {printHref ? (
        <Link
          to={printHref}
          className="hub-agenda__print-btn"
          title="Imprimir agenda do dia com os filtros ativos"
        >
          <Printer size={16} aria-hidden />
          Imprimir
        </Link>
      ) : null}
    </div>
  );
}
