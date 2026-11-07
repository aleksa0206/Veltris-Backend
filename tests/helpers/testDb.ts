import { prisma } from '../../src/config/prismaClient';

export async function cleanDatabase() {
  await prisma.rateLimitEntry.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.taskActivity.deleteMany();
  await prisma.task.deleteMany({ where: { parentId: { not: null } } });
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
