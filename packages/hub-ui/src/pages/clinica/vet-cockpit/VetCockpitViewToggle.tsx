import React from 'react';
import type { VetCockpitViewMode } from './vetCockpitUtils';

type Props = {
  mode: VetCockpitViewMode;
  onChange: (mode: VetCockpitViewMode) => void;
};

const OPTIONS: { id: VetCockpitViewMode; label: string }[] = [
  { id: 'queue', label: 'Minha fila' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'operation', label: 'Operação clínica' },
];

const VetCockpitViewToggle: React.FC<Props> = ({ mode, onChange }) => (
  <div className="vet-cockpit-toggle" role="tablist" aria-label="Visualização do consultório">
    {OPTIONS.map((opt) => (
      <button
        key={opt.id}
        type="button"
        role="tab"
        aria-selected={mode === opt.id}
        className={`vet-cockpit-toggle__btn${mode === opt.id ? ' vet-cockpit-toggle__btn--active' : ''}`}
        onClick={() => onChange(opt.id)}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export default VetCockpitViewToggle;
