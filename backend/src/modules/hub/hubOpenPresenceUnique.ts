/** Unique parciais de presença aberta (migration 181). */
const OPEN_PRESENCE_UNIQUE_INDEXES = [
  'uniq_hub_grooming_sessions_pet_open',
  'uniq_hub_appointments_pet_grooming_walk_in_open',
  'uniq_hub_appointments_pet_clinical_walk_in_open',
  'uniq_hub_encounters_pet_open',
] as const;

export function isOpenPresenceUniqueViolation(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '23505') {
    const msg = String(error.message || '');
    if (!msg) return true;
    return OPEN_PRESENCE_UNIQUE_INDEXES.some((name) => msg.includes(name)) || msg.includes('pet_open');
  }
  const msg = String(error.message || '');
  return OPEN_PRESENCE_UNIQUE_INDEXES.some((name) => msg.includes(name));
}
