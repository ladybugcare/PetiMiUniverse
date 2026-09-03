import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@petimi/web-core';
import {
  hubGetNotifications,
  hubGetUnreadCount,
  hubMarkAllNotificationsRead,
  hubMarkNotificationRead,
  type HubNotification,
} from '../services/hubNotificationsApi';
import { getHubUserId } from '../utils/hubUserDisplay';
import { goToNotificationLink, notificationRelativeTime } from '../utils/hubNotificationNav';
import { hubNotificationVisual } from '../utils/hubNotificationVisuals';

const HubNotificationBell: React.FC = () => {
  const navigate = useNavigate();
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
    goToNotificationLink(n.link, navigate);
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

  const seeAll = () => {
    setOpen(false);
    navigate('/hub/notificacoes');
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
              list.map((n) => {
                const { Icon, label, color, tint } = hubNotificationVisual(n.type);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`hub-notify__item${n.read ? '' : ' hub-notify__item--unread'}`}
                    onClick={() => void onItemClick(n)}
                  >
                    <div className="hub-notify__item-body">
                      <span
                        className="hub-notify__item-icon"
                        style={{ background: tint, color }}
                        aria-hidden
                      >
                        <Icon size={16} strokeWidth={1.9} />
                      </span>
                      <div className="hub-notify__item-content">
                        <div className="hub-notify__item-top">
                          <span className="hub-notify__item-title">{n.title}</span>
                          {!n.read && <span className="hub-notify__dot" />}
                        </div>
                        <p className="hub-notify__msg">{n.message}</p>
                        <span className="hub-notify__meta">
                          <span className="hub-notify__kind" style={{ color }}>
                            {label}
                          </span>
                          <span className="hub-notify__time">{notificationRelativeTime(n.created_at)}</span>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="hub-notify__foot">
            <button type="button" className="hub-notify__see-all" onClick={seeAll}>
              Ver todas
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HubNotificationBell;
