import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@petimi/web-core';
import {
  hubGetNotifications,
  hubMarkAllNotificationsRead,
  hubMarkNotificationRead,
  type HubNotification,
} from '../services/hubNotificationsApi';
import { getHubUserId } from '../utils/hubUserDisplay';
import { goToNotificationLink, notificationRelativeTime } from '../utils/hubNotificationNav';
import { hubNotificationVisual } from '../utils/hubNotificationVisuals';

const PAGE_SIZE = 20;

const HubNotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = getHubUserId(user);

  const [list, setList] = useState<HubNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadPage = useCallback(
    async (nextPage: number) => {
      if (!userId) return;
      setLoading(true);
      setFailed(false);
      try {
        const rows = await hubGetNotifications(userId, nextPage, PAGE_SIZE);
        setList((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
        setPage(nextPage);
      } catch {
        if (nextPage === 1) setList([]);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const onItemClick = async (n: HubNotification) => {
    try {
      if (!n.read) {
        await hubMarkNotificationRead(n.id);
        setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      }
    } catch {
      /* ignore */
    }
    goToNotificationLink(n.link, navigate);
  };

  const markAll = async () => {
    if (!userId) return;
    try {
      await hubMarkAllNotificationsRead(userId);
      setList((prev) => prev.map((x) => ({ ...x, read: true })));
    } catch {
      /* ignore */
    }
  };

  if (!userId) return null;

  const unreadCount = list.filter((n) => !n.read).length;

  return (
    <div className="hub-notifications">
      <header className="hub-notifications__head">
        <div>
          <h1 className="hub-notifications__title">Notificações</h1>
          <p className="hub-notifications__sub">
            Avisos operacionais da sua unidade, conforme as áreas em que você atua.
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="hub-notifications__mark-all" onClick={() => void markAll()}>
            <CheckCheck size={16} aria-hidden />
            Marcar todas como lidas
          </button>
        )}
      </header>

      {loading && list.length === 0 ? (
        <p className="hub-notifications__state">Carregando…</p>
      ) : list.length === 0 ? (
        <div className="hub-notifications__empty">
          <Bell size={40} strokeWidth={1} aria-hidden />
          <p>{failed ? 'Não foi possível carregar as notificações.' : 'Nenhuma notificação por aqui.'}</p>
        </div>
      ) : (
        <ul className="hub-notifications__list">
          {list.map((n) => {
            const { Icon, label, color, tint } = hubNotificationVisual(n.type);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={`hub-notifications__item${n.read ? '' : ' hub-notifications__item--unread'}`}
                  onClick={() => void onItemClick(n)}
                >
                  <span className="hub-notifications__icon" style={{ background: tint, color }} aria-hidden>
                    <Icon size={18} strokeWidth={1.9} />
                  </span>
                  <span className="hub-notifications__body">
                    <span className="hub-notifications__item-top">
                      <span className="hub-notifications__item-title">{n.title}</span>
                      {!n.read && <span className="hub-notifications__dot" />}
                    </span>
                    <span className="hub-notifications__msg">{n.message}</span>
                    <span className="hub-notifications__meta">
                      <span className="hub-notifications__kind" style={{ color }}>
                        {label}
                      </span>
                      <span className="hub-notifications__time">{notificationRelativeTime(n.created_at)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <div className="hub-notifications__more">
          <button
            type="button"
            className="hub-notifications__more-btn"
            disabled={loading}
            onClick={() => void loadPage(page + 1)}
          >
            {loading ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      )}
    </div>
  );
};

export default HubNotificationsPage;
