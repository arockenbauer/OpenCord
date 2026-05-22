import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { createStageInstance, getStageInstance, updateStageInstance, deleteStageInstance } from '../controllers/stage.controller.js';

const router = Router();

router.use(authenticate);

router.post('/channels/:channelId/stage-instances', createStageInstance);
router.get('/channels/:channelId/stage-instances', getStageInstance);
router.patch('/channels/:channelId/stage-instances', updateStageInstance);
router.delete('/channels/:channelId/stage-instances', deleteStageInstance);

export default router;
