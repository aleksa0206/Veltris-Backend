import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService';
import { UnauthorizedError } from '../errors/UnauthorizedError';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/auth',
};

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const { accessToken, refreshToken, user } = await authService.login(email, password);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ token: accessToken, user });
  } catch (err) {
    next(err);
  }
}

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { accessToken, refreshToken, user } = await authService.register(req.body);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(201).json({ token: accessToken, user });
  } catch (err) {
    next(err);
  }
}

export async function verifyTwoFactorLoginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tempToken, code } = req.body;
    const { accessToken, refreshToken, user } = await authService.verifyTwoFactorLogin(
      tempToken,
      code
    );
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ token: accessToken, user });
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await authService.getCurrentUser(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function setupTwoFactorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { qrCodeDataUrl } = await authService.setupTwoFactor(req.user!.userId);
    res.json({ qrCode: qrCodeDataUrl });
  } catch (err) {
    next(err);
  }
}

export async function confirmTwoFactorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.body;
    await authService.confirmTwoFactor(req.user!.userId, code);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function disableTwoFactorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.body;
    await authService.disableTwoFactor(req.user!.userId, code);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const oldRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!oldRefreshToken) {
      throw new UnauthorizedError('Refresh token missing');
    }
    const { accessToken, refreshToken } = await authService.refresh(oldRefreshToken);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ token: accessToken });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const oldRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (oldRefreshToken) {
      await authService.logout(oldRefreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function requestPasswordResetHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email);
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
