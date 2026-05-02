import { Router } from 'express';
import { prisma } from '../utils/prisma.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const badges = await prisma.badge.findMany({ orderBy: { priority: 'asc' } });
    res.json({ badges });
  } catch (err) {
    next(err);
  }
});

export default router;
