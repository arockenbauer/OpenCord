import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { api } from '../../services/api';
import { useNotificationStore } from '../../stores/notificationStore';
import { useGuildStore } from '../../stores/guildStore';
import styles from './NotificationBell.module.css';

function parseNotification(notification: any, t: any) {
  let parsed = notification.data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }

  let title = notification.title || parsed?.title;
  let body = notification.body || parsed?.body;

  if (!title) {
    const type = notification.type?.toUpperCase();
    if (type === 'FRIEND_REQUEST' && parsed.sender) {
      title = t('notifications.types.FRIEND_REQUEST', { user: parsed.sender.username });
    } else if (type === 'GUILD_INVITE' && parsed.guild) {
      title = t('notifications.types.GUILD_INVITE', { user: parsed.inviter?.username, guild: parsed.guild.name });
    } else if (type === 'MESSAGE_MENTION' || type === 'message_mention') {
      title = t('notifications.types.MENTION', { user: parsed.sender?.username, channel: parsed.channel_name });
    } else if (type === 'ANNOUNCEMENT' || type === 'announcement') {
      title = t('notifications.types.ADMIN_ANNOUNCEMENT', { title: parsed.title });
    } else {
      title = t('notifications.title');
    }
  }

  if (!body && parsed.body) {
    body = parsed.body;
  }

  return {
    ...notification,
    parsedData: parsed || {},
    title,
    body,
  };
}

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const selectChannel = useGuildStore((s) => s.selectChannel);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const locale = i18n.language === 'fr' ? fr : enUS;

  const parsedNotifications = useMemo(
    () => notifications.map((n) => parseNotification(n, t)),
    [notifications, t]
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ notifications: any[] }>('/api/notifications');
      setNotifications(data.notifications || []);
    } catch (err: any) {
      setError(t('notifications.loading'));
    }
    setLoading(false);
  };

  const toggleOpen = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      await loadNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    await api('/api/notifications/mark-read', { method: 'POST' });
    markAllRead();
  };

  const handleOpenNotification = async (notification: any) => {
    if (!notification.read) {
      await api(`/api/notifications/${notification.id}/read`, { method: 'PATCH' });
      markRead(notification.id);
    }

    if (notification.guild_id) selectGuild(notification.guild_id);
    else if (!notification.guild_id && notification.channel_id) selectGuild(null);
    if (notification.channel_id) selectChannel(notification.channel_id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        onClick={() => void toggleOpen()}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        title={t('notifications.title')}
        aria-label={t('notifications.title')}
        aria-expanded={open}
        data-testid="notification-bell"
      >
        <Inbox size={18} strokeWidth={2.35} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className={styles.unreadBadge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-panel"
          style={{
            position: 'absolute',
            top: 56,
            right: 0,
            width: 360,
            maxHeight: '70vh',
            overflow: 'hidden',
            borderRadius: 16,
            background: 'rgba(32, 34, 37, 0.96)',
            backdropFilter: 'blur(18px)',
            boxShadow: 'var(--shadow-high)',
            border: '1px solid rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{t('notifications.title')}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {t('notifications.unread_count', { count: unreadCount })}
              </div>
            </div>
            <button onClick={() => void handleMarkAllRead()} style={{ color: 'var(--text-link)', fontSize: 12, fontWeight: 600 }}>
              {t('notifications.mark_all_read')}
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <div style={{ color: 'var(--text-danger)', fontSize: 13 }}>{error}</div>}
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('notifications.loading')}</div>
            ) : parsedNotifications.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('notifications.empty')}</div>
            ) : (
              parsedNotifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => void handleOpenNotification(notification)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 12,
                    background: notification.read ? 'var(--bg-primary)' : 'rgba(88,101,242,0.18)',
                    border: notification.read ? '1px solid var(--border)' : '1px solid rgba(88,101,242,0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{notification.title}</strong>
                    {!notification.read && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--bg-accent)' }} />}
                  </div>
                  {notification.body && <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.4 }}>{notification.body}</div>}
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale })}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
