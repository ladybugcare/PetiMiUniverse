import { useEffect, useState } from 'react';
import { AUTH_LOGOUT_STARTED_EVENT, isAuthLogoutInProgress, useAuth } from '@petimi/web-core';
import { HUB_SUPPORT_TICKETS_UPDATED_EVENT, hubSupportTicketsApi } from '@petimi/hub-ui';
import { getHubUserId } from '../utils/hubUserDisplay';

const POLL_MS = 60_000;

/** Respostas do suporte PetMi ainda não lidas nos tickets do Hub do usuário logado. */
export function useHubSupportUnread(): number {
  const { user, session, isLoggingOut } = useAuth();
  const userId = getHubUserId(user);
  const [count, setCount] = useState(0);
  const authLive = Boolean(session) && Boolean(userId) && !isLoggingOut && !isAuthLogoutInProgress();

  useEffect(() => {
    if (!authLive || !userId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      if (cancelled || isAuthLogoutInProgress()) return;
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
    const onLogout = () => {
      cancelled = true;
      window.clearInterval(timer);
      setCount(0);
    };
    window.addEventListener(HUB_SUPPORT_TICKETS_UPDATED_EVENT, refresh);
    window.addEventListener(AUTH_LOGOUT_STARTED_EVENT, onLogout);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(HUB_SUPPORT_TICKETS_UPDATED_EVENT, refresh);
      window.removeEventListener(AUTH_LOGOUT_STARTED_EVENT, onLogout);
    };
  }, [authLive, userId]);

  return count;
}
