import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import * as discovery from '../controllers/discovery.controller.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

// Public routes
router.get('/', discovery.getDiscoverableGuilds);
router.get('/categories', discovery.getCategories);
router.get('/featured', discovery.getFeaturedGuilds);
router.post('/:guildId/join', authenticate, discovery.joinGuildFromDiscovery);

// Guild discovery settings (requires MANAGE_GUILD)
const guildDiscoveryRouter = Router({ mergeParams: true });
guildDiscoveryRouter.patch('/discovery', authenticate, discovery.updateGuildDiscovery);
guildDiscoveryRouter.put('/discovery-splash', authenticate, upload.single('file'), discovery.uploadDiscoverySplash);

// Admin routes for featuring guilds
const adminDiscoveryRouter = Router();
adminDiscoveryRouter.post('/featured', authenticate, requireAdmin(2), discovery.featureGuild);
adminDiscoveryRouter.delete('/featured/:guildId', authenticate, requireAdmin(2), discovery.unfeatureGuild);

export { guildDiscoveryRouter, adminDiscoveryRouter };
export default router;
