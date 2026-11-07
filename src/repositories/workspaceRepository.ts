import { Prisma, WorkspaceRole } from '@prisma/client';
import { prisma } from '../config/prismaClient';
import { userRefSelect } from './userRepository';

export async function findWorkspaceById(id: number) {
  return await prisma.workspace.findUnique({ where: { id } });
}

export async function findMembership(workspaceId: number, userId: number) {
  return await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

/** The caller's workspaces with their role, oldest membership first. */
export async function findWorkspacesForUser(userId: number) {
  const rows = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { include: { _count: { select: { members: true } } } } },
    orderBy: [{ createdAt: 'asc' }, { workspaceId: 'asc' }],
  });
  return rows.map(({ role, workspace: { _count, ...workspace } }) => ({
    ...workspace,
    role,
    memberCount: _count.members,
  }));
}

export async function findMembers(workspaceId: number) {
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { ...userRefSelect, email: true } } },
    orderBy: [{ user: { firstName: 'asc' } }, { userId: 'asc' }],
  });
  return rows.map(({ role, user }) => ({ ...user, role }));
}

/** How many of `userIds` are members of the workspace. */
export async function countMembers(workspaceId: number, userIds: number[]) {
  return await prisma.workspaceMember.count({ where: { workspaceId, userId: { in: userIds } } });
}

export async function createWorkspace(
  name: string,
  ownerId: number,
  tx: Prisma.TransactionClient = prisma
) {
  return await tx.workspace.create({
    data: { name, members: { create: { userId: ownerId, role: 'Owner' } } },
  });
}

export async function updateWorkspace(id: number, data: { name: string }) {
  return await prisma.workspace.update({ where: { id }, data });
}

export async function addMember(workspaceId: number, userId: number, role: WorkspaceRole) {
  return await prisma.workspaceMember.create({ data: { workspaceId, userId, role } });
}

export async function updateMemberRole(workspaceId: number, userId: number, role: WorkspaceRole) {
  return await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { role },
  });
}

/**
 * Removes a member. Their open tasks in the workspace become unassigned (with a history entry by
 * `actorId`) and they stop leading projects, so nothing points at someone who can no longer act.
 */
export async function removeMember(workspaceId: number, userId: number, actorId: number) {
  return await prisma.$transaction(async (tx) => {
    const assigned = await tx.task.findMany({
      where: {
        assigneeId: userId,
        status: { notIn: ['Done', 'Cancelled'] },
        project: { workspaceId },
      },
      select: { id: true },
    });
    const taskIds = assigned.map((task) => task.id);
    if (taskIds.length) {
      await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { assigneeId: null } });
      await tx.taskActivity.createMany({
        data: taskIds.map((taskId) => ({
          taskId,
          actorId,
          type: 'AssigneeChanged' as const,
          fromValue: String(userId),
          toValue: null,
        })),
      });
    }
    await tx.project.updateMany({ where: { workspaceId, leadId: userId }, data: { leadId: null } });
    await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    return { unassignedTasks: taskIds.length };
  });
}
