import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { serializeBigInt } from '../utils/serialize.js';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISCOVERY_UPLOAD_DIR = path.join(__dirname, '../../uploads/discovery');

// Ensure upload directory exists
if (!fs.existsSync(DISCOVERY_UPLOAD_DIR)) {
  fs.mkdirSync(DISCOVERY_UPLOAD_DIR, { recursive: true });
}

// Discoverability requirements check
async function checkDiscoverabilityRequirements(guildId: string): Promise<{ met: boolean; unmet: string[] }> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      members: { select: { user_id: true } },
      _count: { select: { members: true } },
    },
  });

  if (!guild) return { met: false, unmet: ['GUILD_NOT_FOUND'] };

  const unmet: string[] = [];
  const memberCount = guild._count.members;
  const guildAgeDays = (Date.now() - new Date(guild.created_at).getTime()) / (1000 * 60 * 60 * 24);

  if (memberCount < 10) unmet.push('MIN_MEMBERS');
  if (guildAgeDays < 7) unmet.push('GUILD_TOO_NEW');
  if (!guild.description || guild.description.length < 10) unmet.push('DESCRIPTION_REQUIRED');
  if (!guild.icon) unmet.push('ICON_REQUIRED');
  if (!guild.primary_category_id) unmet.push('CATEGORY_REQUIRED');
  if (!guild.system_channel_id) unmet.push('SYSTEM_CHANNEL_REQUIRED');

  return { met: unmet.length === 0, unmet };
}

export async function getDiscoverableGuilds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 24, 48);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const category = req.query.category as string | undefined;
    const query = req.query.query as string | undefined;
    const sort = req.query.sort as string || 'member_count_desc';

    let orderBy: any = { members: { _count: 'desc' } };
    if (sort === 'member_count_asc') orderBy = { members: { _count: 'asc' } };
    else if (sort === 'created_at_desc') orderBy = { created_at: 'desc' };

    const where: any = { discoverable: true };
    if (category) {
      where.primary_category_id = category;
    }
    if (query) {
      // Use FTS5 for search
      const ftsResults = await prisma.$queryRaw<{ rowid: number }[]>`
        SELECT rowid FROM guilds_discovery_fts WHERE guilds_discovery_fts MATCH ${query}
      `;
      const guildIds = ftsResults.map((r: any) => r.rowid.toString());
      if (guildIds.length > 0) {
        where.id = { in: guildIds };
      } else {
        where.id = { in: ['-1'] }; // No results
      }
    }

    const [guilds, total] = await Promise.all([
      prisma.guild.findMany({
        where,
        select: {
          id: true,
          name: true,
          icon: true,
          banner: true,
          description: true,
          discovery_splash: true,
          discovery_description: true,
          premium_tier: true,
          features: true,
          primary_category_id: true,
          _count: { select: { members: true } },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.guild.count({ where }),
    ]);

    // Get presence counts from gateway if available
    const io = getIO();
    const presenceStore = (io as any)?.presenceStore;

    const guildsWithDetails = await Promise.all(guilds.map(async (g) => {
      const primaryCategory = g.primary_category_id
        ? await prisma.discoveryCategory.findUnique({ where: { id: g.primary_category_id } })
        : null;

      const tags = await prisma.guildDiscoveryTag.findMany({
        where: { guild_id: g.id },
        select: { tag: true },
      });

      let presence_count = 0;
      if (presenceStore) {
        const guildMembers = await prisma.guildMember.findMany({
          where: { guild_id: g.id },
          select: { user_id: true },
        });
        presence_count = guildMembers.filter((m: any) =>
          presenceStore.get(m.user_id)?.status !== 'offline'
        ).length;
      }

      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        banner: g.banner,
        discovery_splash: g.discovery_splash,
        description: g.description,
        discovery_description: g.discovery_description,
        member_count: g._count.members,
        presence_count,
        primary_category: primaryCategory ? {
          id: primaryCategory.id,
          name: primaryCategory.name,
          icon: primaryCategory.icon,
        } : null,
        tags: tags.map((t: any) => t.tag),
        premium_tier: g.premium_tier,
        features: JSON.parse(g.features || '[]'),
        is_member: false,
      };
    }));

    // If user is authenticated, check membership
    if (req.user?.userId) {
      const memberGuildIds = new Set(
        (await prisma.guildMember.findMany({
          where: { user_id: req.user.userId },
          select: { guild_id: true },
        })).map((m: any) => m.guild_id)
      );

      for (const guild of guildsWithDetails) {
        (guild as any).is_member = memberGuildIds.has(guild.id);
      }
    }

    res.json({
      guilds: guildsWithDetails,
      total,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await prisma.discoveryCategory.findMany({
      orderBy: { position: 'asc' },
    });

    // Get guild counts per category (cached for 5 minutes in production)
    const categoriesWithCounts = await Promise.all(
      categories.map(async (cat) => ({
        id: cat.id,
        name: cat.name,
        label_key: cat.label_key,
        icon: cat.icon,
        position: cat.position,
        guild_count: await prisma.guild.count({
          where: { primary_category_id: cat.id, discoverable: true },
        }),
      }))
    );

    res.json({ categories: categoriesWithCounts });
  } catch (err) {
    next(err);
  }
}

export async function getFeaturedGuilds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const featured = await prisma.featuredGuild.findMany({
      where: {
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      orderBy: { position: 'asc' },
      include: {
        guild: {
          select: {
            id: true,
            name: true,
            icon: true,
            banner: true,
            description: true,
            discovery_splash: true,
            discovery_description: true,
            premium_tier: true,
            features: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    const io = getIO();
    const presenceStore = (io as any)?.presenceStore;

    const featuredWithDetails = await Promise.all(featured.map(async (f) => {
      const tags = await prisma.guildDiscoveryTag.findMany({
        where: { guild_id: f.guild.id },
        select: { tag: true },
      });

      let presence_count = 0;
      if (presenceStore) {
        const guildMembers = await prisma.guildMember.findMany({
          where: { guild_id: f.guild.id },
          select: { user_id: true },
        });
        presence_count = guildMembers.filter((m: any) =>
          presenceStore.get(m.user_id)?.status !== 'offline'
        ).length;
      }

      return {
        guild: {
          id: f.guild.id,
          name: f.guild.name,
          icon: f.guild.icon,
          banner: f.guild.banner,
          discovery_splash: f.guild.discovery_splash,
          description: f.guild.description,
          discovery_description: f.guild.discovery_description,
          member_count: f.guild._count.members,
          presence_count,
          tags: tags.map((t: any) => t.tag),
          premium_tier: f.guild.premium_tier,
          features: JSON.parse(f.guild.features || '[]'),
          is_member: false,
        },
        position: f.position,
        featured_at: f.featured_at,
      };
    }));

    res.json({ featured: featuredWithDetails });
  } catch (err) {
    next(err);
  }
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
    if (!guild.discoverable) throw new AppError(404, 'GUILD_NOT_DISCOVERABLE', 'Server is not discoverable');

    const ban = await prisma.ban.findUnique({
      where: {
        guild_id_user_id: {
          guild_id: guild.id,
          user_id: req.user!.userId,
        },
      },
    });
    if (ban) throw new AppError(403, 'BANNED_FROM_GUILD', 'You are banned from this server');

    // Check max guilds per user
    const memberCount = await prisma.guildMember.count({
      where: { user_id: req.user!.userId },
    });
    const maxGuildsSetting = await prisma.platformSettings.findUnique({ where: { key: 'max_guilds_per_user' } });
    const maxGuilds = parseInt(maxGuildsSetting?.value || '100');
    if (memberCount >= maxGuilds) {
      throw new AppError(403, 'MAX_GUILDS_REACHED', 'Maximum number of servers reached');
    }

    const existingMember = await prisma.guildMember.findUnique({
      where: {
        guild_id_user_id: {
          guild_id: guild.id,
          user_id: req.user!.userId,
        },
      },
    });

    if (!existingMember) {
      // Check if membership verification is enabled
      const verification = await prisma.guildMemberVerification.findUnique({
        where: { guild_id: guild.id },
        select: { enabled: true },
      });
      const isPending = verification?.enabled ?? false;

      await prisma.guildMember.create({
        data: {
          guild_id: guild.id,
          user_id: req.user!.userId,
          pending: isPending,
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

      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.GUILD_CREATE, serializeBigInt({ guild: fullGuild }));
    }

    res.json(fullGuild);
  } catch (err) {
    next(err);
  }
}

export async function updateGuildDiscovery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId); // MANAGE_GUILD

    const { discoverable, discovery_description, primary_category_id, tags } = req.body;
    const data: any = {};

    if (discoverable !== undefined) data.discoverable = discoverable;
    if (discovery_description !== undefined) data.discovery_description = discovery_description;
    if (primary_category_id !== undefined) data.primary_category_id = primary_category_id;

    // Check requirements if enabling discoverable
    if (discoverable === true) {
      const { met, unmet } = await checkDiscoverabilityRequirements(req.params.guildId);
      if (!met) {
        throw new AppError(400, 'DISCOVERY_REQUIREMENTS_NOT_MET', `Requirements not met: ${unmet.join(', ')}`);
      }
    }

    const guild = await prisma.guild.update({
      where: { id: req.params.guildId },
      data,
      select: {
        id: true,
        name: true,
        discoverable: true,
        discovery_description: true,
        primary_category_id: true,
      },
    });

    // Update tags if provided
    if (tags !== undefined && Array.isArray(tags)) {
      // Remove existing tags
      await prisma.guildDiscoveryTag.deleteMany({
        where: { guild_id: req.params.guildId },
      });

      // Add new tags (max 10)
      const validTags = tags.slice(0, 10).map((t: string) => t.toLowerCase().slice(0, 20));
      if (validTags.length > 0) {
        await prisma.guildDiscoveryTag.createMany({
          data: validTags.map((tag: string) => ({
            guild_id: req.params.guildId,
            tag,
          } as any)),
        });
      }
    }

    // Get updated tags
    const guildTags = await prisma.guildDiscoveryTag.findMany({
      where: { guild_id: req.params.guildId },
      select: { tag: true },
    });

    // Check if requirements are met
    const { met: requirements_met } = await checkDiscoverabilityRequirements(req.params.guildId);

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_UPDATE, {
        guild: { id: guild.id, discoverable: guild.discoverable },
      });
    }

    res.json({
      ...guild,
      tags: guildTags.map((t: any) => t.tag),
      requirements_met,
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadDiscoverySplash(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId); // MANAGE_GUILD

    if (!req.file) {
      throw new AppError(400, 'NO_FILE', 'No file uploaded');
    }

    const guildId = req.params.guildId;
    const filename = `${guildId}_${Date.now()}.webp`;
    const filepath = path.join(DISCOVERY_UPLOAD_DIR, filename);

    await sharp(req.file.buffer)
      .resize(960, 540, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(filepath);

    const discovery_splash = `/uploads/discovery/${filename}`;

    const guild = await prisma.guild.update({
      where: { id: guildId },
      data: { discovery_splash },
      select: { id: true, discovery_splash: true },
    });

    res.json(guild);
  } catch (err) {
    next(err);
  }
}

// Admin: Feature a guild
export async function featureGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guild_id, position, expires_at } = req.body;

    const exists = await prisma.featuredGuild.findUnique({
      where: { guild_id },
    });

    if (exists) {
      throw new AppError(400, 'ALREADY_FEATURED', 'Guild is already featured');
    }

    const featured = await prisma.featuredGuild.create({
      data: {
        guild_id,
        featured_by: req.user!.userId,
        position: position || 0,
        featured_at: new Date(),
        expires_at: expires_at ? new Date(expires_at) : undefined,
      } as any,
    });

    res.json(featured);
  } catch (err) {
    next(err);
  }
}

// Admin: Unfeature a guild
export async function unfeatureGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildId = req.params.guildId;

    await prisma.featuredGuild.delete({
      where: { guild_id: guildId },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
