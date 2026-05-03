import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

// Component type constants
const COMPONENT_TYPES = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
};

// Validate message components according to spec
function validateComponents(components: any[]): void {
  if (!components || components.length === 0) return;
  
  // Max 5 ActionRows per message
  if (components.length > 5) {
    throw new AppError(400, 'INVALID_COMPONENTS', 'Maximum 5 ActionRows per message');
  }
  
  for (const row of components) {
    if (row.type !== COMPONENT_TYPES.ACTION_ROW) {
      throw new AppError(400, 'INVALID_COMPONENTS', 'Top-level component must be ActionRow (type 1)');
    }
    
    if (!row.components || row.components.length === 0) {
      throw new AppError(400, 'INVALID_COMPONENTS', 'ActionRow cannot be empty');
    }
    
    let buttonCount = 0;
    let hasSelect = false;
    
    for (const component of row.components) {
      if (component.type === COMPONENT_TYPES.BUTTON) {
        buttonCount++;
        if (buttonCount > 5) {
          throw new AppError(400, 'INVALID_COMPONENTS', 'Maximum 5 buttons per ActionRow');
        }
      } else if (component.type === COMPONENT_TYPES.STRING_SELECT) {
        if (hasSelect) {
          throw new AppError(400, 'INVALID_COMPONENTS', 'Only one select component per ActionRow');
        }
        hasSelect = true;
      } else if (component.type === COMPONENT_TYPES.TEXT_INPUT) {
        // Text inputs only allowed in modals
        throw new AppError(400, 'INVALID_COMPONENTS', 'TextInput only allowed in modals');
      }
    }
  }
}

export async function createApplicationCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description, type = 1, options, default_member_permissions, dm_permission, nsfw } = req.body;
    const applicationId = req.params.appId;

    const command = await prisma.applicationCommand.create({
      data: {
        id: generateSnowflake(),
        application_id: applicationId,
        guild_id: req.params.guildId || null,
        name,
        description,
        type,
        options: options ? JSON.stringify(options) : null,
        default_member_permissions: default_member_permissions ? default_member_permissions.toString() : null,
        dm_permission,
        nsfw,
        version: generateSnowflake(),
      },
    });

    res.status(201).json(command);
  } catch (err) {
    next(err);
  }
}

export async function listApplicationCommands(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const applicationId = req.params.appId;
    const guildId = req.params.guildId;

    const where: any = { application_id: applicationId };
    if (guildId) where.guild_id = guildId;

    const commands = await prisma.applicationCommand.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json({ commands });
  } catch (err) {
    next(err);
  }
}

export async function getApplicationCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, commandId } = req.params;

    const command = await prisma.applicationCommand.findFirst({
      where: { id: commandId, application_id: appId },
    });

    if (!command) throw new AppError(404, 'COMMAND_NOT_FOUND', 'Command not found');

    res.json(command);
  } catch (err) {
    next(err);
  }
}

export async function updateApplicationCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, commandId } = req.params;
    const { name, description, options, default_member_permissions, dm_permission, nsfw } = req.body;

    const command = await prisma.applicationCommand.findFirst({
      where: { id: commandId, application_id: appId },
    });

    if (!command) throw new AppError(404, 'COMMAND_NOT_FOUND', 'Command not found');

    const updated = await prisma.applicationCommand.update({
      where: { id: commandId },
      data: {
        name: name || undefined,
        description: description || undefined,
        options: options ? JSON.stringify(options) : undefined,
        default_member_permissions: default_member_permissions ? default_member_permissions.toString() : undefined,
        dm_permission,
        nsfw,
        version: generateSnowflake(),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteApplicationCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, commandId } = req.params;

    await prisma.applicationCommand.deleteMany({
      where: { id: commandId, application_id: appId },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function bulkOverwriteCommands(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const guildId = req.params.guildId;
    const commands = req.body.commands || [];

    await prisma.$transaction(async (tx) => {
      await tx.applicationCommand.deleteMany({
        where: { application_id: appId, guild_id: guildId || null },
      });

      if (commands.length > 0) {
        await tx.applicationCommand.createMany({
          data: commands.map((cmd: any) => ({
            id: generateSnowflake(),
            application_id: appId,
            guild_id: guildId || null,
            name: cmd.name,
            description: cmd.description,
            type: cmd.type || 1,
            options: cmd.options ? JSON.stringify(cmd.options) : null,
            default_member_permissions: cmd.default_member_permissions ? BigInt(cmd.default_member_permissions).toString() : null,
            dm_permission: cmd.dm_permission,
            nsfw: cmd.nsfw,
            version: generateSnowflake(),
          })),
        });
      }
    });

    const updated = await prisma.applicationCommand.findMany({
      where: { application_id: appId, guild_id: guildId || null },
    });

    res.json({ commands: updated });
  } catch (err) {
    next(err);
  }
}

export async function createInteraction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { application_id, type, guild_id, channel_id, user_id, data, token } = req.body;

    const interaction = await prisma.interaction.create({
      data: {
        id: generateSnowflake(),
        application_id,
        type,
        guild_id,
        channel_id,
        user_id,
        token,
        data: data ? JSON.stringify(data) : null,
      },
    });

    const io = getIO();
    if (io) {
      io.to(`user:${user_id}`).emit('INTERACTION_CREATE', {
        id: interaction.id,
        application_id,
        type,
        guild_id,
        channel_id,
        user_id,
        token,
        data,
      });
    }

    res.status(201).json({ id: interaction.id });
  } catch (err) {
    next(err);
  }
}

export async function respondToInteraction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { interactionId, interactionToken } = req.params;
    const { type, data } = req.body;

    const interaction = await prisma.interaction.findFirst({
      where: { id: interactionId, token: interactionToken },
    });

    if (!interaction) throw new AppError(404, 'INTERACTION_NOT_FOUND', 'Interaction not found');
    if (interaction.responded) throw new AppError(400, 'ALREADY_RESPONDED', 'Interaction already responded to');

    await prisma.interaction.update({
      where: { id: interactionId },
      data: { responded: true },
    });

    const io = getIO();
    
    // Handle different response types according to spec
    switch (type) {
      case 1: // PONG - just acknowledge
        res.status(200).json({ type: 1 });
        break;
        
      case 4: // CHANNEL_MESSAGE_WITH_SOURCE
      case 5: // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        if (io && interaction.channel_id && data) {
          io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.INTERACTION_CREATE, {
            id: interaction.id,
            type,
            data,
            guild_id: interaction.guild_id,
          });
        }
        res.status(200).json({ type, data });
        break;
        
      case 6: // DEFERRED_UPDATE_MESSAGE
      case 7: // UPDATE_MESSAGE
        if (io && data) {
          io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.INTERACTION_CREATE, {
            id: interaction.id,
            type,
            data,
          });
        }
        res.status(200).json({ type, data });
        break;
        
      case 8: // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
        if (data && data.choices) {
          // Limit to 25 choices max
          data.choices = data.choices.slice(0, 25);
        }
        res.status(200).json({ type: 8, data });
        break;
        
      case 9: // MODAL
        if (io) {
          io.to(`user:${interaction.user_id}`).emit(GatewayEvents.INTERACTION_CREATE, {
            id: interaction.id,
            type: 9,
            data,
          });
        }
        res.status(200).json({ type: 9, data });
        break;
        
      default:
        res.status(200).json({ success: true });
    }
  } catch (err) {
    next(err);
  }
}

export async function listCommandPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, guildId } = req.params;

    const permissions = await prisma.applicationCommandPermission.findMany({
      where: { application_id: appId, guild_id: guildId },
      include: { command: { select: { id: true, name: true } } },
    });

    res.json({ permissions });
  } catch (err) {
    next(err);
  }
}

export async function updateCommandPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, guildId, cmdId } = req.params;
    const { permissions } = req.body; // Array of { role_id?, user_id?, type, allow?, deny? }

    await prisma.$transaction(async (tx) => {
      // Delete existing permissions for this command
      await tx.applicationCommandPermission.deleteMany({
        where: { command_id: cmdId, guild_id: guildId },
      });

      // Create new permissions
      if (permissions && permissions.length > 0) {
        await tx.applicationCommandPermission.createMany({
          data: permissions.map((p: any) => ({
            id: generateSnowflake(),
            application_id: appId,
            command_id: cmdId,
            guild_id: guildId,
            role_id: p.role_id || null,
            user_id: p.user_id || null,
            permission_type: p.permission_type || (p.role_id ? 1 : 2),
            allow: p.allow ? BigInt(p.allow) : BigInt(0),
            deny: p.deny ? BigInt(p.deny) : BigInt(0),
          })),
        });
      }
    });

    const updated = await prisma.applicationCommandPermission.findMany({
      where: { command_id: cmdId, guild_id: guildId },
    });

    res.json({ permissions: updated });
  } catch (err) {
    next(err);
  }
}

export async function getOriginalResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken } = req.params;

    const interaction = await prisma.interaction.findFirst({
      where: { application_id: appId, token: interactionToken },
    });

    if (!interaction) throw new AppError(404, 'INTERACTION_NOT_FOUND', 'Interaction not found');

    // In a real implementation, you'd store the original response message
    // For now, return a placeholder
    res.json({ content: 'Original response not stored' });
  } catch (err) {
    next(err);
  }
}

export async function editOriginalResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken } = req.params;
    const { content, embeds, components } = req.body;

    const interaction = await prisma.interaction.findFirst({
      where: { application_id: appId, token: interactionToken },
    });

    if (!interaction) throw new AppError(404, 'INTERACTION_NOT_FOUND', 'Interaction not found');

    // In a real implementation, you'd update the stored message
    res.json({ content, embeds, components });
  } catch (err) {
    next(err);
  }
}

export async function deleteOriginalResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken } = req.params;

    const interaction = await prisma.interaction.findFirst({
      where: { application_id: appId, token: interactionToken },
    });

    if (!interaction) throw new AppError(404, 'INTERACTION_NOT_FOUND', 'Interaction not found');

    // In a real implementation, you'd delete the stored message
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function sendFollowUpMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken } = req.params;
    const { content, embeds, components, tts, wait } = req.body;

    const interaction = await prisma.interaction.findFirst({
      where: { application_id: appId, token: interactionToken },
    });

    if (!interaction) throw new AppError(404, 'INTERACTION_NOT_FOUND', 'Interaction not found');

    // Create a follow-up message
    const messageId = generateSnowflake();
    const message = await prisma.message.create({
      data: {
        id: messageId,
        channel_id: interaction.channel_id!,
        author_id: interaction.application_id, // Bot user ID
        content: content || '',
        type: 4, // APPLICATION_COMMAND
        application_id: appId,
      },
      include: {
        author: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    const io = getIO();
    if (io && interaction.channel_id) {
      io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_CREATE, {
        message: { ...message, guild_id: interaction.guild_id },
      });
    }

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

export async function editFollowUpMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken, messageId } = req.params;
    const { content, embeds, components } = req.body;

    const interaction = await prisma.interaction.findFirst({
      where: { application_id: appId, token: interactionToken },
    });

    if (!interaction) throw new AppError(404, 'INTERACTION_NOT_FOUND', 'Interaction not found');

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.application_id !== appId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content || undefined,
        edited_at: new Date(),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}
