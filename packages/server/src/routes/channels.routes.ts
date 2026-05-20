import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { channelManageRateLimit, typingRateLimit } from '../middleware/rate-limit.middleware.js';
import * as channels from '../controllers/channel.controller.js';
import * as threads from '../controllers/thread.controller.js';
import { createChannelSchema } from '@opencord/shared';

const router = Router({ mergeParams: true });

router.post('/', authenticate, channelManageRateLimit, validate(createChannelSchema), channels.createChannel);
router.get('/:channelId', authenticate, channels.getChannel);
router.patch('/:channelId', authenticate, channels.updateChannel);
router.delete('/:channelId', authenticate, channels.deleteChannel);
router.put('/:channelId/permissions/:overwriteId', authenticate, channels.updatePermissionOverwrite);
router.delete('/:channelId/permissions/:overwriteId', authenticate, channels.deletePermissionOverwrite);
router.post('/:channelId/permissions', authenticate, channels.createPermissionOverwrite);

// Thread routes - spec 28
router.post('/:channelId/threads', authenticate, threads.startThread);
router.post('/:channelId/messages/:messageId/threads', authenticate, threads.startThreadFromMessage);
router.get('/:channelId/threads/active', authenticate, threads.getActiveThreads);
router.get('/:channelId/threads/archived/public', authenticate, threads.getArchivedThreads);
router.get('/:channelId/threads/archived/private', authenticate, threads.getArchivedThreads);
router.get('/:channelId/users/@me/threads/archived/private', authenticate, threads.getMyPrivateArchivedThreads);

router.put('/:threadId/thread-members/@me', authenticate, threads.joinThread);
router.delete('/:threadId/thread-members/@me', authenticate, threads.leaveThread);
router.put('/:threadId/thread-members/:userId', authenticate, threads.addThreadMember);
router.delete('/:threadId/thread-members/:userId', authenticate, threads.removeThreadMember);
router.get('/:threadId/thread-members', authenticate, threads.getThreadMembers);

router.patch('/:threadId', authenticate, threads.updateThread);

router.post('/:channelId/typing', authenticate, typingRateLimit, channels.triggerTyping);
router.post('/:channelId/followers', authenticate, channels.followChannel);

export { router as guildChannelRouter };
export default router;
