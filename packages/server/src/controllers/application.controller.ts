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
    res.json({ applications: withBots.map(serializeApplication) });
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
    const token = `${Buffer.from(botId).toString('base64url')}.${Buffer.from(application.id).toString('base64url')}.${crypto.randomBytes(24).toString('base64url')}`;
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

export async function authorizeApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await prisma.application.findUnique({ where: { id: req.body.application_id } });
    if (!application || !application.bot_id) {
      throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application or bot not found');
    }

    await requireMembership(req.body.guild_id, req.user!.userId);
    const perms = await getMemberPermissions(req.body.guild_id, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const permissions = typeof req.body.permissions === 'string' || typeof req.body.permissions === 'number'
      ? String(req.body.permissions)
      : '0';

    await prisma.guildMember.upsert({
      where: { guild_id_user_id: { guild_id: req.body.guild_id, user_id: application.bot_id } },
      create: { guild_id: req.body.guild_id, user_id: application.bot_id },
      update: {},
    });

    let managedRole = await prisma.role.findFirst({
      where: { guild_id: req.body.guild_id, managed: true, name: application.name },
      orderBy: { position: 'desc' },
    });

    if (!managedRole) {
      const highestRole = await prisma.role.findFirst({
        where: { guild_id: req.body.guild_id },
        orderBy: { position: 'desc' },
      });

      managedRole = await prisma.role.create({
        data: {
          id: generateSnowflake(),
          guild_id: req.body.guild_id,
          name: application.name,
          managed: true,
          permissions,
          position: (highestRole?.position || 0) + 1,
        },
      });
    } else if (managedRole.permissions !== permissions) {
      managedRole = await prisma.role.update({
        where: { id: managedRole.id },
        data: { permissions },
      });
    }

    await prisma.guildMemberRole.upsert({
      where: {
        guild_id_user_id_role_id: {
          guild_id: req.body.guild_id,
          user_id: application.bot_id,
          role_id: managedRole.id,
        },
      },
      create: {
        guild_id: req.body.guild_id,
        user_id: application.bot_id,
        role_id: managedRole.id,
        assigned_by: req.user!.userId,
      },
      update: {},
    });

    res.json({
      success: true,
      guild_id: req.body.guild_id,
      application_id: application.id,
      bot_id: application.bot_id,
    });
  } catch (err) {
    next(err);
  }
}
