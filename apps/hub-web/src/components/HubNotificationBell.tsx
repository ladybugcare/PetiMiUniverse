import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import {
  hubGetNotifications,
  hubGetUnreadCount,
  hubMarkAllNotificationsRead,
  hubMarkNotificationRead,
  type HubNotification,
} from '../services/hubNotificationsApi';
import { getHubUserId } from '../utils/hubUserDisplay';

const vetBase = (import.meta.env.VITE_VET_WEB_URL || '').replace(/\/$/, '');

function openNotificationLink(link: string | undefined): void {
  if (!link) return;
  if (/^https?:\/\//i.test(link)) {
    window.open(link, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!vetBase) return;
  const path = link.startsWith('/') ? link : `/${link}`;
  window.open(`${vetBase}${path}`, '_blank', 'noopener,noreferrer');
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days < 7) return `${days}d atrás`;
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

const HubNotificationBell: React.FC = () => {
  const { user } = useAuth();
  const userId = getHubUserId(user);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<HubNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastUnreadFetch = useRef(0);

  const loadUnread = useCallback(async () => {
    if (!userId) return;
    const now = Date.now();
    if (now - lastUnreadFetch.current < 2500) return;
    lastUnreadFetch.current = now;
    try {
      const n = await hubGetUnreadCount(userId);
      setUnread(n);
    } catch {
      /* silencioso — API indisponível */
    }
  }, [userId]);

  const loadList = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = await hubGetNotifications(userId, 1, 12);
      setList(rows);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void loadUnread();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void loadUnread();
    }, 60000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadUnread();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [userId, loadUnread]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = async () => {
    if (!open) {
      await loadList();
      await loadUnread();
    }
    setOpen((o) => !o);
  };

  const onItemClick = async (n: HubNotification) => {
    try {
      if (!n.read) {
        await hubMarkNotificationRead(n.id);
        setUnread((u) => Math.max(0, u - 1));
        setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
    openNotificationLink(n.link);
  };

  const markAll = async () => {
    if (!userId) return;
    try {
      await hubMarkAllNotificationsRead(userId);
      setUnread(0);
      setList((prev) => prev.map((x) => ({ ...x, read: true })));
    } catch {
      /* ignore */
    }
  };

  if (!userId) return null;

  return (
    <div className="hub-notify" ref={wrapRef}>
      <button type="button" className="hub-notify__bell" onClick={() => void toggle()} aria-label="Notificações">
        <Bell size={20} strokeWidth={1.75} />
        {unread > 0 && <span className="hub-notify__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="hub-notify__dropdown">
          <div className="hub-notify__head">
            <h3 className="hub-notify__title">Notificações</h3>
            {unread > 0 && (
              <button type="button" className="hub-notify__mark-all" onClick={() => void markAll()}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="hub-notify__list">
            {loading ? (
              <div className="hub-notify__loading">Carregando…</div>
            ) : list.length === 0 ? (
              <div className="hub-notify__empty">
                <Bell size={32} strokeWidth={1} className="hub-notify__empty-icon" />
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              list.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`hub-notify__item${n.read ? '' : ' hub-notify__item--unread'}`}
                  onClick={() => void onItemClick(n)}
                >
                  <div className="hub-notify__item-body">
                    <div className="hub-notify__item-top">
                      <span className="hub-notify__item-title">{n.title}</span>
                      {!n.read && <span className="hub-notify__dot" />}
                    </div>
                    <p className="hub-notify__msg">{n.message}</p>
                    <span className="hub-notify__time">{relativeTime(n.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HubNotificationBell;
