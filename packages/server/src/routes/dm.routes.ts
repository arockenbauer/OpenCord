import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as dm from '../controllers/dm.controller.js';

const router = Router();

router.get('/', authenticate, dm.getDMChannels);
router.post('/', authenticate, dm.createDM);
router.post('/group', authenticate, dm.createGroupDM);
router.patch('/:channelId', authenticate, dm.updateDMChannel);
router.delete('/:channelId', authenticate, dm.deleteDMChannel);
router.put('/:channelId/recipients/:userId', authenticate, dm.addDMRecipient);
router.delete('/:channelId/recipients/:userId', authenticate, dm.removeDMRecipient);

export default router;
