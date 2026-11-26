/** Campos mínimos para rotular unidade (lista da clínica ou embed do agendamento). */
export type UnitDisplaySource = {
  name?: string | null;
  nickname?: string | null;
  is_main?: boolean | null;
};

function sameLabel(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'pt-BR', { sensitivity: 'accent' }) === 0;
}

/**
 * Rótulo curto e estável (header multi-unidade, filtros).
 * Preferência: nickname distinto → sobra após o nome da clínica → "Matriz" se is_main → name.
 */
export function unitShortLabel(unit: UnitDisplaySource, clinicName?: string): string {
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

/**
 * Rótulo da unidade no detalhe operacional (painel do agendamento, etc.).
 * Com uma única unidade, o header mostra só o nome da clínica — o detalhe deve
 * espelhar isso (evita “Unidade Principal” genérico do seed).
 * Com várias unidades, usa o rótulo curto (nickname / Matriz / …).
 */
export function unitOperationalLabel(
  unit: UnitDisplaySource,
  clinicName?: string,
  unitCount = 1,
): string {
  const clinic = clinicName?.trim() || '';
  if (unitCount <= 1 && clinic) return clinic;
  return unitShortLabel(unit, clinicName);
}
