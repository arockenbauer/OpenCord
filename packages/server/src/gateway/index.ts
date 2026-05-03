import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { GatewayEvents } from '@opencord/shared';
import { logInfo, logError } from '../utils/logger.js';

let io: SocketServer | null = null;

export function getIO(): SocketServer | null {
  return io;
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

      const secret = process.env.JWT_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') return next(new Error('JWT_SECRET not configured'));
      const payload = jwt.verify(token, secret || 'dev_jwt_secret') as any;
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
    socket.emit(GatewayEvents.READY, readyPayload);

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

    // VOICE_STATE_UPDATE (différé selon spec)
    socket.on(GatewayEvents.VOICE_STATE_UPDATE, async (data: any) => {
      const { guild_id, channel_id, deaf, mute, self_deaf, self_mute, self_video, suppress } = data;
      if (channel_id === null) {
        await prisma.voiceState.deleteMany({ where: { user_id: userId, guild_id } });
      } else {
        await prisma.voiceState.upsert({
          where: { guild_id_user_id: { guild_id, user_id: userId } },
          create: {
            id: `${guild_id}:${userId}`,
            guild_id,
            channel_id,
            user_id: userId,
            deaf: deaf || false,
            mute: mute || false,
            self_deaf: self_deaf || false,
            self_mute: self_mute || false,
            self_video: self_video || false,
            suppress: suppress || false,
          },
          update: { channel_id, deaf, mute, self_deaf, self_mute, self_video, suppress },
        });
      }

      socket.to(`guild:${guild_id}`).emit(GatewayEvents.VOICE_STATE_UPDATE, {
        guild_id,
        user_id: userId,
        channel_id,
        deaf,
        mute,
        self_deaf,
        self_mute,
        self_video,
        suppress,
      });
    });

    // Déconnexion
    socket.on('disconnect', async () => {
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

async function getAccessibleChannels(userId: string, guildId: string): Promise<Array<{ id: string }>> {
  const channels = await prisma.channel.findMany({
    where: { guild_id: guildId },
    select: { id: true },
  });
  // TODO: vérifier les permissions VIEW_CHANNEL
  return channels;
}
