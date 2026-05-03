import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

// Constantes pour les raisons de signalement
const REASON_MAP: Record<number, string> = {
  0: 'ILLEGAL_CONTENT',
  1: 'HARASSMENT',
  2: 'SPAM',
  3: 'NSFW',
  4: 'SELF_HARM',
  5: 'IMPERSONATION',
  6: 'MISINFORMATION',
  7: 'OTHER',
};

export async function createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guild_id, target_id, target_type, reason, description } = req.body;

    // Validation
    if (!target_id) {
      throw new AppError(400, 'INVALID_REQUEST', 'target_id must be provided');
    }

    // Vérifier qu'on ne se signale pas soi-même
    if (target_id === req.user!.userId && target_type === 'user') {
      throw new AppError(400, 'INVALID_REQUEST', 'You cannot report yourself');
    }

    // Vérifier si un signalement identique existe déjà dans les 24h
    const existingReport = await prisma.report.findFirst({
      where: {
        reporter_id: req.user!.userId,
        target_id: target_id || undefined,
        target_type: target_type || undefined,
        reason,
        created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (existingReport) {
      throw new AppError(400, 'DUPLICATE_REPORT', 'You have already reported this within the last 24 hours');
    }

    const report = await prisma.report.create({
      data: {
        id: generateSnowflake(),
        reporter_id: req.user!.userId,
        target_type: target_type || 'user',
        target_id: target_id,
        reason: description || reason || null,
        status: 'pending',
      },
      include: {
        reporter: { select: { id: true, username: true, avatar: true } },
      },
    });

    const io = getIO();
    if (io) {
      io.to('admin').emit(GatewayEvents.NOTIFICATION_CREATE, { type: 'report', report_id: report.id });
    }

    res.status(201).json({
      id: report.id,
      status: report.status,
      created_at: report.created_at,
    });
  } catch (err) {
    next(err);
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.reportId },
      include: {
        reporter: { select: { id: true, username: true, avatar: true } },
        reviewer: { select: { id: true, username: true, avatar: true } },
      },
    });
    if (!report) throw new AppError(404, 'NOT_FOUND', 'Report not found');
    res.json(report);
  } catch (err) {
    next(err);
  }
}

export async function updateReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, review_note } = req.body;
    const updateData: any = {};

    if (status !== undefined) {
      updateData.status = status;
      if (status === 2 || status === 3) { // ACTION_TAKEN or DISMISSED
        updateData.updated_at = new Date();
      }
    }
    if (review_note !== undefined) updateData.review_note = review_note;
    updateData.reviewed_by = req.user!.userId;

    const report = await prisma.report.update({
      where: { id: req.params.reportId },
      data: updateData,
      include: {
        reporter: { select: { id: true, username: true, avatar: true } },
      },
    });

    res.json(report);
  } catch (err) {
    next(err);
  }
}

export async function getReports(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const guild_id = req.query.guild_id as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status !== undefined) where.status = status;
    if (guild_id) where.guild_id = guild_id;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true, avatar: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({
      reports,
      total,
      page,
    });
  } catch (err) {
    next(err);
  }
}

export async function getReportStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [total, pending, reviewed, action_taken, dismissed, byReason] = await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where: { status: 'pending' } }),
      prisma.report.count({ where: { status: 'reviewed' } }),
      prisma.report.count({ where: { status: 'resolved' } }),
      prisma.report.count({ where: { status: 'dismissed' } }),
      prisma.report.groupBy({
        by: ['reason'],
        _count: { reason: true },
      }),
    ]);

    const by_reason: Record<string, number> = {};
    for (const item of byReason) {
      const key = REASON_MAP[Number(item.reason)] || `UNKNOWN_${item.reason}`;
      by_reason[key] = item._count.reason;
    }

    res.json({
      total,
      pending,
      reviewed,
      action_taken,
      dismissed,
      by_reason,
    });
  } catch (err) {
    next(err);
  }
}
