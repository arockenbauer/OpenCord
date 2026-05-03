import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import * as admin from '../controllers/admin.controller.js';
import * as announcements from '../controllers/announcement.controller.js';

const router = Router();

router.use(authenticate, requireAdmin(1));

// Stats
router.get('/stats', admin.getStats);
router.get('/stats/charts', admin.getStatsCharts);
router.get('/stats/activity', admin.getRecentAuditActivity);
router.get('/storage/stats', admin.getStorageStats);

// Platform settings
router.get('/settings', admin.getPlatformSettings);
router.patch('/settings', requireAdmin(2), admin.updatePlatformSettings);

// Users
router.get('/users', admin.getUsers);
router.get('/users/:userId', admin.getUserAdmin);
router.patch('/users/:userId', requireAdmin(2), admin.updateUserAdmin);
router.post('/users/:userId/ban', requireAdmin(2), admin.banUserAdmin);
router.delete('/users/:userId/ban', requireAdmin(2), admin.unbanUserAdmin);
router.post('/users/:userId/force-logout', requireAdmin(2), admin.forceLogoutUser);
router.post('/users/:userId/reset-password', requireAdmin(2), admin.resetUserPassword);
router.post('/users/:userId/badges', requireAdmin(2), admin.assignBadge);
router.delete('/users/:userId/badges/:badgeId', requireAdmin(2), admin.removeBadge);

// Badges
router.get('/badges', admin.getBadges);
router.post('/badges', requireAdmin(2), admin.createBadge);
router.patch('/badges/:badgeId', requireAdmin(2), admin.updateBadge);
router.delete('/badges/:badgeId', requireAdmin(3), admin.deleteBadge);
router.get('/badges/:badgeId/users', admin.getBadgeUsers);
router.post('/badges/:badgeId/assign', requireAdmin(2), admin.assignBadgeToUser);
router.delete('/badges/:badgeId/assign/:userId', requireAdmin(2), admin.revokeBadgeFromUser);

// Guilds
router.get('/guilds', admin.getGuildsAdmin);
router.get('/guilds/:guildId', admin.getGuildAdmin);
router.delete('/guilds/:guildId', requireAdmin(2), admin.deleteGuildAdmin);
router.patch('/guilds/:guildId', requireAdmin(2), admin.updateGuildFeatures);

// Reports
router.get('/reports', admin.getReportsAdmin);
router.patch('/reports/:reportId', requireAdmin(1), admin.updateReportAdmin);
router.post('/reports/:reportId/resolve', requireAdmin(1), admin.resolveReport);
router.post('/reports/:reportId/dismiss', requireAdmin(1), admin.dismissReport);

// Plugins
router.get('/plugins', admin.getPlugins);
router.post('/plugins', requireAdmin(3), admin.createPlugin);
router.get('/plugins/:slug', admin.getPlugin);
router.patch('/plugins/:slug', requireAdmin(2), admin.updatePluginBySlug);
router.delete('/plugins/:slug', requireAdmin(3), admin.deletePlugin);

// Announcements
router.get('/announcements', announcements.getAnnouncements);
router.post('/announcements', requireAdmin(2), announcements.createAnnouncement);
router.patch('/announcements/:announcementId', requireAdmin(2), announcements.updateAnnouncement);
router.delete('/announcements/:announcementId', requireAdmin(2), announcements.deleteAnnouncement);

// Audit logs
router.get('/audit-logs', requireAdmin(2), admin.getAuditLogs);

// Misc
router.get('/roles', requireAdmin(2), admin.getAllRolesAdmin);
router.get('/channels', requireAdmin(2), admin.getAllChannelsAdmin);

// Backups
router.get('/backups', admin.getBackupList);
router.post('/backups', admin.createBackup);
router.get('/backups/:filename/download', requireAdmin(3), admin.downloadBackup);
router.post('/backups/:backupId/restore', admin.restoreBackup);
router.delete('/backups/:backupId', requireAdmin(3), admin.deleteBackup);
router.post('/backups/upload', requireAdmin(3), admin.uploadBackup);

// Email test (admin level 3)
router.post('/email/test', requireAdmin(3), admin.testEmailConfig);

// GDPR - Force delete user (admin level 3)
router.delete('/users/:userId/force-delete', requireAdmin(3), admin.forceDeleteUser);

export default router;
