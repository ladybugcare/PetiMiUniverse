const vetBase = (import.meta.env.VITE_VET_WEB_URL || '').replace(/\/$/, '');

/** Navega na mesma aba — nunca abre popup/nova aba. */
export function goToNotificationLink(
  link: string | undefined,
  navigate: (to: string) => void,
): void {
  if (!link) return;

  if (/^https?:\/\//i.test(link)) {
    try {
      const url = new URL(link);
      if (url.origin === window.location.origin) {
        navigate(`${url.pathname}${url.search}${url.hash}`);
        return;
      }
    } catch {
      /* URL inválida — cai no assign abaixo */
    }
    window.location.assign(link);
    return;
  }

  const path = link.startsWith('/') ? link : `/${link}`;
  if (path.startsWith('/hub')) {
    navigate(path);
    return;
  }
  if (!vetBase) {
    navigate(path);
    return;
  }
  window.location.assign(`${vetBase}${path}`);
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
