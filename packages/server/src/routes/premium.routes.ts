import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as premium from '../controllers/premium.controller.js';

const router = Router();

router.get('/tiers', premium.getPremiumTiers);
router.get('/subscription', authenticate, premium.getMySubscription);
router.post('/subscribe', authenticate, premium.subscribe);
router.post('/checkout', authenticate, premium.createCheckoutSession);
router.post('/portal', authenticate, premium.createPortalSession);
router.delete('/subscription', authenticate, premium.cancelSubscription);
router.get('/boosts', authenticate, premium.getMyBoosts);

// Stripe webhook (raw body needed, no authenticate middleware)
router.post('/webhook', premium.handleStripeWebhook);

export const guildBoostRouter = Router({ mergeParams: true });
guildBoostRouter.post('/boosts', authenticate, premium.boostGuild);
guildBoostRouter.delete('/boosts', authenticate, premium.unboostGuild);

export default router;
