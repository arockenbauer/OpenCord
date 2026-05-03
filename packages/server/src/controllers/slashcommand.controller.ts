import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function getSlashCommands(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20)); // MANAGE_GUILD

    const commands = await prisma.applicationCommand.findMany({
      where: { guild_id: req.params.guildId },
      include: { application: { select: { id: true, name: true } } },
      orderBy: { created_at: 'asc' },
    });

    res.json({ commands });
  } catch (err) {
    next(err);
  }
}

export async function createSlashCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20)); // MANAGE_GUILD

    const count = await prisma.applicationCommand.count({
      where: { guild_id: req.params.guildId },
    });
    if (count >= 100) throw new AppError(400, 'MAX_COMMANDS', 'Maximum 100 slash commands per server');

    const command = await prisma.applicationCommand.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        application_id: req.body.application_id as string || null,
        name: req.body.name as string,
        description: req.body.description as string || null,
        options: req.body.options ? JSON.stringify(req.body.options) : null,
        default_member_permissions: req.body.default_member_permissions as string || null,
        dm_permission: req.body.dm_permission ?? true,
      } as any,
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('APPLICATIONS_COMMAND_CREATE', {
        guild_id: req.params.guildId,
        command,
      });
    }

    res.status(201).json(command);
  } catch (err) {
    next(err);
  }
}

export async function updateSlashCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20)); // MANAGE_GUILD

    const command = await prisma.applicationCommand.findUnique({
      where: { id: req.params.commandId },
    });
    if (!command) throw new AppError(404, 'NOT_FOUND', 'Command not found');
    if (command.guild_id !== req.params.guildId) {
      throw new AppError(403, 'FORBIDDEN', 'Command does not belong to this guild');
    }

    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.options !== undefined) data.options = JSON.stringify(req.body.options);
    if (req.body.default_member_permissions !== undefined) {
      data.default_member_permissions = req.body.default_member_permissions;
    }
    if (req.body.dm_permission !== undefined) data.dm_permission = req.body.dm_permission;

    const updated = await prisma.applicationCommand.update({
      where: { id: req.params.commandId },
      data,
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('APPLICATIONS_COMMAND_UPDATE', {
        guild_id: req.params.guildId,
        command: updated,
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteSlashCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20)); // MANAGE_GUILD

    const command = await prisma.applicationCommand.findUnique({
      where: { id: req.params.commandId },
    });
    if (!command) throw new AppError(404, 'NOT_FOUND', 'Command not found');
    if (command.guild_id !== req.params.guildId) {
      throw new AppError(403, 'FORBIDDEN', 'Command does not belong to this guild');
    }

    await prisma.applicationCommand.delete({
      where: { id: req.params.commandId },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit('APPLICATIONS_COMMAND_DELETE', {
        guild_id: req.params.guildId,
        command_id: req.params.commandId,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function handleSlashCommandInteraction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { command_id, channel_id, guild_id, options } = req.body;

    const command = await prisma.applicationCommand.findUnique({
      where: { id: command_id },
      include: { application: true },
    });
    if (!command) throw new AppError(404, 'NOT_FOUND', 'Command not found');

    // Create a message for the command
    const messageId = generateSnowflake();
    const message = await prisma.message.create({
      data: {
        id: messageId,
        channel_id,
        author_id: req.user!.userId,
        content: `/${command.name} ${options ? JSON.stringify(options) : ''}`,
        type: 2, // APPLICATION_COMMAND
        application_id: command.application_id,
      },
      include: {
        author: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${channel_id}`).emit(GatewayEvents.MESSAGE_CREATE, {
        message: { ...message, guild_id },
      });
    }

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}
