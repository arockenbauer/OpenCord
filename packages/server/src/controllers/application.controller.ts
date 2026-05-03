import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { checkPermission, getMemberPermissions, requireMembership } from './guild.controller.js';

function serializeApplication(application: any) {
  return {
    id: application.id,
    name: application.name,
    description: application.description,
    icon: application.icon,
    owner_id: application.owner_id,
    bot_id: application.bot_id,
    created_at: application.created_at,
    bot: application.bot ? {
      id: application.bot.id,
      username: application.bot.username,
      avatar: application.bot.avatar,
      bot: application.bot.bot,
    } : null,
  };
}

async function attachBots<T extends { bot_id?: string | null }>(applications: T[]): Promise<Array<T & { bot: { id: string; username: string; avatar: string | null; bot: boolean } | null }>> {
  const botIds = applications.map((application) => application.bot_id).filter((botId): botId is string => !!botId);
  if (botIds.length === 0) {
    return applications.map((application) => ({ ...application, bot: null }));
  }

  const bots = await prisma.user.findMany({
    where: { id: { in: botIds } },
    select: { id: true, username: true, avatar: true, bot: true },
  });
  const botMap = new Map(bots.map((bot) => [bot.id, bot]));

  return applications.map((application) => ({
    ...application,
    bot: application.bot_id ? (botMap.get(application.bot_id) || null) : null,
  }));
}

export async function listApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const applications = await prisma.application.findMany({
      where: { owner_id: req.user!.userId },
      orderBy: { created_at: 'desc' },
    });
    const withBots = await attachBots(applications);
    res.json(withBots.map(serializeApplication));
  } catch (err) {
    next(err);
  }
}

export async function createApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const name = String(req.body.name || '').trim();
    if (!name || name.length < 2 || name.length > 100) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Le nom de l’application doit contenir entre 2 et 100 caractères.');
    }

    const application = await prisma.application.create({
      data: {
        id: generateSnowflake(),
        name,
        description: req.body.description?.trim() || null,
        owner_id: req.user!.userId,
      },
    });

    res.status(201).json({ application: serializeApplication({ ...application, bot: null }) });
  } catch (err) {
    next(err);
  }
}

export async function getApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.applicationId },
    });

    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
    const [withBot] = await attachBots([application]);
    res.json({ application: serializeApplication(withBot) });
  } catch (err) {
    next(err);
  }
}

export async function createBot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await prisma.application.findUnique({ where: { id: req.params.applicationId } });
    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
    if (application.owner_id !== req.user!.userId) throw new AppError(403, 'FORBIDDEN', 'Not your application');
    if (application.bot_id) throw new AppError(409, 'BOT_ALREADY_EXISTS', 'This application already has a bot');

    const botId = generateSnowflake();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const botIdB64 = Buffer.from(botId).toString('base64url');
    const timestampB64 = Buffer.from(timestamp).toString('base64url');
    const hmac = crypto.createHmac('sha256', process.env.BOT_SECRET || 'opencord_dev_bot_secret')
      .update(`${botIdB64}.${timestampB64}`)
      .digest('base64url');
    const token = `${botIdB64}.${timestampB64}.${hmac}`;
    const [botTokenHash, passwordHash] = await Promise.all([
      bcrypt.hash(token, 12),
      bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12),
    ]);

    const botUser = await prisma.user.create({
      data: {
        id: botId,
        email: `${botId}@bots.opencord.local`,
        username: application.name.slice(0, 32),
        discriminator: '0000',
        password_hash: passwordHash,
        date_of_birth: new Date('2000-01-01'),
        verified: true,
        bot: true,
        bot_token: botTokenHash,
        bot_owner_id: req.user!.userId,
        application_id: application.id,
      },
      select: { id: true, username: true, avatar: true, bot: true },
    });

    await prisma.application.update({
      where: { id: application.id },
      data: { bot_id: botUser.id },
    });

    res.status(201).json({
      bot: botUser,
      token,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAuthorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { client_id, permissions, scope } = req.query;
    if (!client_id) throw new AppError(400, 'MISSING_PARAM', 'client_id is required');

    const application = await prisma.application.findUnique({
      where: { id: client_id as string },
      include: { bot: { select: { id: true, username: true, avatar: true } } },
    });
    if (!application || !application.bot) {
      throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application or bot not found');
    }

    const perms = permissions ? BigInt(permissions as string) : BigInt(0);

    const guilds = await prisma.guild.findMany({
      where: { members: { some: { user_id: req.user!.userId } } },
      select: { id: true, name: true, icon: true, owner_id: true },
    });

    res.json({
      application: {
        id: application.id,
        name: application.name,
        icon: application.icon,
      },
      bot: application.bot ? {
        id: application.bot.id,
        username: application.bot.username,
        avatar: application.bot.avatar,
      } : null,
      permissions: perms.toString(),
      guilds: guilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        is_owner: g.owner_id === req.user!.userId,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function postAuthorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { client_id, guild_id, permissions } = req.body;
    if (!client_id || !guild_id) {
      throw new AppError(400, 'MISSING_PARAM', 'client_id and guild_id are required');
    }

    const application = await prisma.application.findUnique({
      where: { id: client_id },
      include: { bot: true },
    });
    if (!application || !application.bot_id) {
      throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application or bot not found');
    }

    await requireMembership(guild_id, req.user!.userId);
    const perms = await getMemberPermissions(guild_id, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const permValue = typeof permissions === 'string' || typeof permissions === 'number'
      ? BigInt(permissions)
      : BigInt(0);

    await prisma.guildMember.upsert({
      where: { guild_id_user_id: { guild_id, user_id: application.bot_id } },
      create: { guild_id, user_id: application.bot_id },
      update: {},
    });

    let managedRole = await prisma.role.findFirst({
      where: { guild_id, managed: true, name: application.name },
      orderBy: { position: 'desc' },
    });

    if (!managedRole) {
      const highestRole = await prisma.role.findFirst({
        where: { guild_id },
        orderBy: { position: 'desc' },
      });

      managedRole = await prisma.role.create({
        data: {
          id: generateSnowflake(),
          guild_id,
          name: application.name,
          managed: true,
          permissions: permValue,
          position: (highestRole?.position || 0) + 1,
        },
      });
    } else if (managedRole.permissions !== permValue) {
      managedRole = await prisma.role.update({
        where: { id: managedRole.id },
        data: { permissions: permValue },
      });
    }

    await prisma.guildMemberRole.upsert({
      where: {
        guild_id_user_id_role_id: {
          guild_id,
          user_id: application.bot_id,
          role_id: managedRole.id,
        },
      },
      create: {
        guild_id,
        user_id: application.bot_id,
        role_id: managedRole.id,
        assigned_by: req.user!.userId,
      },
      update: {},
    });

    res.json({
      guild_id,
      bot_id: application.bot_id,
      permissions: permValue.toString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listAllApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page = '1', limit = '20', search } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.application.count({ where }),
    ]);
    const withBots = await attachBots(applications);
    res.json({ applications: withBots.map(serializeApplication), total, page: pageNum, limit: limitNum });
  } catch (err) {
    next(err);
  }
}

export async function updateApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await prisma.application.findUnique({ where: { id: req.params.applicationId } });
    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
    if (application.owner_id !== req.user!.userId) throw new AppError(403, 'FORBIDDEN', 'Not your application');

    const { name, description, icon } = req.body;
    const data: any = {};
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (trimmedName.length < 2 || trimmedName.length > 100) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Le nom doit contenir entre 2 et 100 caractères.');
      }
      data.name = trimmedName;
    }
    if (description !== undefined) data.description = String(description).trim() || null;
    if (icon !== undefined) data.icon = icon || null;

    const updated = await prisma.application.update({
      where: { id: req.params.applicationId },
      data,
    });
    const [withBot] = await attachBots([updated]);
    res.json({ application: serializeApplication(withBot) });
  } catch (err) {
    next(err);
  }
}

export async function deleteApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.applicationId },
      include: { bot: true },
    });
    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
    if (application.owner_id !== req.user!.userId) throw new AppError(403, 'FORBIDDEN', 'Not your application');

    if (application.bot_id) {
      await prisma.user.delete({ where: { id: application.bot_id } });
    }

    await prisma.application.delete({ where: { id: req.params.applicationId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function resetBotToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await prisma.application.findUnique({ where: { id: req.params.applicationId } });
    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
    if (application.owner_id !== req.user!.userId) throw new AppError(403, 'FORBIDDEN', 'Not your application');
    if (!application.bot_id) throw new AppError(400, 'NO_BOT', 'This application has no bot');

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const botIdB64 = Buffer.from(application.bot_id).toString('base64url');
    const timestampB64 = Buffer.from(timestamp).toString('base64url');
    const hmac = crypto.createHmac('sha256', process.env.BOT_SECRET || 'opencord_dev_bot_secret')
      .update(`${botIdB64}.${timestampB64}`)
      .digest('base64url');
    const token = `${botIdB64}.${timestampB64}.${hmac}`;

    const botTokenHash = await bcrypt.hash(token, 12);
    await prisma.user.update({
      where: { id: application.bot_id },
      data: { bot_token: botTokenHash },
    });

    res.json({ token });
  } catch (err) {
    next(err);
  }
}
