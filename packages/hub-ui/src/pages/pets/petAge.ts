/** Idade aproximada a partir de YYYY-MM-DD (lista). */
export function petAgeLabel(birthDate: string | null): string {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return '—';
  const [y, m, d] = birthDate.split('-').map(Number);
  const born = new Date(y, m - 1, d);
  if (Number.isNaN(born.getTime())) return '—';
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const md = now.getMonth() - born.getMonth();
  const dd = now.getDate() - born.getDate();
  if (md < 0 || (md === 0 && dd < 0)) years -= 1;
  if (years < 0) return '—';
  if (years === 0) return '< 1 ano';
  return `${years} ano${years !== 1 ? 's' : ''}`;
}

/** Idade com meses (ex.: "3 anos e 2 meses") para fichas e detalhe. */
export function petAgeDetailedLabel(birthDate: string | null): string {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return '—';
  const [y, m, d] = birthDate.split('-').map(Number);
  const born = new Date(y, m - 1, d);
  if (Number.isNaN(born.getTime())) return '—';
  const now = new Date();
  let months =
    (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return '—';
  if (months === 0) return '< 1 mês';
  const years = Math.floor(months / 12);
  const mo = months % 12;
  if (years === 0) return `${mo} ${mo === 1 ? 'mês' : 'meses'}`;
  if (mo === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${mo} ${mo === 1 ? 'mês' : 'meses'}`;
}
