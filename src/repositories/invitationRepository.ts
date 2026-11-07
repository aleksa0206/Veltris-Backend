import { WorkspaceRole } from '@prisma/client';
import { prisma } from '../config/prismaClient';
import { userRefSelect } from './userRepository';

const invitationInclude = {
  workspace: { select: { id: true, name: true } },
  invitedBy: { select: userRefSelect },
} as const;

/** Open invitations of a workspace, newest first. */
export async function findPendingInvitations(workspaceId: number, now: Date) {
  return await prisma.invitation.findMany({
    where: { workspaceId, acceptedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: userRefSelect },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export async function findInvitationById(id: number) {
  return await prisma.invitation.findUnique({ where: { id } });
}

export async function findInvitationByTokenHash(tokenHash: string) {
  return await prisma.invitation.findUnique({ where: { tokenHash }, include: invitationInclude });
}

/** Creates the invitation, or renews an existing one for the same email (new token and expiry). */
export async function upsertInvitation(data: {
  workspaceId: number;
  email: string;
  role: WorkspaceRole;
  tokenHash: string;
  invitedById: number;
  expiresAt: Date;
}) {
  const { workspaceId, email, ...rest } = data;
  return await prisma.invitation.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    create: data,
    update: { ...rest, acceptedAt: null },
  });
}

export async function removeInvitation(id: number) {
  return await prisma.invitation.delete({ where: { id } });
}

/**
 * Accepts the invitation for `userId`: marks it accepted (guarded on it still being open, so a
 * double click cannot use it twice) and adds the membership unless the user already has one.
 * Returns false when the invitation was no longer open.
 */
export async function acceptInvitation(id: number, userId: number, now: Date) {
  return await prisma.$transaction(async (tx) => {
    const result = await tx.invitation.updateMany({
      where: { id, acceptedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });
    if (result.count !== 1) return false;
    const invitation = await tx.invitation.findUniqueOrThrow({ where: { id } });
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      create: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
      update: {},
    });
    return true;
  });
}
