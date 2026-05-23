import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayEvents } from '@opencord/shared';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
}));

vi.mock('../services/socket', () => ({
  getSocket: () => ({ emit: mocks.emit }),
}));

vi.mock('mediasoup-client', () => ({
  Device: class {},
}));

import { useVoiceStore } from './voiceStore';

describe('voiceStore', () => {
  beforeEach(() => {
    mocks.emit.mockReset();
    useVoiceStore.getState().reset();
  });

  it('joins voice by updating local state and emitting a gateway voice state update', () => {
    useVoiceStore.getState().joinVoiceChannel('guild-1', 'channel-1');

    expect(useVoiceStore.getState().guildId).toBe('guild-1');
    expect(useVoiceStore.getState().channelId).toBe('channel-1');
    expect(useVoiceStore.getState().isConnecting).toBe(true);
    expect(mocks.emit).toHaveBeenCalledWith(GatewayEvents.VOICE_STATE_UPDATE, {
      guild_id: 'guild-1',
      channel_id: 'channel-1',
      self_mute: false,
      self_deaf: false,
    });
  });

  it('emits mute and deafen changes for the active voice channel', () => {
    useVoiceStore.setState({ guildId: 'guild-1', channelId: 'channel-1', selfMute: false, selfDeaf: false });

    useVoiceStore.getState().toggleSelfMute();
    useVoiceStore.getState().toggleSelfDeaf();

    expect(useVoiceStore.getState().selfMute).toBe(true);
    expect(useVoiceStore.getState().selfDeaf).toBe(true);
    expect(mocks.emit).toHaveBeenCalledWith(GatewayEvents.VOICE_STATE_UPDATE, {
      guild_id: 'guild-1',
      channel_id: 'channel-1',
      self_mute: true,
      self_deaf: false,
    });
  });

  it('leaves voice by clearing local connection state', () => {
    useVoiceStore.setState({ guildId: 'guild-1', channelId: 'channel-1', selfMute: true, selfDeaf: true });

    useVoiceStore.getState().leaveVoiceChannel();

    expect(mocks.emit).toHaveBeenCalledWith(GatewayEvents.VOICE_STATE_UPDATE, { guild_id: 'guild-1', channel_id: null });
    expect(useVoiceStore.getState().guildId).toBeNull();
    expect(useVoiceStore.getState().channelId).toBeNull();
  });
});
