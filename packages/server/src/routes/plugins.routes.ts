import { Router } from 'express';
import * as plugins from '../controllers/plugin.controller.js';

const router = Router();

// Public plugin listing
router.get('/', plugins.getPlugins);
router.get('/:slug', plugins.getPlugin);

// User plugin settings
router.get('/users/@me/plugins', plugins.getUserPlugins);
router.patch('/users/@me/plugins/:slug', plugins.updateUserPlugin);

// Guild plugin settings (require admin)
router.get('/guilds/:guildId/plugins', plugins.getGuildPlugins);
router.patch('/guilds/:guildId/plugins/:slug', plugins.updateGuildPlugin);

export default router;
