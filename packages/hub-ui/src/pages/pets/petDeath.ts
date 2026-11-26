/** Helpers de óbito / situação do pet (pt-BR). */

export type PetDeathType = 'euthanasia' | 'natural' | 'accidental' | 'other' | 'unknown';
export type PetDeathSource = 'manual' | 'encounter' | 'surgery' | 'hospitalization';
export type PetSituationFilter = 'active' | 'deceased' | 'archived' | 'all';

export const DEATH_TYPE_OPTIONS: Array<{ value: PetDeathType; label: string }> = [
  { value: 'euthanasia', label: 'Eutanásia' },
  { value: 'natural', label: 'Natural' },
  { value: 'accidental', label: 'Acidental' },
  { value: 'other', label: 'Outro' },
  { value: 'unknown', label: 'Desconhecido' },
];

export function deathTypeLabel(type: string | null | undefined): string {
  return DEATH_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type ?? '—';
}

export function hasValidPetDeath(pet: {
  deceased_at?: string | null;
  death_invalidated_at?: string | null;
}): boolean {
  return Boolean(pet.deceased_at) && !pet.death_invalidated_at;
}

export function petSituationLabel(pet: {
  deleted_at?: string | null;
  deceased_at?: string | null;
  death_invalidated_at?: string | null;
}): string {
  const deceased = hasValidPetDeath(pet);
  const archived = Boolean(pet.deleted_at);
  if (deceased && archived) return 'Falecido · Arquivado';
  if (deceased) return 'Falecido';
  if (archived) return 'Arquivado';
  return 'Ativo';
}

export function toDatetimeLocalValue(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/** Partes para HubDateField + HubTimeField. */
export function splitDeceasedLocal(local: string): { dateIso: string; hm: string } {
  const [dateIso = '', hm = ''] = local.split('T');
  return { dateIso, hm: hm.slice(0, 5) };
}

export function joinDeceasedLocal(dateIso: string, hm: string): string {
  const fallback = splitDeceasedLocal(toDatetimeLocalValue());
  const safeDate = dateIso.trim() || fallback.dateIso;
  const safeHm = hm.trim() || fallback.hm || '00:00';
  return `${safeDate}T${safeHm}`;
}

/** ISO UTC a partir de data (YYYY-MM-DD) + hora (HH:mm) no fuso local. */
export function fromDateAndHm(dateIso: string, hm: string): string {
  return fromDatetimeLocalValue(joinDeceasedLocal(dateIso, hm));
}
