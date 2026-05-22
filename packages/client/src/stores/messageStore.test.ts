import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('../services/api', () => ({
  api: mocks.api,
}));

import { useMessageStore } from './messageStore';

const baseMessage = {
  id: 'message-1',
  channel_id: 'channel-1',
  author: {
    id: 'user-1',
    username: 'johnny',
    discriminator: '1234',
    avatar: null,
  },
  content: 'Hello',
  type: 0,
  flags: 0,
  edited_at: null,
  tts: false,
  mention_everyone: false,
  pinned: false,
  reference_id: null,
  attachments: [],
  embeds: [],
  reactions: [],
  created_at: '2026-05-20T12:00:01.000Z',
};

function resetMessageStore() {
  useMessageStore.setState({
    messages: new Map(),
    isLoading: false,
    hasMore: new Map(),
    typingUsers: new Map(),
    pendingMessages: new Map(),
  });
}

describe('messageStore', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    resetMessageStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches messages, sorts them and sets the pagination flag', async () => {
    mocks.api.mockResolvedValue({
      messages: [
        { ...baseMessage, id: 'b', created_at: '2026-05-20T12:00:02.000Z' },
        { ...baseMessage, id: 'a', created_at: '2026-05-20T12:00:01.000Z' },
      ],
    });

    await useMessageStore.getState().fetchMessages('channel-1');

    expect(useMessageStore.getState().messages.get('channel-1')?.map((message) => message.id)).toEqual(['a', 'b']);
    expect(useMessageStore.getState().hasMore.get('channel-1')).toBe(false);
  });

  it('replaces a matching pending message when the confirmed message arrives', () => {
    useMessageStore.setState({
      pendingMessages: new Map([
        ['pending-1', { ...baseMessage, id: 'pending-1', pending: true }],
      ]),
    });

    useMessageStore.getState().addMessage('channel-1', { ...baseMessage, id: 'server-1' } as any);

    expect(useMessageStore.getState().pendingMessages.size).toBe(0);
    expect(useMessageStore.getState().messages.get('channel-1')?.map((message) => message.id)).toEqual(['server-1']);
  });

  it('adds and removes reactions without leaving zero-count entries', () => {
    useMessageStore.setState({
      messages: new Map([['channel-1', [{ ...baseMessage }]]]),
    });

    useMessageStore.getState().addReaction('channel-1', 'message-1', ':wave:');
    useMessageStore.getState().addReaction('channel-1', 'message-1', ':wave:');
    useMessageStore.getState().removeReaction('channel-1', 'message-1', ':wave:', 'user-1');
    useMessageStore.getState().removeReaction('channel-1', 'message-1', ':wave:', 'user-1');

    expect(useMessageStore.getState().messages.get('channel-1')?.[0]?.reactions).toEqual([]);
  });

  it('tracks typing users and clears them after the timeout', () => {
    vi.useFakeTimers();

    useMessageStore.getState().setTyping('channel-1', 'user-1');
    expect(Array.from(useMessageStore.getState().typingUsers.get('channel-1') || [])).toEqual(['user-1']);

    vi.advanceTimersByTime(8000);

    expect(Array.from(useMessageStore.getState().typingUsers.get('channel-1') || [])).toEqual([]);
  });
});
