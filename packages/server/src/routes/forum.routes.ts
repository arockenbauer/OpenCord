import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as forumController from '../controllers/forum.controller.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/:channelId/tags', forumController.getForumTags);
router.post('/:channelId/tags', forumController.createForumTag);
router.patch('/:channelId/tags/:tagId', forumController.updateForumTag);
router.delete('/:channelId/tags/:tagId', forumController.deleteForumTag);

// Applied tags for threads
router.get('/:channelId/threads/:threadId/applied-tags', forumController.getAppliedTags);

export default router;
