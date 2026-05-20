import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { messageSendRateLimit, messageSendBotRateLimit, messageEditDeleteRateLimit, reactionAddRateLimit, reactionAddBotRateLimit, bulkDeleteRateLimit, searchRateLimit, botGlobalRateLimit } from '../middleware/rate-limit.middleware.js';
import { uploadAttachments } from '../middleware/upload.middleware.js';
import { createMessageSchema, editMessageSchema, bulkDeleteSchema, getMessagesSchema, searchMessagesSchema } from '@opencord/shared';
import * as messages from '../controllers/message.controller.js';

const router = Router({ mergeParams: true });

function botAwareRateLimit(userLimit: any, botLimit: any) {
  return (req: any, res: any, next: any) => {
    if (req.user?.type === 'bot') {
      return botLimit(req, res, next);
    }
    return userLimit(req, res, next);
  };
}

router.get('/', authenticate, validate(getMessagesSchema, 'query'), messages.getMessages);
router.get('/search', authenticate, searchRateLimit, validate(searchMessagesSchema, 'query'), messages.searchMessages);
router.get('/pins', authenticate, messages.getPins);
router.post('/', authenticate, botAwareRateLimit(messageSendRateLimit, messageSendBotRateLimit), uploadAttachments, validate(createMessageSchema), messages.createMessage);
router.post('/bulk-delete', authenticate, bulkDeleteRateLimit, validate(bulkDeleteSchema), messages.bulkDelete);
router.get('/:messageId', authenticate, messages.getMessage);
router.patch('/:messageId', authenticate, messageEditDeleteRateLimit, validate(editMessageSchema), messages.editMessage);
router.delete('/:messageId', authenticate, messageEditDeleteRateLimit, messages.deleteMessage);
router.put('/:messageId/pins', authenticate, messages.pinMessage);
router.delete('/:messageId/pins', authenticate, messages.unpinMessage);
router.put('/:messageId/reactions/:emoji/@me', authenticate, botAwareRateLimit(reactionAddRateLimit, reactionAddBotRateLimit), messages.addReaction);
router.delete('/:messageId/reactions/:emoji/@me', authenticate, messages.removeReaction);
router.post('/:messageId/ack', authenticate, messages.ackMessage);
router.get('/:messageId/poll', authenticate, messages.getPoll);
router.post('/:messageId/poll/answers', authenticate, messages.answerPoll);
router.get('/:messageId/poll/answers', authenticate, messages.getPollAnswers);
router.post('/:messageId/poll/end', authenticate, messages.endPoll);
router.get('/:messageId/reactions/:emoji', authenticate, messages.getReactionUsers);
router.delete('/:messageId/reactions', authenticate, messages.removeAllReactions);
router.delete('/:messageId/reactions/:emoji', authenticate, messages.removeEmojiReactions);
router.delete('/:messageId/reactions/:emoji/:userId', authenticate, messages.removeReaction);
router.post('/:messageId/crosspost', authenticate, messages.crosspostMessage);
router.post('/:messageId/reports', authenticate, messages.reportMessage);

export default router;
