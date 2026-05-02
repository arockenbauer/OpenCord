import { create } from 'zustand';

interface UnreadState {
  channelUnreads: Record<string, { mentionCount: number; hasUnread: boolean }>;
  markRead: (channelId: string) => void;
  incrementUnread: (channelId: string, hasMention: boolean) => void;
  initFromReadStates: (readStates: Array<{ channel_id: string; mention_count: number; last_read_message_id: string | null }>) => void;
}

export const useUnreadStore = create<UnreadState>((set) => ({
  channelUnreads: {},

  markRead: (channelId) => set((state) => ({
    channelUnreads: { ...state.channelUnreads, [channelId]: { mentionCount: 0, hasUnread: false } },
  })),

  incrementUnread: (channelId, hasMention) => set((state) => {
    const current = state.channelUnreads[channelId] || { mentionCount: 0, hasUnread: false };
    return {
      channelUnreads: {
        ...state.channelUnreads,
        [channelId]: {
          mentionCount: hasMention ? current.mentionCount + 1 : current.mentionCount,
          hasUnread: true,
        },
      },
    };
  }),

  initFromReadStates: (readStates) => set(() => {
    const unreads: Record<string, { mentionCount: number; hasUnread: boolean }> = {};
    for (const rs of readStates) {
      unreads[rs.channel_id] = { mentionCount: rs.mention_count || 0, hasUnread: false };
    }
    return { channelUnreads: unreads };
  }),
}));
