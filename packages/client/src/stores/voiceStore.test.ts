import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
}));

vi.mock('../services/socket', () => ({
  getSocket: () => ({ emit: mocks.emit }),
}));

vi.mock('mediasoup-client', () => ({
  Device: class {},
}));

import { GatewayEvents } from '@opencord/shared';
import { useVoiceStore } from './voiceStore';

describe('voiceStore', () => {
  beforeEach(() => {
    mocks.emit.mockReset();
    useVoiceStore.getState().reset();
  });

  it('emits a voice state update when joining a voice channel', () => {
    useVoiceStore.getState().joinVoiceChannel('guild-1', 'voice-1');

    expect(mocks.emit).toHaveBeenCalledWith(GatewayEvents.VOICE_STATE_UPDATE, {
      guild_id: 'guild-1',
      channel_id: 'voice-1',
      self_mute: false,
      self_deaf: false,
    });
    expect(useVoiceStore.getState().channelId).toBe('voice-1');
  });

  it('emits mute/deafen changes for the active channel', () => {
    useVoiceStore.setState({ guildId: 'guild-1', channelId: 'voice-1', selfMute: false, selfDeaf: false });

    useVoiceStore.getState().toggleSelfMute();
    useVoiceStore.getState().toggleSelfDeaf();

    expect(mocks.emit).toHaveBeenCalledWith(GatewayEvents.VOICE_STATE_UPDATE, {
      guild_id: 'guild-1',
      channel_id: 'voice-1',
      self_mute: true,
      self_deaf: false,
    });
    expect(mocks.emit).toHaveBeenCalledWith(GatewayEvents.VOICE_STATE_UPDATE, {
      guild_id: 'guild-1',
      channel_id: 'voice-1',
      self_mute: true,
      self_deaf: true,
    });
  });

  it('emits disconnect and clears local state when leaving', () => {
    useVoiceStore.setState({ guildId: 'guild-1', channelId: 'voice-1' });

    useVoiceStore.getState().leaveVoiceChannel();

    expect(mocks.emit).toHaveBeenCalledWith(GatewayEvents.VOICE_STATE_UPDATE, {
      guild_id: 'guild-1',
      channel_id: null,
    });
    expect(useVoiceStore.getState().channelId).toBeNull();
  });
});
