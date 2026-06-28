import { supabaseAdmin } from '../../config/supabase';

/** Colunas estáveis para painéis operacionais (sem avatar_url — migration opcional). */
export const HUB_DAY_BOARD_PET_SELECT =
  'id, name, species, breed, size_tier, birth_date, coat_type, notes';

export type HubDayBoardPetRow = {
  id: string;
  name: string;
  species?: string;
  breed?: string | null;
  size_tier?: string;
  birth_date?: string | null;
  coat_type?: string | null;
  notes?: string | null;
};

export async function fetchHubPetsMapByIds(
  petIds: Iterable<string | null | undefined>,
): Promise<Map<string, HubDayBoardPetRow>> {
  const uniq = [...new Set([...petIds].filter((id): id is string => Boolean(id)))];
  if (uniq.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from('hub_pets')
    .select(HUB_DAY_BOARD_PET_SELECT)
    .in('id', uniq)
    .is('deleted_at', null);

  if (error) {
    console.error('[hubDayBoardPets] fetchHubPetsMapByIds', error);
    return new Map();
  }

  return new Map((data ?? []).map((p) => [p.id as string, p as HubDayBoardPetRow]));
}

/**
 * Quando o agendamento tem tutor mas não tem pet_id, tenta o pet principal
 * (ou o único pet vinculado ao tutor).
 */
export async function resolvePrimaryPetIdsByGuardians(
  clinicId: string,
  guardianIds: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const uniq = [...new Set([...guardianIds].filter((id): id is string => Boolean(id)))];
  const result = new Map<string, string>();
  if (uniq.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from('hub_pet_guardians')
    .select('guardian_id, pet_id, role, hub_pets!inner(id, clinic_id, deleted_at)')
    .in('guardian_id', uniq);

  if (error || !data) {
    console.error('[hubDayBoardPets] resolvePrimaryPetIdsByGuardians', error);
    return result;
  }

  type PetEmbed = { id: string; clinic_id: string; deleted_at: string | null };
  type LinkRow = {
    guardian_id: string;
    pet_id: string;
    role: string;
    hub_pets: PetEmbed | PetEmbed[] | null;
  };

  const byGuardian = new Map<string, string[]>();
  const primaryByGuardian = new Map<string, string>();

  for (const row of data as LinkRow[]) {
    const rawPet = row.hub_pets;
    const pet = Array.isArray(rawPet) ? rawPet[0] : rawPet;
    if (!pet || pet.clinic_id !== clinicId || pet.deleted_at != null) continue;

    const list = byGuardian.get(row.guardian_id) ?? [];
    list.push(row.pet_id);
    byGuardian.set(row.guardian_id, list);
    if (row.role === 'primary') primaryByGuardian.set(row.guardian_id, row.pet_id);
  }

  for (const [guardianId, pets] of byGuardian) {
    const resolved = primaryByGuardian.get(guardianId) ?? (pets.length === 1 ? pets[0]! : null);
    if (resolved) result.set(guardianId, resolved);
  }

  return result;
}

/** Preferência: pet do agendamento, depois da sessão operacional. */
export function coalesceAppointmentPetId(
  appointmentPetId: string | null | undefined,
  sessionPetId: string | null | undefined,
): string | null {
  return appointmentPetId ?? sessionPetId ?? null;
}
