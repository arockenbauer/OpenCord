import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function createStageInstance(req: Request, res: Response, next: NextFunction) {
  try {
    const { channelId } = req.params;
    const { topic, privacyLevel } = req.body;
    const userId = req.user!.userId;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { guild: true },
    });

    if (!channel || channel.type !== 14) {
      throw new AppError(404, 'STAGE_CHANNEL_NOT_FOUND', 'Stage channel not found');
    }

    if (channel.guild.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const existing = await prisma.stageInstance.findUnique({
      where: { channel_id: channelId },
    });

    if (existing) {
      throw new AppError(400, 'STAGE_ALREADY_ACTIVE', 'Stage instance already exists');
    }

    const stage = await prisma.stageInstance.create({
      data: {
        id: generateSnowflake(),
        channel_id: channelId,
        guild_id: channel.guild_id,
        topic: topic || '',
        privacy_level: privacyLevel || 1,
      },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.STAGE_INSTANCE_CREATE, stage);
    }

    res.status(201).json(stage);
  } catch (err) {
    next(err);
  }
}

export async function getStageInstance(req: Request, res: Response, next: NextFunction) {
  try {
    const { channelId } = req.params;
    const stage = await prisma.stageInstance.findUnique({
      where: { channel_id: channelId },
    });

    if (!stage) {
      throw new AppError(404, 'STAGE_NOT_FOUND', 'Stage instance not found');
    }

    res.json(stage);
  } catch (err) {
    next(err);
  }
}

export async function updateStageInstance(req: Request, res: Response, next: NextFunction) {
  try {
    const { channelId } = req.params;
    const { topic, privacyLevel } = req.body;
    const userId = req.user!.userId;

    const stage = await prisma.stageInstance.findUnique({
      where: { channel_id: channelId },
      include: { guild: true },
    });

    if (!stage) {
      throw new AppError(404, 'STAGE_NOT_FOUND', 'Stage instance not found');
    }

    if (stage.guild.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.stageInstance.update({
      where: { channel_id: channelId },
      data: {
        topic: topic ?? stage.topic,
        privacy_level: privacyLevel ?? stage.privacy_level,
      },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${stage.guild_id}`).emit(GatewayEvents.STAGE_INSTANCE_UPDATE, updated);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteStageInstance(req: Request, res: Response, next: NextFunction) {
  try {
    const { channelId } = req.params;
    const userId = req.user!.userId;

    const stage = await prisma.stageInstance.findUnique({
      where: { channel_id: channelId },
      include: { guild: true },
    });

    if (!stage) {
      throw new AppError(404, 'STAGE_NOT_FOUND', 'Stage instance not found');
    }

    if (stage.guild.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.stageInstance.delete({
      where: { channel_id: channelId },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${stage.guild_id}`).emit(GatewayEvents.STAGE_INSTANCE_DELETE, { channel_id: channelId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
