import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as applications from '../controllers/application.controller.js';

const router = Router();

router.get('/', authenticate, applications.listApplications);
router.post('/', authenticate, applications.createApplication);
router.get('/:applicationId', authenticate, applications.getApplication);
router.post('/:applicationId/bot', authenticate, applications.createBot);

export default router;
