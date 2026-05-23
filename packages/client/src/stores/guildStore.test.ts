import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('../services/api', () => ({ api: mocks.api }));

import { useGuildStore } from './guildStore';

const textChannel = { id: 'channel-1', guild_id: 'guild-1', name: 'general', type: 0, position: 0, topic: null, nsfw: false, parent_id: null, last_message_id: null, slowmode_delay: 0 };
const guild = {
  id: 'guild-1',
  name: 'Test Guild',
  icon: null,
  banner: null,
  owner_id: 'user-1',
  channels: [textChannel],
  roles: [],
  members: [],
  emojis: [],
  premium_tier: 0,
};

describe('guildStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGuildStore.setState({
      guilds: new Map(),
      dmChannels: [],
      selectedGuildId: null,
      selectedChannelId: null,
      voiceStates: new Map(),
    });
  });

  it('sets guilds and selects the first text channel when selecting a guild', () => {
    useGuildStore.getState().setGuilds([guild as any]);
    useGuildStore.getState().selectGuild('guild-1');

    expect(useGuildStore.getState().selectedGuildId).toBe('guild-1');
    expect(useGuildStore.getState().selectedChannelId).toBe('channel-1');
    expect(useGuildStore.getState().getSelectedChannel()?.name).toBe('general');
  });

  it('adds, updates and removes channels inside a guild', () => {
    useGuildStore.getState().setGuilds([{ ...guild, channels: [] } as any]);
    useGuildStore.getState().addChannel('guild-1', textChannel as any);
    expect(useGuildStore.getState().guilds.get('guild-1')?.channels).toHaveLength(1);

    useGuildStore.getState().updateChannel('guild-1', { id: 'channel-1', name: 'announcements' } as any);
    expect(useGuildStore.getState().guilds.get('guild-1')?.channels[0]?.name).toBe('announcements');

    useGuildStore.getState().removeChannel('guild-1', 'channel-1');
    expect(useGuildStore.getState().guilds.get('guild-1')?.channels).toHaveLength(0);
  });

  it('fetches a guild through the API and stores it by id', async () => {
    mocks.api.mockResolvedValue(guild);

    await expect(useGuildStore.getState().fetchGuild('guild-1')).resolves.toEqual(guild);
    expect(useGuildStore.getState().guilds.get('guild-1')?.name).toBe('Test Guild');
  });
});
