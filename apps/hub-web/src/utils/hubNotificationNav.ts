const vetBase = (import.meta.env.VITE_VET_WEB_URL || '').replace(/\/$/, '');

export type HubNotificationNavInput = {
  link?: string | null;
  type?: string | null;
  entity_id?: string | null;
};

/**
 * Normaliza o destino da notificação (ex.: /hub/agenda legado → /hub/appointments)
 * e, para série a renovar, anexa renew_series quando houver entity_id.
 */
export function resolveHubNotificationHref(n: HubNotificationNavInput): string | null {
  const entityId = typeof n.entity_id === 'string' ? n.entity_id.trim() : '';
  const isSeriesRenew = n.type === 'hub_series_ending_soon' && /^[0-9a-f-]{36}$/i.test(entityId);

  let path = (n.link ?? '').trim();
  if (!path) {
    return isSeriesRenew
      ? `/hub/appointments?renew_series=${encodeURIComponent(entityId)}`
      : null;
  }

  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin === (typeof window !== 'undefined' ? window.location.origin : url.origin)) {
        path = `${url.pathname}${url.search}${url.hash}`;
      } else {
        return path;
      }
    } catch {
      return path;
    }
  } else if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  if (path === '/hub/agenda' || path.startsWith('/hub/agenda?') || path.startsWith('/hub/agenda#')) {
    path = `/hub/appointments${path.slice('/hub/agenda'.length)}`;
  }

  if (isSeriesRenew) {
    try {
      const url = new URL(path, 'https://hub.local');
      if (url.pathname === '/hub/appointments' && !url.searchParams.has('renew_series')) {
        url.searchParams.set('renew_series', entityId);
        path = `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      /* mantém path */
    }
  }

  return path;
}

/** Navega na mesma aba — nunca abre popup/nova aba. */
export function goToNotificationLink(
  notificationOrLink: HubNotificationNavInput | string | undefined | null,
  navigate: (to: string) => void,
): void {
  const input: HubNotificationNavInput =
    typeof notificationOrLink === 'string' || notificationOrLink == null
      ? { link: notificationOrLink ?? undefined }
      : notificationOrLink;

  const resolved = resolveHubNotificationHref(input);
  if (!resolved) return;

  if (/^https?:\/\//i.test(resolved)) {
    window.location.assign(resolved);
    return;
  }

  if (resolved.startsWith('/hub') || !vetBase) {
    navigate(resolved);
    return;
  }
  window.location.assign(`${vetBase}${resolved}`);
}

export function notificationRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days < 7) return `${days}d atrás`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
