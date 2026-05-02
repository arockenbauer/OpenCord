import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { guildOperationsRateLimit } from '../middleware/rate-limit.middleware.js';
import { uploadIcon, uploadBanner, uploadSticker } from '../middleware/upload.middleware.js';
import { createGuildSchema, updateGuildSchema, deleteGuildSchema } from '@opencord/shared';
import * as guilds from '../controllers/guild.controller.js';
import * as automod from '../controllers/automod.controller.js';
import * as scheduledEvents from '../controllers/scheduledEvent.controller.js';
import * as emojis from '../controllers/emoji.controller.js';
import * as analytics from '../controllers/analytics.controller.js';
import * as plugins from '../controllers/plugin.controller.js';
import { guildBoostRouter } from './premium.routes.js';

const router = Router();

router.post('/', authenticate, guildOperationsRateLimit, validate(createGuildSchema), guilds.createGuild);
router.get('/:guildId', authenticate, guilds.getGuild);
router.patch('/:guildId', authenticate, guildOperationsRateLimit, validate(updateGuildSchema), guilds.updateGuild);
router.delete('/:guildId', authenticate, validate(deleteGuildSchema), guilds.deleteGuild);
router.patch('/:guildId/icon', authenticate, uploadIcon, guilds.uploadGuildIcon);
router.patch('/:guildId/banner', authenticate, uploadBanner, guilds.uploadGuildBanner);
router.post('/:guildId/transfer', authenticate, guilds.transferOwnership);

router.get('/:guildId/members', authenticate, guilds.getMembers);
router.get('/:guildId/members/:userId', authenticate, guilds.getMember);
router.patch('/:guildId/members/:userId', authenticate, guilds.updateMember);
router.delete('/:guildId/members/:userId', authenticate, guilds.kickMember);
router.delete('/:guildId/members/@me', authenticate, guilds.leaveGuild);

router.get('/:guildId/bans', authenticate, guilds.getBans);
router.get('/:guildId/bans/:userId', authenticate, guilds.getBan);
router.put('/:guildId/bans/:userId', authenticate, guilds.createBan);
router.delete('/:guildId/bans/:userId', authenticate, guilds.removeBan);

router.get('/:guildId/audit-logs', authenticate, guilds.getAuditLogs);

router.get('/:guildId/vanity-url', authenticate, guilds.getVanityUrl);
router.patch('/:guildId/vanity-url', authenticate, guilds.updateVanityUrl);
router.get('/:guildId/plugins', authenticate, plugins.getGuildPlugins);
router.patch('/:guildId/plugins/:slug', authenticate, plugins.updateGuildPlugin);

router.get('/:guildId/automod/rules', authenticate, automod.getRules);
router.post('/:guildId/automod/rules', authenticate, automod.createRule);
router.patch('/:guildId/automod/rules/:ruleId', authenticate, automod.updateRule);
router.delete('/:guildId/automod/rules/:ruleId', authenticate, automod.deleteRule);
router.get('/:guildId/automod/executions', authenticate, automod.getAutoModExecutions);

router.get('/:guildId/auto-moderation/rules', authenticate, automod.getRules);
router.post('/:guildId/auto-moderation/rules', authenticate, automod.createRule);
router.patch('/:guildId/auto-moderation/rules/:ruleId', authenticate, automod.updateRule);
router.delete('/:guildId/auto-moderation/rules/:ruleId', authenticate, automod.deleteRule);
router.get('/:guildId/auto-moderation/executions', authenticate, automod.getAutoModExecutions);

router.get('/:guildId/scheduled-events', authenticate, scheduledEvents.getScheduledEvents);
router.post('/:guildId/scheduled-events', authenticate, scheduledEvents.createScheduledEvent);
router.get('/:guildId/scheduled-events/:eventId', authenticate, scheduledEvents.getScheduledEvent);
router.patch('/:guildId/scheduled-events/:eventId', authenticate, scheduledEvents.updateScheduledEvent);
router.delete('/:guildId/scheduled-events/:eventId', authenticate, scheduledEvents.deleteScheduledEvent);
router.get('/:guildId/scheduled-events/:eventId/users', authenticate, scheduledEvents.getEventUsers);
router.post('/:guildId/scheduled-events/:eventId/users', authenticate, scheduledEvents.rsvpEvent);
router.delete('/:guildId/scheduled-events/:eventId/users/:userId', authenticate, scheduledEvents.removeRsvp);

router.get('/:guildId/widget', authenticate, guilds.getWidget);
router.patch('/:guildId/widget', authenticate, guilds.updateWidget);

router.get('/:guildId/prune', authenticate, guilds.pruneCount);
router.post('/:guildId/prune', authenticate, guilds.pruneMembers);

router.get('/:guildId/templates', authenticate, guilds.getGuildTemplates);
router.post('/:guildId/templates', authenticate, guilds.createGuildTemplate);
router.put('/:guildId/templates/:code/sync', authenticate, guilds.syncGuildTemplate);
router.delete('/:guildId/templates/:code', authenticate, guilds.deleteGuildTemplate);

router.get('/:guildId/welcome-screen', authenticate, guilds.getWelcomeScreen);
router.patch('/:guildId/welcome-screen', authenticate, guilds.updateWelcomeScreen);

router.get('/:guildId/members/@me/permissions', authenticate, guilds.getMyGuildPermissions);

router.use('/:guildId', guildBoostRouter);
router.get('/:guildId/boosts', authenticate, guilds.getGuildBoosters);

router.get('/:guildId/stickers', authenticate, emojis.getStickers);
router.post('/:guildId/stickers', authenticate, uploadSticker, emojis.createSticker);
router.get('/:guildId/stickers/:stickerId', authenticate, emojis.getSticker);
router.patch('/:guildId/stickers/:stickerId', authenticate, emojis.updateSticker);
router.delete('/:guildId/stickers/:stickerId', authenticate, emojis.deleteSticker);

router.get('/:guildId/analytics/overview', authenticate, analytics.getOverview);
router.get('/:guildId/analytics/timeseries', authenticate, analytics.getTimeseries);
router.get('/:guildId/analytics/hourly', authenticate, analytics.getHourly);
router.get('/:guildId/analytics/retention', authenticate, analytics.getRetention);

export default router;
