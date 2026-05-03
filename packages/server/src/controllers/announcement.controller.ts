import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { createAdminAuditLog } from '../utils/audit-log.js';

export async function getAnnouncements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { created_at: 'desc' },
      include: { creator: { select: { id: true, username: true, discriminator: true } } },
    });
    res.json(announcements);
  } catch (err) {
    next(err);
  }
}

export async function getActiveAnnouncements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        active: true,
        OR: [{ expires_at: null }, { expires_at: { gte: now } }],
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(announcements);
  } catch (err) {
    next(err);
  }
}

export async function createAnnouncement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, content, type, active, expires_at } = req.body;
    if (!title || !content) throw new AppError(400, 'MISSING_FIELDS', 'Title and content are required');

    const announcement = await prisma.announcement.create({
      data: {
        id: generateSnowflake(),
        title,
        content,
        type: type || 'info',
        active: active !== undefined ? active : true,
        created_by: req.user!.userId,
        expires_at: expires_at ? new Date(expires_at) : null,
      },
    });

    const io = getIO();
    if (io && announcement.active) {
      io.emit(GatewayEvents.NOTIFICATION_CREATE, { type: 'announcement', announcement });
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'ANNOUNCEMENT_CREATE', targetType: 'announcement', targetId: announcement.id, details: { title, type }, ipAddress: ip });

    res.status(201).json(announcement);
  } catch (err) {
    next(err);
  }
}

export async function updateAnnouncement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const announcement = await prisma.announcement.update({
      where: { id: req.params.announcementId },
      data: {
        title: req.body.title,
        content: req.body.content,
        type: req.body.type,
        active: req.body.active,
        expires_at: req.body.expires_at !== undefined ? (req.body.expires_at ? new Date(req.body.expires_at) : null) : undefined,
      },
    });
    res.json(announcement);
  } catch (err) {
    next(err);
  }
}

export async function deleteAnnouncement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.announcement.delete({ where: { id: req.params.announcementId } });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'ANNOUNCEMENT_DELETE', targetType: 'announcement', targetId: req.params.announcementId, ipAddress: ip });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
