import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authRateLimit } from '../middleware/rate-limit.middleware.js';
import {
  registerSchema, loginSchema, refreshSchema, logoutSchema,
  twoFactorEnableSchema, twoFactorVerifySchema, twoFactorLoginSchema,
  changePasswordSchema, resetPasswordSchema,
} from '@opencord/shared';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', authRateLimit, validate(registerSchema), auth.register);
router.post('/login', authRateLimit, validate(loginSchema), auth.login);
router.post('/refresh', validate(refreshSchema), auth.refresh);
router.post('/logout', authenticate, validate(logoutSchema), auth.logout);
router.post('/logout/all', authenticate, auth.logoutAll);
router.post('/2fa/enable', authenticate, validate(twoFactorEnableSchema), auth.twoFactorEnable);
router.post('/2fa/verify', authenticate, validate(twoFactorVerifySchema), auth.twoFactorVerify);
router.post('/2fa/login', authRateLimit, validate(twoFactorLoginSchema), auth.twoFactorLogin);
router.post('/2fa/disable', authenticate, validate(twoFactorEnableSchema), auth.twoFactorDisable);
router.post('/password/change', authenticate, validate(changePasswordSchema), auth.changePassword);
router.post('/password/reset-request', authRateLimit, validate(z.object({ email: z.string().email() })), auth.requestPasswordReset);
router.post('/password/reset', authRateLimit, validate(resetPasswordSchema), auth.resetPassword);
router.post('/verify-email', authRateLimit, validate(z.object({ token: z.string() })), auth.verifyEmail);
router.post('/2fa/backup-codes', authenticate, validate(z.object({ password: z.string() })), auth.regenerateBackupCodes);

export default router;
