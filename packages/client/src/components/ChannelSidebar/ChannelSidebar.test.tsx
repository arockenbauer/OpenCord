import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChannelSidebar } from './ChannelSidebar';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useVoiceStore } from '../../stores/voiceStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../services/api', () => ({
  api: Object.assign(vi.fn(), {
    users: { createDM: vi.fn() },
    dm: { createMessage: vi.fn() },
  }),
}));

const guild = {
  id: 'guild-1',
  name: 'Smoke Guild',
  icon: null,
  banner: null,
  owner_id: 'user-1',
  channels: [
    { id: 'text-1', guild_id: 'guild-1', name: 'general', type: 0, position: 0, topic: null, nsfw: false, parent_id: null, last_message_id: null, slowmode_delay: 0 },
    { id: 'voice-1', guild_id: 'guild-1', name: 'Voice Lobby', type: 2, position: 1, topic: null, nsfw: false, parent_id: null, last_message_id: null, slowmode_delay: 0 },
  ],
  roles: [],
  members: [],
  emojis: [],
  premium_tier: 0,
};

describe('ChannelSidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'user-1', username: 'john', discriminator: '0001', avatar: null, status: 'online' } as any,
      relationships: [],
      isAuthenticated: true,
    });
    useGuildStore.setState({
      guilds: new Map([[guild.id, guild as any]]),
      dmChannels: [],
      selectedGuildId: guild.id,
      selectedChannelId: 'text-1',
      voiceStates: new Map(),
    });
    useVoiceStore.setState({
      joinVoiceChannel: vi.fn(),
      leaveVoiceChannel: vi.fn(),
    });
  });

  it('renders selected guild text and voice channels', () => {
    render(<ChannelSidebar />);
    expect(screen.getByText('general')).toBeInTheDocument();
    expect(screen.getByText('Voice Lobby')).toBeInTheDocument();
  });

  it('keeps text selection when clicking voice channel', async () => {
    const { selectChannel } = useGuildStore.getState();
    selectChannel('text-1');
    
    render(<ChannelSidebar />);
    
    // Click on voice channel should not change text channel selection
    const voiceChannel = screen.getByText('Voice Lobby');
    fireEvent.click(voiceChannel);
    
    expect(useGuildStore.getState().selectedChannelId).toBe('text-1');
  });
});
