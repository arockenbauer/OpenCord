import { beforeEach, describe, expect, it } from 'vitest';
import { useUnreadStore } from './unreadStore';

function resetUnreadStore() {
  useUnreadStore.setState({ channelUnreads: {} });
}

describe('unreadStore', () => {
  beforeEach(() => {
    resetUnreadStore();
  });

  it('increments mentions and unread flags per channel', () => {
    useUnreadStore.getState().incrementUnread('channel-1', true);
    useUnreadStore.getState().incrementUnread('channel-1', false);

    expect(useUnreadStore.getState().channelUnreads['channel-1']).toEqual({
      mentionCount: 1,
      hasUnread: true,
    });
  });

  it('marks a channel as read and can initialize state from read states', () => {
    useUnreadStore.getState().initFromReadStates([
      { channel_id: 'channel-1', mention_count: 2, last_read_message_id: 'msg-1' },
    ]);
    useUnreadStore.getState().markRead('channel-1');

    expect(useUnreadStore.getState().channelUnreads['channel-1']).toEqual({
      mentionCount: 0,
      hasUnread: false,
    });
  });
});
