/** Normaliza nome de pet para comparação: minúsculas, sem acentos, espaços colapsados. */
export function normalizePetName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
