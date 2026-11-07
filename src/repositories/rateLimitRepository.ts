import { prisma } from '../config/prismaClient';

export async function incrementOrCreate(key: string, windowMs: number) {
  const now = new Date();
  const existing = await prisma.rateLimitEntry.findUnique({ where: { key } });

  if (!existing || existing.expiresAt < now) {
    const entry = await prisma.rateLimitEntry.upsert({
      where: { key },
      create: { key, count: 1, expiresAt: new Date(now.getTime() + windowMs) },
      update: { count: 1, expiresAt: new Date(now.getTime() + windowMs) },
    });
    return entry;
  }

  return await prisma.rateLimitEntry.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
}

export async function cleanupExpired() {
  await prisma.rateLimitEntry.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
