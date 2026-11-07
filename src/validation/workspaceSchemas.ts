import { z } from 'zod';

export const WORKSPACE_ROLES = ['Owner', 'Admin', 'Member'] as const;

export const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// Ownership is not handed out here; a workspace has exactly the owner who created it.
export const addMemberSchema = z.object({
  email: z.email().max(191),
  role: z.enum(['Admin', 'Member']).default('Member'),
});
