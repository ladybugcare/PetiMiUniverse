import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { wizardBreedOptionsForSpecies, WIZARD_SPECIES_CANONICAL } from './petSpeciesBreedOptions';

/** Re-export: mesma ordem e rótulos que `WIZARD_SPECIES_OPTIONS` (cadastro completo). */
export const WIZARD_SPECIES_COMBO_ROWS = WIZARD_SPECIES_CANONICAL;

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
