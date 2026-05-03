import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

// Public: list all badges
router.get('/', async (req, res, next) => {
  try {
    const badges = await prisma.badge.findMany({ orderBy: { priority: 'asc' } });
    res.json({ badges });
  } catch (err) {
    next(err);
  }
});

// Admin: create badge (requires admin_level >= 2)
router.post('/', authenticate, requireAdmin(2), async (req, res, next) => {
  try {
    const { name, label, description, icon, type, color, priority } = req.body;
    if (!name) throw new AppError(400, 'MISSING_FIELD', 'name is required');

    const badge = await prisma.badge.create({
      data: {
        id: generateSnowflake(),
        name,
        label: label || '',
        description: description || '',
        icon: icon || '',
        type: type || 'system',
        color: color || null,
        priority: priority || 100,
      },
    });
    res.status(201).json({ badge });
  } catch (err) {
    next(err);
  }
});

// Admin: update badge (requires admin_level >= 2)
router.patch('/:badgeId', authenticate, requireAdmin(2), async (req, res, next) => {
  try {
    const { label, description, icon, type, color, priority } = req.body;
    const badge = await prisma.badge.update({
      where: { id: req.params.badgeId },
      data: { label, description, icon, type, color, priority },
    });
    res.json({ badge });
  } catch (err) {
    next(err);
  }
});

// Admin: delete badge (requires admin_level >= 3)
router.delete('/:badgeId', authenticate, requireAdmin(3), async (req, res, next) => {
  try {
    // Revoke badge from all users first
    await prisma.userBadge.deleteMany({ where: { badge_id: req.params.badgeId } });
    await prisma.badge.delete({ where: { id: req.params.badgeId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Admin: assign badge to user (requires admin_level >= 2)
router.post('/:badgeId/assign/:userId', authenticate, requireAdmin(2), async (req, res, next) => {
  try {
    const badge = await prisma.badge.findUnique({ where: { id: req.params.badgeId } });
    if (!badge) throw new AppError(404, 'BADGE_NOT_FOUND', 'Badge not found');

    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const entry = await prisma.userBadge.upsert({
      where: { user_id_badge_id: { user_id: req.params.userId, badge_id: req.params.badgeId } },
      create: { id: generateSnowflake(), user_id: req.params.userId, badge_id: req.params.badgeId, assigned_by: req.user!.userId },
      update: { assigned_by: req.user!.userId },
    });
    res.status(201).json({ user_id: entry.user_id, badge_id: entry.badge_id, assigned_at: entry.assigned_at, assigned_by: entry.assigned_by });
  } catch (err) {
    next(err);
  }
});

// Admin: revoke badge from user (requires admin_level >= 2)
router.delete('/:badgeId/revoke/:userId', authenticate, requireAdmin(2), async (req, res, next) => {
  try {
    await prisma.userBadge.deleteMany({
      where: { user_id: req.params.userId, badge_id: req.params.badgeId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
