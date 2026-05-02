import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { channelManageRateLimit, typingRateLimit } from '../middleware/rate-limit.middleware.js';
import * as channels from '../controllers/channel.controller.js';
import * as threads from '../controllers/thread.controller.js';
import { createChannelSchema } from '@opencord/shared';

const router = Router();

router.post('/', authenticate, channelManageRateLimit, validate(createChannelSchema), channels.createChannel);
router.get('/:channelId', authenticate, channels.getChannel);
router.patch('/:channelId', authenticate, channels.updateChannel);
router.delete('/:channelId', authenticate, channels.deleteChannel);
router.put('/:channelId/permissions/:overwriteId', authenticate, channels.updatePermissionOverwrite);
router.delete('/:channelId/permissions/:overwriteId', authenticate, channels.deletePermissionOverwrite);
router.post('/:channelId/permissions', authenticate, channels.createPermissionOverwrite);

router.post('/:channelId/threads', authenticate, threads.startThread);
router.post('/:channelId/thread', authenticate, threads.startThreadWithoutMessage);
router.get('/:channelId/thread/:threadId', authenticate, threads.getThread);
router.patch('/:channelId/thread/:threadId', authenticate, threads.updateThread);
router.delete('/:channelId/thread/:threadId', authenticate, threads.deleteThread);
router.patch('/:channelId/thread/:threadId/archive', authenticate, threads.archiveThread);
router.patch('/:channelId/thread/:threadId/lock', authenticate, threads.lockThread);
router.get('/:channelId/thread/:threadId/members', authenticate, threads.getThreadMembers);
router.post('/:channelId/thread/:threadId/members/:userId', authenticate, threads.joinThread);
router.delete('/:channelId/thread/:threadId/members/:userId', authenticate, threads.leaveThread);
router.get('/:channelId/threads/archived/public', authenticate, threads.getArchivedThreads);
router.get('/:channelId/threads/archived/private', authenticate, threads.getArchivedThreads);
router.get('/:channelId/threads/archived/joined', authenticate, threads.getArchivedThreads);

router.post('/:channelId/typing', authenticate, typingRateLimit, channels.triggerTyping);
router.post('/:channelId/follow', authenticate, channels.followChannel);

export { router as guildChannelRouter };

export default router;
