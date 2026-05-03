import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as controller from '../controllers/connected-account.controller.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

// User connections
router.get('/@me/connections', controller.getConnections);
router.post('/@me/connections/:type/callback', controller.connectionCallback);
router.patch('/@me/connections/:connectionId', controller.updateConnection);
router.delete('/@me/connections/:connectionId', controller.deleteConnection);

export default router;
