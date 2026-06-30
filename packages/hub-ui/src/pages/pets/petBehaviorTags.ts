export type PetBehaviorTagLevel = 'danger' | 'warning' | 'info';

export type PetBehaviorTagDef = {
  key: string;
  label: string;
  level: PetBehaviorTagLevel;
};

/** Tags predefinidas do questionário de comportamento. */
export const PET_BEHAVIOR_TAG_DEFS: PetBehaviorTagDef[] = [
  { key: 'agressivo_pessoas', label: 'Agressivo c/ pessoas', level: 'danger' },
  { key: 'agressivo_animais', label: 'Agressivo c/ animais', level: 'danger' },
  { key: 'morde', label: 'Morde', level: 'danger' },
  { key: 'ansioso', label: 'Ansioso / nervoso', level: 'warning' },
  { key: 'fugitivo', label: 'Fugitivo', level: 'warning' },
  { key: 'sedacao', label: 'Precisa de sedação', level: 'warning' },
  { key: 'def_visual', label: 'Deficiência visual', level: 'info' },
  { key: 'def_auditiva', label: 'Deficiência auditiva', level: 'info' },
  { key: 'idoso', label: 'Idoso (cuidado especial)', level: 'info' },
  { key: 'filhote', label: 'Filhote', level: 'info' },
];

const PREDEFINED_KEYS = new Set(PET_BEHAVIOR_TAG_DEFS.map((d) => d.key));

const DEF_BY_KEY = new Map(PET_BEHAVIOR_TAG_DEFS.map((d) => [d.key, d]));

export function isPredefinedBehaviorTag(key: string): boolean {
  return PREDEFINED_KEYS.has(key);
}

export function behaviorTagLabel(key: string): string {
  return DEF_BY_KEY.get(key)?.label ?? key;
}

export function behaviorTagLevel(key: string): PetBehaviorTagLevel {
  return DEF_BY_KEY.get(key)?.level ?? 'info';
}

export function normalizeBehaviorTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}
