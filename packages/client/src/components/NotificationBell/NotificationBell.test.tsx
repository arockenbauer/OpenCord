import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NotificationBell } from './NotificationBell';
import { useNotificationStore } from '../../stores/notificationStore';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  api: mocks.api,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'notifications.unread_count') return `${params?.count ?? 0} unread`;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  it('shows the unread count from the notification store', () => {
    useNotificationStore.setState({ notifications: [], unreadCount: 5 });

    render(<NotificationBell />);

    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('loads notifications when opened and marks all as read', async () => {
    mocks.api.mockResolvedValueOnce({
      notifications: [
        { id: 'notif-1', type: 'ANNOUNCEMENT', title: 'Maintenance', body: 'Tonight', read: false, created_at: new Date().toISOString() },
      ],
    });
    mocks.api.mockResolvedValueOnce({});

    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    expect(await screen.findByTestId('notification-panel')).toBeVisible();
    expect(await screen.findByText('Maintenance')).toBeInTheDocument();
    expect(useNotificationStore.getState().unreadCount).toBe(1);

    fireEvent.click(screen.getByText('notifications.mark_all_read'));

    await waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(0));
    expect(mocks.api).toHaveBeenCalledWith('/api/notifications/mark-read', { method: 'POST' });
  });
});
