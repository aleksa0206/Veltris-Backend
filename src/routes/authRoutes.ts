import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  meHandler,
  verifyTwoFactorLoginHandler,
  setupTwoFactorHandler,
  confirmTwoFactorHandler,
  disableTwoFactorHandler,
  refreshHandler,
  logoutHandler,
  requestPasswordResetHandler,
  resetPasswordHandler,
} from '../controllers/authController';
import { loginDbRateLimiter } from '../middleware/dbRateLimiter';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  registerSchema,
  loginSchema,
  verifyTwoFactorLoginSchema,
  twoFactorCodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validation/authSchemas';

const router = Router();
router.post('/auth/register', loginDbRateLimiter, validate(registerSchema), registerHandler);
router.post('/auth/login', loginDbRateLimiter, validate(loginSchema), loginHandler);
router.post(
  '/auth/2fa/verify-login',
  loginDbRateLimiter,
  validate(verifyTwoFactorLoginSchema),
  verifyTwoFactorLoginHandler
);
router.get('/auth/me', authMiddleware, meHandler);
router.post('/auth/2fa/setup', authMiddleware, setupTwoFactorHandler);
router.post(
  '/auth/2fa/confirm',
  authMiddleware,
  validate(twoFactorCodeSchema),
  confirmTwoFactorHandler
);
router.delete('/auth/2fa', authMiddleware, validate(twoFactorCodeSchema), disableTwoFactorHandler);
router.post('/auth/refresh', refreshHandler);
router.post('/auth/logout', logoutHandler);
router.post(
  '/auth/forgot-password',
  loginDbRateLimiter,
  validate(forgotPasswordSchema),
  requestPasswordResetHandler
);
router.post(
  '/auth/reset-password',
  loginDbRateLimiter,
  validate(resetPasswordSchema),
  resetPasswordHandler
);
export default router;
