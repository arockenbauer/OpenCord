import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../services/api';
import { useNotificationStore } from '../../stores/notificationStore';
import { useGuildStore } from '../../stores/guildStore';

function parseNotification(notification: any) {
  let parsed = notification.data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  return {
    ...notification,
    parsedData: parsed || {},
    title: notification.title || parsed?.title || getNotificationTitle(notification.type),
    body: notification.body || parsed?.body || getNotificationBody(notification.type, parsed || {}),
  };
}

function getNotificationTitle(type: string) {
  if (type === 'friend_request') return 'Nouvelle demande d’ami';
  if (type === 'guild_invite') return 'Invitation de serveur';
  if (type === 'message_mention') return 'Nouvelle mention';
  if (type === 'announcement') return 'Nouvelle annonce';
  return 'Notification';
}

function getNotificationBody(type: string, data: any) {
  if (type === 'friend_request' && data.sender) return `${data.sender.username} vous a envoyé une demande d’ami.`;
  if (type === 'guild_invite' && data.guild) return `Invitation vers ${data.guild.name}.`;
  if (type === 'announcement' && data.announcement?.title) return data.announcement.title;
  return '';
}

export function NotificationBell() {
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

  const parsedNotifications = useMemo(() => notifications.map(parseNotification), [notifications]);

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
      setError(err.message || 'Impossible de charger les notifications.');
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
    <div ref={containerRef} style={{ position: 'fixed', top: 18, right: 24, zIndex: 1300 }}>
      <button
        onClick={() => void toggleOpen()}
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 14,
          background: 'rgba(32, 34, 37, 0.92)',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-high)',
          backdropFilter: 'blur(16px)',
        }}
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              padding: '0 6px',
              borderRadius: 999,
              background: 'var(--danger)',
              color: 'white',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
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
              <div style={{ fontWeight: 700, fontSize: 16 }}>Notifications</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</div>
            </div>
            <button onClick={() => void handleMarkAllRead()} style={{ color: 'var(--text-link)', fontSize: 12, fontWeight: 600 }}>
              Tout marquer lu
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <div style={{ color: 'var(--text-danger)', fontSize: 13 }}>{error}</div>}
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement…</div>
            ) : parsedNotifications.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Aucune notification pour le moment.</div>
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
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: fr })}
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
