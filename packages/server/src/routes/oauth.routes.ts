import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as applications from '../controllers/application.controller.js';

const router = Router();

router.post('/authorize', authenticate, applications.authorizeApplication);

export default router;
