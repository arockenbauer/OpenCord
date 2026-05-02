import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as analytics from '../controllers/analytics.controller.js';

const router = Router({ mergeParams: true });

router.get('/overview', authenticate, analytics.getOverview);
router.get('/timeseries', authenticate, analytics.getTimeseries);
router.get('/hourly', authenticate, analytics.getHourly);
router.get('/retention', authenticate, analytics.getRetention);

export default router;