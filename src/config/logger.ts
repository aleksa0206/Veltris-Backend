import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = isProduction
  ? pino({ level: 'info' })
  : pino({
      level: 'debug',
      transport: { target: 'pino-pretty', options: { colorize: true } },
    });
