import { WorkspaceRole } from '@prisma/client';
import * as workspaceRepository from '../repositories/workspaceRepository';
import * as userRepository from '../repositories/userRepository';
import { ConflictError } from '../errors/ConflictError';
import { ForbiddenError } from '../errors/ForbiddenError';
import { NotFoundError } from '../errors/NotFoundError';
import { ValidationError } from '../errors/ValidationError';

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

/** Adds an existing account by email. Invitations for people without an account come later. */
export async function addMember(
  workspaceId: number,
  input: { email: string; role: 'Admin' | 'Member' },
  userId: number
) {
  await requireMember(workspaceId, userId, MANAGERS);
  const user = await userRepository.findUserByEmail(input.email);
  if (!user) {
    throw new NotFoundError('User');
  }
  if (await workspaceRepository.findMembership(workspaceId, user.id)) {
    throw new ConflictError('This person is already a member of the workspace');
  }
  await workspaceRepository.addMember(workspaceId, user.id, input.role);
  return await workspaceRepository.findMembers(workspaceId);
}
