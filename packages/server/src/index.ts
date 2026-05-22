import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cookieParser = require('cookie-parser');

import { globalRateLimit } from './middleware/rate-limit.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { logError, logInfo } from './utils/logger.js';
import { setupGateway } from './gateway/index.js';
import { getIO } from './gateway/index.js';
import { prisma } from './utils/prisma.js';
import { generateSnowflake } from './utils/snowflake.js';
import { GatewayEvents } from '@opencord/shared';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import guildsRoutes from './routes/guilds.routes.js';
import channelsRoutes, { guildChannelRouter } from './routes/channels.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import invitesRoutes, { guildInvitesRouter } from './routes/invites.routes.js';
import emojisRoutes from './routes/emojis.routes.js';
import adminRoutes from './routes/admin.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import badgesRoutes from './routes/badges.routes.js';
import pluginsRoutes from './routes/plugins.routes.js';
import applicationsRoutes from './routes/applications.routes.js';
import interactionsRoutes from './routes/interactions.routes.js';
import forumRoutes from './routes/forum.routes.js';
import connectedAccountsRoutes from './routes/connected-accounts.routes.js';
import userNotesRoutes from './routes/user-notes.routes.js';
import oauthRoutes from './routes/oauth.routes.js';
import dmRoutes from './routes/dm.routes.js';
import friendsRoutes from './routes/friends.routes.js';
import premiumRoutes, { guildBoostRouter } from './routes/premium.routes.js';
import discoveryRoutes, { guildDiscoveryRouter, adminDiscoveryRouter } from './routes/discovery.routes.js';
import proxyRoutes from './routes/proxy.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import { getStickerPacks } from './controllers/emoji.controller.js';
import { getActiveAnnouncements } from './controllers/announcement.controller.js';
import * as voiceController from './controllers/voice.controller.js';
import { authenticate } from './middleware/auth.middleware.js';
import { startBackupCron } from './services/backup.service.js';
import { runSnapshotCron } from './controllers/analytics.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const STARTUP_DISABLED = process.env.OPENCORD_DISABLE_STARTUP === 'true';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  xFrameOptions: false,
  xssFilter: false,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalRateLimit);

// HTTP request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const userId = (req as any).user?.userId;
    logInfo('HTTP Request', {
      module: 'http',
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip,
      userId,
    });
  });
  next();
});

const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });

const staticUploads = express.static(path.resolve(uploadDir));

// Serve uploaded files under /files/* and legacy /uploads/* URLs with proper security headers
function serveUploadedFile(req: express.Request, res: express.Response, next: express.NextFunction) {
  const filePath = req.path.replace(/^\/+/, '');
  const resolvedPath = path.resolve(uploadDir, filePath);

  // Prevent directory traversal attacks
  if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
    return res.status(403).send('Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

  // Set security headers
  res.set('X-Content-Type-Options', 'nosniff');

  // Determine cache policy based on file type and path
  const isHashed = /[0-9a-f]{16}/i.test(filePath); // Simple hash detection
  const isEmojiOrSticker = filePath.includes('/emojis/') || filePath.includes('/stickers/');

  if (isHashed && (filePath.includes('/avatars/') || filePath.includes('/guild-icons/'))) {
    // Hashed files (avatars, icons): cache aggressively
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (isEmojiOrSticker) {
    // Emojis/stickers: cache for 24 hours
    res.set('Cache-Control', 'public, max-age=86400');
  } else if (imageExts.includes(ext)) {
    // Images: cache for 1 hour
    res.set('Cache-Control', 'public, max-age=3600');
  } else {
    // Non-images: no cache, force download
    res.set('Cache-Control', 'private, no-cache');
    const originalName = filePath.split('/').pop() || 'file';
    res.set('Content-Disposition', `attachment; filename="${originalName}"`);
  }

  staticUploads(req, res, next);
}

app.use('/files', serveUploadedFile);
app.use('/uploads', serveUploadedFile);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/guilds', guildsRoutes);
app.use('/api/guilds/:guildId/channels', guildChannelRouter);
app.use('/api/guilds/:guildId/roles', rolesRoutes);
app.use('/api/guilds/:guildId/invites', guildInvitesRouter);
app.use('/api/guilds/:guildId', emojisRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/channels/:channelId/messages', messagesRoutes);
app.use('/api', invitesRoutes);
app.use('/api', webhooksRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/plugins', pluginsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api', interactionsRoutes);
app.use('/api/guilds/:guildId/channels', forumRoutes);
app.use('/api/connected-accounts', connectedAccountsRoutes);
app.use('/api/users/@me/notes', userNotesRoutes);
app.use('/api/oauth2', oauthRoutes);
app.get('/api/announcements/active', getActiveAnnouncements);
app.use('/api/dms', dmRoutes);
app.use('/api/relationships', friendsRoutes);
app.post('/api/stage-instances', authenticate, voiceController.createStageInstance);
app.get('/api/stage-instances/:channelId', authenticate, voiceController.getStageInstance);
app.patch('/api/stage-instances/:channelId', authenticate, voiceController.updateStageInstance);
app.delete('/api/stage-instances/:channelId', authenticate, voiceController.deleteStageInstance);
app.use('/api/premium', premiumRoutes);
app.use('/api/discover', discoveryRoutes);
app.use('/api/admin/discover', adminDiscoveryRouter);
app.use('/api/guilds/:guildId', guildBoostRouter);
app.use('/api/guilds/:guildId', guildDiscoveryRouter);
app.use('/api/proxy', proxyRoutes);
app.use('/api', monitoringRoutes);
app.get('/api/sticker-packs', authenticate, getStickerPacks);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

// Analytics snapshot cron (runs every hour, checks if it's 00:05 UTC)
const ANALYTICS_CRON_INTERVAL = 60 * 60 * 1000; // 1 hour

// Periodic cleanup of deleted attachments (every 24 hours)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const ATTACHMENT_CLEANUP_DELAY_HOURS = Number(process.env.ATTACHMENT_CLEANUP_DELAY_HOURS) || 48;

async function cleanupDeletedAttachments() {
  try {
    const cutoffDate = new Date(Date.now() - ATTACHMENT_CLEANUP_DELAY_HOURS * 60 * 60 * 1000);
    const deletedAttachments = await prisma.attachment.findMany({
      where: {
        deleted_at: { not: null, lte: cutoffDate },
      },
    });

    let cleaned = 0;
    for (const attachment of deletedAttachments) {
      try {
        // Delete physical file
        if (attachment.storage_path && fs.existsSync(attachment.storage_path)) {
          fs.unlinkSync(attachment.storage_path);
        }

        // Delete thumbnail if exists
        if (attachment.thumbnail_url) {
          const thumbnailPath = path.join(uploadDir, attachment.thumbnail_url.replace('/files/', ''));
          if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
        }

        // Delete from database
        await prisma.attachment.delete({ where: { id: attachment.id } });
        cleaned++;
      } catch (err) {
        console.error(`Failed to cleanup attachment ${attachment.id}:`, err);
      }
    }

    if (cleaned > 0) {
      logInfo(`Cleaned up ${cleaned} deleted attachments`);
    }
  } catch (err) {
    console.error('Error during attachment cleanup:', err);
  }
}

// Scheduled Events cron job: transition events and send reminders
const EVENT_CRON_INTERVAL = 60 * 1000; // 1 minute
async function processScheduledEvents() {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // SCHEDULED → ACTIVE: start time reached
    const startingEvents = await prisma.guildScheduledEvent.findMany({
      where: { status: 1, scheduled_start_time: { lte: now } },
    });
    for (const event of startingEvents) {
      const updatedEvent = await prisma.guildScheduledEvent.update({ where: { id: event.id }, data: { status: 2 } });
      const io = getIO();
      if (io) io.to(`guild:${event.guild_id}`).emit(GatewayEvents.GUILD_SCHEDULED_EVENT_UPDATE, { guild_id: event.guild_id, event: updatedEvent });
      logInfo(`Event ${event.id} started (SCHEDULED → ACTIVE)`);
    }

    // ACTIVE → COMPLETED: end time reached
    const endingEvents = await prisma.guildScheduledEvent.findMany({
      where: { status: 2, scheduled_end_time: { lte: now } },
    });
    for (const event of endingEvents) {
      const updatedEvent = await prisma.guildScheduledEvent.update({ where: { id: event.id }, data: { status: 3 } });
      const io = getIO();
      if (io) io.to(`guild:${event.guild_id}`).emit(GatewayEvents.GUILD_SCHEDULED_EVENT_UPDATE, { guild_id: event.guild_id, event: updatedEvent });
      logInfo(`Event ${event.id} completed (ACTIVE → COMPLETED)`);
    }

    // Reminders: 60 minutes before start
    const upcomingEvents = await prisma.guildScheduledEvent.findMany({
      where: { status: 1, scheduled_start_time: { gte: now, lte: oneHourFromNow } },
      include: { users: { select: { user_id: true } } },
    });
    for (const event of upcomingEvents) {
      for (const rsvp of event.users) {
        // Check if reminder already sent (avoid duplicates)
        const existingNotif = await prisma.notification.findFirst({
          where: { user_id: rsvp.user_id, type: 'EVENT_REMINDER', data: { contains: event.id } },
        });
        if (!existingNotif) {
          await prisma.notification.create({
            data: {
              id: generateSnowflake(),
              user_id: rsvp.user_id,
              type: 'EVENT_REMINDER',
              data: JSON.stringify({ event_id: event.id, event_name: event.name }),
              created_at: now,
            },
          });
          const io = getIO();
          if (io) io.to(`user:${rsvp.user_id}`).emit(GatewayEvents.NOTIFICATION_CREATE, { type: 'EVENT_REMINDER', event_id: event.id });
        }
      }
    }

    // Cleanup: delete COMPLETED/CANCELLED events after 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oldEvents = await prisma.guildScheduledEvent.findMany({
      where: { status: { in: [3, 4] }, scheduled_end_time: { lte: thirtyDaysAgo } },
    });
    for (const event of oldEvents) {
      await prisma.guildScheduledEvent.delete({ where: { id: event.id } });
      logInfo(`Cleaned up old event ${event.id}`);
    }
  } catch (err) {
    logError('Error in scheduled events cron:', err);
  }
}

// ── GDPR Cron Job ────────────────────────────────────────────────
const GDPR_CRON_INTERVAL = 60 * 60 * 1000; // Run every hour

async function runGdprCron() {
  try {
    const { runGdprCronJobs } = await import('./services/export.service.js');
    await runGdprCronJobs();
  } catch (err) {
    logError('Error in GDPR cron:', err);
  }
}

// ── Linked Roles Eligibility Cron ────────────────────────────
const LINKED_ROLES_CRON_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function checkLinkedRolesEligibility() {
  try {
    const requirements = await prisma.guildRoleConnectionRequirement.findMany({
      include: { role: true, application: true },
    });

    for (const req of requirements) {
      // Get all members with this role
      const membersWithRole = await prisma.guildMember.findMany({
        where: { guild_id: req.guild_id, role_assignments: { some: { role_id: req.role_id } } },
        select: { user_id: true },
      });

      for (const member of membersWithRole) {
        // Get user's application role connection
        const userConnection = await prisma.userApplicationRoleConnection.findUnique({
          where: { user_id_application_id: { user_id: member.user_id, application_id: req.application_id } },
        });

        if (!userConnection) {
          // No metadata, remove role
          await prisma.guildMemberRole.deleteMany({
            where: { guild_id: req.guild_id, role_id: req.role_id, user_id: member.user_id },
          }).catch(() => {});
          continue;
        }

        const rawMetadata = userConnection.metadata;
        const metadata = rawMetadata ? (typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata) : {};
        const value = metadata[req.metadata_key];
        let eligible = false;

        // Get the metadata type from ApplicationRoleConnectionMetadata
        const metadataDef = await prisma.applicationRoleConnectionMetadata.findUnique({
          where: { application_id_key: { application_id: req.application_id, key: req.metadata_key } },
        });

        if (metadataDef) {
          eligible = evaluateRequirement(metadataDef.type, value, req.metadata_value);
        }

        if (!eligible) {
          // Remove role
          await prisma.guildMemberRole.deleteMany({
            where: { guild_id: req.guild_id, role_id: req.role_id, user_id: member.user_id },
          }).catch(() => {});
        }
      }

      // Check users without the role but who might be eligible
      const allGuildMembers = await prisma.guildMember.findMany({
        where: { guild_id: req.guild_id },
        select: { user_id: true },
      });

      for (const member of allGuildMembers) {
        const hasRole = await prisma.guildMemberRole.findFirst({
          where: { guild_id: req.guild_id, role_id: req.role_id, user_id: member.user_id },
        });

        if (hasRole) continue; // Already checked above

        const userConnection = await prisma.userApplicationRoleConnection.findUnique({
          where: { user_id_application_id: { user_id: member.user_id, application_id: req.application_id } },
        });

        if (!userConnection) continue;

        const rawMetadata = userConnection.metadata;
        const metadata = rawMetadata ? (typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata) : {};
        const value = metadata[req.metadata_key];
        let eligible = false;

        const metadataDef = await prisma.applicationRoleConnectionMetadata.findUnique({
          where: { application_id_key: { application_id: req.application_id, key: req.metadata_key } },
        });

        if (metadataDef) {
          eligible = evaluateRequirement(metadataDef.type, value, req.metadata_value);
        }

        if (eligible) {
          // Add role
          await prisma.guildMemberRole.create({
            data: { guild_id: req.guild_id, role_id: req.role_id, user_id: member.user_id, assigned_by: member.user_id },
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    logError('Error in linked roles eligibility cron:', err);
  }
}

function evaluateRequirement(type: number, userValue: any, expectedValue: string): boolean {
  const expected = expectedValue;
  switch (type) {
    case 1: // INTEGER_LESS_THAN_OR_EQUAL
      return Number(userValue) <= Number(expected);
    case 2: // INTEGER_GREATER_THAN_OR_EQUAL
      return Number(userValue) >= Number(expected);
    case 3: // INTEGER_EQUAL
      return Number(userValue) === Number(expected);
    case 4: // INTEGER_NOT_EQUAL
      return Number(userValue) !== Number(expected);
    case 5: // DATETIME_LESS_THAN_OR_EQUAL
      return new Date(userValue) <= new Date(expected);
    case 6: // DATETIME_GREATER_THAN_OR_EQUAL
      return new Date(userValue) >= new Date(expected);
    case 7: // BOOLEAN_EQUAL
      return Boolean(userValue) === (expected === 'true');
    case 8: // BOOLEAN_NOT_EQUAL
      return Boolean(userValue) !== (expected === 'true');
    default:
      return false;
  }
}

// ── Thread Auto-Archive Cron ───────────────────────────────
const THREAD_ARCHIVE_CRON_INTERVAL = 60 * 60 * 1000; // Run every hour

async function autoArchiveThreads() {
  try {
    const now = new Date();
    // Find active threads where last_message_id timestamp + auto_archive_duration has passed
    const activeThreads = await prisma.channel.findMany({
      where: {
        type: { in: [10, 11, 12] }, // ANNOUNCEMENT_THREAD, PUBLIC_THREAD, PRIVATE_THREAD
        thread_metadata: { equals: { archived: false } as any },
        last_message_id: { not: null },
      },
      include: { messages: { orderBy: { created_at: 'desc' }, take: 1 } },
    });

    let archived = 0;
    for (const thread of activeThreads) {
      const metadata = thread.thread_metadata as any || {};
      const autoArchiveDuration = metadata.auto_archive_duration || 1440; // default 24h in minutes
      const lastMessage = thread.messages[0];
      if (!lastMessage) continue;

      const lastMessageTime = new Date(lastMessage.created_at).getTime();
      const archiveTime = lastMessageTime + autoArchiveDuration * 60 * 1000;

      if (now.getTime() >= archiveTime) {
        metadata.archived = true;
        metadata.archive_timestamp = now.toISOString();

        await prisma.channel.update({
          where: { id: thread.id },
          data: { thread_metadata: metadata as any },
        });

        const io = getIO();
        if (io && thread.guild_id) {
          io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.THREAD_UPDATE, { thread: { id: thread.id, thread_metadata: metadata } });
        }
        archived++;
      }
    }

    if (archived > 0) {
      logInfo(`Auto-archived ${archived} threads`);
    }
  } catch (err) {
    logError('Error in thread auto-archive cron:', err);
  }
}

// ── Monitoring Cron ───────────────────────────────────
const MONITORING_CRON_INTERVAL = 60 * 1000; // Run every 60 seconds

async function runMonitoringChecks() {
  try {
    const { getMonitors, performCheck } = await import('./controllers/monitoring.controller.js');
    const monitors = await prisma.statusMonitor.findMany({
      where: { enabled: true },
    });

    for (const monitor of monitors) {
      try {
        await performCheck(monitor);
      } catch (err) {
        logError('Monitor check failed', { monitor_id: monitor.id, error: (err as Error).message });
      }
    }
  } catch (err) {
    logError('Monitoring cron error', { error: (err as Error).message });
  }
}

// ── Maintenance Mode Middleware ──────────────────────
const maintenanceMode = { active: false, title: '', scheduled_end: '' };

// Check for active maintenances on startup
async function checkMaintenanceMode() {
  const active = await prisma.statusMaintenance.findFirst({
    where: { status: 'in_progress' },
  });
  if (active) {
    maintenanceMode.active = true;
    maintenanceMode.title = active.title;
    maintenanceMode.scheduled_end = active.scheduled_end.toISOString();
  }
}

app.use((req, res, next) => {
  if (maintenanceMode.active) {
    const publicPaths = ['/api/health', '/api/status', '/api/admin'];
    const isPublic = publicPaths.some(p => req.path.startsWith(p));
    if (!isPublic) {
      return res.status(503).json({
        error: 'MAINTENANCE_MODE',
        message: 'OpenCord est en maintenance. Veuillez réessayer plus tard.',
        retry_after: 1800,
        maintenance: {
          title: maintenanceMode.title,
          scheduled_end: maintenanceMode.scheduled_end,
        },
      });
    }
  }
  next();
});

const PORT = Number(process.env.PORT) || 3001;
let backgroundJobsStarted = false;
let serverStarted = false;

// Kill any existing process on the port before starting
function killPort(port: number, cb: () => void): void {
  if (!port) {
    cb();
    return;
  }
  try {
    const { execSync } = require('child_process');
    const pid = execSync(`lsof -t -i:${port} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (pid) {
      logInfo(`Killing existing process ${pid} on port ${port}`);
      try { process.kill(Number(pid), 'SIGKILL'); } catch {}
      setTimeout(() => killPort(port, cb), 500);
    } else {
      cb();
    }
  } catch {
    cb();
  }
}

export function startBackgroundJobs(): void {
  if (backgroundJobsStarted) return;
  backgroundJobsStarted = true;

  setupGateway(httpServer);
  startBackupCron();
  setInterval(runSnapshotCron, ANALYTICS_CRON_INTERVAL);
  runSnapshotCron();
  cleanupDeletedAttachments();
  setInterval(cleanupDeletedAttachments, CLEANUP_INTERVAL);
  processScheduledEvents();
  setInterval(processScheduledEvents, EVENT_CRON_INTERVAL);
  runGdprCron();
  setInterval(runGdprCron, GDPR_CRON_INTERVAL);
  checkLinkedRolesEligibility();
  setInterval(checkLinkedRolesEligibility, LINKED_ROLES_CRON_INTERVAL);
  autoArchiveThreads();
  setInterval(autoArchiveThreads, THREAD_ARCHIVE_CRON_INTERVAL);
  runMonitoringChecks();
  setInterval(runMonitoringChecks, MONITORING_CRON_INTERVAL);
  void checkMaintenanceMode();
}

export function startServer(port = PORT): void {
  if (serverStarted) return;
  serverStarted = true;

  killPort(port, () => {
    httpServer.listen(port, () => {
      logInfo(`OpenCord server running on port ${port}`);
    });
  });
}

if (!STARTUP_DISABLED) {
  startBackgroundJobs();
  startServer();
}

export default app;
export { httpServer, maintenanceMode };
