import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function getScheduledEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const events = await prisma.guildScheduledEvent.findMany({
      where: { guild_id: req.params.guildId },
      include: { users: { select: { id: true, user_id: true, subscribed_at: true } } },
      orderBy: { scheduled_start_time: 'asc' },
    });
    res.json({ events });
  } catch (err) {
    next(err);
  }
}

export async function createScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const event = await prisma.guildScheduledEvent.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        channel_id: req.body.channel_id || null,
        creator_id: req.user!.userId,
        name: req.body.name,
        description: req.body.description || null,
        scheduled_start_time: new Date(req.body.scheduled_start_time),
        scheduled_end_time: req.body.scheduled_end_time ? new Date(req.body.scheduled_end_time) : null,
        entity_type: req.body.entity_type || 3,
        entity_metadata: req.body.entity_metadata ? JSON.stringify(req.body.entity_metadata) : null,
        status: 1,
        image: req.body.image || null,
      },
    });

    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
}

export async function getScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await prisma.guildScheduledEvent.findUnique({
      where: { id: req.params.eventId },
      include: { users: { select: { id: true, user_id: true, subscribed_at: true } } },
    });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');
    res.json(event);
  } catch (err) {
    next(err);
  }
}

export async function updateScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const event = await prisma.guildScheduledEvent.findUnique({ where: { id: req.params.eventId } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const updated = await prisma.guildScheduledEvent.update({
      where: { id: req.params.eventId },
      data: {
        name: req.body.name !== undefined ? req.body.name : event.name,
        description: req.body.description !== undefined ? req.body.description : event.description,
        scheduled_start_time: req.body.scheduled_start_time ? new Date(req.body.scheduled_start_time) : event.scheduled_start_time,
        scheduled_end_time: req.body.scheduled_end_time !== undefined ? (req.body.scheduled_end_time ? new Date(req.body.scheduled_end_time) : null) : event.scheduled_end_time,
        entity_type: req.body.entity_type !== undefined ? req.body.entity_type : event.entity_type,
        entity_metadata: req.body.entity_metadata !== undefined ? JSON.stringify(req.body.entity_metadata) : event.entity_metadata,
        image: req.body.image !== undefined ? req.body.image : event.image,
        status: req.body.status !== undefined ? req.body.status : event.status,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    await prisma.guildScheduledEvent.delete({ where: { id: req.params.eventId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getEventUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await prisma.guildScheduledEventUser.findMany({
      where: { event_id: req.params.eventId },
      select: { id: true, user_id: true, subscribed_at: true },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

export async function rsvpEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await prisma.guildScheduledEvent.findUnique({ where: { id: req.params.eventId } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const existing = await prisma.guildScheduledEventUser.findUnique({
      where: { event_id_user_id: { event_id: req.params.eventId, user_id: req.user!.userId } },
    });
    if (existing) throw new AppError(400, 'ALREADY_RSVPED', 'Already RSVPed');

    await prisma.guildScheduledEventUser.create({
      data: { id: generateSnowflake(), event_id: req.params.eventId, user_id: req.user!.userId },
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function removeRsvp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.guildScheduledEventUser.delete({
      where: { event_id_user_id: { event_id: req.params.eventId, user_id: req.user!.userId } },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
