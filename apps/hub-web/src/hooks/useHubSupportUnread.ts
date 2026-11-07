import { useEffect, useState } from 'react';
import { useAuth } from '@petimi/web-core';
import { HUB_SUPPORT_TICKETS_UPDATED_EVENT, hubSupportTicketsApi } from '@petimi/hub-ui';
import { getHubUserId } from '../utils/hubUserDisplay';

const POLL_MS = 60_000;

/** Respostas do suporte PetMi ainda não lidas nos tickets do Hub do usuário logado. */
export function useHubSupportUnread(): number {
  const { user } = useAuth();
  const userId = getHubUserId(user);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      hubSupportTicketsApi
        .unreadCount(userId)
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {
          /* badge é best-effort */
        });
    };
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener(HUB_SUPPORT_TICKETS_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(HUB_SUPPORT_TICKETS_UPDATED_EVENT, refresh);
    };
  }, [userId]);

  return count;
}
