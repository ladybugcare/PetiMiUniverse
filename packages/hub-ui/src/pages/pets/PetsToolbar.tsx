import React, { useMemo } from 'react';
import { Search, Plus, SlidersHorizontal } from 'lucide-react';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import type { HubPet } from '../../api/hubPetsApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { WIZARD_SPECIES_COMBO_ROWS } from './wizard/petSpeciesComboboxData';

interface PetsToolbarProps {
  searchQ: string;
  onSearchChange: (q: string) => void;
  speciesFilter: string;
  onSpeciesFilterChange: (v: string) => void;
  tutorFilter: string;
  onTutorFilterChange: (v: string) => void;
  situationFilter: 'all' | 'ativo';
  onSituationFilterChange: (v: 'all' | 'ativo') => void;
  pets: HubPet[];
  guardians: HubGuardian[];
  onNewPet: () => void;
}

export const PetsToolbar: React.FC<PetsToolbarProps> = ({
  searchQ,
  onSearchChange,
  speciesFilter,
  onSpeciesFilterChange,
  tutorFilter,
  onTutorFilterChange,
  situationFilter,
  onSituationFilterChange,
  pets,
  guardians,
  onNewPet,
}) => {
  const situationFilterOptions = useMemo(
    (): HubComboboxOption[] => [
      { value: 'all', label: 'Situação (todas)' },
      { value: 'ativo', label: 'Ativo' },
    ],
    [],
  );

  const tutorFilterOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = [{ value: '', label: 'Tutor (todos)' }];
    for (const g of guardians) {
      rows.push({ value: g.id, label: g.full_name });
    }
    const tf = tutorFilter.trim();
    if (tf && !rows.some((o) => o.value === tutorFilter)) {
      rows.push({ value: tutorFilter, label: tutorFilter });
    }
    return rows;
  }, [guardians, tutorFilter]);

  const speciesFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of pets) {
      const v = p.species.trim();
      if (v) set.add(v);
    }
    for (const r of WIZARD_SPECIES_COMBO_ROWS) {
      set.add(r.value);
    }
    const sorted = [...set].sort((a, b) => a.localeCompare(b, 'pt'));
    const rows: HubComboboxOption[] = [{ value: '', label: 'Espécie (todas)' }];
    for (const v of sorted) {
      const row = WIZARD_SPECIES_COMBO_ROWS.find((r) => r.value === v);
      rows.push(row ? { value: v, label: row.label } : { value: v, label: v });
    }
    const sf = speciesFilter.trim();
    if (sf && !rows.some((o) => o.value === speciesFilter)) {
      rows.push({ value: speciesFilter, label: speciesFilter });
    }
    return rows;
  }, [pets, speciesFilter]);

  return (
    <div className="hub-pets-toolbar-wrap">
      <div className="hub-pets-toolbar-row">
        <div className="hub-clientes__search">
          <span className="hub-clientes__search-icon">
            <Search size={16} />
          </span>
          <input
            type="search"
            placeholder="Buscar pet por nome, tutor ou microchip…"
            value={searchQ}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Buscar pets"
          />
        </div>
        <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onNewPet}>
          <Plus size={18} />
          Novo pet
        </button>
      </div>
      <div className="hub-pets-toolbar-row">
        <div style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 360 }}>
          <HubSearchableCombobox
            id="hub-pets-toolbar-species"
            className="hub-combobox--clientes"
            options={speciesFilterOptions}
            value={speciesFilter}
            onChange={onSpeciesFilterChange}
            placeholder="Espécie (todas)"
            searchPlaceholder="Buscar espécie…"
            allowCreate={false}
            ariaLabel="Filtrar por espécie"
          />
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 0, maxWidth: 280 }}>
          <HubSearchableCombobox
            id="hub-pets-toolbar-situation"
            className="hub-combobox--clientes"
            options={situationFilterOptions}
            value={situationFilter}
            onChange={(v) => onSituationFilterChange(v as 'all' | 'ativo')}
            placeholder="Situação"
            searchPlaceholder="Buscar…"
            allowCreate={false}
            clearable={false}
            ariaLabel="Situação"
          />
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 360 }}>
          <HubSearchableCombobox
            id="hub-pets-toolbar-tutor"
            className="hub-combobox--clientes"
            options={tutorFilterOptions}
            value={tutorFilter}
            onChange={onTutorFilterChange}
            placeholder="Tutor (todos)"
            searchPlaceholder="Buscar tutor…"
            allowCreate={false}
            ariaLabel="Filtrar por tutor"
          />
        </div>
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" disabled title="Em breve">
          <SlidersHorizontal size={16} />
          Filtros
        </button>
      </div>
    </div>
  );
};
