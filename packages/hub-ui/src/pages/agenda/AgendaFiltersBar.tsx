import React from 'react';
import { X } from 'lucide-react';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { SERVICE_GROUP_OPTIONS } from '../../utils/serviceTypeSlug';
import { ServiceGroupIcon } from '../../components/ServiceGroupIcon';
import { resolveServiceAccentColor } from '../../utils/serviceTypeSlug';
import type { AgendaGroupMode } from './agendaModel';

export type AgendaFilterChip = {
  key: string;
  label: string;
  onClear: () => void;
};

export type AgendaFiltersBarProps = {
  activeFilterCount: number;
  chips: AgendaFilterChip[];
  onClearAll: () => void;
  unitFilter: string;
  onUnitFilter: (v: string) => void;
  unitOptions: HubComboboxOption[];
  professionalFilter: string;
  onProfessionalFilter: (v: string) => void;
  professionalOptions: HubComboboxOption[];
  groupFilter: string;
  onGroupFilter: (v: string) => void;
  groupOptions: HubComboboxOption[];
  resourceFilter: string;
  onResourceFilter: (v: string) => void;
  resourceOptions: HubComboboxOption[];
  resourceFieldLabel: string;
  serviceTypeFilter: string;
  onServiceTypeFilter: (v: string) => void;
  serviceTypeOptions: HubComboboxOption[];
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  statusOptions: HubComboboxOption[];
  groupMode: AgendaGroupMode;
  onGroupMode: (m: AgendaGroupMode) => void;
  serviceGroupColors: Map<string, string>;
};

export function AgendaFiltersBar({
  activeFilterCount,
  chips,
  onClearAll,
  unitFilter,
  onUnitFilter,
  unitOptions,
  professionalFilter,
  onProfessionalFilter,
  professionalOptions,
  groupFilter,
  onGroupFilter,
  groupOptions,
  resourceFilter,
  onResourceFilter,
  resourceOptions,
  resourceFieldLabel,
  serviceTypeFilter,
  onServiceTypeFilter,
  serviceTypeOptions,
  statusFilter,
  onStatusFilter,
  statusOptions,
  groupMode,
  onGroupMode,
  serviceGroupColors,
}: AgendaFiltersBarProps) {
  return (
    <div className="hub-agenda__filters-chrome">
      {chips.length > 0 ? (
        <div className="hub-agenda__filter-chips" aria-label="Filtros ativos">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="hub-agenda__filter-chip"
              onClick={chip.onClear}
              aria-label={`Remover filtro ${chip.label}`}
            >
              <span>{chip.label}</span>
              <X size={12} aria-hidden />
            </button>
          ))}
          <button type="button" className="hub-agenda__filter-chips-clear" onClick={onClearAll}>
            Limpar
          </button>
        </div>
      ) : null}

      <div className="hub-agenda__group-shortcuts" role="group" aria-label="Atalhos de grupo de serviço">
        <button
          type="button"
          className={`hub-agenda__group-shortcut${groupFilter === 'all' ? ' hub-agenda__group-shortcut--on' : ''}`}
          aria-pressed={groupFilter === 'all'}
          onClick={() => onGroupFilter('all')}
        >
          Todos
        </button>
        {SERVICE_GROUP_OPTIONS.map((g) => {
          const hex = serviceGroupColors.get(g.value) ?? resolveServiceAccentColor(null, g.value);
          const on = groupFilter === g.value;
          return (
            <button
              key={g.value}
              type="button"
              className={`hub-agenda__group-shortcut${on ? ' hub-agenda__group-shortcut--on' : ''}`}
              aria-pressed={on}
              title={g.label}
              onClick={() => onGroupFilter(on ? 'all' : g.value)}
            >
              <span className="hub-agenda__group-shortcut-dot" style={{ background: hex }} aria-hidden />
              <ServiceGroupIcon group={g.value} color={hex} size={14} strokeWidth={2.1} />
              <span className="hub-agenda__group-shortcut-label">{g.label}</span>
            </button>
          );
        })}
      </div>

      <div className="hub-agenda__group-toggle hub-agenda__group-toggle--chrome" role="group" aria-label="Agrupar por">
        <button
          type="button"
          className={groupMode === 'professional' ? 'hub-agenda__group-toggle--on' : ''}
          onClick={() => onGroupMode('professional')}
        >
          Profissional
        </button>
        <button
          type="button"
          className={groupMode === 'category' ? 'hub-agenda__group-toggle--on' : ''}
          onClick={() => onGroupMode('category')}
        >
          Categoria
        </button>
        <button
          type="button"
          className={groupMode === 'resource' ? 'hub-agenda__group-toggle--on' : ''}
          onClick={() => onGroupMode('resource')}
        >
          Recurso
        </button>
      </div>

      <details className="hub-agenda__filters-details">
        <summary className="hub-agenda__filters-summary">
          <span>Filtros</span>
          {activeFilterCount > 0 ? (
            <span className="hub-agenda__filters-badge">{activeFilterCount}</span>
          ) : null}
        </summary>
        <div className="hub-agenda__filters">
          <div className="hub-servicos__filter-field hub-agenda__filter-combo">
            <label className="hub-clientes__label" htmlFor="ag-unit">
              Unidade
            </label>
            <HubSearchableCombobox
              id="ag-unit"
              className="hub-combobox--clientes"
              options={unitOptions}
              value={unitFilter}
              onChange={onUnitFilter}
              placeholder="Todas"
              searchPlaceholder="Buscar unidade…"
              allowCreate={false}
              clearable={false}
              ariaLabel="Filtrar por unidade"
            />
          </div>
          <div className="hub-servicos__filter-field hub-agenda__filter-combo">
            <label className="hub-clientes__label" htmlFor="ag-prof">
              Profissional
            </label>
            <HubSearchableCombobox
              id="ag-prof"
              className="hub-combobox--clientes"
              options={professionalOptions}
              value={professionalFilter}
              onChange={onProfessionalFilter}
              placeholder="Todos"
              searchPlaceholder="Buscar profissional…"
              allowCreate={false}
              clearable={false}
              ariaLabel="Filtrar por profissional"
            />
          </div>
          <div className="hub-servicos__filter-field hub-agenda__filter-combo">
            <label className="hub-clientes__label" htmlFor="ag-group">
              Grupo de serviço
            </label>
            <HubSearchableCombobox
              id="ag-group"
              className="hub-combobox--clientes"
              options={groupOptions}
              value={groupFilter}
              onChange={onGroupFilter}
              placeholder="Todos"
              searchPlaceholder="Buscar grupo…"
              allowCreate={false}
              clearable={false}
              ariaLabel="Filtrar por grupo de serviço"
            />
          </div>
          <div className="hub-servicos__filter-field hub-agenda__filter-combo">
            <label className="hub-clientes__label" htmlFor="ag-res">
              {resourceFieldLabel}
            </label>
            <HubSearchableCombobox
              id="ag-res"
              className="hub-combobox--clientes"
              options={resourceOptions}
              value={resourceFilter}
              onChange={onResourceFilter}
              placeholder="Todos"
              searchPlaceholder="Buscar recurso…"
              allowCreate={false}
              clearable={false}
              ariaLabel="Filtrar por recurso ou sala"
            />
          </div>
          <div className="hub-servicos__filter-field hub-agenda__filter-combo">
            <label className="hub-clientes__label" htmlFor="ag-svc-type">
              Tipo de serviço
            </label>
            <HubSearchableCombobox
              id="ag-svc-type"
              className="hub-combobox--clientes"
              options={serviceTypeOptions}
              value={serviceTypeFilter}
              onChange={onServiceTypeFilter}
              placeholder="Todos"
              searchPlaceholder="Buscar tipo de serviço…"
              allowCreate={false}
              clearable={false}
              ariaLabel="Filtrar por tipo de serviço"
            />
          </div>
          <div className="hub-servicos__filter-field hub-agenda__filter-combo">
            <label className="hub-clientes__label" htmlFor="ag-status">
              Status
            </label>
            <HubSearchableCombobox
              id="ag-status"
              className="hub-combobox--clientes"
              options={statusOptions}
              value={statusFilter}
              onChange={onStatusFilter}
              placeholder="Todos"
              searchPlaceholder="Buscar status…"
              allowCreate={false}
              clearable={false}
              ariaLabel="Filtrar por status"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
