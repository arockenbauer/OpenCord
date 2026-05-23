import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('../services/api', () => ({ api: mocks.api }));

import { useNotificationStore } from './notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
    });
  });

  it('fetches notifications', async () => {
    mocks.api.mockResolvedValue([
      { id: 'notif-1', type: 'friend_request', read: false },
    ]);
    await useNotificationStore.getState().fetchNotifications();
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('marks notification as read', () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'notif-1', type: 'friend_request', read: false },
      ],
    });
    useNotificationStore.getState().markAsRead('notif-1');
    expect(useNotificationStore.getState().notifications[0].read).toBe(true);
  });

  it('clears all notifications', () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'notif-1', type: 'friend_request' },
      ],
    });
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('calculates unread count', () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'notif-1', read: false },
        { id: 'notif-2', read: true },
        { id: 'notif-3', read: false },
      ],
    });
    useNotificationStore.getState().updateUnreadCount();
    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });
});
