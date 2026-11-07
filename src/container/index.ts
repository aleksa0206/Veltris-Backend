import * as emailService from '../services/emailService';
import { logger } from '../config/logger';
import { prisma } from '../config/prismaClient';

export interface Container {
  email: typeof emailService;
  logger: typeof logger;
  prisma: typeof prisma;
}

let container: Container = {
  email: emailService,
  logger,
  prisma,
};

export function getContainer(): Container {
  return container;
}

export function setContainer(overrides: Partial<Container>): void {
  container = { ...container, ...overrides };
}

export function resetContainer(): void {
  container = { email: emailService, logger, prisma };
}
