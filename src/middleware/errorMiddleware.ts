import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { TwoFactorRequiredError } from '../errors/TwoFactorRequiredError';
import { ValidationError } from '../errors/ValidationError';
import { logger } from '../config/logger';

export function errorMiddleware(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof TwoFactorRequiredError) {
    res
      .status(err.statusCode)
      .json({ error: err.message, tempToken: err.tempToken, twoFactorRequired: true });
    return;
  }

  if (err instanceof ValidationError && err.details) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 423) {
      logger.warn(
        { path: req.path, method: req.method, status: err.statusCode, userId: req.user?.userId },
        'Security-relevant denial'
      );
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A record with this value already exists' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: 'Cannot complete this action: referenced by other records' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Invalid request data' });
    return;
  }

  if (err && typeof err === 'object' && 'type' in err) {
    const bodyParserErrorType = (err as { type?: string }).type;
    if (bodyParserErrorType === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    if (bodyParserErrorType === 'entity.too.large') {
      res.status(413).json({ error: 'Request body too large' });
      return;
    }
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}
