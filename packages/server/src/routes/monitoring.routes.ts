import { Router } from 'express';
import * as monitoring from '../controllers/monitoring.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Public routes
router.get('/health', monitoring.getHealth);
router.get('/status', monitoring.getStatus);
router.get('/status/history', monitoring.getStatusHistory);
router.get('/status/incidents', monitoring.getIncidents);

// Admin routes - metrics
router.get('/admin/metrics', authenticate, requireAdmin(1), monitoring.getMetrics);

// Admin routes - incidents
router.post('/admin/status/incidents', authenticate, requireAdmin(1), monitoring.createIncident);
router.patch('/admin/status/incidents/:id', authenticate, requireAdmin(1), monitoring.updateIncident);
router.delete('/admin/status/incidents/:id', authenticate, requireAdmin(1), monitoring.deleteIncident);

// Admin routes - maintenances
router.post('/admin/status/maintenances', authenticate, requireAdmin(2), monitoring.createMaintenance);
router.patch('/admin/status/maintenances/:id', authenticate, requireAdmin(2), monitoring.updateMaintenance);
router.delete('/admin/status/maintenances/:id', authenticate, requireAdmin(2), monitoring.deleteMaintenance);

// Admin routes - monitors
router.get('/admin/status/monitors', authenticate, requireAdmin(1), monitoring.getMonitors);
router.post('/admin/status/monitors', authenticate, requireAdmin(1), monitoring.createMonitor);
router.patch('/admin/status/monitors/:id', authenticate, requireAdmin(1), monitoring.updateMonitor);
router.delete('/admin/status/monitors/:id', authenticate, requireAdmin(1), monitoring.deleteMonitor);
router.post('/admin/status/monitors/:id/check', authenticate, requireAdmin(1), monitoring.runMonitorCheck);

// Admin routes - SFTP
router.get('/admin/logging/sftp/status', authenticate, requireAdmin(2), monitoring.getSftpStatus);
router.post('/admin/logging/sftp/test', authenticate, requireAdmin(2), monitoring.testSftpConnection);
router.post('/admin/logging/sftp/export', authenticate, requireAdmin(2), monitoring.triggerSftpExport);

export default router;
