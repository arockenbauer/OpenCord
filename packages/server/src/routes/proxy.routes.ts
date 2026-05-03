import { Router } from 'express';
import { proxyImage } from '../controllers/proxy.controller.js';

const router = Router();

router.get('/image', proxyImage);

export default router;
