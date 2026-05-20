import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { serializeMessageForClient } from '../utils/message-response.js';

// Component type constants
const COMPONENT_TYPES = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
};

const INTERACTION_TOKEN_TTL_MS = 15 * 60 * 1000;
const MESSAGE_FLAG_LOADING = 1 << 6;
const INTERACTION_MESSAGE_TYPE = 4;

const messageInclude = {
  author: { select: { id: true, username: true, discriminator: true, avatar: true, bot: true } },
  attachments: true,
  embeds: true,
  reactions: true,
} as const;

function assertInteractionTokenValid(interaction: { created_at: Date }): void {
  if (Date.now() - interaction.created_at.getTime() > INTERACTION_TOKEN_TTL_MS) {
    throw new AppError(401, 'INTERACTION_EXPIRED', 'Interaction token has expired');
  }
}

function extractTargetMessageId(interactionData: string | null): string | null {
  if (!interactionData) return null;

  try {
    const parsed = JSON.parse(interactionData);
    if (typeof parsed?.message_id === 'string') return parsed.message_id;
    if (typeof parsed?.message?.id === 'string') return parsed.message.id;
    if (typeof parsed?.message?.message_id === 'string') return parsed.message.message_id;
  } catch {
    return null;
  }

  return null;
}

function getResponseData(data: unknown): Record<string, any> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return data as Record<string, any>;
}

async function syncMessageEmbeds(messageId: string, embeds: unknown): Promise<void> {
  if (embeds === undefined) return;

  await prisma.embed.deleteMany({ where: { message_id: messageId } });
  if (!Array.isArray(embeds) || embeds.length === 0) return;

  await prisma.embed.createMany({
    data: embeds.map((embed) => ({
      id: generateSnowflake(),
      message_id: messageId,
      data: JSON.stringify(embed),
    })),
  });
}

async function getAuthorizedInteraction(
  where: { id: string; token: string } | { application_id: string; token: string },
  botUserId: string,
) {
  const interaction = await prisma.interaction.findFirst({
    where,
    include: {
      application: {
        select: { bot_id: true },
      },
    },
  });

  if (!interaction) throw new AppError(404, 'INTERACTION_NOT_FOUND', 'Interaction not found');
  if (!interaction.application.bot_id || interaction.application.bot_id !== botUserId) {
    throw new AppError(403, 'FORBIDDEN', 'Bot is not allowed to access this interaction');
  }

  return interaction;
}

async function getApplicationBotId(applicationId: string): Promise<string> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { bot_id: true },
  });

  if (!application?.bot_id) {
    throw new AppError(400, 'NO_BOT', 'Application has no bot user');
  }

  return application.bot_id;
}

async function getMessagePayload(messageId: string, guildId?: string | null) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude,
  });

  if (!message) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  const payload = serializeMessageForClient(message, guildId);
  if (!payload) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  return payload;
}

async function createInteractionResponseMessage(
  interaction: { id: string; application_id: string; channel_id: string | null; guild_id: string | null },
  responseType: number,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  if (!interaction.channel_id) {
    throw new AppError(400, 'MISSING_CHANNEL', 'Interaction has no channel');
  }

  if (data.components) {
    validateComponents(data.components);
  }

  const botId = await getApplicationBotId(interaction.application_id);
  const messageId = generateSnowflake();
  const isDeferredPlaceholder = responseType === 5;

  await prisma.message.create({
    data: {
      id: messageId,
      channel_id: interaction.channel_id,
      author_id: botId,
      content: data.content ?? (isDeferredPlaceholder ? 'Le bot repond...' : null),
      components: data.components ? JSON.stringify(data.components) : null,
      type: INTERACTION_MESSAGE_TYPE,
      flags: isDeferredPlaceholder ? MESSAGE_FLAG_LOADING : Number(data.flags || 0),
      tts: Boolean(data.tts),
      application_id: interaction.application_id,
    },
  });

  await syncMessageEmbeds(messageId, data.embeds);

  await prisma.interaction.update({
    where: { id: interaction.id },
    data: {
      responded: true,
      response_type: responseType,
      original_message_id: messageId,
    },
  });

  return getMessagePayload(messageId, interaction.guild_id);
}

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
    const application = await prisma.application.findUnique({
      where: { id: application_id },
      select: { bot_id: true },
    });

    if (!application?.bot_id) throw new AppError(400, 'NO_BOT', 'Application has no bot user');

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
      io.to(`user:${application.bot_id}`).emit(GatewayEvents.INTERACTION_CREATE, {
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
    const interaction = await getAuthorizedInteraction({ id: interactionId, token: interactionToken }, req.user!.userId);
    if (interaction.responded) throw new AppError(400, 'ALREADY_RESPONDED', 'Interaction already responded to');
    assertInteractionTokenValid(interaction);
    const io = getIO();
    const responseData = getResponseData(data);

    switch (type) {
      case 1:
        await prisma.interaction.update({
          where: { id: interactionId },
          data: { responded: true, response_type: 1 },
        });
        res.status(200).json({ type: 1 });
        break;

      case 4: {
        const message = await createInteractionResponseMessage(interaction, 4, responseData);
        if (io && interaction.channel_id) {
          io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_CREATE, { message });
        }
        res.status(200).json({ type: 4, data: message });
        break;
      }

      case 5: {
        const message = await createInteractionResponseMessage(interaction, 5, responseData);
        if (io && interaction.channel_id) {
          io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_CREATE, { message });
        }
        res.status(200).json({ type: 5 });
        break;
      }

      case 6: {
        if (interaction.type !== 3) {
          throw new AppError(400, 'INVALID_INTERACTION_TYPE', 'Deferred message updates require a component interaction');
        }

        const targetMessageId = extractTargetMessageId(interaction.data);
        if (!targetMessageId) {
          throw new AppError(400, 'MISSING_MESSAGE_ID', 'Component interaction data must include a target message');
        }

        const targetMessage = await prisma.message.findUnique({
          where: { id: targetMessageId },
        });
        if (!targetMessage || targetMessage.channel_id !== interaction.channel_id) {
          throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Target message not found');
        }

        await prisma.interaction.update({
          where: { id: interactionId },
          data: {
            responded: true,
            response_type: 6,
            original_message_id: targetMessageId,
          },
        });

        res.status(200).json({ type: 6 });
        break;
      }

      case 7: {
        if (interaction.type !== 3) {
          throw new AppError(400, 'INVALID_INTERACTION_TYPE', 'Message updates require a component interaction');
        }

        const targetMessageId = extractTargetMessageId(interaction.data);
        if (!targetMessageId) {
          throw new AppError(400, 'MISSING_MESSAGE_ID', 'Component interaction data must include a target message');
        }

        const existingMessage = await prisma.message.findUnique({
          where: { id: targetMessageId },
        });
        if (!existingMessage || existingMessage.channel_id !== interaction.channel_id) {
          throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Target message not found');
        }

        if (responseData.components) {
          validateComponents(responseData.components);
        }

        await prisma.message.update({
          where: { id: targetMessageId },
          data: {
            content: responseData.content !== undefined ? responseData.content : undefined,
            components: responseData.components !== undefined
              ? (responseData.components ? JSON.stringify(responseData.components) : null)
              : undefined,
            flags: responseData.flags !== undefined ? Number(responseData.flags) : undefined,
            edited_at: new Date(),
          },
        });
        await syncMessageEmbeds(targetMessageId, responseData.embeds);
        await prisma.interaction.update({
          where: { id: interactionId },
          data: {
            responded: true,
            response_type: 7,
            original_message_id: targetMessageId,
          },
        });

        const message = await getMessagePayload(targetMessageId, interaction.guild_id);
        if (io && interaction.channel_id) {
          io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_UPDATE, { message });
        }
        res.status(200).json({ type: 7, data: message });
        break;
      }

      case 8:
        if (responseData.choices) {
          responseData.choices = responseData.choices.slice(0, 25);
        }
        await prisma.interaction.update({
          where: { id: interactionId },
          data: { responded: true, response_type: 8 },
        });
        res.status(200).json({ type: 8, data: responseData });
        break;

      case 9:
        await prisma.interaction.update({
          where: { id: interactionId },
          data: { responded: true, response_type: 9 },
        });
        if (io) {
          io.to(`user:${interaction.user_id}`).emit(GatewayEvents.INTERACTION_CREATE, {
            id: interaction.id,
            type: 9,
            data: responseData,
          });
        }
        res.status(200).json({ type: 9, data: responseData });
        break;

      default:
        await prisma.interaction.update({
          where: { id: interactionId },
          data: { responded: true },
        });
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
    const interaction = await getAuthorizedInteraction({ application_id: appId, token: interactionToken }, req.user!.userId);
    assertInteractionTokenValid(interaction);

    if (!interaction.original_message_id) {
      throw new AppError(404, 'NO_ORIGINAL_RESPONSE', 'No original response exists for this interaction');
    }

    res.json(await getMessagePayload(interaction.original_message_id, interaction.guild_id));
  } catch (err) {
    next(err);
  }
}

export async function editOriginalResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken } = req.params;
    const { content, embeds, components, flags } = req.body;
    const interaction = await getAuthorizedInteraction({ application_id: appId, token: interactionToken }, req.user!.userId);
    assertInteractionTokenValid(interaction);

    if (!interaction.original_message_id) {
      throw new AppError(404, 'NO_ORIGINAL_RESPONSE', 'No original response exists for this interaction');
    }

    if (components) {
      validateComponents(components);
    }

    const existingMessage = await prisma.message.findUnique({
      where: { id: interaction.original_message_id },
    });
    if (!existingMessage) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Original response not found');

    await prisma.message.update({
      where: { id: interaction.original_message_id },
      data: {
        content: content !== undefined ? content : undefined,
        components: components !== undefined ? (components ? JSON.stringify(components) : null) : undefined,
        flags: flags !== undefined
          ? Number(flags)
          : (Number(existingMessage.flags || 0) & ~MESSAGE_FLAG_LOADING),
        edited_at: new Date(),
      },
    });
    await syncMessageEmbeds(interaction.original_message_id, embeds);

    const message = await getMessagePayload(interaction.original_message_id, interaction.guild_id);
    const io = getIO();
    if (io && interaction.channel_id) {
      io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_UPDATE, { message });
    }

    res.json(message);
  } catch (err) {
    next(err);
  }
}

export async function deleteOriginalResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken } = req.params;
    const interaction = await getAuthorizedInteraction({ application_id: appId, token: interactionToken }, req.user!.userId);
    assertInteractionTokenValid(interaction);

    if (!interaction.original_message_id) {
      throw new AppError(404, 'NO_ORIGINAL_RESPONSE', 'No original response exists for this interaction');
    }

    const originalMessageId = interaction.original_message_id;
    await prisma.embed.deleteMany({ where: { message_id: originalMessageId } });
    await prisma.reaction.deleteMany({ where: { message_id: originalMessageId } });
    await prisma.attachment.deleteMany({ where: { message_id: originalMessageId } });
    await prisma.message.delete({ where: { id: originalMessageId } });
    await prisma.interaction.update({
      where: { id: interaction.id },
      data: { original_message_id: null },
    });

    const io = getIO();
    if (io && interaction.channel_id) {
      io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_DELETE, {
        id: originalMessageId,
        channel_id: interaction.channel_id,
        guild_id: interaction.guild_id,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function sendFollowUpMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, interactionToken } = req.params;
    const { content, embeds, components, tts } = req.body;
    const interaction = await getAuthorizedInteraction({ application_id: appId, token: interactionToken }, req.user!.userId);
    assertInteractionTokenValid(interaction);

    if (!interaction.channel_id) {
      throw new AppError(400, 'MISSING_CHANNEL', 'Interaction has no channel');
    }
    if (components) {
      validateComponents(components);
    }

    const botId = await getApplicationBotId(appId);
    const messageId = generateSnowflake();
    await prisma.message.create({
      data: {
        id: messageId,
        channel_id: interaction.channel_id,
        author_id: botId,
        content: content || null,
        components: components ? JSON.stringify(components) : null,
        type: INTERACTION_MESSAGE_TYPE,
        application_id: appId,
        tts: Boolean(tts),
      },
    });
    await syncMessageEmbeds(messageId, embeds);

    const message = await getMessagePayload(messageId, interaction.guild_id);
    const io = getIO();
    if (io && interaction.channel_id) {
      io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_CREATE, {
        message,
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
    const { content, embeds, components, flags } = req.body;
    const interaction = await getAuthorizedInteraction({ application_id: appId, token: interactionToken }, req.user!.userId);
    assertInteractionTokenValid(interaction);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.application_id !== appId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    if (components) {
      validateComponents(components);
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content !== undefined ? content : undefined,
        components: components !== undefined ? (components ? JSON.stringify(components) : null) : undefined,
        flags: flags !== undefined ? Number(flags) : undefined,
        edited_at: new Date(),
      },
    });
    await syncMessageEmbeds(messageId, embeds);

    const updated = await getMessagePayload(messageId, interaction.guild_id);
    const io = getIO();
    if (io && interaction.channel_id) {
      io.to(`channel:${interaction.channel_id}`).emit(GatewayEvents.MESSAGE_UPDATE, {
        message: updated,
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}
