import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { guildOperationsRateLimit, searchRateLimit } from '../middleware/rate-limit.middleware.js';
import { uploadIcon, uploadBanner, uploadSticker, uploadEventImage, uploadSoundboardSound } from '../middleware/upload.middleware.js';
import { createGuildSchema, updateGuildSchema, deleteGuildSchema, searchMessagesSchema } from '@opencord/shared';
import * as guilds from '../controllers/guild.controller.js';
import * as automod from '../controllers/automod.controller.js';
import * as scheduledEvents from '../controllers/scheduledEvent.controller.js';
import * as emojis from '../controllers/emoji.controller.js';
import * as analytics from '../controllers/analytics.controller.js';
import * as messages from '../controllers/message.controller.js';
import * as plugins from '../controllers/plugin.controller.js';
import * as ban from '../controllers/ban.controller.js';
import * as slashCommands from '../controllers/slashcommand.controller.js';
import * as invites from '../controllers/invite.controller.js';
import * as channels from '../controllers/channel.controller.js';
import * as voice from '../controllers/voice.controller.js';
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
router.put('/:guildId/members/:userId/roles/:roleId', authenticate, guilds.assignRoleToMember);
router.delete('/:guildId/members/:userId/roles/:roleId', authenticate, guilds.removeRoleFromMember);
router.post('/:guildId/members/:userId/warn', authenticate, ban.warnUser);
router.delete('/:guildId/members/:userId', authenticate, ban.kickUser);
router.delete('/:guildId/members/@me', authenticate, guilds.leaveGuild);

router.get('/:guildId/bans', authenticate, ban.getBans);
router.get('/:guildId/bans/:userId', authenticate, ban.getBan);
router.put('/:guildId/bans/:userId', authenticate, ban.banUser);
router.delete('/:guildId/bans/:userId', authenticate, ban.unbanUser);
router.post('/:guildId/members/:userId/warn', authenticate, ban.warnUser);

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
router.put('/:guildId/scheduled-events/:eventId/image', authenticate, uploadEventImage, scheduledEvents.uploadEventImage);
router.put('/:guildId/scheduled-events/:eventId/users/@me', authenticate, scheduledEvents.rsvpEvent);
router.delete('/:guildId/scheduled-events/:eventId/users/@me', authenticate, scheduledEvents.removeRsvp);
router.get('/:guildId/scheduled-events/:eventId/users', authenticate, scheduledEvents.getEventUsers);

router.get('/:guildId/slash-commands', authenticate, slashCommands.getSlashCommands);
router.post('/:guildId/slash-commands', authenticate, slashCommands.createSlashCommand);
router.patch('/:guildId/slash-commands/:commandId', authenticate, slashCommands.updateSlashCommand);
router.delete('/:guildId/slash-commands/:commandId', authenticate, slashCommands.deleteSlashCommand);
router.post('/:guildId/slash-commands/execute', authenticate, slashCommands.handleSlashCommandInteraction);

router.get('/:guildId/voice-states', authenticate, voice.getVoiceStates);
router.get('/:guildId/voice-states/@me', authenticate, voice.getMyVoiceState);
router.patch('/:guildId/voice-states/@me', authenticate, voice.patchMyVoiceState);
router.patch('/:guildId/voice-states/:userId', authenticate, voice.patchUserVoiceState);

router.post('/:guildId/stage-instances', authenticate, voice.createStageInstance);
router.get('/:guildId/stage-instances/:channelId', authenticate, voice.getStageInstance);
router.patch('/:guildId/stage-instances/:channelId', authenticate, voice.updateStageInstance);
router.delete('/:guildId/stage-instances/:channelId', authenticate, voice.deleteStageInstance);

router.get('/:guildId/soundboard-sounds', authenticate, voice.getSoundboardSounds);
router.post('/:guildId/soundboard-sounds', authenticate, uploadSoundboardSound, voice.createSoundboardSound);
router.patch('/:guildId/soundboard-sounds/:soundId', authenticate, voice.updateSoundboardSound);
router.delete('/:guildId/soundboard-sounds/:soundId', authenticate, voice.deleteSoundboardSound);
router.post('/:guildId/soundboard-sounds/:soundId/play', authenticate, voice.playSoundboardSound);

router.get('/:guildId/widget', authenticate, guilds.getWidget);
router.patch('/:guildId/widget', authenticate, guilds.updateWidget);

router.get('/:guildId/prune', authenticate, guilds.pruneCount);
router.post('/:guildId/prune', authenticate, guilds.pruneMembers);

router.get('/:guildId/templates', authenticate, guilds.getGuildTemplates);
router.post('/:guildId/templates', authenticate, guilds.createGuildTemplate);
router.patch('/:guildId/templates/:code', authenticate, guilds.updateGuildTemplate);
router.put('/:guildId/templates/:code/sync', authenticate, guilds.syncGuildTemplate);
router.delete('/:guildId/templates/:code', authenticate, guilds.deleteGuildTemplate);

// Public template endpoints (no auth)
router.get('/templates/:code', guilds.getPublicTemplate);
router.post('/templates/:code', authenticate, guilds.createGuildFromTemplate);

router.get('/:guildId/welcome-screen', authenticate, guilds.getWelcomeScreen);
router.patch('/:guildId/welcome-screen', authenticate, guilds.updateWelcomeScreen);

// Member Verification (Membership Screening)
router.get('/:guildId/member-verification', authenticate, guilds.getMemberVerification);
router.put('/:guildId/member-verification', authenticate, guilds.updateMemberVerification);
router.patch('/:guildId/member-verification', authenticate, guilds.updateMemberVerification);
router.post('/:guildId/member-verification/complete', authenticate, guilds.completeMemberVerification);

// Guild Onboarding
router.get('/:guildId/onboarding', authenticate, guilds.getGuildOnboarding);
router.put('/:guildId/onboarding', authenticate, guilds.updateGuildOnboarding);
router.post('/:guildId/onboarding/submit', authenticate, guilds.submitOnboarding);

router.get('/:guildId/members/@me/permissions', authenticate, guilds.getMyGuildPermissions);

router.use('/:guildId', guildBoostRouter);
router.get('/:guildId/boosts', authenticate, guilds.getGuildBoosters);

// Channel invites
router.post('/:guildId/channels/:channelId/invites', authenticate, invites.createInvite);

router.patch('/:guildId/channels', authenticate, channels.reorderChannels);
router.get('/:guildId/stickers', authenticate, emojis.getStickers);
router.post('/:guildId/stickers', authenticate, uploadSticker, emojis.createSticker);
router.get('/:guildId/stickers/:stickerId', authenticate, emojis.getSticker);
router.patch('/:guildId/stickers/:stickerId', authenticate, emojis.updateSticker);
router.delete('/:guildId/stickers/:stickerId', authenticate, emojis.deleteSticker);

router.get('/:guildId/analytics/overview', authenticate, analytics.getOverview);
router.get('/:guildId/analytics/timeseries', authenticate, analytics.getTimeseries);
router.get('/:guildId/analytics/hourly', authenticate, analytics.getHourly);
router.get('/:guildId/analytics/retention', authenticate, analytics.getRetention);

// Message search
router.get('/:guildId/messages/search', authenticate, searchRateLimit, validate(searchMessagesSchema, 'query'), messages.searchMessages);

export default router;
