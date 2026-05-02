import { create } from 'zustand';
import { api } from '../services/api';
import { useAuthStore } from './authStore';

interface Author {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
}

interface Message {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: Author;
  content: string | null;
  type: number;
  flags: number;
  edited_at: string | null;
  tts: boolean;
  mention_everyone: boolean;
  pinned: boolean;
  reference_id: string | null;
  attachments: any[];
  embeds: any[];
  reactions: any[];
  created_at: string;
  [key: string]: any;
}

interface MessageState {
  messages: Map<string, Message[]>;
  isLoading: boolean;
  hasMore: Map<string, boolean>;
  typingUsers: Map<string, Set<string>>;
  pendingMessages: Map<string, Message>;
  fetchMessages: (channelId: string, before?: string) => Promise<void>;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, message: Partial<Message> & { id: string }) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  bulkRemoveMessages: (channelId: string, ids: string[]) => void;
  getMessagesForChannel: (channelId: string) => Message[];
  sendMessage: (channelId: string, content: string, files?: File[], replyTo?: string) => void;
  retryMessage: (channelId: string, messageId: string) => void;
  editMessage: (channelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
  addReaction: (channelId: string, messageId: string, emoji: string) => void;
  removeReaction: (channelId: string, messageId: string, emoji: string, userId: string) => void;
  setTyping: (channelId: string, userId: string) => void;
  clearTyping: (channelId: string, userId: string) => void;
  clearMessages: (channelId: string) => void;
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const dateDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.id.localeCompare(b.id);
  });
}

function dedupeMessages(messages: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of messages) {
    byId.set(message.id, message);
  }
  return sortMessages(Array.from(byId.values()));
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: new Map(),
  isLoading: false,
  hasMore: new Map(),
  typingUsers: new Map(),
  pendingMessages: new Map(),

  fetchMessages: async (channelId, before) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (before) params.set('before', before);

      const data = await api<{ messages: Message[] }>(`/api/channels/${channelId}/messages?${params}`);
      const incomingMessages = sortMessages(data.messages || []);

      set((state) => {
        const messages = new Map(state.messages);
        const existing = messages.get(channelId) || [];
        const merged = before ? dedupeMessages([...incomingMessages, ...existing]) : incomingMessages;
        messages.set(channelId, merged);

        const hasMore = new Map(state.hasMore);
        hasMore.set(channelId, incomingMessages.length === 50);

        return { messages, hasMore, isLoading: false };
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addMessage: (channelId, message) => set((state) => {
    // If a confirmed message arrives, check if we have a matching pending message
    // from the same author in the same channel, and remove it
    if (!message.pending) {
      const pendingToRemove = Array.from(state.pendingMessages.values()).find(
        (pm) => pm.channel_id === channelId &&
               pm.author.id === message.author.id
      );

      if (pendingToRemove) {
        const pendingMessages = new Map(state.pendingMessages);
        pendingMessages.delete(pendingToRemove.id);
        // Add the confirmed message (don't re-add pending, it's now confirmed)
        const messages = new Map(state.messages);
        const existing = messages.get(channelId) || [];
        messages.set(channelId, dedupeMessages([...existing, message as Message]));
        return { messages, pendingMessages };
      }
    }

    const messages = new Map(state.messages);
    const existing = messages.get(channelId) || [];
    messages.set(channelId, dedupeMessages([...existing, message as Message]));
    return { messages };
  }),

  getMessagesForChannel: (channelId) => {
    const state = get();
    const confirmed = state.messages.get(channelId) || [];
    const pending = Array.from(state.pendingMessages.values()).filter(
      (pm) => pm.channel_id === channelId
    );
    return dedupeMessages([...confirmed, ...pending]);
  },

  updateMessage: (channelId, message) => set((state) => {
    // If this is a pending message being confirmed, remove the pending entry
    const pendingMsg = state.pendingMessages.get(message.id);
    if (pendingMsg) {
      const messages = new Map(state.messages);
      const existing = messages.get(channelId) || [];
      // Remove pending message, add real message
      const filtered = existing.filter((m) => m.id !== pendingMsg.id);
      messages.set(channelId, dedupeMessages([...filtered, message as Message]));
      const pendingMessages = new Map(state.pendingMessages);
      pendingMessages.delete(message.id);
      return { messages, pendingMessages };
    }
    const messages = new Map(state.messages);
    const existing = messages.get(channelId) || [];
    messages.set(channelId, existing.map((m) => m.id === message.id ? { ...m, ...message } as Message : m));
    return { messages };
  }),

  removeMessage: (channelId, messageId) => set((state) => {
    const messages = new Map(state.messages);
    const existing = messages.get(channelId) || [];
    messages.set(channelId, existing.filter((m) => m.id !== messageId));
    const pendingMessages = new Map(state.pendingMessages);
    pendingMessages.delete(messageId);
    return { messages, pendingMessages };
  }),

  bulkRemoveMessages: (channelId, ids) => set((state) => {
    const messages = new Map(state.messages);
    const existing = messages.get(channelId) || [];
    const idSet = new Set(ids);
    messages.set(channelId, existing.filter((m) => !idSet.has(m.id)));
    return { messages };
  }),

  sendMessage: (channelId, content, files, replyTo) => {
    const tempId = `pending-${Date.now()}-${Math.random()}`;
    const user = useAuthStore.getState().user;

    if (user) {
      const pendingMsg: Message = {
        id: tempId,
        channel_id: channelId,
        author: {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
        },
        content: content || null,
        type: 0,
        flags: 0,
        edited_at: null,
        tts: false,
        mention_everyone: false,
        pinned: false,
        reference_id: replyTo || null,
        attachments: files ? files.map((f, i) => ({
          id: `temp-${i}`,
          filename: f.name,
          size: f.size,
          url: URL.createObjectURL(f),
          content_type: f.type,
        })) : [],
        embeds: [],
        reactions: [],
        created_at: new Date().toISOString(),
        pending: true,
        failed: false,
        error: null,
        _files: files,
      };

      // Only track pending message, don't add to displayed messages yet
      set((state) => {
        const pendingMessages = new Map(state.pendingMessages);
        pendingMessages.set(tempId, pendingMsg);
        return { pendingMessages };
      });
    }

    // Fire API call in background, don't await
    (async () => {
      try {
        if (files && files.length > 0) {
          const formData = new FormData();
          const payload: Record<string, unknown> = {};
          if (content) payload.content = content;
          if (replyTo) payload.message_reference = { message_id: replyTo };
          formData.append('payload_json', JSON.stringify(payload));
          for (const file of files) {
            formData.append('files', file);
          }
          await api(`/api/channels/${channelId}/messages`, { method: 'POST', body: formData, headers: {} });
        } else {
          const body: Record<string, unknown> = {};
          if (content) body.content = content;
          if (replyTo) body.message_reference = { message_id: replyTo };
          await api(`/api/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(body) });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Impossible d’envoyer le message.';
        set((state) => {
          const pendingMessages = new Map(state.pendingMessages);
          const current = pendingMessages.get(tempId);
          if (current) {
            pendingMessages.set(tempId, { ...current, failed: true, error: errorMessage });
          }
          return { pendingMessages };
        });
      }
    })();
  },

  retryMessage: (channelId, messageId) => {
    const pending = get().pendingMessages.get(messageId) as (Message & { _files?: File[]; error?: string | null }) | undefined;
    if (!pending) return;
    set((state) => {
      const pendingMessages = new Map(state.pendingMessages);
      pendingMessages.set(messageId, { ...pending, failed: false, error: null });
      return { pendingMessages };
    });
    // Fire the API call and wait for it to settle before removing the pending entry.
    // This ensures the pending message is still available for another retry if this one fails.
    (async () => {
      try {
        if (pending._files && pending._files.length > 0) {
          const formData = new FormData();
          const payload: Record<string, unknown> = {};
          if (pending.content) payload.content = pending.content;
          if (pending.reference_id) payload.message_reference = { message_id: pending.reference_id };
          formData.append('payload_json', JSON.stringify(payload));
          for (const file of pending._files) {
            formData.append('files', file);
          }
          await api(`/api/channels/${channelId}/messages`, { method: 'POST', body: formData, headers: {} });
        } else {
          const body: Record<string, unknown> = {};
          if (pending.content) body.content = pending.content;
          if (pending.reference_id) body.message_reference = { message_id: pending.reference_id };
          await api(`/api/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(body) });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Impossible d\u2019envoyer le message.';
        set((state) => {
          const pendingMessages = new Map(state.pendingMessages);
          const current = pendingMessages.get(messageId);
          if (current) {
            pendingMessages.set(messageId, { ...current, failed: true, error: errorMessage });
          }
          return { pendingMessages };
        });
        return;
      }
      // Only remove after success
      set((state) => {
        const pendingMessages = new Map(state.pendingMessages);
        pendingMessages.delete(messageId);
        return { pendingMessages };
      });
    })();
  },

  editMessage: async (channelId, messageId, content) => {
    await api(`/api/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  },

  deleteMessage: async (channelId, messageId) => {
    await api(`/api/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
  },

  addReaction: (channelId, messageId, emoji) => set((state) => {
    const messages = new Map(state.messages);
    const existing = messages.get(channelId) || [];
    messages.set(channelId, existing.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = [...(m.reactions || [])];
      const idx = reactions.findIndex((r: any) => r.emoji_name === emoji);
      if (idx >= 0) {
        reactions[idx] = { ...reactions[idx], count: (reactions[idx].count || 1) + 1 };
      } else {
        reactions.push({ emoji_name: emoji, emoji_id: null, count: 1 });
      }
      return { ...m, reactions };
    }));
    return { messages };
  }),

  removeReaction: (channelId, messageId, emoji, _userId) => set((state) => {
    const messages = new Map(state.messages);
    const existing = messages.get(channelId) || [];
    messages.set(channelId, existing.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = (m.reactions || []).map((r: any) => {
        if (r.emoji_name === emoji) {
          return { ...r, count: Math.max(0, (r.count || 1) - 1) };
        }
        return r;
      }).filter((r: any) => r.count > 0);
      return { ...m, reactions };
    }));
    return { messages };
  }),

  setTyping: (channelId, userId) => set((state) => {
    const typingUsers = new Map(state.typingUsers);
    const channelTyping = new Set(typingUsers.get(channelId) || []);
    channelTyping.add(userId);
    typingUsers.set(channelId, channelTyping);

    setTimeout(() => {
      const current = get().typingUsers.get(channelId);
      if (current?.has(userId)) {
        get().clearTyping(channelId, userId);
      }
    }, 8000);

    return { typingUsers };
  }),

  clearTyping: (channelId, userId) => set((state) => {
    const typingUsers = new Map(state.typingUsers);
    const channelTyping = new Set(typingUsers.get(channelId) || []);
    channelTyping.delete(userId);
    typingUsers.set(channelId, channelTyping);
    return { typingUsers };
  }),

  clearMessages: (channelId) => set((state) => {
    const messages = new Map(state.messages);
    messages.delete(channelId);
    return { messages };
  }),
}));
