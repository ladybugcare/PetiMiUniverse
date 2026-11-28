import { supabaseAdmin } from '../../config/supabase';

/** Colunas estáveis para painéis operacionais (sem avatar_url — migration opcional). */
export const HUB_DAY_BOARD_PET_SELECT =
  'id, name, species, breed, size_tier, birth_date, coat_type, notes, behavior_tags';

export type HubDayBoardPetRow = {
  id: string;
  name: string;
  species?: string;
  breed?: string | null;
  size_tier?: string;
  birth_date?: string | null;
  coat_type?: string | null;
  notes?: string | null;
  behavior_tags?: string[] | null;
  /** Presente para enrich de itens existentes (falecido/arquivado ainda aparece na fila). */
  deleted_at?: string | null;
  deceased_at?: string | null;
  death_invalidated_at?: string | null;
};

/**
 * Enrich de pets já referenciados em day boards.
 * Inclui falecidos/arquivados para não cair em "Sem pet" — flags vêm no row.
 */
export async function fetchHubPetsMapByIds(
  petIds: Iterable<string | null | undefined>,
): Promise<Map<string, HubDayBoardPetRow>> {
  const uniq = [...new Set([...petIds].filter((id): id is string => Boolean(id)))];
  if (uniq.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from('hub_pets')
    .select(`${HUB_DAY_BOARD_PET_SELECT}, deleted_at, deceased_at, death_invalidated_at`)
    .in('id', uniq);

  if (error) {
    console.error('[hubDayBoardPets] fetchHubPetsMapByIds', error);
    return new Map();
  }

  return new Map(
    (data ?? []).map((p) => {
      const row = p as HubDayBoardPetRow & { id: string };
      return [row.id, row];
    }),
  );
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
    .select(
      'guardian_id, pet_id, role, hub_pets!inner(id, clinic_id, deleted_at, deceased_at, death_invalidated_at)',
    )
    .in('guardian_id', uniq);

  if (error || !data) {
    console.error('[hubDayBoardPets] resolvePrimaryPetIdsByGuardians', error);
    return result;
  }

  type PetEmbed = {
    id: string;
    clinic_id: string;
    deleted_at: string | null;
    deceased_at: string | null;
    death_invalidated_at: string | null;
  };
  type LinkRow = {
    guardian_id: string;
    pet_id: string;
    role: string;
    hub_pets: PetEmbed | PetEmbed[] | null;
  };

  const byGuardian = new Map<string, string[]>();
  const primaryByGuardian = new Map<string, string>();
  const { isPetEligibleForNewOp } = await import('./petDeathService');

  for (const row of data as LinkRow[]) {
    const rawPet = row.hub_pets;
    const pet = Array.isArray(rawPet) ? rawPet[0] : rawPet;
    if (!pet || pet.clinic_id !== clinicId || !isPetEligibleForNewOp(pet)) continue;

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
