import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

const DISCOVERY_CATEGORIES = [
  'Gaming', 'Music', 'Education', 'Science & Technology', 'Entertainment',
  'Community', 'Art', 'Social', 'Sports', 'Other',
];

export async function getDiscoverableGuilds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 24, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const [guilds, total] = await Promise.all([
      prisma.guild.findMany({
        select: {
          id: true,
          name: true,
          icon: true,
          banner: true,
          description: true,
          premium_tier: true,
          vanity_url_code: true,
          _count: { select: { members: true } },
        },
        orderBy: { members: { _count: 'desc' } },
        take: limit,
        skip,
      }),
      prisma.guild.count(),
    ]);

    res.json({
      guilds: guilds.map((g) => ({ ...g, member_count: g._count.members, _count: undefined })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.json({ categories: DISCOVERY_CATEGORIES });
}

export async function joinGuildFromDiscovery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const ban = await prisma.ban.findUnique({
      where: {
        guild_id_user_id: {
          guild_id: guild.id,
          user_id: req.user!.userId,
        },
      },
    });
    if (ban) throw new AppError(403, 'BANNED_FROM_GUILD', 'You are banned from this server');

    const existingMember = await prisma.guildMember.findUnique({
      where: {
        guild_id_user_id: {
          guild_id: guild.id,
          user_id: req.user!.userId,
        },
      },
    });

    if (!existingMember) {
      await prisma.guildMember.create({
        data: {
          guild_id: guild.id,
          user_id: req.user!.userId,
        },
      });
    }

    const fullGuild = existingMember
      ? guild
      : await prisma.guild.findUnique({
        where: { id: guild.id },
        include: {
          channels: { orderBy: { position: 'asc' } },
          roles: { orderBy: { position: 'asc' } },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  discriminator: true,
                  avatar: true,
                  status: true,
                },
              },
            },
          },
        },
      });

    if (!fullGuild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const io = getIO();
    if (io) {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, username: true, discriminator: true, avatar: true, status: true },
      });

      if (user) {
        io.to(`guild:${guild.id}`).emit(GatewayEvents.GUILD_MEMBER_ADD, {
          guild_id: guild.id,
          member: { user, roles: [], joined_at: new Date(), nickname: null },
        });
      }

      const sockets = await io.in(`user:${req.user!.userId}`).fetchSockets();
      for (const socket of sockets) {
        socket.join(`guild:${guild.id}`);
        for (const channel of fullGuild.channels) {
          socket.join(`channel:${channel.id}`);
        }
      }

      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.GUILD_CREATE, { guild: fullGuild });
    }

    res.json(fullGuild);
  } catch (err) {
    next(err);
  }
}

export async function updateGuildDiscovery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20)); // MANAGE_GUILD

    const { description } = req.body;
    const data: any = {};

    if (description !== undefined) data.description = description;

    if (Object.keys(data).length === 0) {
      throw new AppError(400, 'NO_CHANGES', 'No valid fields provided');
    }

    const guild = await prisma.guild.update({
      where: { id: req.params.guildId },
      data,
      select: { id: true, name: true, description: true },
    });

    res.json(guild);
  } catch (err) {
    next(err);
  }
}
