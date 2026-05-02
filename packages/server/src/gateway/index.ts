import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { GatewayEvents } from '@opencord/shared';

let io: SocketServer | null = null;

export function getIO(): SocketServer | null {
  return io;
}

const LAZY_MEMBER_THRESHOLD = 100;
const PRESENCE_BATCH_INTERVAL = 5000;

const presenceBatch = new Map<string, { status: string; custom_status_text?: string; custom_status_emoji?: string; activities?: any[] }[]>();
let presenceBatchTimer: NodeJS.Timeout | null = null;

function flushPresenceBatch() {
  if (!io) return;
  for (const [userId, updates] of presenceBatch.entries()) {
    const latest = updates[updates.length - 1];
    io.to(`user:${userId}`).emit(GatewayEvents.PRESENCE_UPDATE, {
      user_id: userId,
      status: latest.status,
      custom_status_text: latest.custom_status_text,
      custom_status_emoji: latest.custom_status_emoji,
      activities: latest.activities,
    });
  }
  presenceBatch.clear();
}

function schedulePresenceFlush() {
  if (presenceBatchTimer) return;
  presenceBatchTimer = setTimeout(() => {
    flushPresenceBatch();
    presenceBatchTimer = null;
  }, PRESENCE_BATCH_INTERVAL);
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
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('UNAUTHORIZED'));

      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret') as any;
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

    await prisma.user.update({ where: { id: userId }, data: { status: 'online', last_seen_at: new Date() } });

    const memberships = await prisma.guildMember.findMany({
      where: { user_id: userId },
      include: {
        guild: {
          include: {
            channels: { orderBy: { position: 'asc' } },
            roles: { orderBy: { position: 'asc' } },
            emojis: true,
          },
        },
      },
    });

    const guilds = await Promise.all(memberships.map(async (m) => {
      socket.join(`guild:${m.guild.id}`);
      for (const ch of m.guild.channels) {
        socket.join(`channel:${ch.id}`);
      }

      const memberCount = await prisma.guildMember.count({ where: { guild_id: m.guild.id } });
      let members: any[] = [];

      if (memberCount <= LAZY_MEMBER_THRESHOLD) {
        const fullMembers = await prisma.guildMember.findMany({
          where: { guild_id: m.guild.id },
          include: {
            user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, custom_status_text: true, global_name: true } },
            role_assignments: { select: { role_id: true } },
          },
          orderBy: { joined_at: 'asc' },
        });
        members = fullMembers.map((mem) => ({
          user: mem.user,
          nickname: mem.nickname,
          roles: mem.role_assignments.map((ra) => ra.role_id),
          joined_at: mem.joined_at,
        }));
      }

      const channelsWithOverwrites = await prisma.channel.findMany({
        where: { guild_id: m.guild.id },
        include: { permission_overwrites: true },
        orderBy: { position: 'asc' },
      });

      return {
        ...m.guild,
        members,
        member_count: memberCount,
        channels: channelsWithOverwrites,
        roles: m.guild.roles,
        emojis: m.guild.emojis,
      };
    }));

    const dmMemberships = await prisma.dMChannelMember.findMany({
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

    for (const dm of dmMemberships) {
      socket.join(`channel:${dm.channel.id}`);
    }

    const dmChannels = dmMemberships.map((dm) => ({
      ...dm.channel,
      recipients: dm.channel.members.filter((m) => m.user_id !== userId).map((m) => m.user),
    }));

    const readStates = await prisma.readState.findMany({ where: { user_id: userId } });
    const voiceStates = memberships.length > 0
      ? await prisma.voiceState.findMany({ where: { guild_id: { in: memberships.map((m) => m.guild.id) } } })
      : [];

    const relationships = await prisma.friend.findMany({
      where: { OR: [{ user_id: userId }, { target_id: userId }] },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, global_name: true, custom_status_text: true } },
        target: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, global_name: true, custom_status_text: true } },
      },
    });

    const unreadCount = await prisma.notification.count({ where: { user_id: userId, read: false } });

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

    const connections = await prisma.connectedAccount.findMany({ where: { user_id: userId } });
    const activities = await prisma.userActivity.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' }, take: 5 });

    socket.emit(GatewayEvents.READY, {
      user,
      guilds,
      dm_channels: dmChannels,
      read_states: readStates.map((rs) => ({
        channel_id: rs.channel_id,
        last_read_message_id: rs.last_read_message_id,
        mention_count: rs.mention_count,
      })),
      relationships: relationships.map((r) => ({
        id: r.id,
        type: r.user_id === userId ? r.status : (r.status === 0 ? 3 : r.status),
        user: r.user_id === userId ? r.target : r.user,
      })),
      notifications_unread_count: unreadCount,
      connections,
      activities,
      voice_states: voiceStates,
    });

    const allGuildIds = memberships.map((m) => m.guild.id);
    for (const guildId of allGuildIds) {
      socket.to(`guild:${guildId}`).emit(GatewayEvents.PRESENCE_UPDATE, {
        user_id: userId,
        status: 'online',
      });
    }

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

    socket.on(GatewayEvents.PRESENCE_UPDATE, async (data: { status: string; custom_status_text?: string; custom_status_emoji?: string; activities?: any[] }) => {
      await prisma.user.update({
        where: { id: userId },
        data: { status: data.status, custom_status_text: data.custom_status_text || null, custom_status_emoji: data.custom_status_emoji || null, last_seen_at: new Date() },
      });

      presenceBatch.set(userId, [...(presenceBatch.get(userId) || []), {
        status: data.status,
        custom_status_text: data.custom_status_text,
        custom_status_emoji: data.custom_status_emoji,
        activities: data.activities,
      }]);
      schedulePresenceFlush();
    });

    socket.on('disconnect', async () => {
      await prisma.user.update({ where: { id: userId }, data: { status: 'offline', last_seen_at: new Date() } });

      for (const guildId of allGuildIds) {
        socket.to(`guild:${guildId}`).emit(GatewayEvents.PRESENCE_UPDATE, {
          user_id: userId,
          status: 'offline',
        });
      }
    });
  });

  return io;
}
