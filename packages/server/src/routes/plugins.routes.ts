import { Router } from 'express';
import * as plugins from '../controllers/plugin.controller.js';

const router = Router();

router.get('/', plugins.getPlugins);
router.get('/:slug', plugins.getPlugin);

export default router;
