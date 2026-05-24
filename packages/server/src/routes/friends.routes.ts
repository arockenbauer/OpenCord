import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as friend from '../controllers/friend.controller.js';

const router = Router();

router.get('/', authenticate, friend.getRelationships);
router.post('/', authenticate, friend.sendFriendRequest);
router.post('/accept/:userId', authenticate, friend.acceptFriendRequest);
router.post('/decline/:userId', authenticate, friend.declineFriendRequest);
router.put('/:userId/block', authenticate, friend.blockUser);
router.delete('/:userId/block', authenticate, friend.unblockUser);
router.delete('/:userId', authenticate, friend.removeOrUnblock);
router.get('/:userId/relationships', authenticate, friend.getMutualRelationships);

export default router;
