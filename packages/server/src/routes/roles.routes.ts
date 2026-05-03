import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { uploadRoleIcon } from '../middleware/upload.middleware.js';
import * as roles from '../controllers/role.controller.js';
import * as linkedRole from '../controllers/linked-role.controller.js';

const router = Router({ mergeParams: true });

router.get('/', authenticate, roles.getRoles);
router.post('/', authenticate, roles.createRole);
router.patch('/positions', authenticate, roles.updateRolePositions);
router.patch('/:roleId', authenticate, roles.updateRole);
router.delete('/:roleId', authenticate, roles.deleteRole);
router.patch('/:roleId/icon', authenticate, uploadRoleIcon, roles.updateRoleIcon);
router.get('/:roleId/connections', authenticate, roles.getRoleConnections);
router.patch('/:roleId/connections', authenticate, roles.updateRoleConnections);
router.get('/hierarchy', authenticate, roles.getRoleHierarchy);

// Role Connection Requirements (Guild Admin)
router.get('/:roleId/role-connection-requirements', authenticate, linkedRole.getRoleConnectionRequirements);
router.put('/:roleId/role-connection-requirements', authenticate, linkedRole.setRoleConnectionRequirements);

export default router;
