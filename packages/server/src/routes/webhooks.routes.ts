import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as webhooks from '../controllers/webhook.controller.js';

const router = Router();

router.get('/channels/:channelId/webhooks', authenticate, webhooks.getWebhooks);
router.post('/channels/:channelId/webhooks', authenticate, webhooks.createWebhook);
router.get('/guilds/:guildId/webhooks', authenticate, webhooks.getGuildWebhooks);
router.get('/webhooks/:webhookId', authenticate, webhooks.getWebhook);
router.patch('/webhooks/:webhookId', authenticate, webhooks.updateWebhook);
router.delete('/webhooks/:webhookId', authenticate, webhooks.deleteWebhook);
router.post('/webhooks/:webhookId/:token', webhooks.executeWebhook);

export default router;
