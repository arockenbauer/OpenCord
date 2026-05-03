import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as controller from '../controllers/user-note.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', controller.getNotes);
router.get('/:targetId', controller.getNoteForUser);
router.post('/:targetId', controller.upsertNote);
router.delete('/:targetId', controller.deleteNote);

export default router;
