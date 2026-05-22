import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from './notificationStore';

function resetNotificationStore() {
  useNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
  });
}

describe('notificationStore', () => {
  beforeEach(() => {
    resetNotificationStore();
  });

  it('sets notifications and derives the unread count', () => {
    useNotificationStore.getState().setNotifications([
      { id: 'n1', read: false },
      { id: 'n2', read: true },
    ]);

    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('deduplicates notifications and updates read state', () => {
    useNotificationStore.getState().addNotification({ id: 'n1', read: false });
    useNotificationStore.getState().addNotification({ id: 'n1', read: false, title: 'updated' });
    useNotificationStore.getState().markRead('n1');

    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ id: 'n1', read: true, title: 'updated' }),
    ]);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('marks all notifications as read', () => {
    useNotificationStore.getState().setNotifications([
      { id: 'n1', read: false },
      { id: 'n2', read: false },
    ]);

    useNotificationStore.getState().markAllRead();

    expect(useNotificationStore.getState().unreadCount).toBe(0);
    expect(useNotificationStore.getState().notifications.every((notification) => notification.read)).toBe(true);
  });
});
