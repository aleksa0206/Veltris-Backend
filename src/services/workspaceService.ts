import { WorkspaceRole } from '@prisma/client';
import * as workspaceRepository from '../repositories/workspaceRepository';
import * as userRepository from '../repositories/userRepository';
import * as invitationRepository from '../repositories/invitationRepository';
import { getContainer } from '../container';
import { ConflictError } from '../errors/ConflictError';
import { ForbiddenError } from '../errors/ForbiddenError';
import { NotFoundError } from '../errors/NotFoundError';
import { ValidationError } from '../errors/ValidationError';
import { generateToken, hashToken } from '../utils/tokens';

export const MANAGERS: WorkspaceRole[] = ['Owner', 'Admin'];

/**
 * The caller's membership: 404 if the workspace does not exist, 403 if they are not a member or
 * their role is not in `roles`. Every workspace-scoped read and write goes through here.
 */
export async function requireMember(workspaceId: number, userId: number, roles?: WorkspaceRole[]) {
  if (!(await workspaceRepository.findWorkspaceById(workspaceId))) {
    throw new NotFoundError('Workspace');
  }
  const membership = await workspaceRepository.findMembership(workspaceId, userId);
  if (!membership) {
    throw new ForbiddenError();
  }
  if (roles && !roles.includes(membership.role)) {
    throw new ForbiddenError('Only workspace owners and admins can do this');
  }
  return membership;
}

/** Assignees and project leads must be members of the workspace. */
export async function assertMembers(workspaceId: number, field: string, userIds: number[]) {
  const unique = [...new Set(userIds)];
  if (
    unique.length &&
    (await workspaceRepository.countMembers(workspaceId, unique)) !== unique.length
  ) {
    throw new ValidationError(`${field}: must be a member of the workspace`, [
      { path: field, message: 'must be a member of the workspace' },
    ]);
  }
}

export async function getMyWorkspaces(userId: number) {
  return await workspaceRepository.findWorkspacesForUser(userId);
}

export async function getWorkspace(workspaceId: number, userId: number) {
  const { role } = await requireMember(workspaceId, userId);
  const [workspace, members] = await Promise.all([
    workspaceRepository.findWorkspaceById(workspaceId),
    workspaceRepository.findMembers(workspaceId),
  ]);
  return { ...workspace!, role, members };
}

export async function createWorkspace(name: string, userId: number) {
  const workspace = await workspaceRepository.createWorkspace(name, userId);
  return await getWorkspace(workspace.id, userId);
}

export async function renameWorkspace(workspaceId: number, name: string, userId: number) {
  await requireMember(workspaceId, userId, MANAGERS);
  await workspaceRepository.updateWorkspace(workspaceId, { name });
  return await getWorkspace(workspaceId, userId);
}

export async function getMembers(workspaceId: number, userId: number) {
  await requireMember(workspaceId, userId);
  return await workspaceRepository.findMembers(workspaceId);
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Brings someone into the workspace by email: an existing account becomes a member at once,
 * anyone else gets an invitation link by email (inviting again renews the link).
 */
export async function inviteMember(
  workspaceId: number,
  input: { email: string; role: 'Admin' | 'Member' },
  userId: number
): Promise<{ outcome: 'added' | 'invited' }> {
  await requireMember(workspaceId, userId, MANAGERS);
  const user = await userRepository.findUserByEmail(input.email);
  if (user) {
    if (await workspaceRepository.findMembership(workspaceId, user.id)) {
      throw new ConflictError('This person is already a member of the workspace');
    }
    await workspaceRepository.addMember(workspaceId, user.id, input.role);
    return { outcome: 'added' };
  }

  const token = generateToken();
  await invitationRepository.upsertInvitation({
    workspaceId,
    email: input.email,
    role: input.role,
    tokenHash: hashToken(token),
    invitedById: userId,
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  });
  const [workspace, inviter] = await Promise.all([
    workspaceRepository.findWorkspaceById(workspaceId),
    userRepository.findById(userId),
  ]);
  await getContainer().email.sendInvitationEmail(input.email, {
    workspaceName: workspace!.name,
    inviterName: `${inviter!.firstName} ${inviter!.lastName}`,
    token,
  });
  return { outcome: 'invited' };
}

/** Owners and admins change other members between Admin and Member; ownership never moves. */
export async function changeRole(
  workspaceId: number,
  memberId: number,
  role: 'Admin' | 'Member',
  userId: number
) {
  await requireMember(workspaceId, userId, MANAGERS);
  const target = await workspaceRepository.findMembership(workspaceId, memberId);
  if (!target) {
    throw new NotFoundError('Member');
  }
  if (target.role === 'Owner') {
    throw new ForbiddenError('The owner’s role cannot be changed');
  }
  await workspaceRepository.updateMemberRole(workspaceId, memberId, role);
  return await workspaceRepository.findMembers(workspaceId);
}

/**
 * Owners and admins remove members; anyone can remove themselves (leave). The owner can do
 * neither, so a workspace always has its owner.
 */
export async function removeMember(workspaceId: number, memberId: number, userId: number) {
  const caller = await requireMember(workspaceId, userId);
  if (memberId !== userId && !MANAGERS.includes(caller.role)) {
    throw new ForbiddenError('Only workspace owners and admins can do this');
  }
  const target = await workspaceRepository.findMembership(workspaceId, memberId);
  if (!target) {
    throw new NotFoundError('Member');
  }
  if (target.role === 'Owner') {
    throw new ForbiddenError('The owner cannot leave or be removed from the workspace');
  }
  return await workspaceRepository.removeMember(workspaceId, memberId, userId);
}

export async function getInvitations(workspaceId: number, userId: number) {
  await requireMember(workspaceId, userId, MANAGERS);
  return await invitationRepository.findPendingInvitations(workspaceId, new Date());
}

export async function revokeInvitation(workspaceId: number, invitationId: number, userId: number) {
  await requireMember(workspaceId, userId, MANAGERS);
  const invitation = await invitationRepository.findInvitationById(invitationId);
  if (!invitation || invitation.workspaceId !== workspaceId) {
    throw new NotFoundError('Invitation');
  }
  return await invitationRepository.removeInvitation(invitationId);
}
