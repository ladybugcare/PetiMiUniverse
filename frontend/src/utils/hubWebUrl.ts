/**
 * URL base da app PetMi Hub (ex.: https://hub.petimi.com ou http://localhost:3002).
 * Se não estiver definida, o menu usa rotas relativas `/hub/*` no mesmo host (legado).
 */
export function getHubWebBaseUrl(): string | undefined {
  const u = process.env.REACT_APP_HUB_WEB_URL?.trim();
  return u || undefined;
}

/** Path absoluto para outro host ou relativo no mesmo app. */
export function hubWebPath(path: string): string {
  const base = getHubWebBaseUrl()?.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  if (base) return `${base}${p}`;
  return p;
}
