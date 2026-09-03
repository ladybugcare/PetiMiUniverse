import type { HubPetProfileChange } from '../../api/hubPetsApi';
import { behaviorTagLabel } from './petBehaviorTags';
import { clinicalFlagLabel, neuteredLabel } from './petClinicalFlags';

const SOURCE_LABEL: Record<string, string> = {
  wizard: 'cadastro',
  clinic: 'clínica',
  grooming: 'banho e tosa',
  boarding: 'hotel',
  pets_form: 'ficha rápida',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function asBool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value: unknown }).value;
    if (inner === true || inner === false) return inner;
  }
  return null;
}

function formatTags(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return 'vazio';
  return v.map((t) => behaviorTagLabel(String(t))).join(', ');
}

function formatFlag(v: unknown): string {
  if (!v || typeof v !== 'object') return 'vazio';
  const o = v as { flag_key?: string; label?: string; active?: boolean };
  const name = clinicalFlagLabel(String(o.flag_key || ''), o.label);
  if (o.active === false) return `${name} (desligado)`;
  return name;
}

export function formatPetProfileChangeLine(change: HubPetProfileChange): string {
  const source = SOURCE_LABEL[change.source] ?? change.source;
  const when = formatWhen(change.created_at);
  const suffix = [source, when].filter(Boolean).join(' · ');

  if (change.field === 'neutered') {
    const oldV = asBool(change.old_value);
    const newObj = change.new_value as { value?: unknown; applied?: boolean; conflict?: boolean } | boolean | null;
    const attempted = typeof newObj === 'object' && newObj ? asBool(newObj) : asBool(newObj);
    const applied = typeof newObj === 'object' && newObj && 'applied' in newObj ? Boolean(newObj.applied) : true;
    const conflict = typeof newObj === 'object' && newObj && 'conflict' in newObj ? Boolean(newObj.conflict) : false;
    if (conflict || !applied) {
      return `Castrado: manteve ${neuteredLabel(oldV)} (divergência ${neuteredLabel(attempted)}) · ${suffix}`;
    }
    return `Castrado: ${neuteredLabel(oldV)} → ${neuteredLabel(attempted ?? asBool(change.new_value))} · ${suffix}`;
  }

  if (change.field === 'behavior_tags') {
    return `Comportamento: ${formatTags(change.old_value)} → ${formatTags(change.new_value)} · ${suffix}`;
  }

  return `Alerta: ${formatFlag(change.old_value)} → ${formatFlag(change.new_value)} · ${suffix}`;
}
