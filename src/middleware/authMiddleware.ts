import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Only a real access token passes. The 2FA temp token is signed with the same secret but has
  // `purpose`; accepting it would skip the second factor.
  const claims = decoded as Record<string, unknown>;
  if (claims.purpose !== undefined || !Number.isInteger(claims.userId)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { userId: claims.userId as number };
  next();
}
