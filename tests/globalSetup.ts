import { prisma } from '../src/config/prismaClient';

export default async function globalSetup() {
  await prisma.rateLimitEntry.deleteMany();
  await prisma.$disconnect();
}
