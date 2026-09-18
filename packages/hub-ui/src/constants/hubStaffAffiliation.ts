/** Vínculo do profissional com a clínica (independente de acesso ao Hub). */
export type HubStaffAffiliation = 'internal' | 'guest';

export const HUB_STAFF_AFFILIATION_LABELS: Record<HubStaffAffiliation, string> = {
  internal: 'Equipe',
  guest: 'Convidado',
};

export function staffAffiliationLabel(raw: string | null | undefined): string {
  if (raw === 'guest') return HUB_STAFF_AFFILIATION_LABELS.guest;
  return HUB_STAFF_AFFILIATION_LABELS.internal;
}

export function isGuestAffiliation(raw: string | null | undefined): boolean {
  return raw === 'guest';
}
