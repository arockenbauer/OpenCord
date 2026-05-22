import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { createPoll, answerPoll, endPoll, getPollResults } from '../controllers/poll.controller.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post('/:channelId/polls', createPoll);
router.post('/:pollId/answers', answerPoll);
router.post('/:pollId/end', endPoll);
router.get('/:pollId/results', getPollResults);

export default router;
