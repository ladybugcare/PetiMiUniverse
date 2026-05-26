import React from 'react';
import { Search, SlidersHorizontal, Plus } from 'lucide-react';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';

const BOND_FILTER_OPTIONS: HubComboboxOption[] = [
  { value: 'all', label: 'Tipo de vínculo (todos)' },
  { value: 'primary', label: 'Principal em algum pet' },
  { value: 'secondary', label: 'Só co-tutor' },
];

const STATUS_FILTER_OPTIONS: HubComboboxOption[] = [
  { value: 'all', label: 'Status (todos)' },
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];

interface ClientesToolbarProps {
  searchQ: string;
  onSearchChange: (q: string) => void;
  bondFilter: 'all' | 'primary' | 'secondary';
  onBondFilterChange: (v: 'all' | 'primary' | 'secondary') => void;
  statusFilter: 'all' | 'active' | 'inactive';
  onStatusFilterChange: (v: 'all' | 'active' | 'inactive') => void;
  onNewTutor: () => void;
}

export const ClientesToolbar: React.FC<ClientesToolbarProps> = ({
  searchQ,
  onSearchChange,
  bondFilter,
  onBondFilterChange,
  statusFilter,
  onStatusFilterChange,
  onNewTutor,
}) => {
  return (
    <div className="hub-clientes__toolbar">
      <div className="hub-clientes__search">
        <span className="hub-clientes__search-icon">
          <Search size={16} />
        </span>
        <input
          type="search"
          placeholder="Buscar tutor por nome, telefone ou e-mail…"
          value={searchQ}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Buscar clientes"
        />
      </div>
      <HubSearchableCombobox
        id="hub-clientes-toolbar-bond"
        className="hub-combobox--clientes"
        options={BOND_FILTER_OPTIONS}
        value={bondFilter}
        onChange={(v) => onBondFilterChange(v as 'all' | 'primary' | 'secondary')}
        placeholder="Tipo de vínculo"
        searchPlaceholder="Buscar…"
        allowCreate={false}
        clearable={false}
        ariaLabel="Tipo de vínculo"
      />
      <HubSearchableCombobox
        id="hub-clientes-toolbar-status"
        className="hub-combobox--clientes"
        options={STATUS_FILTER_OPTIONS}
        value={statusFilter}
        onChange={(v) => onStatusFilterChange(v as 'all' | 'active' | 'inactive')}
        placeholder="Status"
        searchPlaceholder="Buscar…"
        allowCreate={false}
        clearable={false}
        ariaLabel="Status"
      />
      <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" disabled title="Em breve">
        <SlidersHorizontal size={16} />
        Filtros
      </button>
      <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onNewTutor}>
        <Plus size={18} />
        Novo tutor
      </button>
    </div>
  );
};
