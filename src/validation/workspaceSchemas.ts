import { z } from 'zod';

export const WORKSPACE_ROLES = ['Owner', 'Admin', 'Member'] as const;

export const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// Ownership is never handed out: a workspace has exactly the owner who created it.
const assignableRole = z.enum(['Admin', 'Member']);

export const inviteMemberSchema = z.object({
  email: z
    .email()
    .max(191)
    .transform((email) => email.toLowerCase()),
  role: assignableRole.default('Member'),
});

export const changeRoleSchema = z.object({ role: assignableRole });

export const invitationTokenSchema = z.object({ token: z.string().min(1).max(200) });
