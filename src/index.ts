import { env } from './config/env';
import app from './app';
import { logger } from './config/logger';
import { prisma } from './config/prismaClient';

const port = env.PORT;

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    await prisma.$disconnect();
    logger.info('Prisma connection closed.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown: timeout exceeded.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
