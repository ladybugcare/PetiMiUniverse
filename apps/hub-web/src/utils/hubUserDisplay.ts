/** Metadados Supabase / sessão — alinhado ao helper do PetMi Vet. */
export type HubUserLike = {
  id?: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
    photo_url?: string;
    avatar_url?: string;
    phone?: string;
    telefone?: string;
    birth_date?: string;
    data_nascimento?: string;
    locale?: string;
    idioma?: string;
    language?: string;
  };
} | null;

export function getHubUserPhotoUrl(user: unknown): string | undefined {
  const u = user as HubUserLike;
  if (!u) return undefined;
  if (u.user_metadata?.photo_url) return String(u.user_metadata.photo_url);
  if (u.user_metadata?.avatar_url) return String(u.user_metadata.avatar_url);
  return undefined;
}

export function getHubUserDisplayName(user: unknown): string {
  const u = user as HubUserLike;
  if (!u) return 'Usuário';
  const meta = u.user_metadata;
  return meta?.name || meta?.full_name || u.email?.split('@')[0] || 'Usuário';
}

export function getHubUserPhone(user: unknown): string | undefined {
  const m = (user as HubUserLike)?.user_metadata;
  if (!m) return undefined;
  const v = m.phone ?? m.telefone;
  return v != null && String(v).trim() !== '' ? String(v).trim() : undefined;
}

export function getHubUserBirthDate(user: unknown): string | undefined {
  const m = (user as HubUserLike)?.user_metadata;
  if (!m) return undefined;
  const v = m.birth_date ?? m.data_nascimento;
  return v != null && String(v).trim() !== '' ? String(v).trim() : undefined;
}

export function getHubUserLocaleCode(user: unknown): string | undefined {
  const m = (user as HubUserLike)?.user_metadata;
  if (!m) return undefined;
  const v = m.locale ?? m.idioma ?? m.language;
  return v != null && String(v).trim() !== '' ? String(v).trim().toLowerCase() : undefined;
}

export function getHubUserId(user: unknown): string | undefined {
  const u = user as { id?: string } | null;
  return u?.id ? String(u.id) : undefined;
}
