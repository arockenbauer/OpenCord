import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as applications from '../controllers/application.controller.js';

const router = Router();

router.get('/authorize', authenticate, applications.getAuthorize);
router.post('/authorize', authenticate, applications.postAuthorize);

export default router;
