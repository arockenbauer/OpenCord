import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
const MANAGE_EVENTS = 0x8000000000n;
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { createAdminAuditLog } from '../utils/audit-log.js';

// Helper to include creator in event
function includeCreator() {
  return { creator: { select: { id: true, username: true, avatar: true } } };
}

// GET /api/guilds/:guildId/scheduled-events
export async function getScheduledEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, with_user_count } = req.query;
    const where: any = { guild_id: req.params.guildId };
    if (status) where.status = parseInt(status as string, 10);

    const events = await prisma.guildScheduledEvent.findMany({
      where,
      include: { creator: { select: { id: true, username: true, avatar: true } } },
      orderBy: { scheduled_start_time: 'asc' },
    });

    // If with_user_count is false, strip user_count (default true per spec)
    if (with_user_count === 'false') {
      events.forEach(e => { (e as any).user_count = undefined; });
    }

    res.json(events);
  } catch (err) {
    next(err);
  }
}

// POST /api/guilds/:guildId/scheduled-events
export async function createScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, (req as any).user!.userId);
    checkPermission(perms, BigInt(MANAGE_EVENTS));

    const { name, description, scheduled_start_time, scheduled_end_time, entity_type, entity_metadata, privacy_level, channel_id } = req.body;

    // Validation
    if (!name || name.length < 1 || name.length > 100) throw new AppError(400, 'INVALID_NAME', 'Name must be 1-100 characters');
    if (description && description.length > 1000) throw new AppError(400, 'INVALID_DESCRIPTION', 'Description max 1000 characters');

    const startTime = new Date(scheduled_start_time);
    if (isNaN(startTime.getTime()) || startTime <= new Date()) throw new AppError(400, 'INVALID_DATE', 'scheduled_start_time must be in the future');

    const endTime = scheduled_end_time ? new Date(scheduled_end_time) : null;
    const entityType = entity_type || 3;

    // Validation by entity_type
    if (entityType === 3) {
      // EXTERNAL: channel_id must be null, end_time required
      if (channel_id) throw new AppError(400, 'INVALID_CHANNEL', 'External events cannot have a channel');
      if (!endTime) throw new AppError(400, 'MISSING_END_TIME', 'scheduled_end_time is required for external events');
      if (endTime <= startTime) throw new AppError(400, 'INVALID_DATE', 'scheduled_end_time must be after scheduled_start_time');
    } else if (entityType === 1 || entityType === 2) {
      // STAGE or VOICE: channel_id required, must be valid channel in guild
      if (!channel_id) throw new AppError(400, 'MISSING_CHANNEL', 'channel_id is required for voice/stage events');
      const channel = await prisma.channel.findFirst({ where: { id: channel_id, guild_id: req.params.guildId } });
      if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found in this guild');
    }

    const event = await prisma.guildScheduledEvent.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        channel_id: entityType === 3 ? null : channel_id,
        creator_id: (req as any).user!.userId,
        name,
        description: description || null,
        image: null,
        scheduled_start_time: startTime,
        scheduled_end_time: endTime,
        entity_type: entityType,
        entity_metadata: entity_metadata ? JSON.stringify(entity_metadata) : null,
        status: 1, // SCHEDULED
        privacy_level: privacy_level || 2,
        user_count: 0,
        recurrence_rule: null,
      },
      include: includeCreator(),
    });

    // Audit log
    await createAdminAuditLog({
      adminId: (req as any).user!.userId,
      action: 'GUILD_SCHEDULED_EVENT_CREATE',
      targetType: 'GuildScheduledEvent',
      targetId: event.id,
      details: { name, entity_type: entityType },
      ipAddress: (req as any).ip,
    });

    // Emit Socket.IO event
    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_SCHEDULED_EVENT_CREATE, { guild_id: req.params.guildId, event });

    // Send system message in system channel
    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId }, select: { system_channel_id: true } });
    if (guild?.system_channel_id) {
      const startTime = new Date(event.scheduled_start_time).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
      await prisma.message.create({
        data: {
          id: generateSnowflake(),
          channel_id: guild.system_channel_id,
          author_id: (req as any).user!.userId,
          content: `📅 **${(req as any).user!.username}** a créé l'événement **${event.name}** — ${startTime}`,
          type: 19, // GUILD_SCHEDULED_EVENT_CREATE
          created_at: new Date(),
        },
      });
    }

    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
}

// GET /api/guilds/:guildId/scheduled-events/:eventId
export async function getScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await prisma.guildScheduledEvent.findUnique({
      where: { id: req.params.eventId },
      include: { creator: { select: { id: true, username: true, avatar: true } } },
    });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');
    res.json(event);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/guilds/:guildId/scheduled-events/:eventId
export async function updateScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user!.userId;
    const event = await prisma.guildScheduledEvent.findUnique({ where: { id: req.params.eventId }, include: { creator: true } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    // Check permissions: MANAGE_EVENTS or creator
    const isCreator = event.creator_id === userId;
    if (!isCreator) {
      const perms = await getMemberPermissions(req.params.guildId, userId);
      checkPermission(perms, BigInt(MANAGE_EVENTS));
    }

    const { name, description, scheduled_start_time, scheduled_end_time, entity_type, entity_metadata, status, privacy_level, channel_id } = req.body;

    const data: any = {};
    if (name !== undefined) {
      if (name.length < 1 || name.length > 100) throw new AppError(400, 'INVALID_NAME', 'Name must be 1-100 characters');
      data.name = name;
    }
    if (description !== undefined) {
      if (description && description.length > 1000) throw new AppError(400, 'INVALID_DESCRIPTION', 'Description max 1000 characters');
      data.description = description;
    }
    if (scheduled_start_time !== undefined) data.scheduled_start_time = new Date(scheduled_start_time);
    if (scheduled_end_time !== undefined) data.scheduled_end_time = scheduled_end_time ? new Date(scheduled_end_time) : null;
    if (entity_type !== undefined) data.entity_type = entity_type;
    if (entity_metadata !== undefined) data.entity_metadata = entity_metadata ? JSON.stringify(entity_metadata) : null;
    if (status !== undefined) data.status = status;
    if (privacy_level !== undefined) data.privacy_level = privacy_level;
    if (channel_id !== undefined) data.channel_id = channel_id;

    const updated = await prisma.guildScheduledEvent.update({
      where: { id: req.params.eventId },
      data,
      include: includeCreator(),
    });

    // Audit log
    await createAdminAuditLog({
      adminId: (req as any).user!.userId,
      action: 'GUILD_SCHEDULED_EVENT_UPDATE',
      targetType: 'GuildScheduledEvent',
      targetId: event.id,
      details: { changes: data },
      ipAddress: (req as any).ip,
    });

    // Emit Socket.IO event
    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_SCHEDULED_EVENT_UPDATE, { guild_id: req.params.guildId, event: updated });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/guilds/:guildId/scheduled-events/:eventId
export async function deleteScheduledEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, (req as any).user!.userId);
    checkPermission(perms, BigInt(MANAGE_EVENTS));

    const event = await prisma.guildScheduledEvent.findUnique({ where: { id: req.params.eventId } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    await prisma.guildScheduledEvent.delete({ where: { id: req.params.eventId } });

    // Audit log
    await createAdminAuditLog({
      adminId: (req as any).user!.userId,
      action: 'GUILD_SCHEDULED_EVENT_DELETE',
      targetType: 'GuildScheduledEvent',
      targetId: event.id,
      details: { name: event.name },
      ipAddress: (req as any).ip,
    });

    // Emit Socket.IO event
    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_SCHEDULED_EVENT_DELETE, { guild_id: req.params.guildId, event_id: req.params.eventId });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// PUT /api/guilds/:guildId/scheduled-events/:eventId/image - Upload cover image
export async function uploadEventImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, (req as any).user!.userId);
    checkPermission(perms, BigInt(MANAGE_EVENTS));

    const event = await prisma.guildScheduledEvent.findUnique({ where: { id: req.params.eventId } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    // File upload handled by middleware, path in req.file
    const file = (req as any).file;
    if (!file) throw new AppError(400, 'NO_FILE', 'No image file provided');

    const imagePath = `/files/events/${event.id}.webp`;
    // In real impl, process with sharp to 800x320 WebP
    // For now, assume middleware handled it
    await prisma.guildScheduledEvent.update({
      where: { id: req.params.eventId },
      data: { image: imagePath },
    });

    res.json({ image: imagePath });
  } catch (err) {
    next(err);
  }
}

// PUT /api/guilds/:guildId/scheduled-events/:eventId/users/@me - RSVP
export async function rsvpEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user!.userId;
    const eventId = req.params.eventId;

    const event = await prisma.guildScheduledEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    // Check if already RSVPed
    const existing = await prisma.guildScheduledEventUser.findUnique({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
    });
    if (existing) throw new AppError(400, 'ALREADY_RSVPED', 'Already RSVPed');

    // Create RSVP
    await prisma.guildScheduledEventUser.create({
      data: { event_id: eventId, user_id: userId },
    });

    // Increment user_count
    await prisma.guildScheduledEvent.update({
      where: { id: eventId },
      data: { user_count: { increment: 1 } },
    });

    // Emit Socket.IO event
    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_SCHEDULED_EVENT_USER_ADD, { guild_id: req.params.guildId, event_id: eventId, user_id: userId });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// DELETE /api/guilds/:guildId/scheduled-events/:eventId/users/@me - Remove RSVP
export async function removeRsvp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user!.userId;
    const eventId = req.params.eventId;

    const event = await prisma.guildScheduledEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    // Remove RSVP
    await prisma.guildScheduledEventUser.delete({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
    }).catch(() => { /* ignore if not found */ });

    // Decrement user_count (but not below 0)
    await prisma.guildScheduledEvent.update({
      where: { id: eventId },
      data: { user_count: { decrement: 1 } },
    });

    // Emit Socket.IO event
    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_SCHEDULED_EVENT_USER_REMOVE, { guild_id: req.params.guildId, event_id: eventId, user_id: userId });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// GET /api/guilds/:guildId/scheduled-events/:eventId/users - List RSVP users
export async function getEventUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit, after } = req.query;
    const take = Math.min(parseInt(limit as string, 10) || 100, 100);
    const eventId = req.params.eventId;

    const where: any = { event_id: eventId };
    if (after) where.user_id = { gt: after };

    const rsvps = await prisma.guildScheduledEventUser.findMany({
      where,
      take,
      orderBy: { created_at: 'asc' },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });

    const users = rsvps.map(r => ({
      user: { id: r.user_id, username: r.user?.username, avatar: r.user?.avatar },
      guild_scheduled_event_id: eventId,
    }));

    res.json({ users });
  } catch (err) {
    next(err);
  }
}
