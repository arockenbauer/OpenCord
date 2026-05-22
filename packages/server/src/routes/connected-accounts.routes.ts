import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as controller from '../controllers/connected-account.controller.js';
import * as users from '../controllers/user.controller.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

// User connections
router.get('/', controller.getConnections);
router.post('/', users.createConnection);
router.post('/:type/callback', controller.connectionCallback);
router.patch('/:connectionId', controller.updateConnection);
router.delete('/:connectionId', controller.deleteConnection);

export default router;
