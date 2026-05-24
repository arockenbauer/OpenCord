import { create } from 'zustand';
import { api } from '../services/api';

interface Channel {
  id: string;
  guild_id: string | null;
  name: string;
  type: number;
  position: number;
  topic: string | null;
  nsfw: boolean;
  parent_id: string | null;
  last_message_id: string | null;
  slowmode_delay: number;
  [key: string]: any;
}

interface DMRecipient {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  status: string;
  global_name?: string | null;
  [key: string]: any;
}

export interface DMChannel {
  id: string;
  type: number;
  name: string | null;
  owner_id?: string | null;
  icon?: string | null;
  recipients: DMRecipient[];
  last_message_id: string | null;
  created_at: string;
  [key: string]: any;
}

interface Role {
  id: string;
  guild_id: string;
  name: string;
  color: string | null;
  hoist: boolean;
  position: number;
  permissions: string;
  mentionable: boolean;
  [key: string]: any;
}

interface Member {
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    status: string;
    bot?: boolean;
    global_name?: string | null;
    custom_status_text?: string | null;
  };
  nickname: string | null;
  roles: string[];
  joined_at: string;
  [key: string]: any;
}

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  owner_id: string;
  channels: Channel[];
  roles: Role[];
  members: Member[];
  emojis: any[];
  member_count?: number;
  premium_tier: number;
  [key: string]: any;
}

interface GuildState {
  guilds: Map<string, Guild>;
  dmChannels: DMChannel[];
  selectedGuildId: string | null;
  selectedChannelId: string | null;
  voiceStates: Map<string, VoiceStateEntry[]>;
  setGuilds: (guilds: Guild[]) => void;
  setDMChannels: (dmChannels: DMChannel[]) => void;
  addGuild: (guild: Guild) => void;
  addDMChannel: (channel: DMChannel) => void;
  removeGuild: (guildId: string) => void;
  updateGuild: (guildId: string, data: Partial<Guild>) => void;
  selectGuild: (guildId: string | null) => void;
  selectChannel: (channelId: string | null) => void;
  fetchGuild: (guildId: string) => Promise<Guild>;
  createGuild: (name: string) => Promise<Guild>;
  addChannel: (guildId: string, channel: Channel) => void;
  updateChannel: (guildId: string, channel: Partial<Channel> & { id: string }) => void;
  removeChannel: (guildId: string, channelId: string) => void;
  addMember: (guildId: string, member: Member) => void;
  removeMember: (guildId: string, userId: string) => void;
  updateMember: (guildId: string, member: Partial<Member> & { user: { id: string } }) => void;
  updateRole: (guildId: string, role: Role) => void;
  removeRole: (guildId: string, roleId: string) => void;
  getSelectedGuild: () => Guild | undefined;
  getSelectedChannel: () => Channel | DMChannel | undefined;
  setVoiceStates: (states: Map<string, VoiceStateEntry[]>) => void;
  updateVoiceState: (guildId: string, userId: string, channelId: string | null) => void;
}

export interface VoiceStateEntry {
  guild_id: string;
  user_id: string;
  channel_id: string | null;
  deaf: boolean;
  mute: boolean;
  self_deaf: boolean;
  self_mute: boolean;
  self_video: boolean;
  suppress: boolean;
}

export const useGuildStore = create<GuildState>((set, get) => ({
  guilds: new Map(),
  dmChannels: [],
  selectedGuildId: null,
  selectedChannelId: null,

  setGuilds: (guilds) => {
    const map = new Map<string, Guild>();
    for (const guild of guilds) map.set(guild.id, guild);
    set({ guilds: map });
  },

  setDMChannels: (dmChannels) => set((state) => {
    const activeDmChannelId = state.selectedGuildId === null && state.selectedChannelId && dmChannels.some((channel) => channel.id === state.selectedChannelId)
      ? state.selectedChannelId
      : state.selectedChannelId;

    return {
      dmChannels,
      selectedChannelId: state.selectedGuildId === null ? activeDmChannelId : state.selectedChannelId,
    };
  }),

  addGuild: (guild) => set((state) => {
    const guilds = new Map(state.guilds);
    const existing = guilds.get(guild.id);
    guilds.set(guild.id, {
      ...existing,
      ...guild,
      channels: guild.channels || existing?.channels || [],
      roles: guild.roles || existing?.roles || [],
      members: guild.members || existing?.members || [],
      emojis: guild.emojis || existing?.emojis || [],
    });
    return { guilds };
  }),

  addDMChannel: (channel) => set((state) => {
    const dmChannels = [channel, ...state.dmChannels.filter((existing) => existing.id !== channel.id)];
    return { dmChannels };
  }),

  removeGuild: (guildId) => set((state) => {
    const guilds = new Map(state.guilds);
    guilds.delete(guildId);
    const updates: Partial<GuildState> = { guilds };
    if (state.selectedGuildId === guildId) {
      updates.selectedGuildId = null;
      updates.selectedChannelId = null;
    }
    return updates;
  }),

  updateGuild: (guildId, data) => set((state) => {
    const guilds = new Map(state.guilds);
    const existing = guilds.get(guildId);
    if (existing) guilds.set(guildId, { ...existing, ...data });
    return { guilds };
  }),

  selectGuild: (guildId) => {
    if (!guildId) {
      set({ selectedGuildId: null, selectedChannelId: null });
      return;
    }

    const guild = get().guilds.get(guildId);
    const textChannel = (guild?.channels || []).find((channel) => channel.type === 0);
    set({ selectedGuildId: guildId, selectedChannelId: textChannel?.id || null });
  },

  selectChannel: (channelId) => set({ selectedChannelId: channelId }),

  fetchGuild: async (guildId) => {
    const guild = await api<Guild>(`/api/guilds/${guildId}`);
    set((state) => {
      const guilds = new Map(state.guilds);
      guilds.set(guildId, guild);
      return { guilds };
    });
    return guild;
  },

  createGuild: async (name) => {
    const guild = await api<Guild>('/api/guilds', { method: 'POST', body: JSON.stringify({ name }) });
    set((state) => {
      const guilds = new Map(state.guilds);
      guilds.set(guild.id, guild);
      return { guilds };
    });
    return guild;
  },

  addChannel: (guildId, channel) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      guilds.set(guildId, { ...guild, channels: [...guild.channels, channel] });
    }
    return { guilds };
  }),

  updateChannel: (guildId, channel) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      guilds.set(guildId, {
        ...guild,
        channels: guild.channels.map((existingChannel) => existingChannel.id === channel.id ? { ...existingChannel, ...channel } : existingChannel),
      });
    }
    return { guilds };
  }),

  removeChannel: (guildId, channelId) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      guilds.set(guildId, { ...guild, channels: guild.channels.filter((channel) => channel.id !== channelId) });
    }
    const updates: Partial<GuildState> = { guilds };
    if (state.selectedChannelId === channelId) updates.selectedChannelId = null;
    return updates;
  }),

  addMember: (guildId, member) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      guilds.set(guildId, { ...guild, members: [...guild.members, member] });
    }
    return { guilds };
  }),

  removeMember: (guildId, userId) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      guilds.set(guildId, { ...guild, members: guild.members.filter((member) => member.user.id !== userId) });
    }
    return { guilds };
  }),

  updateMember: (guildId, member) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      guilds.set(guildId, {
        ...guild,
        members: guild.members.map((existingMember) => existingMember.user.id === member.user.id ? { ...existingMember, ...member } : existingMember),
      });
    }
    return { guilds };
  }),

  updateRole: (guildId, role) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      const exists = guild.roles.find((existingRole) => existingRole.id === role.id);
      const roles = exists
        ? guild.roles.map((existingRole) => existingRole.id === role.id ? { ...existingRole, ...role } : existingRole)
        : [...guild.roles, role];
      guilds.set(guildId, { ...guild, roles });
    }
    return { guilds };
  }),

  removeRole: (guildId, roleId) => set((state) => {
    const guilds = new Map(state.guilds);
    const guild = guilds.get(guildId);
    if (guild) {
      guilds.set(guildId, { ...guild, roles: guild.roles.filter((role) => role.id !== roleId) });
    }
    return { guilds };
  }),

  voiceStates: new Map(),

  setVoiceStates: (states) => set({ voiceStates: states }),

  updateVoiceState: (guildId, userId, channelId) => set((state) => {
    const voiceStates = new Map(state.voiceStates);
    const existing = voiceStates.get(guildId) || [];
    if (channelId === null) {
      // Remove user from voice state
      voiceStates.set(guildId, existing.filter(v => v.user_id !== userId));
    } else {
      const idx = existing.findIndex(v => v.user_id === userId);
      if (idx >= 0) {
        const updated = [...existing];
        updated[idx] = { ...updated[idx], channel_id: channelId } as VoiceStateEntry;
        voiceStates.set(guildId, updated);
      } else {
        voiceStates.set(guildId, [...existing, { guild_id: guildId, user_id: userId, channel_id: channelId, deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false }]);
      }
    }
    return { voiceStates };
  }),

  getSelectedGuild: () => {
    const state = get();
    if (!state.selectedGuildId) return undefined;
    return state.guilds.get(state.selectedGuildId);
  },

  getSelectedChannel: () => {
    const state = get();
    if (!state.selectedChannelId) return undefined;
    if (state.selectedGuildId) {
      const guild = state.getSelectedGuild();
      return guild?.channels.find((channel) => channel.id === state.selectedChannelId);
    }
    return state.dmChannels.find((channel) => channel.id === state.selectedChannelId);
  },
}));
