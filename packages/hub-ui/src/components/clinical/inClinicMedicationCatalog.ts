/** Regras de catálogo para medicação aplicada na consulta. */

export function isInternalSalePurpose(purpose: string | null | undefined): boolean {
  return String(purpose ?? '')
    .trim()
    .toUpperCase() === 'INTERNAL';
}

export function filterMedicationItemsForInClinic<
  T extends { active?: boolean | null; sale_purpose?: string | null },
>(items: T[]): T[] {
  return items.filter((it) => it.active !== false && !isInternalSalePurpose(it.sale_purpose));
}

export function filterEncounterApplicationServices<
  T extends { active?: boolean | null; is_encounter_application?: boolean | null },
>(services: T[]): T[] {
  return services.filter((s) => s.active && Boolean(s.is_encounter_application));
}
