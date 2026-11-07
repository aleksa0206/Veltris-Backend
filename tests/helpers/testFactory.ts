import bcrypt from 'bcrypt';
import { WorkspaceRole } from '@prisma/client';
import { prisma } from '../../src/config/prismaClient';

export async function createTestUser(
  params: { email?: string; password?: string; firstName?: string } = {}
) {
  const password = params.password ?? 'password123';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      firstName: params.firstName ?? 'Test',
      lastName: 'User',
      email: params.email ?? `user${Date.now()}${Math.random()}@test.com`,
      passwordHash,
    },
  });

  return { user, rawPassword: password };
}

/** A workspace owned by `ownerId`, with `members` added under the given roles. */
export async function createTestWorkspace(
  ownerId: number,
  members: Array<{ userId: number; role: WorkspaceRole }> = []
) {
  return await prisma.workspace.create({
    data: {
      name: 'Acme',
      members: { create: [{ userId: ownerId, role: 'Owner' }, ...members] },
    },
  });
}

export async function createTestProject(workspaceId: number, key = 'WEB') {
  return await prisma.project.create({ data: { workspaceId, key, name: `${key} project` } });
}
