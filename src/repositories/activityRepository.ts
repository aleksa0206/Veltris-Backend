import { prisma } from '../config/prismaClient';
import { userRefSelect } from './userRepository';

export async function findTaskActivity(taskId: number) {
  return await prisma.taskActivity.findMany({
    where: { taskId },
    include: { actor: { select: userRefSelect } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** Latest changes anywhere in the workspace, newest first, with the task they belong to. */
export async function findRecentActivity(workspaceId: number, take: number) {
  return await prisma.taskActivity.findMany({
    where: { task: { project: { workspaceId } } },
    include: {
      actor: { select: userRefSelect },
      task: {
        select: {
          id: true,
          number: true,
          title: true,
          project: { select: { id: true, key: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
  });
}
