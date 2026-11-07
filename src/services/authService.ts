import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import QRCode from 'qrcode';
import * as userRepository from '../repositories/userRepository';
import * as refreshTokenRepository from '../repositories/refreshTokenRepository';
import { UnauthorizedError } from '../errors/UnauthorizedError';
import { ConflictError } from '../errors/ConflictError';
import { LockedError } from '../errors/LockedError';
import { TwoFactorRequiredError } from '../errors/TwoFactorRequiredError';
import { ValidationError } from '../errors/ValidationError';
import * as invitationService from './invitationService';
import { getContainer } from '../container';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { generateToken, hashToken } from '../utils/tokens';

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
  issuer: 'Veltris',
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const TEMP_TOKEN_TTL = '5m';

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function signAccessToken(user: { id: number }) {
  return jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '15m' });
}

function signTempToken(userId: number) {
  return jwt.sign({ userId, purpose: '2fa-pending' }, env.JWT_SECRET, {
    expiresIn: TEMP_TOKEN_TTL,
  });
}

async function issueTokensForUser(user: { id: number }) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();

  await refreshTokenRepository.createRefreshToken({
    userId: user.id,
    token: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return { accessToken, refreshToken };
}

const DUMMY_PASSWORD_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO5cLDl6h.HOOrGqW9dR1MXwLXVWfHbf.';

export async function login(email: string, password: string) {
  const user = await userRepository.findUserByEmail(email);

  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    logger.warn({ email }, 'Login attempt for unknown email');
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new LockedError('Account is temporarily locked due to too many failed login attempts');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    const attemptsAfterThis = user.failedLoginAttempts + 1;

    if (attemptsAfterThis >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await userRepository.setAccountLock(user.id, new Date(Date.now() + LOCKOUT_DURATION_MS), 0);
      logger.warn({ userId: user.id }, 'Account locked after too many failed login attempts');
      throw new LockedError(
        'Account locked due to too many failed login attempts. Try again in 15 minutes.'
      );
    }

    await userRepository.incrementFailedLoginAttempts(user.id);
    logger.warn({ userId: user.id, attempt: attemptsAfterThis }, 'Failed login attempt');
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await userRepository.setAccountLock(user.id, null, 0);
  }

  if (user.twoFactorEnabled) {
    const tempToken = signTempToken(user.id);
    throw new TwoFactorRequiredError(tempToken);
  }

  const { accessToken, refreshToken } = await issueTokensForUser(user);

  return { accessToken, refreshToken, user: userRepository.toSafeUser(user) };
}

// Public sign-up: creates the account and its first workspace, then logs them in.
export async function register(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  workspaceName?: string | undefined;
  /** Signing up from an invitation link joins that workspace instead of creating one. */
  invitationToken?: string | undefined;
}) {
  if (await userRepository.findUserByEmail(input.email)) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const data = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    passwordHash,
  };

  let user;
  if (input.invitationToken) {
    const { invitation, status } = await invitationService.findByToken(input.invitationToken);
    if (status !== 'open') {
      throw new ConflictError('This invitation is no longer valid');
    }
    // The link proves access to the invited mailbox, not to any other address.
    if (!invitationService.sameEmail(invitation.email, input.email)) {
      throw new ValidationError('email: must be the address the invitation was sent to', [
        { path: 'email', message: 'must be the address the invitation was sent to' },
      ]);
    }
    user = await userRepository.createWithInvitation(data, invitation);
    if (!user) {
      throw new ConflictError('This invitation is no longer valid');
    }
  } else {
    user = await userRepository.createWithWorkspace(
      data,
      input.workspaceName ?? `${input.firstName}'s workspace`
    );
  }

  const { accessToken, refreshToken } = await issueTokensForUser(user);

  return { accessToken, refreshToken, user };
}

export async function verifyTwoFactorLogin(tempToken: string, code: string) {
  let payload: { userId: number; purpose: string };

  try {
    payload = jwt.verify(tempToken, env.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as typeof payload;
  } catch {
    throw new UnauthorizedError('Invalid or expired temporary token');
  }

  if (payload.purpose !== '2fa-pending') {
    throw new UnauthorizedError('Invalid temporary token');
  }

  const user = await userRepository.findByIdWithAuthFields(payload.userId);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new UnauthorizedError('Two-factor authentication is not enabled for this account');
  }

  const result = await totp.verify(code, { secret: user.twoFactorSecret });
  if (!result.valid) {
    throw new UnauthorizedError('Invalid two-factor code');
  }

  const { accessToken, refreshToken } = await issueTokensForUser(user);

  return { accessToken, refreshToken, user: userRepository.toSafeUser(user) };
}

export async function getCurrentUser(userId: number) {
  const user = await userRepository.findByIdWithAuthFields(userId);
  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }
  return { ...userRepository.toSafeUser(user), twoFactorEnabled: user.twoFactorEnabled };
}

export async function setupTwoFactor(userId: number) {
  const user = await userRepository.findByIdWithAuthFields(userId);
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  // Replacing the secret of an active 2FA would let a stolen access token take over the second
  // factor; turning it off first requires a valid code.
  if (user.twoFactorEnabled) {
    throw new ConflictError('Two-factor authentication is already enabled');
  }

  const secret = totp.generateSecret();
  await userRepository.setTwoFactorSecret(userId, secret);

  const otpauthUrl = totp.toURI({ label: user.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return { qrCodeDataUrl, secret };
}

export async function confirmTwoFactor(userId: number, code: string) {
  const user = await userRepository.findByIdWithAuthFields(userId);
  if (!user || !user.twoFactorSecret) {
    throw new UnauthorizedError('Two-factor setup was not initiated');
  }

  const result = await totp.verify(code, { secret: user.twoFactorSecret });
  if (!result.valid) {
    throw new UnauthorizedError('Invalid two-factor code');
  }

  await userRepository.enableTwoFactor(userId);
}
export async function disableTwoFactor(userId: number, code: string) {
  const user = await userRepository.findByIdWithAuthFields(userId);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new UnauthorizedError('Two-factor authentication is not enabled for this account');
  }

  const result = await totp.verify(code, { secret: user.twoFactorSecret });
  if (!result.valid) {
    throw new UnauthorizedError('Invalid two-factor code');
  }

  await userRepository.disableTwoFactor(userId);
}

export async function refresh(oldRefreshToken: string) {
  const hashed = hashToken(oldRefreshToken);
  const existing = await refreshTokenRepository.findRefreshTokenByTokenHash(hashed);

  if (!existing || existing.revoked || existing.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const rotated = await refreshTokenRepository.revokeRefreshTokenIfActive(existing.id);
  if (!rotated) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await userRepository.findById(existing.userId);
  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = generateRefreshToken();

  await refreshTokenRepository.createRefreshToken({
    userId: user.id,
    token: hashToken(newRefreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(oldRefreshToken: string) {
  const hashed = hashToken(oldRefreshToken);
  const existing = await refreshTokenRepository.findRefreshTokenByTokenHash(hashed);
  if (existing) {
    await refreshTokenRepository.revokeRefreshToken(existing.id);
  }
}

export async function requestPasswordReset(email: string) {
  const user = await userRepository.findUserByEmail(email);

  if (!user) {
    return;
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await userRepository.setPasswordResetToken(user.id, tokenHash, expiresAt);
  await getContainer().email.sendPasswordResetEmail(user.email, rawToken);
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const user = await userRepository.findByResetTokenHash(tokenHash);

  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await userRepository.updatePassword(user.id, newPasswordHash);
  await userRepository.setPasswordResetToken(user.id, null, null);

  // Security measure: revoke ALL existing refresh tokens after a password reset
  await refreshTokenRepository.revokeAllForUser(user.id);
}
