import { User } from '@prisma/client';
import { prisma } from '../config/prismaClient';

const userSafeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function findById(userId: number) {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: userSafeSelect,
  });
}

export async function update(
  userId: number,
  data: Partial<{
    firstName: string;
    lastName: string;
    email: string;
  }>
) {
  return await prisma.user.update({
    where: { id: userId },
    data,
    select: userSafeSelect,
  });
}

export async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({ where: { email } });
}

export function toSafeUser(user: User): Pick<User, keyof typeof userSafeSelect> {
  const keys = Object.keys(userSafeSelect) as (keyof typeof userSafeSelect)[];
  return Object.fromEntries(keys.map((key) => [key, user[key]])) as Pick<
    User,
    keyof typeof userSafeSelect
  >;
}

export async function incrementFailedLoginAttempts(userId: number) {
  return await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
  });
}

export async function setAccountLock(
  userId: number,
  lockedUntil: Date | null,
  failedLoginAttempts: number
) {
  return await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil, failedLoginAttempts },
  });
}

export async function setTwoFactorSecret(userId: number, secret: string) {
  return await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret },
  });
}

export async function enableTwoFactor(userId: number) {
  return await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });
}

export async function disableTwoFactor(userId: number) {
  return await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
}

export async function findByIdWithAuthFields(userId: number) {
  return await prisma.user.findUnique({ where: { id: userId } });
}

export async function setPasswordResetToken(
  userId: number,
  tokenHash: string | null,
  expiresAt: Date | null
) {
  return await prisma.user.update({
    where: { id: userId },
    data: { resetPasswordTokenHash: tokenHash, resetPasswordExpiresAt: expiresAt },
  });
}

export async function findByResetTokenHash(tokenHash: string) {
  return await prisma.user.findFirst({ where: { resetPasswordTokenHash: tokenHash } });
}

export async function updatePassword(userId: number, passwordHash: string) {
  return await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/** What other members see of a user (assignee, author, lead). */
export const userRefSelect = { id: true, firstName: true, lastName: true } as const;

/** Sign-up: the account and its first workspace, which the new user owns. */
export async function createWithWorkspace(
  data: { firstName: string; lastName: string; email: string; passwordHash: string },
  workspaceName: string
) {
  return await prisma.user.create({
    data: {
      ...data,
      memberships: { create: { role: 'Owner', workspace: { create: { name: workspaceName } } } },
    },
    select: userSafeSelect,
  });
}

/**
 * Sign-up through an invitation: the account joins the invited workspace instead of getting one
 * of its own. Guarded on the invitation still being open; returns null (nothing created) otherwise.
 */
export async function createWithInvitation(
  data: { firstName: string; lastName: string; email: string; passwordHash: string },
  invitation: { id: number; workspaceId: number; role: 'Owner' | 'Admin' | 'Member' }
) {
  return await prisma.$transaction(async (tx) => {
    const now = new Date();
    const result = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });
    if (result.count !== 1) return null;
    return await tx.user.create({
      data: {
        ...data,
        memberships: { create: { workspaceId: invitation.workspaceId, role: invitation.role } },
      },
      select: userSafeSelect,
    });
  });
}
