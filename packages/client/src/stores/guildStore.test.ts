import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('../services/api', () => ({ api: mocks.api }));

import { useGuildStore } from './guildStore';

describe('guildStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGuildStore.setState({
      guilds: [],
      channels: {},
      roles: {},
      members: {},
      currentGuildId: null,
      currentChannelId: null,
    });
  });

  it('fetches guilds', async () => {
    mocks.api.mockResolvedValue([
      { id: 'guild-1', name: 'Test Guild' },
    ]);
    await useGuildStore.getState().fetchGuilds();
    expect(useGuildStore.getState().guilds).toHaveLength(1);
  });

  it('sets current guild', () => {
    useGuildStore.getState().setCurrentGuild('guild-1');
    expect(useGuildStore.getState().currentGuildId).toBe('guild-1');
  });

  it('sets current channel', () => {
    useGuildStore.getState().setCurrentChannel('channel-1');
    expect(useGuildStore.getState().currentChannelId).toBe('channel-1');
  });

  it('adds a channel to a guild', () => {
    useGuildStore.getState().addChannel('guild-1', { id: 'chan-1', name: 'general' });
    expect(useGuildStore.getState().channels['guild-1']).toHaveLength(1);
  });

  it('removes a channel from a guild', () => {
    useGuildStore.getState().addChannel('guild-1', { id: 'chan-1', name: 'general' });
    useGuildStore.getState().removeChannel('guild-1', 'chan-1');
    expect(useGuildStore.getState().channels['guild-1']).toHaveLength(0);
  });
});
