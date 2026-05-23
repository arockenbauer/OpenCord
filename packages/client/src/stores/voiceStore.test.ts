import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSocket: vi.fn(() => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

vi.mock('../services/socket', () => ({ getSocket: mocks.getSocket }));

import { useVoiceStore } from './voiceStore';

describe('voiceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVoiceStore.setState({
      guildId: null,
      channelId: null,
      callStatus: 'idle',
      selfMute: false,
      selfDeaf: false,
      selfVideo: false,
      isConnecting: false,
      error: null,
    });
  });

  it('joins voice channel', () => {
    useVoiceStore.getState().joinVoiceChannel('guild-1', 'channel-1');
    expect(useVoiceStore.getState().guildId).toBe('guild-1');
    expect(useVoiceStore.getState().channelId).toBe('channel-1');
    expect(useVoiceStore.getState().callStatus).toBe('connected');
  });

  it('leaves voice channel', () => {
    useVoiceStore.getState().joinVoiceChannel('guild-1', 'channel-1');
    useVoiceStore.getState().leaveVoiceChannel();
    expect(useVoiceStore.getState().guildId).toBeNull();
    expect(useVoiceStore.getState().channelId).toBeNull();
    expect(useVoiceStore.getState().callStatus).toBe('idle');
  });

  it('toggles mute', () => {
    useVoiceStore.getState().toggleSelfMute();
    expect(useVoiceStore.getState().selfMute).toBe(true);
    useVoiceStore.getState().toggleSelfMute();
    expect(useVoiceStore.getState().selfMute).toBe(false);
  });

  it('toggles deafen', () => {
    useVoiceStore.getState().toggleSelfDeaf();
    expect(useVoiceStore.getState().selfDeaf).toBe(true);
  });

  it('sets error state', () => {
    useVoiceStore.getState().setError('Connection failed');
    expect(useVoiceStore.getState().error).toBe('Connection failed');
  });
});
