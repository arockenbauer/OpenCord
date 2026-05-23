import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { GatewayEvents } from '@opencord/shared';
import { logInfo, logError } from '../utils/logger.js';
import { serializeBigInt } from '../utils/serialize.js';
import { updateOwnVoiceState } from '../services/voice-state.service.js';
import {
  closeUserMedia,
  connectTransport,
  consume,
  createWebRtcTransport,
  getProducers,
  getRtpCapabilities,
  produce,
  resumeConsumer,
} from '../services/voice-media.service.js';

let io: SocketServer | null = null;

export function getIO(): SocketServer | null {
  return io;
}

export function setIO(nextIO: SocketServer | null): void {
  io = nextIO;
}

const LAZY_MEMBER_THRESHOLD = 100;
const PRESENCE_BATCH_INTERVAL = 5000;
const OFFLINE_DELAY = 30000;

interface PresenceState {
  status: string;
  custom_status_text?: string | null;
  custom_status_emoji?: string | null;
  activities?: any[];
  client_status?: { desktop?: string; mobile?: string; web?: string };
  last_seen: Date;
  socket_ids: Set<string>;
  offlineTimer?: NodeJS.Timeout;
}

const presenceStore = new Map<string, PresenceState>();

const presenceBatch = new Map<string, Array<{ status: string; custom_status_text?: string | null; custom_status_emoji?: string | null; activities?: any[]; client_status?: { desktop?: string; mobile?: string; web?: string } }>>();
let presenceBatchTimer: NodeJS.Timeout | null = null;

async function flushPresenceBatch() {
  if (!io) return;
  for (const [userId, updates] of presenceBatch.entries()) {
    const latest = updates[updates.length - 1];
    const presence = presenceStore.get(userId);
    if (!presence) continue;

    const payload: any = {
      user_id: userId,
      status: latest.status,
      activities: latest.activities,
      client_status: latest.client_status,
    };

    // Diffuser aux guildes communes et amis
    const userGuilds = await getGuildIdsForUser(userId);
    for (const guildId of userGuilds) {
      io.to(`guild:${guildId}`).emit(GatewayEvents.PRESENCE_UPDATE, payload);
    }

    // Diffuser aux amis
    const friends = await getFriendIds(userId);
    for (const friendId of friends) {
      io.to(`user:${friendId}`).emit(GatewayEvents.PRESENCE_UPDATE, payload);
    }
  }
  presenceBatch.clear();
}

async function getGuildIdsForUser(userId: string): Promise<string[]> {
  const memberships = await prisma.guildMember.findMany({
    where: { user_id: userId },
    select: { guild_id: true },
  });
  return memberships.map(m => m.guild_id);
}

async function getFriendIds(userId: string): Promise<string[]> {
  const friends = await prisma.friend.findMany({
    where: {
      OR: [{ user_id: userId }, { target_id: userId }],
      status: 1, // FRIEND
    },
    select: { user_id: true, target_id: true },
  });
  return friends.map(f => f.user_id === userId ? f.target_id : f.user_id);
}

function schedulePresenceFlush() {
  if (presenceBatchTimer) return;
  presenceBatchTimer = setTimeout(() => {
    flushPresenceBatch();
    presenceBatchTimer = null;
  }, PRESENCE_BATCH_INTERVAL);
}

async function buildReadyPayload(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, username: true, discriminator: true, email: true, avatar: true,
      banner: true, bio: true, locale: true, theme: true, status: true,
      admin_level: true, two_factor_enabled: true, premium: true, created_at: true,
      custom_status_text: true, custom_status_emoji: true, global_name: true,
      explicit_content_filter: true, default_message_notifications: true, allow_dms_from: true,
    },
  });

  const guildMemberships = await prisma.guildMember.findMany({
    where: { user_id: userId },
    select: { guild_id: true },
  });
  const guildIds = guildMemberships.map(m => m.guild_id);

  const guilds = [];
  for (const guildId of guildIds) {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        emojis: true,
      },
    });
    if (!guild) continue;

    const memberCount = await prisma.guildMember.count({ where: { guild_id: guildId } });
    let members: any[] = [];
    if (memberCount <= LAZY_MEMBER_THRESHOLD) {
      const fullMembers = await prisma.guildMember.findMany({
        where: { guild_id: guildId },
        include: {
          user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, custom_status_text: true, global_name: true } },
          role_assignments: { select: { role_id: true } },
        },
        orderBy: { joined_at: 'asc' },
      });
      members = fullMembers.map(mem => ({
        user: mem.user,
        nickname: mem.nickname,
        roles: mem.role_assignments.map(ra => ra.role_id),
        joined_at: mem.joined_at,
      }));
    }

    guilds.push({
      ...guild,
      members,
      member_count: memberCount,
    });
  }

  const dmChannels = await prisma.dMChannelMember.findMany({
    where: { user_id: userId },
    include: {
      channel: {
        include: {
          members: {
            include: { user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, global_name: true, custom_status_text: true } } },
          },
        },
      },
    },
  });

  const presences: any[] = [];
  const onlineUserIds = new Set<string>();

  // Présences des membres des guildes
  for (const guild of guilds) {
    for (const member of (guild as any).members || []) {
      if (member.user.status && member.user.status !== 'offline' && !onlineUserIds.has(member.user.id)) {
        onlineUserIds.add(member.user.id);
        presences.push({
          user_id: member.user.id,
          status: member.user.status,
          custom_status: member.user.custom_status_text ? { text: member.user.custom_status_text } : undefined,
        });
      }
    }
  }

  const readStates = await prisma.readState.findMany({
    where: { user_id: userId },
  });

  const relationships = await prisma.friend.findMany({
    where: { OR: [{ user_id: userId }, { target_id: userId }] },
    include: {
      user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, global_name: true, custom_status_text: true } },
      target: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, global_name: true, custom_status_text: true } },
    },
  });

  const notifications_unread_count = await prisma.notification.count({ where: { user_id: userId, read: false } });
  const voiceStates = await prisma.voiceState.findMany({
    where: { guild_id: { in: guildIds } },
  });

  return {
    user,
    guilds,
    dm_channels: dmChannels.map(dm => ({
      ...dm.channel,
      recipients: dm.channel.members.filter((m: any) => m.user_id !== userId).map((m: any) => m.user),
    })),
    presences,
    read_states: readStates,
    relationships: relationships.map(r => ({
      id: r.id,
      type: r.user_id === userId ? r.status : (r.status === 0 ? 3 : r.status),
      user: r.user_id === userId ? r.target : r.user,
    })),
    notifications_unread_count,
    voice_states: voiceStates,
  };
}

export function setupGateway(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie;
      if (!cookies) return next(new Error('UNAUTHORIZED'));

      const tokenMatch = cookies.match(/access_token=([^;]+)/);
      if (!tokenMatch) return next(new Error('UNAUTHORIZED'));
      const token = tokenMatch[1];

      const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') return next(new Error('JWT_ACCESS_SECRET not configured'));
      const payload = jwt.verify(token, secret || 'opencord_dev_jwt_secret_change_me_in_production_1234567890') as any;
      if (!payload.userId || payload.type !== 'access') return next(new Error('INVALID_TOKEN'));

      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user || user.disabled || user.banned) return next(new Error('UNAUTHORIZED'));

      socket.data.user = { id: user.id, username: user.username, discriminator: user.discriminator };
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.user.id;
    socket.join(`user:${userId}`);

    // Gestion du presenceStore
    let presence = presenceStore.get(userId);
    if (!presence) {
      presence = {
        status: 'online',
        last_seen: new Date(),
        socket_ids: new Set<string>(),
      };
      presenceStore.set(userId, presence);
    }
    presence.socket_ids.add(socket.id);
    presence.status = 'online';
    presence.last_seen = new Date();

    await prisma.user.update({ where: { id: userId }, data: { status: 'online', last_seen_at: new Date() } });

    // Rejoindre les rooms des guildes
    const guildMemberships = await prisma.guildMember.findMany({
      where: { user_id: userId },
      select: { guild_id: true },
    });
    const guildIds = guildMemberships.map(m => m.guild_id);
    for (const guildId of guildIds) {
      socket.join(`guild:${guildId}`);
    }

    // Rejoindre les rooms des canaux accessibles
    for (const guildId of guildIds) {
      const channels = await getAccessibleChannels(userId, guildId);
      for (const channel of channels) {
        socket.join(`channel:${channel.id}`);
      }
    }

    // Rejoindre les rooms des DM channels
    const dmMemberships = await prisma.dMChannelMember.findMany({
      where: { user_id: userId },
      select: { channel_id: true },
    });
    for (const dm of dmMemberships) {
      socket.join(`channel:${dm.channel_id}`);
    }

    // Envoyer READY
    const readyPayload = await buildReadyPayload(userId);
    socket.emit(GatewayEvents.READY, serializeBigInt(readyPayload));

    // REQUEST_GUILD_MEMBERS
    socket.on('REQUEST_GUILD_MEMBERS' as any, async (data: { guild_id: string; query?: string; limit?: number }) => {
      if (!guildIds.includes(data.guild_id)) return;

      const limit = Math.min(data.limit || 100, 100);
      const members = await prisma.$queryRawUnsafe(`
        SELECT gm.*, u.*, ra.*
        FROM GuildMember gm
        LEFT JOIN User u ON gm.user_id = u.id
        LEFT JOIN GuildMemberRole ra ON gm.guild_id = ra.guild_id AND gm.user_id = ra.user_id
        WHERE gm.guild_id = ?
        AND (u.username LIKE ? OR gm.nickname LIKE ?)
        ORDER BY gm.joined_at ASC
        LIMIT ?
      `, data.guild_id, `%${data.query || ''}%`, `%${data.query || ''}%`, limit) as any[];

      for (const member of members) {
        socket.emit(GatewayEvents.GUILD_MEMBER_ADD, {
          guild_id: data.guild_id,
          member: {
            user: { id: member.user_id, username: '', discriminator: '', avatar: null },
            roles: [],
            joined_at: member.joined_at,
            nickname: member.nickname,
          },
        });
      }
    });

    // TYPING_START
    const typingTimers = new Map<string, NodeJS.Timeout>();
    socket.on(GatewayEvents.TYPING_START, (data: { channel_id: string; guild_id?: string }) => {
      socket.to(`channel:${data.channel_id}`).emit(GatewayEvents.TYPING_START, {
        user_id: userId,
        channel_id: data.channel_id,
        guild_id: data.guild_id,
        timestamp: Date.now(),
      });

      const key = `${userId}:${data.channel_id}`;
      if (typingTimers.has(key)) {
        clearTimeout(typingTimers.get(key)!);
      }
      typingTimers.set(key, setTimeout(() => {
        socket.to(`channel:${data.channel_id}`).emit(GatewayEvents.TYPING_STOP, {
          user_id: userId,
          channel_id: data.channel_id,
        });
        typingTimers.delete(key);
      }, 10000));
    });

    // PRESENCE_UPDATE
    socket.on(GatewayEvents.PRESENCE_UPDATE, async (data: { status: string; activities?: any[]; client_status?: { desktop?: string; mobile?: string; web?: string }; guild_id?: string }) => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: data.status,
          last_seen_at: new Date(),
        },
      });

      const presence = presenceStore.get(userId);
      if (presence) {
        presence.status = data.status;
        presence.activities = data.activities;
        presence.client_status = data.client_status;
      }

      presenceBatch.set(userId, [...(presenceBatch.get(userId) || []), {
        status: data.status,
        activities: data.activities,
        client_status: data.client_status,
      }]);
      schedulePresenceFlush();
    });

    async function ensureVoiceAccess(channelId: string) {
      const voiceState = await prisma.voiceState.findFirst({
        where: { user_id: userId, channel_id: channelId },
      });
      if (!voiceState) throw new Error('NOT_CONNECTED_TO_VOICE');
      return voiceState;
    }

    socket.on(GatewayEvents.VOICE_STATE_UPDATE, async (data: any) => {
      try {
        const guildId = data.guild_id || data.guildId;
        if (!guildId) throw new Error('MISSING_GUILD');
        const state = await updateOwnVoiceState(guildId, userId, data, socket.id);
        if ((state as any).channel_id) {
          const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'opencord_dev_jwt_secret_change_me_in_production_1234567890';
          const token = jwt.sign(
            { type: 'voice', userId, guildId, channelId: (state as any).channel_id, sessionId: socket.id },
            secret,
            { expiresIn: '5m' },
          );
          socket.emit(GatewayEvents.VOICE_SERVER_UPDATE, {
            token,
            guildId,
            guild_id: guildId,
            channelId: (state as any).channel_id,
            channel_id: (state as any).channel_id,
            endpoint: process.env.VOICE_ENDPOINT || process.env.CORS_ORIGIN || 'http://localhost:3000',
            producers: getProducers((state as any).channel_id),
          });
        }
      } catch (err: any) {
        socket.emit(GatewayEvents.VOICE_ERROR, { message: err.message || 'Voice state update failed' });
      }
    });

    socket.on(GatewayEvents.VOICE_GET_RTP_CAPABILITIES, async (data: any, ack?: (payload: any) => void) => {
      try {
        await ensureVoiceAccess(data.channel_id || data.channelId);
        const rtpCapabilities = await getRtpCapabilities(data.channel_id || data.channelId);
        const payload = { channel_id: data.channel_id || data.channelId, rtpCapabilities };
        if (ack) ack(payload);
        else socket.emit(GatewayEvents.VOICE_RTP_CAPABILITIES, payload);
      } catch (err: any) {
        const payload = { message: err.message || 'Unable to get RTP capabilities' };
        if (ack) ack({ error: payload });
        else socket.emit(GatewayEvents.VOICE_ERROR, payload);
      }
    });

    socket.on(GatewayEvents.VOICE_CREATE_WEBRTC_TRANSPORT, async (data: any, ack?: (payload: any) => void) => {
      try {
        await ensureVoiceAccess(data.channel_id || data.channelId);
        const transport = await createWebRtcTransport(data.channel_id || data.channelId, userId);
        const payload = { channel_id: data.channel_id || data.channelId, transport };
        if (ack) ack(payload);
        else socket.emit(GatewayEvents.VOICE_WEBRTC_TRANSPORT_CREATED, payload);
      } catch (err: any) {
        const payload = { message: err.message || 'Unable to create voice transport' };
        if (ack) ack({ error: payload });
        else socket.emit(GatewayEvents.VOICE_ERROR, payload);
      }
    });

    socket.on(GatewayEvents.VOICE_CONNECT_TRANSPORT, async (data: any, ack?: (payload: any) => void) => {
      try {
        await ensureVoiceAccess(data.channel_id || data.channelId);
        await connectTransport(data.channel_id || data.channelId, data.transportId || data.transport_id, data.dtlsParameters || data.dtls_parameters);
        const payload = { ok: true };
        if (ack) ack(payload);
        else socket.emit(GatewayEvents.VOICE_TRANSPORT_CONNECTED, payload);
      } catch (err: any) {
        const payload = { message: err.message || 'Unable to connect voice transport' };
        if (ack) ack({ error: payload });
        else socket.emit(GatewayEvents.VOICE_ERROR, payload);
      }
    });

    socket.on(GatewayEvents.VOICE_PRODUCE, async (data: any, ack?: (payload: any) => void) => {
      try {
        const voiceState = await ensureVoiceAccess(data.channel_id || data.channelId);
        const producer = await produce(
          voiceState.channel_id!,
          userId,
          data.transportId || data.transport_id,
          data.kind,
          data.rtpParameters || data.rtp_parameters,
          data.appData || data.app_data,
        );
        io?.to(`guild:${voiceState.guild_id}`).emit(GatewayEvents.VOICE_PRODUCER_ADDED, producer);
        if (producer.kind === 'audio') {
          socket.to(`guild:${voiceState.guild_id}`).emit(GatewayEvents.SPEAKING, { user_id: userId, userId, speaking: true, ssrc: producer.id });
        }
        const payload = { id: producer.id };
        if (ack) ack(payload);
        else socket.emit(GatewayEvents.VOICE_PRODUCED, payload);
      } catch (err: any) {
        const payload = { message: err.message || 'Unable to produce media' };
        if (ack) ack({ error: payload });
        else socket.emit(GatewayEvents.VOICE_ERROR, payload);
      }
    });

    socket.on(GatewayEvents.VOICE_CONSUME, async (data: any, ack?: (payload: any) => void) => {
      try {
        const voiceState = await ensureVoiceAccess(data.channel_id || data.channelId);
        const consumer = await consume(
          voiceState.channel_id!,
          data.transportId || data.transport_id,
          data.producerId || data.producer_id,
          data.rtpCapabilities || data.rtp_capabilities,
        );
        if (ack) ack(consumer);
        else socket.emit(GatewayEvents.VOICE_CONSUMED, consumer);
      } catch (err: any) {
        const payload = { message: err.message || 'Unable to consume media' };
        if (ack) ack({ error: payload });
        else socket.emit(GatewayEvents.VOICE_ERROR, payload);
      }
    });

    socket.on(GatewayEvents.VOICE_RESUME_CONSUMER, async (data: any, ack?: (payload: any) => void) => {
      try {
        const voiceState = await ensureVoiceAccess(data.channel_id || data.channelId);
        await resumeConsumer(voiceState.channel_id!, data.consumerId || data.consumer_id);
        if (ack) ack({ ok: true });
      } catch (err: any) {
        const payload = { message: err.message || 'Unable to resume consumer' };
        if (ack) ack({ error: payload });
        else socket.emit(GatewayEvents.VOICE_ERROR, payload);
      }
    });

    socket.on(GatewayEvents.SPEAKING, async (data: any) => {
      try {
        const voiceState = await ensureVoiceAccess(data.channel_id || data.channelId);
        const room = data.channel_id || data.channelId;
        socket.to(`channel:${room}`).emit(GatewayEvents.SPEAKING, {
          user_id: userId,
          userId,
          speaking: Boolean(data.speaking),
          ssrc: data.ssrc,
        });
      } catch {
        // Ignore stale speaking updates.
      }
    });

    // DM Call Events
    socket.on(GatewayEvents.DM_CALL_INITIATE, async (data: any) => {
      try {
        const { initiateDMCall } = await import('../services/voice-state.service.js');
        const result = await initiateDMCall(data.dm_channel_id, userId);
        socket.emit(GatewayEvents.DM_CALL_INITIATE, result);
      } catch (err: any) {
        socket.emit(GatewayEvents.DM_CALL_END, { error: err.message || 'Failed to initiate call' });
      }
    });

    socket.on(GatewayEvents.DM_CALL_ACCEPT, async (data: any) => {
      try {
        const { answerDMCall } = await import('../services/voice-state.service.js');
        const result = await answerDMCall(data.dm_channel_id, userId, true);
        socket.emit(GatewayEvents.DM_CALL_ACCEPT, result);
      } catch (err: any) {
        socket.emit(GatewayEvents.DM_CALL_END, { error: err.message || 'Failed to accept call' });
      }
    });

    socket.on(GatewayEvents.DM_CALL_DECLINE, async (data: any) => {
      try {
        const { answerDMCall } = await import('../services/voice-state.service.js');
        const result = await answerDMCall(data.dm_channel_id, userId, false);
        socket.emit(GatewayEvents.DM_CALL_DECLINE, result);
      } catch (err: any) {
        socket.emit(GatewayEvents.DM_CALL_END, { error: err.message || 'Failed to decline call' });
      }
    });

    socket.on(GatewayEvents.DM_CALL_END, async (data: any) => {
      try {
        const { endDMCall } = await import('../services/voice-state.service.js');
        const result = await endDMCall(data.dm_channel_id, userId);
        socket.emit(GatewayEvents.DM_CALL_END, result);
      } catch (err: any) {
        socket.emit(GatewayEvents.DM_CALL_END, { error: err.message || 'Failed to end call' });
      }
    });

    // Déconnexion
    socket.on('disconnect', async () => {
      const disconnectedVoiceStates = await prisma.voiceState.findMany({
        where: { user_id: userId, session_id: socket.id },
      });
      for (const state of disconnectedVoiceStates) {
        if (state.channel_id) {
          const closedProducerIds = closeUserMedia(state.channel_id, userId);
          for (const producerId of closedProducerIds) {
            io?.to(`guild:${state.guild_id}`).emit(GatewayEvents.VOICE_PRODUCER_CLOSED, {
              producer_id: producerId,
              producerId,
              user_id: userId,
              userId,
              channel_id: state.channel_id,
              channelId: state.channel_id,
            });
          }
        }
        await prisma.voiceState.delete({ where: { id: state.id } }).catch(() => undefined);
        io?.to(`guild:${state.guild_id}`).emit(GatewayEvents.VOICE_STATE_UPDATE, {
          guild_id: state.guild_id,
          user_id: userId,
          channel_id: null,
          session_id: socket.id,
        });
      }

      const presence = presenceStore.get(userId);
      if (presence) {
        presence.socket_ids.delete(socket.id);

        if (presence.socket_ids.size === 0) {
          // Démarrer le timer de 30 secondes
          (presence as any).offlineTimer = setTimeout(async () => {
            const currentPresence = presenceStore.get(userId);
            if (currentPresence && currentPresence.socket_ids.size === 0) {
              currentPresence.status = 'offline';
              await prisma.user.update({ where: { id: userId }, data: { status: 'offline', last_seen_at: new Date() } });

              const payload = { user_id: userId, status: 'offline' };
              for (const guildId of guildIds) {
                io?.to(`guild:${guildId}`).emit(GatewayEvents.PRESENCE_UPDATE, payload);
              }
              const friends = await getFriendIds(userId);
              for (const friendId of friends) {
                io?.to(`user:${friendId}`).emit(GatewayEvents.PRESENCE_UPDATE, payload);
              }
            }
          }, OFFLINE_DELAY);
        }
      }
    });

    // Annuler le timer si l'utilisateur se reconnecte
    socket.on('connect', () => {
      const presence = presenceStore.get(userId);
      if (presence && (presence as any).offlineTimer) {
        clearTimeout((presence as any).offlineTimer);
        (presence as any).offlineTimer = undefined;
      }
    });
  });

  return io;
}

export const initSocketIO = setupGateway;

async function getAccessibleChannels(userId: string, guildId: string): Promise<Array<{ id: string }>> {
  // Load necessary helpers dynamically to avoid circular imports at module init
  const { computeEffectivePermissions } = await import('../services/permission.service.js');
  const { getMemberPermissions } = await import('../controllers/guild.controller.js');

  // Load channels with overwrites
  const channels = await prisma.channel.findMany({
    where: { guild_id: guildId },
    include: { permission_overwrites: true },
  });

  // Preload member role ids and everyone role
  const roleIds = (await prisma.guildMemberRole.findMany({ where: { guild_id: guildId, user_id: userId }, select: { role_id: true } })).map(r => r.role_id);
  const everyoneRole = await prisma.role.findFirst({ where: { guild_id: guildId, name: '@everyone' }, select: { id: true } });

  const basePerms = await getMemberPermissions(guildId, userId);

  const accessible: Array<{ id: string }> = [];
  for (const ch of channels) {
    const everyoneOverwrite = everyoneRole
      ? ch.permission_overwrites.find((ow: any) => ow.target_type === 'role' && ow.target_id === everyoneRole.id)
      : null;
    const roleOverwrites = ch.permission_overwrites.filter((ow: any) => ow.target_type === 'role' && roleIds.includes(ow.target_id));
    const memberOverwrite = ch.permission_overwrites.find((ow: any) => ow.target_type === 'member' && ow.target_id === userId) || null;

    const perms = computeEffectivePermissions(
      basePerms,
      everyoneOverwrite ? { allow: BigInt(everyoneOverwrite.allow), deny: BigInt(everyoneOverwrite.deny) } : null,
      roleOverwrites.map((ow: any) => ({ allow: BigInt(ow.allow), deny: BigInt(ow.deny) })),
      memberOverwrite ? { allow: BigInt(memberOverwrite.allow), deny: BigInt(memberOverwrite.deny) } : null,
    );

    // VIEW_CHANNEL = 0x400n
    if ((perms & BigInt(0x400)) !== BigInt(0)) {
      accessible.push({ id: ch.id });
    }
  }

  return accessible;
}
