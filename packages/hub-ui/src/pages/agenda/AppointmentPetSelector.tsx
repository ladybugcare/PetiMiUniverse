import React, { useMemo } from 'react';
import { Dog } from 'lucide-react';
import { HubMultiSelectCombobox } from '../../components/HubMultiSelectCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';

export type AppointmentPetOption = {
  id: string;
  name: string;
  size_tier: string;
  coat_type: string | null;
  birth_date: string | null;
};

export type AppointmentPetSelectorProps = {
  id?: string;
  pets: AppointmentPetOption[];
  selectedPetIds: string[];
  onChange: (petIds: string[]) => void;
  disabled?: boolean;
};

export const AppointmentPetSelector: React.FC<AppointmentPetSelectorProps> = ({
  id = 'nam-pet',
  pets,
  selectedPetIds,
  onChange,
  disabled = false,
}) => {
  const options = useMemo<HubComboboxOption[]>(
    () => pets.map((pet) => ({ value: pet.id, label: pet.name })),
    [pets],
  );

  const resolveLabel = useMemo(
    () => (petId: string) => pets.find((p) => p.id === petId)?.name ?? petId,
    [pets],
  );

  if (pets.length === 0) return null;

  return (
    <HubMultiSelectCombobox
      id={id}
      options={options}
      value={selectedPetIds}
      onChange={onChange}
      placeholder="Selecionar pets…"
      searchPlaceholder="Buscar pet…"
      emptyResultsLabel="Nenhum pet encontrado"
      resolveLabel={resolveLabel}
      disabled={disabled}
      triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
      ariaLabel="Selecionar pets"
    />
  );
};

export default AppointmentPetSelector;
