import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await prisma.report.create({
      data: {
        id: generateSnowflake(),
        reporter_id: req.user!.userId,
        target_type: req.body.target_type || 'user',
        target_id: req.body.target_id || req.body.user_id,
        reason: req.body.reason,
        status: 'pending',
      },
    });

    const io = getIO();
    if (io) {
      io.to('admin').emit(GatewayEvents.NOTIFICATION_CREATE, { type: 'report', report_id: report.id });
    }

    res.status(201).json(report);
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
    const { status, notes } = req.body;
    const report = await prisma.report.update({
      where: { id: req.params.reportId },
      data: {
        status: status !== undefined ? status : undefined,
        notes: notes !== undefined ? notes : undefined,
        reviewer_id: req.user!.userId,
        resolved_at: status === 'resolved' || status === 'dismissed' ? new Date() : undefined,
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
    const where: any = {};
    if (status) where.status = status;

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const reports = await prisma.report.findMany({
      where,
      include: {
        reporter: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    res.json({ reports });
  } catch (err) {
    next(err);
  }
}
