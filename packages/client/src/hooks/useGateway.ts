import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import { useAuthStore } from '../stores/authStore';
import { useGuildStore } from '../stores/guildStore';
import { useMessageStore } from '../stores/messageStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useUnreadStore } from '../stores/unreadStore';
import { useVoiceStore } from '../stores/voiceStore';
import { GatewayEvents } from '@opencord/shared';

export function useGateway() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);
  const setRelationships = useAuthStore((s) => s.setRelationships);
  const upsertRelationship = useAuthStore((s) => s.upsertRelationship);
  const removeRelationshipByUserId = useAuthStore((s) => s.removeRelationshipByUserId);
  const updateRelationshipPresence = useAuthStore((s) => s.updateRelationshipPresence);
  const {
    setGuilds,
    setDMChannels,
    setVoiceStates,
    addGuild,
    addDMChannel,
    removeGuild,
    updateGuild,
    addChannel,
    updateChannel,
    removeChannel,
    addMember,
    removeMember,
    updateMember,
    updateRole,
    removeRole,
    updateVoiceState,
  } = useGuildStore();
  const { addMessage, updateMessage, removeMessage, bulkRemoveMessages, addReaction, removeReaction, setTyping, clearTyping } = useMessageStore();
  const setupDone = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      setupDone.current = false;
      return;
    }

    const socket = connectSocket();
    if (setupDone.current) return;
    setupDone.current = true;

    socket.on(GatewayEvents.READY, (data: any) => {
      setUser(data.user);
      setRelationships(data.relationships || []);
      setGuilds(data.guilds || []);
      setDMChannels(data.dm_channels || []);
      const nextVoiceStates = new Map<string, any[]>();
      for (const state of data.voice_states || []) {
        const existing = nextVoiceStates.get(state.guild_id) || [];
        nextVoiceStates.set(state.guild_id, [...existing, state]);
      }
      setVoiceStates(nextVoiceStates);
      useNotificationStore.getState().setUnreadCount(data.notifications_unread_count || 0);
      useUnreadStore.getState().initFromReadStates(data.read_states || []);
    });

    socket.on(GatewayEvents.MESSAGE_CREATE, (data: any) => {
      const message = data.message;
      addMessage(message.channel_id, message);
      const { selectedChannelId } = useGuildStore.getState();
      if (message.channel_id !== selectedChannelId) {
        const currentUser = useAuthStore.getState().user;
        const hasMention =
          message.mention_everyone ||
          (Array.isArray(message.mentions) &&
            currentUser != null &&
            message.mentions.some((u: any) => u.id === currentUser.id));
        useUnreadStore.getState().incrementUnread(message.channel_id, !!hasMention);
      }
    });
    socket.on(GatewayEvents.MESSAGE_UPDATE, (data: any) => {
      updateMessage(data.message.channel_id, data.message);
    });
    socket.on(GatewayEvents.MESSAGE_DELETE, (data: any) => {
      removeMessage(data.channel_id, data.id);
    });
    socket.on(GatewayEvents.MESSAGE_BULK_DELETE, (data: any) => {
      bulkRemoveMessages(data.channel_id, data.ids);
    });
    socket.on(GatewayEvents.MESSAGE_REACTION_ADD, (data: any) => {
      addReaction(data.channel_id, data.message_id, data.emoji.name);
    });
    socket.on(GatewayEvents.MESSAGE_REACTION_REMOVE, (data: any) => {
      removeReaction(data.channel_id, data.message_id, data.emoji.name, data.user_id);
    });

    socket.on(GatewayEvents.GUILD_CREATE, (data: any) => addGuild(data.guild));
    socket.on(GatewayEvents.GUILD_UPDATE, (data: any) => updateGuild(data.guild.id, data.guild));
    socket.on(GatewayEvents.GUILD_DELETE, (data: any) => removeGuild(data.id));

    socket.on(GatewayEvents.CHANNEL_CREATE, (data: any) => {
      if (data.channel.guild_id) {
        addChannel(data.channel.guild_id, data.channel);
        return;
      }
      if (data.channel.recipients) {
        addDMChannel(data.channel);
      }
    });
    socket.on(GatewayEvents.CHANNEL_UPDATE, (data: any) => {
      if (data.channel.guild_id) updateChannel(data.channel.guild_id, data.channel);
    });
    socket.on(GatewayEvents.CHANNEL_DELETE, (data: any) => {
      if (data.guild_id) removeChannel(data.guild_id, data.id || data.channel_id);
    });

    socket.on(GatewayEvents.GUILD_MEMBER_ADD, (data: any) => addMember(data.guild_id, data.member));
    socket.on(GatewayEvents.GUILD_MEMBER_REMOVE, (data: any) => removeMember(data.guild_id, data.user_id));
    socket.on(GatewayEvents.GUILD_MEMBER_UPDATE, (data: any) => updateMember(data.guild_id, data.member));

    socket.on(GatewayEvents.GUILD_ROLE_CREATE, (data: any) => updateRole(data.guild_id, data.role));
    socket.on(GatewayEvents.GUILD_ROLE_UPDATE, (data: any) => updateRole(data.guild_id, data.role));
    socket.on(GatewayEvents.GUILD_ROLE_DELETE, (data: any) => removeRole(data.guild_id, data.role_id));

    socket.on(GatewayEvents.TYPING_START, (data: any) => setTyping(data.channel_id, data.user_id));
    socket.on(GatewayEvents.TYPING_STOP, (data: any) => clearTyping(data.channel_id, data.user_id));
    socket.on(GatewayEvents.NOTIFICATION_CREATE, (data: any) => {
      useNotificationStore.getState().addNotification(data);
    });

    socket.on(GatewayEvents.RELATIONSHIP_ADD, (data: any) => {
      upsertRelationship(data);
    });
    socket.on(GatewayEvents.RELATIONSHIP_UPDATE, (data: any) => {
      upsertRelationship(data);
    });
    socket.on(GatewayEvents.RELATIONSHIP_REMOVE, (data: any) => {
      removeRelationshipByUserId(data.user_id);
    });

    socket.on(GatewayEvents.VOICE_STATE_UPDATE, (data: any) => {
      updateVoiceState(data.guild_id, data.user_id, data.channel_id);
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.id === data.user_id && data.channel_id === null) {
        useVoiceStore.getState().reset();
      }
    });
    socket.on(GatewayEvents.VOICE_SERVER_UPDATE, (data: any) => {
      void useVoiceStore.getState().handleVoiceServerUpdate(data);
    });
    socket.on(GatewayEvents.VOICE_PRODUCER_ADDED, (data: any) => {
      const currentUser = useAuthStore.getState().user;
      if (data.userId === currentUser?.id || data.user_id === currentUser?.id) return;
      void useVoiceStore.getState().addProducer(data);
    });
    socket.on(GatewayEvents.VOICE_PRODUCER_CLOSED, (data: any) => {
      useVoiceStore.getState().closeProducer(data.producer_id || data.producerId);
    });
    socket.on(GatewayEvents.SPEAKING, (data: any) => {
      useVoiceStore.getState().setSpeaking(data.user_id || data.userId, Boolean(data.speaking));
    });
    socket.on(GatewayEvents.VOICE_ERROR, (data: any) => {
      useVoiceStore.setState({ error: data.message || 'Erreur vocale', isConnecting: false });
    });

    socket.on(GatewayEvents.USER_UPDATE, (data: any) => {
      const currentUser = useAuthStore.getState().user;
      if (currentUser && data.id === currentUser.id) {
        setUser({ ...currentUser, ...data });
      }
      const guilds = useGuildStore.getState().guilds;
      for (const [guildId, guild] of guilds) {
        const member = guild.members.find((m) => m.user.id === data.id);
        if (member) {
          updateMember(guildId, { ...member, user: { ...member.user, ...data } });
        }
      }
    });

    socket.on(GatewayEvents.PRESENCE_UPDATE, (data: any) => {
      const guilds = useGuildStore.getState().guilds;
      for (const [guildId, guild] of guilds) {
        const member = guild.members.find((m) => m.user.id === data.user_id);
        if (member) {
          updateMember(guildId, {
            ...member,
            user: {
              ...member.user,
              status: data.status,
            } as any,
          });
        }
      }
      updateRelationshipPresence(data.user_id, data.status);
    });

    return () => {
      socket.removeAllListeners();
      setupDone.current = false;
    };
  }, [isAuthenticated, addChannel, addDMChannel, addGuild, addMember, addMessage, addReaction, bulkRemoveMessages, clearTyping, removeChannel, removeGuild, removeMember, removeMessage, removeReaction, removeRelationshipByUserId, setDMChannels, setGuilds, setRelationships, setTyping, setUser, setVoiceStates, updateChannel, updateGuild, updateMember, updateRelationshipPresence, updateMessage, updateRole, upsertRelationship, removeRole, updateVoiceState]);
}

export function emitTyping(channelId: string, guildId?: string) {
  const socket = getSocket();
  if (socket) {
    socket.emit(GatewayEvents.TYPING_START, { channel_id: channelId, guild_id: guildId });
  }
}

export function updatePresence(status: string, activities?: any[], clientStatus?: { desktop?: string; mobile?: string; web?: string }) {
  const socket = getSocket();
  if (socket) {
    socket.emit(GatewayEvents.PRESENCE_UPDATE, { status, activities, client_status: clientStatus });
  }
}
