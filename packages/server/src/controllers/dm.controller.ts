import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { createAndDispatchSystemMessage } from '../services/system-message.service.js';

const dmRecipientSelect = {
  id: true,
  username: true,
  discriminator: true,
  avatar: true,
  status: true,
  global_name: true,
  custom_status_text: true,
} as const;

export async function getDMChannels(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const memberships = await prisma.dMChannelMember.findMany({
      where: { user_id: req.user!.userId },
      include: {
        channel: {
          include: {
            members: {
              include: { user: { select: dmRecipientSelect } },
            },
          },
        },
      },
    });

    const channels = memberships
      .filter((m) => {
        // Inclure si pas fermé, ou si fermé mais avec des messages non lus
        if (!m.closed) return true;
        if (m.last_read_message_id !== m.channel.last_message_id) return true;
        return false;
      })
      .map((m) => ({
        ...m.channel,
        recipients: m.channel.members.filter((mem) => mem.user_id !== req.user!.userId).map((mem) => mem.user),
      }))
      .sort((a, b) => {
        // Trier par last_message_id décroissant
        if (!a.last_message_id) return 1;
        if (!b.last_message_id) return -1;
        return b.last_message_id.localeCompare(a.last_message_id);
      });

    res.json(channels);
  } catch (err) {
    next(err);
  }
}

export async function createDM(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { recipient_id } = req.body;
    if (recipient_id === req.user!.userId) throw new AppError(400, 'SELF_DM', 'Cannot DM yourself');
    const recipient = await prisma.user.findUnique({
      where: { id: recipient_id },
      select: { id: true, username: true, allow_dms_from: true },
    });
    if (!recipient) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const [blockByTarget, blockBySender, friendship] = await Promise.all([
      prisma.friend.findFirst({ where: { user_id: recipient_id, target_id: req.user!.userId, status: 2 } }),
      prisma.friend.findFirst({ where: { user_id: req.user!.userId, target_id: recipient_id, status: 2 } }),
      prisma.friend.findFirst({
        where: {
          status: 1,
          OR: [
            { user_id: req.user!.userId, target_id: recipient_id },
            { user_id: recipient_id, target_id: req.user!.userId },
          ],
        },
      }),
    ]);

    if (blockByTarget || blockBySender) throw new AppError(403, 'BLOCKED', 'Cannot create DM with this user');
    if (recipient.allow_dms_from === 'none') throw new AppError(403, 'DM_DISABLED', 'This user does not accept DMs');
    if (recipient.allow_dms_from === 'friends' && !friendship) {
      throw new AppError(403, 'DM_FRIENDS_ONLY', 'This user only accepts DMs from friends');
    }

    const existing = await prisma.dMChannel.findFirst({
      where: {
        type: 1,
        members: { every: { user_id: { in: [req.user!.userId, recipient_id] } } },
      },
      include: {
        members: {
          include: { user: { select: dmRecipientSelect } },
        },
      },
    });

    if (existing && existing.members.length === 2) {
      res.json({
        ...existing,
        recipients: existing.members.filter((m) => m.user_id !== req.user!.userId).map((m) => m.user),
      });
      return;
    }

    const channelId = generateSnowflake();
    const dm = await prisma.dMChannel.create({
      data: {
        id: channelId,
        type: 1,
        members: {
          create: [
            { user_id: req.user!.userId },
            { user_id: recipient_id },
          ],
        },
      },
      include: {
        members: {
          include: { user: { select: dmRecipientSelect } },
        },
      },
    });

    const channel = await prisma.channel.create({
      data: { id: channelId, name: 'DM', type: 1 },
    });

    const io = getIO();
    if (io) {
      for (const member of dm.members) {
        if (member.user_id !== req.user!.userId) {
          io.to(`user:${member.user_id}`).emit(GatewayEvents.CHANNEL_CREATE, {
            channel: {
              ...dm,
              ...channel,
              type: 1,
              recipients: dm.members.filter((m) => m.user_id !== member.user_id).map((m) => m.user),
            },
          });
        }
      }
    }

    res.status(201).json({
      ...dm,
      recipients: dm.members.filter((m) => m.user_id !== req.user!.userId).map((m) => m.user),
    });
  } catch (err) {
    next(err);
  }
}

export async function createGroupDM(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { recipient_ids, name } = req.body;
    if (!Array.isArray(recipient_ids) || recipient_ids.length === 0) {
      throw new AppError(400, 'INVALID_RECIPIENTS', 'At least one recipient is required for a group DM');
    }
    if (recipient_ids.length > 9) throw new AppError(400, 'TOO_MANY', 'Max 10 members in group DM');

    const allIds = [req.user!.userId, ...recipient_ids];
    const channelId = generateSnowflake();

    const dm = await prisma.dMChannel.create({
      data: {
        id: channelId,
        type: 3,
        name: name || null,
        owner_id: req.user!.userId,
        members: {
          create: allIds.map((uid: string) => ({ user_id: uid })),
        },
      },
      include: {
        members: {
          include: { user: { select: dmRecipientSelect } },
        },
      },
    });

    await prisma.channel.create({
      data: { id: channelId, name: name || 'Group DM', type: 3 },
    });

    const io = getIO();
    if (io) {
      for (const member of dm.members) {
        if (member.user_id !== req.user!.userId) {
          io.to(`user:${member.user_id}`).emit(GatewayEvents.CHANNEL_CREATE, { channel: { ...dm, type: 3 } });
        }
      }
    }

    res.status(201).json({
      ...dm,
      recipients: dm.members.filter((m) => m.user_id !== req.user!.userId).map((m) => m.user),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDMChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const membership = await prisma.dMChannelMember.findUnique({
      where: { channel_id_user_id: { channel_id: req.params.channelId, user_id: req.user!.userId } },
    });
    if (!membership) throw new AppError(404, 'NOT_FOUND', 'DM channel not found');

    const dmChannel = await prisma.dMChannel.findUnique({ where: { id: req.params.channelId } });
    if (!dmChannel) throw new AppError(404, 'NOT_FOUND', 'DM channel not found');

    if (dmChannel.owner_id !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the owner can update the group DM');
    }

    const { name, icon } = req.body;
    const updated = await prisma.dMChannel.update({
      where: { id: req.params.channelId },
      data: {
        name: name !== undefined ? name : dmChannel.name,
        icon: icon !== undefined ? icon : dmChannel.icon,
      },
      include: {
        members: { include: { user: { select: dmRecipientSelect } } },
      },
    });

    if (name) {
      await prisma.channel.update({ where: { id: req.params.channelId }, data: { name } });
    }

    const io = getIO();
    const changedFields: string[] = [];
    if (name && name !== dmChannel.name) changedFields.push(`Channel name changed to "${name}"`);
    if (icon && icon !== dmChannel.icon) changedFields.push('Channel icon changed');

    if (changedFields.length > 0) {
      const systemMessageId = generateSnowflake();
      await prisma.message.create({
        data: {
          id: systemMessageId,
          channel_id: req.params.channelId,
          author_id: 'system',
          type: 6,
          content: changedFields.join(', '),
        },
      });

      if (io) {
        io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.CHANNEL_UPDATE, {
          channel_id: req.params.channelId,
          name: updated.name,
          icon: updated.icon,
        });
        io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_CREATE, {
          channel_id: req.params.channelId,
          message: {
            id: systemMessageId,
            type: 6,
            content: changedFields.join(', '),
            author: { id: 'system', username: 'System', discriminator: '0000' },
            channel_id: req.params.channelId,
            created_at: new Date().toISOString(),
          },
        });
      }
    }

    res.json({
      ...updated,
      recipients: updated.members.filter((m) => m.user_id !== req.user!.userId).map((m) => m.user),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteDMChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const membership = await prisma.dMChannelMember.findUnique({
      where: { channel_id_user_id: { channel_id: req.params.channelId, user_id: req.user!.userId } },
    });
    if (!membership) throw new AppError(404, 'NOT_FOUND', 'DM channel not found');

    const dmChannel = await prisma.dMChannel.findUnique({ where: { id: req.params.channelId } });
    if (!dmChannel) throw new AppError(404, 'NOT_FOUND', 'DM channel not found');

    // Type 1 = DM individuel: masquer (closed=true) au lieu de supprimer
    if (dmChannel.type === 1) {
      await prisma.dMChannelMember.update({
        where: { channel_id_user_id: { channel_id: req.params.channelId, user_id: req.user!.userId } },
        data: { closed: true },
      });
      res.json(dmChannel);
      return;
    }

    // Type 3 = Groupe DM: quitter le groupe
    await prisma.dMChannelMember.delete({
      where: { channel_id_user_id: { channel_id: req.params.channelId, user_id: req.user!.userId } },
    });

    // Si c'est l'owner qui part, transférer la propriété
    if (dmChannel.owner_id === req.user!.userId) {
      const remainingMember = await prisma.dMChannelMember.findFirst({
        where: { channel_id: req.params.channelId },
        orderBy: { joined_at: 'asc' },
      });
      if (remainingMember) {
        await prisma.dMChannel.update({
          where: { id: req.params.channelId },
          data: { owner_id: remainingMember.user_id },
        });
      }
    }

    const remaining = await prisma.dMChannelMember.count({ where: { channel_id: req.params.channelId } });
    if (remaining === 0) {
      await prisma.dMChannel.delete({ where: { id: req.params.channelId } });
      await prisma.channel.delete({ where: { id: req.params.channelId } }).catch(() => {});
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addDMRecipient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmChannel = await prisma.dMChannel.findUnique({ where: { id: req.params.channelId } });
    if (!dmChannel) throw new AppError(404, 'NOT_FOUND', 'DM channel not found');

    if (dmChannel.type === 1) throw new AppError(400, 'NOT_A_GROUP', 'Cannot add recipients to a DM');
    if (dmChannel.owner_id !== req.user!.userId) throw new AppError(403, 'FORBIDDEN', 'Only the owner can add recipients');

    const existing = await prisma.dMChannelMember.findUnique({
      where: { channel_id_user_id: { channel_id: req.params.channelId, user_id: req.params.userId } },
    });
    if (existing) throw new AppError(400, 'ALREADY_MEMBER', 'User is already in this DM');

    const memberCount = await prisma.dMChannelMember.count({ where: { channel_id: req.params.channelId } });
    if (memberCount >= 10) throw new AppError(400, 'TOO_MANY', 'Max 10 members in group DM');

    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    await prisma.dMChannelMember.create({
      data: { channel_id: req.params.channelId, user_id: req.params.userId },
    });

    // Create system message for new recipient
    const systemMsgId = generateSnowflake();
    await prisma.message.create({
      data: {
        id: systemMsgId,
        channel_id: req.params.channelId,
        author_id: 'system',
        type: 7, // RECIPIENT_ADD
        content: `${target.username} was added to the group`,
      },
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.CHANNEL_UPDATE, {
        channel_id: req.params.channelId,
      });
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_CREATE, {
        channel_id: req.params.channelId,
        message: {
          id: systemMsgId,
          type: 7,
          content: `${target.username} was added to the group`,
          author: { id: 'system', username: 'System', discriminator: '0000' },
          channel_id: req.params.channelId,
          created_at: new Date().toISOString(),
        },
      });
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.DM_CHANNEL_CREATE, {
        channel: { id: req.params.channelId, name: dmChannel.name, type: 1 },
      });
    }

    res.status(201).json({ id: target.id, username: target.username, discriminator: target.discriminator, avatar: target.avatar });
  } catch (err) {
    next(err);
  }
}

export async function removeDMRecipient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmChannel = await prisma.dMChannel.findUnique({ where: { id: req.params.channelId } });
    if (!dmChannel) throw new AppError(404, 'NOT_FOUND', 'DM channel not found');

    if (dmChannel.type === 1) throw new AppError(400, 'NOT_A_GROUP', 'Cannot remove recipients from a DM');
    if (dmChannel.owner_id !== req.user!.userId && req.params.userId !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the owner can remove recipients');
    }

    await prisma.dMChannelMember.delete({
      where: { channel_id_user_id: { channel_id: req.params.channelId, user_id: req.params.userId } },
    });

    // Create system message for removed recipient
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    const systemMsgId = generateSnowflake();
    await prisma.message.create({
      data: {
        id: systemMsgId,
        channel_id: req.params.channelId,
        author_id: 'system',
        type: 8, // RECIPIENT_REMOVE
        content: `${target?.username || req.params.userId} was removed from the group`,
      },
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.CHANNEL_UPDATE, {
        channel_id: req.params.channelId,
      });
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_CREATE, {
        channel_id: req.params.channelId,
        message: {
          id: systemMsgId,
          type: 8,
          content: `${target?.username || req.params.userId} was removed from the group`,
          author: { id: 'system', username: 'System', discriminator: '0000' },
          channel_id: req.params.channelId,
          created_at: new Date().toISOString(),
        },
      });
      if (req.params.userId !== req.user!.userId) {
        io.to(`user:${req.params.userId}`).emit(GatewayEvents.CHANNEL_DELETE, {
          channel_id: req.params.channelId,
        });
      }
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
