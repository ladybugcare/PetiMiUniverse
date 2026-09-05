export const VACCINE_CARD_NAMES = [
  'V8',
  'V10',
  'V11',
  'Antirrábica',
  'Giárdia',
  'Gripe canina',
  'Tosse dos canis',
  'Leishmaniose',
  'Tríplice felina',
  'Quádrupla felina',
  'FeLV',
  'FIV',
];

export function uniqueVaccineNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function vaccineCardOptions(current: string | string[]): { value: string; label: string }[] {
  const opts = VACCINE_CARD_NAMES.map((name) => ({ value: name, label: name }));
  const extras = Array.isArray(current) ? current : [current];
  for (const raw of extras) {
    const cur = raw.trim();
    if (cur && !opts.some((o) => o.value.toLowerCase() === cur.toLowerCase())) {
      opts.push({ value: cur, label: cur });
    }
  }
  return opts;
}
