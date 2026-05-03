import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { analyticsRateLimit } from '../middleware/rate-limit.middleware.js';
import * as analytics from '../controllers/analytics.controller.js';

const router = Router({ mergeParams: true });

router.get('/overview', authenticate, analyticsRateLimit, analytics.getOverview);
router.get('/timeseries', authenticate, analyticsRateLimit, analytics.getTimeseries);
router.get('/hourly', authenticate, analyticsRateLimit, analytics.getHourly);
router.get('/retention', authenticate, analyticsRateLimit, analytics.getRetention);

export default router;