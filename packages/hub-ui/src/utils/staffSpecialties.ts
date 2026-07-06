const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSpecialtyUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function parseLegacyStaffSpecialtiesText(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];

  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean);
      }
    } catch {
      /* fallback abaixo */
    }
  }

  return s
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Normaliza resposta da API (`text[]`) ou legado em `text`. */
export function parseStaffSpecialties(raw: string | string[] | null | undefined): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return parseLegacyStaffSpecialtiesText(String(raw));
}

/** Payload da API — array vazio limpa especialidades. */
export function staffSpecialtiesForApi(values: string[]): string[] {
  return values.map((v) => v.trim()).filter(Boolean);
}

export function specialtyCategoryForJobTitle(jobTitle: string): string | undefined {
  const j = jobTitle.trim();
  if (j === 'Médico(a) Veterinário(a)' || j === 'Auxiliar Veterinário(a)' || j === 'Enfermeiro(a) Veterinário(a)') {
    return 'vet';
  }
  if (j === 'Banho & Tosa') return 'freelancer';
  return undefined;
}

export function specialtyLabel(value: string, nameById: Map<string, string>): string {
  const v = value.trim();
  if (!v) return '';
  if (isSpecialtyUuid(v)) return nameById.get(v) ?? v;
  return v;
}
