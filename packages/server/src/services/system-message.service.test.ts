import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayEvents } from '@opencord/shared';

const mocks = vi.hoisted(() => {
  const io = {
    to: vi.fn(),
    emit: vi.fn(),
  };

  io.to.mockReturnValue(io);

  return {
    io,
    getIO: vi.fn(() => io),
    generateSnowflake: vi.fn(() => 'message-1'),
  };
});

vi.mock('../gateway/index.js', () => ({
  getIO: mocks.getIO,
}));

vi.mock('../utils/snowflake.js', () => ({
  generateSnowflake: mocks.generateSnowflake,
}));

import { createAndDispatchSystemMessage } from './system-message.service.js';

describe('system-message.service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    vi.clearAllMocks();
    mocks.io.to.mockReturnValue(mocks.io);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches channel-scoped system messages when no recipient is provided', async () => {
    const message = await createAndDispatchSystemMessage({
      channelId: 'channel-1',
      content: 'Welcome!',
      guildId: 'guild-1',
    });

    expect(message).toMatchObject({
      id: 'message-1',
      channel_id: 'channel-1',
      author_id: '0',
      content: 'Welcome!',
      guild_id: 'guild-1',
      flags: 64,
    });
    expect(message.created_at).toBe('2026-05-20T12:00:00.000Z');
    expect(mocks.io.to).toHaveBeenCalledWith('channel:channel-1');
    expect(mocks.io.emit).toHaveBeenCalledWith(GatewayEvents.MESSAGE_CREATE, { message });
  });

  it('dispatches direct user system messages when a recipient is provided', async () => {
    const message = await createAndDispatchSystemMessage({
      channelId: 'channel-1',
      content: 'Private notice',
      recipientUserId: 'user-1',
    });

    expect(mocks.io.to).toHaveBeenCalledWith('user:user-1');
    expect(mocks.io.emit).toHaveBeenCalledWith(GatewayEvents.MESSAGE_CREATE, { message });
  });
});
