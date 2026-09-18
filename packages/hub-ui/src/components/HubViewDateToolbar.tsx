import React from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { HubDateField } from './HubDateField';
import './HubViewDateToolbar.css';

export type HubViewMode = 'day' | 'week' | 'month' | 'all';

const VIEW_LABELS: Record<HubViewMode, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
  all: 'Tudo',
};

export type HubViewDateToolbarProps = {
  view: HubViewMode;
  onViewChange: (view: HubViewMode) => void;
  dateIso: string;
  onDateChange: (iso: string) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  dateFieldId: string;
  disabled?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Inclui a opção "Tudo" (sem filtro de período). */
  allowAllView?: boolean;
};

export function HubViewDateToolbar({
  view,
  onViewChange,
  dateIso,
  onDateChange,
  onNavigatePrev,
  onNavigateNext,
  dateFieldId,
  disabled = false,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Pet, tutor, serviço…',
  allowAllView = false,
}: HubViewDateToolbarProps) {
  const views: HubViewMode[] = allowAllView
    ? ['all', 'day', 'week', 'month']
    : ['day', 'week', 'month'];
  const showDateNav = view !== 'all';
  const prevLabel =
    view === 'day' ? 'Dia anterior' : view === 'week' ? 'Semana anterior' : 'Mês anterior';
  const nextLabel =
    view === 'day' ? 'Próximo dia' : view === 'week' ? 'Próxima semana' : 'Próximo mês';

  return (
    <div className="hub-view-date-toolbar">
      <div className="hub-view-date-toolbar__view-switch" role="tablist" aria-label="Tipo de vista">
        {views.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`hub-view-date-toolbar__view-btn ${view === v ? 'hub-view-date-toolbar__view-btn--active' : ''}`}
            onClick={() => onViewChange(v)}
            disabled={disabled}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {showDateNav ? (
        <div className="hub-view-date-toolbar__nav-cluster">
          <button
            type="button"
            className="hub-view-date-toolbar__icon-btn"
            aria-label={prevLabel}
            onClick={onNavigatePrev}
            disabled={disabled}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="hub-view-date-toolbar__icon-btn"
            aria-label={nextLabel}
            onClick={onNavigateNext}
            disabled={disabled}
          >
            <ChevronRight size={18} />
          </button>
          <HubDateField
            id={dateFieldId}
            className="hub-view-date-toolbar__date-field"
            valueIso={dateIso}
            onChangeIso={(iso) => {
              if (!iso) return;
              onDateChange(iso);
            }}
            disabled={disabled}
            showTodayButton
          />
        </div>
      ) : (
        <p className="hub-view-date-toolbar__all-hint">Todas as cobranças em aberto, sem filtro de data</p>
      )}

      {onSearchChange != null ? (
        <div className="hub-view-date-toolbar__search">
          <label htmlFor={`${dateFieldId}-search`} className="hub-view-date-toolbar__sr-only">
            Busca
          </label>
          <Search size={16} className="hub-view-date-toolbar__search-icon" aria-hidden />
          <input
            id={`${dateFieldId}-search`}
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled}
          />
          {searchValue ? (
            <button
              type="button"
              className="hub-view-date-toolbar__search-clear"
              aria-label="Limpar busca"
              onClick={() => onSearchChange('')}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default HubViewDateToolbar;
