import { create } from 'zustand';

interface NotificationState {
  notifications: any[];
  unreadCount: number;
  setNotifications: (notifications: any[]) => void;
  addNotification: (notification: any) => void;
  setUnreadCount: (count: number) => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter((notification) => !notification.read).length,
  }),
  addNotification: (notification) => set((state) => {
    const notifications = [notification, ...state.notifications.filter((item) => item.id !== notification.id)];
    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
    };
  }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  markRead: (notificationId) => set((state) => {
    const notifications = state.notifications.map((notification) =>
      notification.id === notificationId ? { ...notification, read: true } : notification,
    );
    return {
      notifications,
      unreadCount: notifications.filter((notification) => !notification.read).length,
    };
  }),
  markAllRead: () => set((state) => ({
    notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
    unreadCount: 0,
  })),
}));
