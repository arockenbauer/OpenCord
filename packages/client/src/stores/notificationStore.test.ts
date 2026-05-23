import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from './notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  it('sets notifications and derives unread count from read state', () => {
    useNotificationStore.getState().setNotifications([
      { id: 'notif-1', read: false },
      { id: 'notif-2', read: true },
      { id: 'notif-3', read: false },
    ]);

    expect(useNotificationStore.getState().notifications).toHaveLength(3);
    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });

  it('upserts incoming notifications and recalculates unread count', () => {
    useNotificationStore.getState().addNotification({ id: 'notif-1', title: 'Old', read: false });
    useNotificationStore.getState().addNotification({ id: 'notif-1', title: 'Updated', read: true });

    expect(useNotificationStore.getState().notifications).toEqual([
      { id: 'notif-1', title: 'Updated', read: true },
    ]);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('marks one or all notifications as read', () => {
    useNotificationStore.getState().setNotifications([
      { id: 'notif-1', read: false },
      { id: 'notif-2', read: false },
    ]);

    useNotificationStore.getState().markRead('notif-1');
    expect(useNotificationStore.getState().unreadCount).toBe(1);

    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().notifications.every((item) => item.read)).toBe(true);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});
