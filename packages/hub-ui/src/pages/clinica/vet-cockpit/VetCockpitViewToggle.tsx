import React from 'react';
import { HubTabs } from '../../../components/HubTabs';
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
  <HubTabs
    ariaLabel="Visualização do consultório"
    items={OPTIONS}
    activeId={mode}
    onTabChange={(id) => onChange(id as VetCockpitViewMode)}
    className="vet-cockpit-view-tabs"
  />
);

export default VetCockpitViewToggle;
