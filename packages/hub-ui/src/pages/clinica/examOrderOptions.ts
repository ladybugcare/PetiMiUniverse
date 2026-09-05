import type { AnamnesisChip } from './anamnesisOptions';

export type ExamTypeGroup = {
  id: string;
  title: string;
  options: AnamnesisChip[];
};

export const EXAM_TYPE_GROUPS: ExamTypeGroup[] = [
  {
    id: 'lab',
    title: 'Laboratório',
    options: [
      { key: 'Hemograma', label: 'Hemograma' },
      { key: 'Bioquímica sérica', label: 'Bioquímica' },
      { key: 'Função renal', label: 'Função renal' },
      { key: 'Função hepática', label: 'Função hepática' },
      { key: 'Eletrólitos', label: 'Eletrólitos' },
      { key: 'Glicemia', label: 'Glicemia' },
      { key: 'Frutosamina', label: 'Frutosamina' },
      { key: 'Urinálise', label: 'Urinálise' },
      { key: 'Urocultura', label: 'Urocultura' },
      { key: 'Parasitológico de fezes', label: 'Parasitológico' },
      { key: 'Pesquisa de Giardia', label: 'Giárdia' },
      { key: 'Cultura e antibiograma', label: 'Cultura' },
    ],
  },
  {
    id: 'imaging',
    title: 'Imagem e cardiologia',
    options: [
      { key: 'Ultrassom abdominal', label: 'US abdominal' },
      { key: 'Ultrassom gestacional', label: 'US gestacional' },
      { key: 'Ecocardiograma', label: 'Ecocardiograma' },
      { key: 'Raio-X tórax', label: 'RX tórax' },
      { key: 'Raio-X abdômen', label: 'RX abdômen' },
      { key: 'Raio-X osteoarticular', label: 'RX ósseo' },
      { key: 'Eletrocardiograma', label: 'ECG' },
    ],
  },
  {
    id: 'rapid',
    title: 'Testes rápidos',
    options: [
      { key: 'FIV / FeLV', label: 'FIV / FeLV' },
      { key: 'Cinomose', label: 'Cinomose' },
      { key: 'Parvovirose', label: 'Parvo' },
      { key: 'Erliquiose / hemoparasitas', label: 'Erliquiose' },
      { key: 'Dirofilariose', label: 'Heartworm' },
    ],
  },
  {
    id: 'other',
    title: 'Hormônios e outros',
    options: [
      { key: 'T4 total', label: 'T4' },
      { key: 'TSH', label: 'TSH' },
      { key: 'Cortisol', label: 'Cortisol' },
      { key: 'cPL / fPL', label: 'Lipase pancreática' },
      { key: 'Citologia', label: 'Citologia' },
      { key: 'Histopatológico', label: 'Histopatológico' },
      { key: 'Raspado de pele', label: 'Raspado' },
      { key: 'Pressão arterial', label: 'PA' },
    ],
  },
];

export const EXAM_TYPE_OPTIONS: AnamnesisChip[] = EXAM_TYPE_GROUPS.flatMap((g) => g.options);

export const EXAM_LAB_OPTIONS: AnamnesisChip[] = [
  { key: 'internal', label: 'Lab interno', level: 'info' },
  { key: 'external', label: 'Lab externo', level: 'warning' },
];

export function examTypeLabel(key: string): string {
  return EXAM_TYPE_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function toggleExamType(selected: string[], key: string): string[] {
  const trimmed = key.trim();
  if (!trimmed) return selected;
  return selected.includes(trimmed) ? selected.filter((k) => k !== trimmed) : [...selected, trimmed];
}

export function uniqueExamTypes(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
