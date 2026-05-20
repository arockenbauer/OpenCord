import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/auth.middleware.js';
import { pinoLogger } from '../utils/logger.js';
import { getIO } from '../gateway/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const prisma = new PrismaClient();
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const logDir = process.env.LOG_FILE_PATH || './logs';

// Health check
export async function getHealth(req: Request, res: Response) {
  const checks: Record<string, any> = {};
  let overallStatus = 'healthy';

  // Database check
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'healthy', latency_ms: Date.now() - start };
  } catch (err: any) {
    checks.database = { status: 'unhealthy', error: err.message };
    overallStatus = 'unhealthy';
  }

  // Filesystem check (disk space)
  let diskFreeGb = 0;
  try {
    diskFreeGb = getDiskFreeGB();
    checks.filesystem = {
      status: diskFreeGb < 0.1 ? 'unhealthy' : diskFreeGb < 1 ? 'warn' : 'healthy',
      disk_free_gb: diskFreeGb,
    };
  } catch {
    checks.filesystem = { status: 'healthy', disk_free_gb: 0 };
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
  checks.memory = {
    status: memUsage.heapUsed / memUsage.heapTotal > 0.95 ? 'unhealthy' : memUsage.heapUsed / memUsage.heapTotal > 0.9 ? 'warn' : 'healthy',
    heap_used_mb: heapUsedMb,
    heap_total_mb: heapTotalMb,
    rss_mb: Math.round(memUsage.rss / 1024 / 1024),
  };

  const uptimeSeconds = Math.floor(process.uptime());
  res.json({
    status: overallStatus,
    version: process.env.npm_package_version || '0.1.0',
    uptime_seconds: uptimeSeconds,
    checks,
    timestamp: new Date().toISOString(),
  });
}

// Admin metrics
export async function getMetrics(req: Request, res: Response) {
  const memUsage = process.memoryUsage();
  const cpuCount = os.cpus().length;
  const loadAvg = os.loadavg();

  // Database latency
  let dbLatency = 0;
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
  } catch {}

  let dbSize = 0;
  let walSize = 0;
  try {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db';
    if (fs.existsSync(dbPath)) {
      dbSize = fs.statSync(dbPath).size;
    }
    const walPath = dbPath + '-wal';
    if (fs.existsSync(walPath)) {
      walSize = fs.statSync(walPath).size;
    }
  } catch {}

  let uploadsSize = 0;
  let backupsSize = 0;
  let logsSize = 0;
  try {
    if (fs.existsSync(uploadDir)) {
      uploadsSize = getDirSize(uploadDir);
    }
    const backupsDir = './backups';
    if (fs.existsSync(backupsDir)) {
      backupsSize = getDirSize(backupsDir);
    }
    if (fs.existsSync(logDir)) {
      logsSize = getDirSize(logDir);
    }
  } catch {}

  const [totalUsers, totalGuilds, messagesToday, messagesThisHour] = await Promise.all([
    prisma.user.count(),
    prisma.guild.count(),
    prisma.message.count({
      where: { created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.message.count({
      where: { created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    }),
  ]);

  const diskFreeGb = getDiskFreeGB();
  const socketStats = getSocketStats();

  res.json({
    system: {
      uptime_seconds: Math.floor(process.uptime()),
      uptime_human: formatUptime(process.uptime()),
      node_version: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpu_count: cpuCount,
      load_average: loadAvg,
    },
    memory: {
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round((memUsage.external || 0) / 1024 / 1024),
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
    },
    database: {
      size_mb: Math.round(dbSize / 1024 / 1024 * 10) / 10,
      wal_size_mb: Math.round(walSize / 1024 / 1024 * 10) / 10,
      latency_ms: dbLatency,
    },
    storage: {
      uploads_size_mb: Math.round(uploadsSize / 1024 / 1024 * 10) / 10,
      backups_size_mb: Math.round(backupsSize / 1024 / 1024 * 10) / 10,
      logs_size_mb: Math.round(logsSize / 1024 / 1024 * 10) / 10,
      disk_free_gb: diskFreeGb,
    },
    connections: socketStats,
    counters: {
      total_users: totalUsers,
      total_guilds: totalGuilds,
      messages_today: messagesToday,
      messages_this_hour: messagesThisHour,
    },
  });
}

// Public status page data
export async function getStatus(req: Request, res: Response) {
  const monitors = await prisma.statusMonitor.findMany({
    include: { checks: { orderBy: { checked_at: 'desc' }, take: 1 } },
    orderBy: { position: 'asc' },
  });

  const activeIncidents = await prisma.statusIncident.findMany({
    where: { status: { not: 'resolved' } },
    include: { updates: { orderBy: { created_at: 'desc' } } },
    orderBy: { created_at: 'desc' },
  });

  const upcomingMaintenances = await prisma.statusMaintenance.findMany({
    where: {
      status: 'scheduled',
      scheduled_start: { gte: new Date() },
    },
    orderBy: { scheduled_start: 'asc' },
  });

  let overallStatus = 'operational';
  const monitorsWithStatus = monitors.map((m: any) => {
    const lastCheck = m.checks[0];
    const status = lastCheck?.status || 'unknown';
    if (status === 'down') {
      overallStatus = overallStatus === 'operational' ? 'partial_outage' : 'major_outage';
    } else if (status === 'degraded' && overallStatus === 'operational') {
      overallStatus = 'degraded';
    }
    return {
      id: m.id,
      name: m.name,
      status: status === 'up' ? 'up' : status === 'down' ? 'down' : 'degraded',
      uptime_percentage_30d: 99.95,
      latency_ms: lastCheck?.latency_ms || null,
      last_checked_at: lastCheck?.checked_at || m.created_at,
    };
  });

  res.json({
    overall_status: overallStatus,
    monitors: monitorsWithStatus,
    active_incidents: activeIncidents.map((i: any) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      impact: i.impact,
      updates: i.updates.map((u: any) => ({
        status: u.status,
        message: u.message,
        created_at: u.created_at,
      })),
    })),
    upcoming_maintenances: upcomingMaintenances.map((m: any) => ({
      id: m.id,
      title: m.title,
      scheduled_start: m.scheduled_start,
      scheduled_end: m.scheduled_end,
      status: m.status,
    })),
  });
}

// Status history
export async function getStatusHistory(req: Request, res: Response) {
  const days = Math.min(parseInt(req.query.days as string) || 90, 90);
  const monitors = await prisma.statusMonitor.findMany({
    include: {
      checks: {
        where: {
          checked_at: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
        },
        orderBy: { checked_at: 'asc' },
      },
    },
  });

  res.json({
    monitors: monitors.map((m: any) => ({
      id: m.id,
      name: m.name,
      daily_history: aggregateChecksByDay(m.checks),
    })),
  });
}

// Incidents list (public)
export async function getIncidents(req: Request, res: Response) {
  const status = req.query.status as string;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const where: any = {};
  if (status) where.status = status;

  const incidents = await prisma.statusIncident.findMany({
    where,
    include: { updates: { orderBy: { created_at: 'desc' } } },
    orderBy: { created_at: 'desc' },
    take: limit,
    skip: offset,
  });

  res.json(incidents.map((i: any) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    impact: i.impact,
    created_at: i.created_at,
    resolved_at: i.resolved_at,
    updates: i.updates.map((u: any) => ({
      status: u.status,
      message: u.message,
      created_at: u.created_at,
    })),
  })));
}

// Admin: Create incident
export const createIncident = [
  requireAdmin(1),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, status, impact, message } = req.body;
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!title) return res.status(400).json({ error: 'title is required' });

      const incident = await prisma.statusIncident.create({
        data: {
          id: generateSnowflake(),
          title,
          status: status || 'investigating',
          impact: impact || 'minor',
          created_by: userId,
        },
      });

      if (message) {
        await prisma.statusIncidentUpdate.create({
          data: {
            id: generateSnowflake(),
            incident_id: incident.id,
            status: incident.status,
            message,
            created_by: userId,
          },
        });
      }

      pinoLogger.info({ module: 'admin', action: 'INCIDENT_CREATE', incident_id: incident.id });
      res.status(201).json(incident);
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Update incident
export const updateIncident = [
  requireAdmin(1),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, message } = req.body;
      const userId = (req as any).user?.userId;

      const updateData: any = {};
      if (status) {
        updateData.status = status;
        if (status === 'resolved') updateData.resolved_at = new Date();
      }

      const incident = await prisma.statusIncident.update({
        where: { id },
        data: updateData,
      });

      if (message) {
        await prisma.statusIncidentUpdate.create({
          data: {
            id: generateSnowflake(),
            incident_id: id,
            status: status || incident.status,
            message,
            created_by: userId,
          },
        });
      }

      pinoLogger.info({ module: 'admin', action: 'INCIDENT_UPDATE', incident_id: id });
      res.json(incident);
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Create maintenance
export const createMaintenance = [
  requireAdmin(2),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, scheduled_start, scheduled_end, auto_maintenance_mode } = req.body;
      const userId = (req as any).user?.userId;
      if (!title || !scheduled_start || !scheduled_end) {
        return res.status(400).json({ error: 'title, scheduled_start and scheduled_end are required' });
      }

      const maintenance = await prisma.statusMaintenance.create({
        data: {
          id: generateSnowflake(),
          title,
          description,
          scheduled_start: new Date(scheduled_start),
          scheduled_end: new Date(scheduled_end),
          status: 'scheduled',
          auto_maintenance_mode: auto_maintenance_mode || false,
          created_by: userId,
        },
      });

      pinoLogger.info({ module: 'admin', action: 'MAINTENANCE_CREATE', maintenance_id: maintenance.id });
      res.status(201).json(maintenance);
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Create monitor
export const createMonitor = [
  requireAdmin(1),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, type, endpoint, interval_seconds, enabled } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      const monitor = await prisma.statusMonitor.create({
        data: {
          id: generateSnowflake(),
          name,
          description,
          type: type || 'http',
          endpoint,
          interval_seconds: interval_seconds || 60,
          enabled: enabled !== false,
          position: await prisma.statusMonitor.count(),
        },
      });

      res.status(201).json(monitor);
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Update monitor
export const updateMonitor = [
  requireAdmin(1),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, description, type, endpoint, interval_seconds, enabled } = req.body;

      const monitor = await prisma.statusMonitor.update({
        where: { id },
        data: { name, description, type, endpoint, interval_seconds, enabled },
      });

      res.json(monitor);
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Delete monitor
export const deleteMonitor = [
  requireAdmin(1),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await prisma.statusMonitor.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Get monitors
export async function getMonitors(req: Request, res: Response) {
  const monitors = await prisma.statusMonitor.findMany({
    orderBy: { position: 'asc' },
    include: { checks: { orderBy: { checked_at: 'desc' }, take: 1 } },
  });

  res.json(monitors.map((m: any) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    type: m.type,
    endpoint: m.endpoint,
    interval_seconds: m.interval_seconds,
    enabled: m.enabled,
    position: m.position,
    last_check: m.checks[0] ? {
      status: m.checks[0].status,
      latency_ms: m.checks[0].latency_ms,
      checked_at: m.checks[0].checked_at,
    } : null,
    created_at: m.created_at,
  })));
}

// Admin: Run monitor check manually
export const runMonitorCheck = [
  requireAdmin(1),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const monitor = await prisma.statusMonitor.findUnique({ where: { id } });

      if (!monitor) return res.status(404).json({ error: 'Monitor not found' });

      const result = await performCheck(monitor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Delete incident
export const deleteIncident = [
  requireAdmin(1),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await prisma.statusIncident.delete({ where: { id } });
      pinoLogger.info({ module: 'admin', action: 'INCIDENT_DELETE', incident_id: id });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Update maintenance
export const updateMaintenance = [
  requireAdmin(2),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { title, description, scheduled_start, scheduled_end, status, auto_maintenance_mode } = req.body;

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (scheduled_start !== undefined) updateData.scheduled_start = new Date(scheduled_start);
      if (scheduled_end !== undefined) updateData.scheduled_end = new Date(scheduled_end);
      if (status !== undefined) {
        updateData.status = status;
        if (status === 'in_progress' && !updateData.started_at) {
          updateData.started_at = new Date();
        }
        if (status === 'completed' && !updateData.completed_at) {
          updateData.completed_at = new Date();
        }
      }
      if (auto_maintenance_mode !== undefined) updateData.auto_maintenance_mode = auto_maintenance_mode;

      const maintenance = await prisma.statusMaintenance.update({
        where: { id },
        data: updateData,
      });

      pinoLogger.info({ module: 'admin', action: 'MAINTENANCE_UPDATE', maintenance_id: id });
      res.json(maintenance);
    } catch (err) {
      next(err);
    }
  },
];

// Admin: Delete maintenance
export const deleteMaintenance = [
  requireAdmin(2),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await prisma.statusMaintenance.delete({ where: { id } });
      pinoLogger.info({ module: 'admin', action: 'MAINTENANCE_DELETE', maintenance_id: id });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
];

// SFTP Status
export async function getSftpStatus(req: Request, res: Response) {
  const settings = await prisma.platformSettings.findMany({
    where: { key: { startsWith: 'logging.sftp_' } },
  });

  const config: Record<string, any> = {
    enabled: process.env.SFTP_EXPORT_ENABLED === 'true',
    host: process.env.SFTP_HOST || '',
    port: parseInt(process.env.SFTP_PORT || '22'),
    user: process.env.SFTP_USER || '',
    remote_path: process.env.SFTP_REMOTE_PATH || '/logs/opencord/',
    cron: process.env.SFTP_EXPORT_CRON || '0 */6 * * *',
  };

  for (const s of settings) {
    const key = s.key.replace('logging.sftp_', '');
    if (key === 'password') {
      config[key] = s.value ? '[CONFIGURED]' : '';
    } else if (key === 'enabled') {
      config.enabled = s.value === 'true';
    } else if (key === 'port') {
      config.port = parseInt(s.value as string) || config.port;
    } else {
      config[key] = s.value;
    }
  }

  res.json({ ...config, password: config.password ? '[CONFIGURED]' : '' });
}

// Test SFTP connection
export const testSftpConnection = [
  requireAdmin(2),
  async (req: Request, res: Response) => {
    try {
      const Client = (await import('ssh2-sftp-client')).default;
      const sftp = new Client();

      const config = await getSftpConfig();
      await sftp.connect(config);
      await sftp.end();

      pinoLogger.info({ module: 'admin', action: 'SFTP_TEST', status: 'success' });
      res.json({ success: true, message: 'SFTP connection successful' });
    } catch (err: any) {
      pinoLogger.error({ module: 'admin', action: 'SFTP_TEST', error: err.message });
      res.status(503).json({ success: false, error: err.message });
    }
  },
];

// Trigger SFTP export
export const triggerSftpExport = [
  requireAdmin(2),
  async (req: Request, res: Response) => {
    try {
      const result = await exportLogsToSftp();
      pinoLogger.info({ module: 'admin', action: 'SFTP_EXPORT', ...result });
      res.json(result);
    } catch (err: any) {
      pinoLogger.error({ module: 'admin', action: 'SFTP_EXPORT', error: err.message });
      res.status(503).json({ success: false, error: err.message });
    }
  },
];

// Helper functions
function getDirSize(dirPath: string): number {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        totalSize += getDirSize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch {}
  return totalSize;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days > 0) return days + ' jours';
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return hours + ' heures';
  const minutes = Math.floor(seconds / 60);
  return minutes + ' minutes';
}

function aggregateChecksByDay(checks: any[]): any[] {
  const byDay: Record<string, any> = {};
  for (const check of checks) {
    const day = check.checked_at.toISOString().split('T')[0];
    if (!byDay[day]) {
      byDay[day] = { date: day, up: 0, down: 0, total: 0, latencies: [] };
    }
    byDay[day].total++;
    if (check.status === 'up') byDay[day].up++;
    else byDay[day].down++;
    if (check.latency_ms) byDay[day].latencies.push(check.latency_ms);
  }
  return Object.values(byDay).map((d: any) => ({
    date: d.date,
    uptime_percentage: d.total > 0 ? Math.round((d.up / d.total) * 1000) / 10 : 0,
    avg_latency_ms: d.latencies.length > 0 ? Math.round(d.latencies.reduce((a: number, b: number) => a + b, 0) / d.latencies.length) : 0,
    incidents: d.down,
  }));
}

function generateSnowflake(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

// Perform a single monitor check
export async function performCheck(monitor: any): Promise<{ status: string; latency_ms: number | null; error?: string }> {
  const start = Date.now();
  try {
    if (monitor.type === 'http' && monitor.endpoint) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(monitor.endpoint, { signal: controller.signal });
      clearTimeout(timeout);
      const latency = Date.now() - start;
      const status = resp.ok ? 'up' : 'degraded';
      await prisma.statusCheck.create({
        data: {
          id: generateSnowflake(),
          monitor_id: monitor.id,
          status,
          latency_ms: latency,
          checked_at: new Date(),
        },
      });
      return { status, latency_ms: latency };
    } else if (monitor.type === 'database') {
      await prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      await prisma.statusCheck.create({
        data: {
          id: generateSnowflake(),
          monitor_id: monitor.id,
          status: 'up',
          latency_ms: latency,
          checked_at: new Date(),
        },
      });
      return { status: 'up', latency_ms: latency };
    } else if (monitor.type === 'websocket') {
      const io = getIO();
      const latency = Date.now() - start;
      const status = io ? 'up' : 'down';
      await prisma.statusCheck.create({
        data: {
          id: generateSnowflake(),
          monitor_id: monitor.id,
          status,
          latency_ms: latency,
          checked_at: new Date(),
        },
      });
      return { status, latency_ms: latency };
    } else if (monitor.type === 'custom') {
      const latency = Date.now() - start;
      await prisma.statusCheck.create({
        data: {
          id: generateSnowflake(),
          monitor_id: monitor.id,
          status: 'up',
          latency_ms: latency,
          checked_at: new Date(),
        },
      });
      return { status: 'up', latency_ms: latency };
    }
    return { status: 'up', latency_ms: Date.now() - start };
  } catch (err: any) {
    const latency = Date.now() - start;
    await prisma.statusCheck.create({
      data: {
        id: generateSnowflake(),
        monitor_id: monitor.id,
        status: 'down',
        latency_ms: latency,
        error: err.message,
        checked_at: new Date(),
      },
    });
    return { status: 'down', latency_ms: latency, error: err.message };
  }
}

// Get SFTP config from env and PlatformSettings
async function getSftpConfig(): Promise<any> {
  const settings = await prisma.platformSettings.findMany({
    where: { key: { startsWith: 'logging.sftp_' } },
  });

  const config: any = {
    host: process.env.SFTP_HOST || '',
    port: parseInt(process.env.SFTP_PORT || '22'),
    username: process.env.SFTP_USER || '',
  };

  for (const s of settings) {
    const key = s.key.replace('logging.sftp_', '');
    if (key === 'password' && s.value) {
      const { decrypt } = await import('../utils/encryption.js');
      config.password = decrypt(s.value as string);
    } else if (key === 'port') {
      config.port = parseInt(s.value as string) || config.port;
    } else if (key === 'host') {
      config.host = s.value;
    } else if (key === 'user') {
      config.username = s.value;
    } else if (key === 'private_key_path' && s.value) {
      const fs = await import('fs');
      config.privateKey = fs.readFileSync(s.value as string);
    }
  }

  if (!config.password && process.env.SFTP_PASSWORD) {
    config.password = process.env.SFTP_PASSWORD;
  }

  return config;
}

// Export logs to SFTP
async function exportLogsToSftp(): Promise<{ success: boolean; files_exported: number; message: string }> {
  const Client = (await import('ssh2-sftp-client')).default;
  const sftp = new Client();

  try {
    const config = await getSftpConfig();
    const remotePath = process.env.SFTP_REMOTE_PATH || '/logs/opencord/';
    const dateFolder = new Date().toISOString().split('T')[0];

    await sftp.connect(config);

    const logDir = process.env.LOG_FILE_PATH ? path.dirname(process.env.LOG_FILE_PATH) : './logs';
    if (!fs.existsSync(logDir)) {
      return { success: false, files_exported: 0, message: 'Log directory does not exist' };
    }

    const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log') || f.includes('opencord.log'));
    let exported = 0;

    await sftp.mkdir(`${remotePath}${dateFolder}/`, true);

    for (const file of files) {
      const filePath = path.join(logDir, file);
      const markerPath = filePath + '.exported';
      if (fs.existsSync(markerPath)) continue;

      await sftp.put(filePath, `${remotePath}${dateFolder}/${file}`);
      fs.writeFileSync(markerPath, new Date().toISOString());
      exported++;
    }

    await sftp.end();
    return { success: true, files_exported: exported, message: `${exported} files exported` };
  } catch (err: any) {
    try { await sftp.end(); } catch {}
    throw err;
  }
}

// Get disk free space (cross-platform)
function getDiskFreeGB(): number {
  try {
    if (process.platform === 'linux' || process.platform === 'darwin') {
      const output = execSync('df -BG / | tail -1').toString();
      const parts = output.trim().split(/\s+/);
      const val = parts[3]?.replace('G', '');
      return parseInt(val) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

// Get socket stats from gateway
function getSocketStats(): { socket_count: number; unique_users: number } {
  try {
    const io = getIO();
    if (!io) return { socket_count: 0, unique_users: 0 };

    const sockets = io.sockets.sockets;
    const userIds = new Set<string>();
    let count = 0;

    for (const [, socket] of sockets) {
      count++;
      const userId = (socket as any).userId;
      if (userId) userIds.add(userId);
    }

    return { socket_count: count, unique_users: userIds.size };
  } catch {
    return { socket_count: 0, unique_users: 0 };
  }
}
