import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as notifs from '../controllers/notification.controller.js';

const router = Router();

router.get('/', authenticate, notifs.getNotifications);
router.get('/unread-count', authenticate, notifs.getUnreadCount);
router.post('/mark-read', authenticate, notifs.markRead);
router.patch('/:notificationId/read', authenticate, notifs.markOneRead);
router.delete('/:notificationId', authenticate, notifs.deleteNotification);

router.get('/settings', authenticate, notifs.getAllNotificationSettings);
router.post('/settings', authenticate, notifs.createNotificationSetting);
router.patch('/settings/:settingId', authenticate, notifs.updateNotificationSetting);
router.delete('/settings/:settingId', authenticate, notifs.deleteNotificationSetting);
router.get('/settings/channels/:channelId', authenticate, notifs.getChannelNotificationSettings);
router.patch('/settings/channels/:channelId', authenticate, notifs.updateChannelNotificationSettings);
router.get('/settings/guilds/:guildId', authenticate, notifs.getGuildNotificationSettings);
router.patch('/settings/guilds/:guildId', authenticate, notifs.updateGuildNotificationSettings);

export default router;
