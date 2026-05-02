import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
import * as reports from '../controllers/report.controller.js';

const router = Router();

router.post('/', authenticate, reports.createReport);
router.get('/', authenticate, requireAdmin(1), reports.getReports);
router.get('/:reportId', authenticate, requireAdmin(1), reports.getReport);
router.patch('/:reportId', authenticate, requireAdmin(1), reports.updateReport);

export default router;
