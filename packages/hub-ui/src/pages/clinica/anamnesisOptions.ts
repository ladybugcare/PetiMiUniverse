import { behaviorTagLabel, PET_BEHAVIOR_TAG_DEFS } from '../pets/petBehaviorTags';

export type AnamnesisChip = { key: string; label: string; level?: 'danger' | 'warning' | 'info' };

export const DIET_TYPE_OPTIONS: AnamnesisChip[] = [
  { key: 'racao_seca', label: 'Ração seca' },
  { key: 'racao_umida', label: 'Ração úmida' },
  { key: 'racao_prescrita', label: 'Ração prescrita' },
  { key: 'dieta_caseira', label: 'Dieta caseira' },
  { key: 'dieta_natural', label: 'Natural / BARF' },
  { key: 'petiscos', label: 'Petiscos' },
  { key: 'inapetente', label: 'Inapetente', level: 'warning' },
  { key: 'jejum', label: 'Em jejum', level: 'warning' },
];

const PAIN_BEHAVIOR_OPTIONS: AnamnesisChip[] = [
  { key: 'apatico', label: 'Apático / quieto demais', level: 'warning' },
  { key: 'irritado_toque', label: 'Irritado ao toque', level: 'warning' },
  { key: 'protege_regiao', label: 'Protege a região', level: 'warning' },
  { key: 'lambe_local', label: 'Lambe / morde o local', level: 'warning' },
  { key: 'coxeia', label: 'Coxeia / evita apoiar', level: 'warning' },
  { key: 'vocaliza', label: 'Vocaliza ao se mexer', level: 'danger' },
];

const DOG_VISIT_OPTIONS: AnamnesisChip[] = [
  { key: 'ansioso_consulta', label: 'Ansioso / ofegante', level: 'warning' },
  { key: 'agressivo_consulta', label: 'Agressivo na consulta', level: 'danger' },
  { key: 'medo_manuseio', label: 'Medo de manuseio', level: 'warning' },
  { key: 'sociavel', label: 'Sociável / tranquilo', level: 'info' },
];

const CAT_VISIT_OPTIONS: AnamnesisChip[] = [
  { key: 'esconde', label: 'Se esconde', level: 'warning' },
  { key: 'agressivo_toque', label: 'Agressivo ao toque', level: 'danger' },
  { key: 'menos_grooming', label: 'Menos grooming', level: 'warning' },
  { key: 'evita_contato', label: 'Evita contato', level: 'warning' },
];

export const PAIN_LEVEL_OPTIONS: AnamnesisChip[] = [
  { key: 'none', label: 'Sem sinais', level: 'info' },
  { key: 'mild', label: 'Leve', level: 'info' },
  { key: 'moderate', label: 'Moderada', level: 'warning' },
  { key: 'severe', label: 'Intensa', level: 'danger' },
];

const PAIN_LABEL_BY_KEY = new Map(PAIN_LEVEL_OPTIONS.map((o) => [o.key, o.label]));

/** Tags da ficha que costumam se cruzar com dor ou manuseio. */
const PAIN_RELEVANT_FICHA_TAGS = new Set([
  'agressivo_pessoas',
  'agressivo_animais',
  'morde',
  'ansioso',
  'sedacao',
  'idoso',
]);

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function anamnesisText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function dietTypeLabel(key: string): string {
  return DIET_TYPE_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function visitBehaviorLabel(key: string): string {
  const fromVisit = [...PAIN_BEHAVIOR_OPTIONS, ...DOG_VISIT_OPTIONS, ...CAT_VISIT_OPTIONS].find((o) => o.key === key);
  if (fromVisit) return fromVisit.label;
  return behaviorTagLabel(key);
}

export function painLevelLabel(key: string): string {
  return PAIN_LABEL_BY_KEY.get(key) ?? key;
}

export function isDogSpecies(species?: string | null): boolean {
  return /c[aã]o|dog|canino/i.test(String(species ?? ''));
}

export function isCatSpecies(species?: string | null): boolean {
  return /gato|felino|cat/i.test(String(species ?? ''));
}

export function visitBehaviorOptions(species?: string | null): AnamnesisChip[] {
  if (isCatSpecies(species)) return [...PAIN_BEHAVIOR_OPTIONS, ...CAT_VISIT_OPTIONS];
  return [...PAIN_BEHAVIOR_OPTIONS, ...DOG_VISIT_OPTIONS];
}

export function fichaBehaviorChips(tags: string[] | null | undefined): AnamnesisChip[] {
  const list = asStringList(tags);
  if (list.length === 0) return [];
  const defByKey = new Map(PET_BEHAVIOR_TAG_DEFS.map((d) => [d.key, d]));
  return list.map((key) => {
    const def = defByKey.get(key);
    return { key, label: def?.label ?? key, level: def?.level ?? 'info' };
  });
}

export function painRelevantFichaTags(tags: string[] | null | undefined): string[] {
  return asStringList(tags).filter((t) => PAIN_RELEVANT_FICHA_TAGS.has(t));
}

const PAIN_BEHAVIOR_KEYS = new Set(PAIN_BEHAVIOR_OPTIONS.map((o) => o.key));

export function painRelatedVisitBehaviors(tags: string[] | null | undefined): string[] {
  return asStringList(tags).filter((t) => PAIN_BEHAVIOR_KEYS.has(t));
}

export function mergeChipValues(current: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...current, ...incoming]) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
