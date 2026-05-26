import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { wizardBreedOptionsForSpecies } from './petSpeciesBreedOptions';

/** Espécies canónicas (combobox; sem ícones — alinhado ao modelo Hub unificado). */
export const WIZARD_SPECIES_COMBO_ROWS: { value: string; label: string }[] = [
  { value: 'Cão', label: 'Cão' },
  { value: 'Gato', label: 'Gato' },
  { value: 'Ave', label: 'Ave' },
  { value: 'Roedor', label: 'Roedor' },
  { value: 'Réptil', label: 'Réptil' },
  { value: 'Coelho', label: 'Coelho' },
  { value: 'Furão', label: 'Furão' },
  { value: 'Peixe', label: 'Peixe' },
  { value: 'Equino', label: 'Equino' },
  { value: 'Outro', label: 'Outro' },
];

export function mergeSpeciesComboboxOptions(storedSpecies: string): HubComboboxOption[] {
  const t = storedSpecies.trim();
  const base: HubComboboxOption[] = WIZARD_SPECIES_COMBO_ROWS.map((r) => ({
    value: r.value,
    label: r.label,
  }));
  if (t && !WIZARD_SPECIES_COMBO_ROWS.some((r) => r.value === t)) {
    base.push({
      value: storedSpecies,
      label: `${t} (valor guardado)`,
    });
  }
  return base;
}

export function mergeBreedComboboxOptions(species: string, storedBreed: string): HubComboboxOption[] {
  const opts = wizardBreedOptionsForSpecies(species).filter((o) => o.value !== '');
  const mapped: HubComboboxOption[] = opts.map((o) => ({ value: o.value, label: o.label }));
  const b = storedBreed.trim();
  if (b && !mapped.some((o) => o.value === storedBreed)) {
    mapped.push({ value: storedBreed, label: `${b} (valor guardado)` });
  }
  return mapped;
}
