import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.email(),
  password: z.string().min(8).max(100),
  workspaceName: z.string().trim().min(1).max(100).optional(),
  invitationToken: z.string().min(1).max(200).optional(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const verifyTwoFactorLoginSchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().length(6),
});

export const twoFactorCodeSchema = z.object({
  code: z.string().length(6),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
