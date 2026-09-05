import type { AnamnesisChip } from './anamnesisOptions';
import { isCatSpecies, isDogSpecies } from './anamnesisOptions';

export const CRT_OPTIONS: AnamnesisChip[] = [
  { key: 'lt2', label: '< 2 s', level: 'info' },
  { key: 'eq2', label: '2 s', level: 'warning' },
  { key: 'gt2', label: '> 2 s', level: 'danger' },
];

export const HYDRATION_OPTIONS: AnamnesisChip[] = [
  { key: 'normal', label: 'Normal', level: 'info' },
  { key: 'leve', label: 'Desidratação leve', level: 'warning' },
  { key: 'moderada', label: 'Moderada', level: 'warning' },
  { key: 'grave', label: 'Grave', level: 'danger' },
];

export const MUCOSA_OPTIONS: AnamnesisChip[] = [
  { key: 'rosada', label: 'Rosada', level: 'info' },
  { key: 'palida', label: 'Pálida', level: 'warning' },
  { key: 'congestionada', label: 'Congesta', level: 'warning' },
  { key: 'cianotica', label: 'Cianótica', level: 'danger' },
  { key: 'icterica', label: 'Ictérica', level: 'warning' },
];

export const LYMPH_OPTIONS: AnamnesisChip[] = [
  { key: 'normais', label: 'Normais', level: 'info' },
  { key: 'aumentados', label: 'Aumentados', level: 'warning' },
  { key: 'dolorosos', label: 'Dolorosos', level: 'warning' },
];

export const GENERAL_STATE_OPTIONS: AnamnesisChip[] = [
  { key: 'alerta', label: 'Alerta', level: 'info' },
  { key: 'apatico', label: 'Apático', level: 'warning' },
  { key: 'deprimido', label: 'Deprimido', level: 'warning' },
  { key: 'prostrado', label: 'Prostrado', level: 'danger' },
];

export function resolveExamChoice(value: unknown, options: AnamnesisChip[]): string {
  const raw = typeof value === 'string' ? value.trim() : value == null || value === '' ? '' : String(value).trim();
  if (!raw) return '';
  if (options.some((o) => o.key === raw)) return raw;
  const lower = raw.toLowerCase();
  const byLabel = options.find((o) => o.label.toLowerCase() === lower);
  return byLabel?.key ?? raw;
}

export function examChoiceLabel(key: string, options: AnamnesisChip[]): string {
  return options.find((o) => o.key === key)?.label ?? key;
}

export type VitalField = 'temperature_c' | 'heart_rate' | 'respiratory_rate' | 'weight_kg';

export function vitalReferenceHint(field: VitalField, species?: string | null): string {
  const cat = isCatSpecies(species);
  const dog = isDogSpecies(species) || (!cat && !species);
  if (field === 'temperature_c') return cat ? 'Ref. 38,0–39,2 °C' : 'Ref. 37,5–39,2 °C';
  if (field === 'heart_rate') return cat ? 'Ref. 140–220 bpm' : dog ? 'Ref. 60–140 bpm' : 'bpm';
  if (field === 'respiratory_rate') return cat ? 'Ref. 20–30 rpm' : 'Ref. 10–30 rpm';
  return 'Neste atendimento';
}
