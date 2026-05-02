import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as discovery from '../controllers/discovery.controller.js';

const router = Router();

router.get('/', discovery.getDiscoverableGuilds);
router.get('/categories', discovery.getCategories);
router.post('/:guildId/join', authenticate, discovery.joinGuildFromDiscovery);

export const guildDiscoveryRouter = Router({ mergeParams: true });
guildDiscoveryRouter.patch('/discovery', authenticate, discovery.updateGuildDiscovery);

export default router;
