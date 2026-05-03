import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import * as applications from '../controllers/application.controller.js';
import * as linkedRole from '../controllers/linked-role.controller.js';

const router = Router();

router.get('/@me', authenticate, applications.listApplications);
router.get('/', authenticate, requireAdmin(2), applications.listAllApplications);
router.post('/', authenticate, applications.createApplication);
router.get('/:applicationId', authenticate, applications.getApplication);
router.patch('/:applicationId', authenticate, applications.updateApplication);
router.delete('/:applicationId', authenticate, applications.deleteApplication);
router.post('/:applicationId/bot', authenticate, applications.createBot);
router.post('/:applicationId/bot/reset-token', authenticate, applications.resetBotToken);

// Role Connection Metadata (Bot Token)
router.get('/:applicationId/role-connections/metadata', authenticate, linkedRole.getRoleConnectionMetadata);
router.put('/:applicationId/role-connections/metadata', authenticate, linkedRole.setRoleConnectionMetadata);

export default router;
