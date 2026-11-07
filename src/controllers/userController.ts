import type { Request, Response, NextFunction } from 'express';
import * as userService from '../services/userService';
import { compact } from '../utils/queryParams';

export async function updateMeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { firstName, lastName, email } = req.body;
    res.json(await userService.updateMe(req.user!.userId, compact({ firstName, lastName, email })));
  } catch (err) {
    next(err);
  }
}
