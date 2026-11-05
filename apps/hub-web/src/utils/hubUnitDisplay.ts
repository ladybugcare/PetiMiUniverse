import type { HubUnit } from '../types/hubUnit';

function sameLabel(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'pt-BR', { sensitivity: 'accent' }) === 0;
}

/**
 * Rótulo curto e estável para o seletor de unidade (header).
 * Preferência: nickname distinto → sobra após o nome da clínica → "Matriz" se is_main → name.
 */
export function unitShortLabel(unit: HubUnit, clinicName?: string): string {
  const name = unit.name?.trim() || '';
  const nick = unit.nickname?.trim() || '';
  if (nick && name && !sameLabel(nick, name)) return nick;

  const clinic = clinicName?.trim() || '';
  if (clinic && name && sameLabel(name, clinic)) {
    return unit.is_main ? 'Matriz' : name;
  }

  if (clinic && name.toLowerCase().startsWith(clinic.toLowerCase())) {
    const rest = name.slice(clinic.length).replace(/^[\s\-–—|/]+/, '').trim();
    if (rest) return rest;
  }

  if (unit.is_main) return 'Matriz';
  return name || 'Unidade';
}
