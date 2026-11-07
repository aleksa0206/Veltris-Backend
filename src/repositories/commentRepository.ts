import { prisma } from '../config/prismaClient';
import { userRefSelect } from './userRepository';

const commentInclude = { author: { select: userRefSelect } } as const;

export async function findComments(taskId: number) {
  return await prisma.comment.findMany({
    where: { taskId },
    include: commentInclude,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export async function findCommentById(id: number) {
  return await prisma.comment.findUnique({ where: { id } });
}

/** Also logs a `Commented` entry, so the comment shows up in the workspace activity feed. */
export async function createComment(taskId: number, authorId: number, body: string) {
  return await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { taskId, authorId, body },
      include: commentInclude,
    });
    await tx.taskActivity.create({ data: { taskId, actorId: authorId, type: 'Commented' } });
    return comment;
  });
}

export async function updateComment(id: number, body: string) {
  return await prisma.comment.update({ where: { id }, data: { body }, include: commentInclude });
}

export async function removeComment(id: number) {
  return await prisma.comment.delete({ where: { id } });
}
