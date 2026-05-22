import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('../services/api', () => ({
  api: mocks.api,
}));

import { useGuildStore, type DMChannel } from './guildStore';

const baseGuild = {
  id: 'guild-1',
  name: 'Smoke Guild',
  icon: null,
  banner: null,
  owner_id: 'owner-1',
  channels: [
    {
      id: 'channel-1',
      guild_id: 'guild-1',
      name: 'general',
      type: 0,
      position: 0,
      topic: null,
      nsfw: false,
      parent_id: null,
      last_message_id: null,
      slowmode_delay: 0,
    },
  ],
  roles: [],
  members: [],
  emojis: [],
  premium_tier: 0,
};

const dmChannel: DMChannel = {
  id: 'dm-1',
  type: 1,
  name: null,
  recipients: [{ id: 'friend-1', username: 'Amy', discriminator: '0001', avatar: null, status: 'online' }],
  last_message_id: null,
  created_at: '2026-05-20T12:00:00.000Z',
};

function resetGuildStore() {
  useGuildStore.setState({
    guilds: new Map(),
    dmChannels: [],
    selectedGuildId: null,
    selectedChannelId: null,
    voiceStates: new Map(),
  });
}

describe('guildStore', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    resetGuildStore();
  });

  it('sets guilds and auto-selects the first text channel when selecting a guild', () => {
    useGuildStore.getState().setGuilds([baseGuild]);
    useGuildStore.getState().selectGuild('guild-1');

    expect(useGuildStore.getState().selectedGuildId).toBe('guild-1');
    expect(useGuildStore.getState().selectedChannelId).toBe('channel-1');
    expect(useGuildStore.getState().getSelectedGuild()?.name).toBe('Smoke Guild');
  });

  it('falls back to the first DM when deselecting or removing a guild', () => {
    useGuildStore.getState().setGuilds([baseGuild]);
    useGuildStore.getState().setDMChannels([dmChannel]);
    useGuildStore.getState().selectGuild('guild-1');

    useGuildStore.getState().removeGuild('guild-1');

    expect(useGuildStore.getState().selectedGuildId).toBeNull();
    expect(useGuildStore.getState().selectedChannelId).toBe('dm-1');
  });

  it('adds DM channels without duplicating them and can select DM mode', () => {
    useGuildStore.getState().addDMChannel(dmChannel);
    useGuildStore.getState().addDMChannel({ ...dmChannel, last_message_id: 'msg-2' });
    useGuildStore.getState().selectGuild(null);

    expect(useGuildStore.getState().dmChannels).toHaveLength(1);
    expect(useGuildStore.getState().selectedGuildId).toBeNull();
    expect(useGuildStore.getState().selectedChannelId).toBe('dm-1');
  });

  it('fetches and stores a guild from the API', async () => {
    mocks.api.mockResolvedValue(baseGuild);

    await expect(useGuildStore.getState().fetchGuild('guild-1')).resolves.toEqual(baseGuild);
    expect(useGuildStore.getState().guilds.get('guild-1')?.name).toBe('Smoke Guild');
  });

  it('updates voice states by join, move and disconnect', () => {
    useGuildStore.getState().updateVoiceState('guild-1', 'user-1', 'channel-1');
    useGuildStore.getState().updateVoiceState('guild-1', 'user-1', 'channel-2');
    useGuildStore.getState().updateVoiceState('guild-1', 'user-1', null);

    expect(useGuildStore.getState().voiceStates.get('guild-1')).toEqual([]);
  });
});
