import { Router } from 'express';
import { updateMeHandler } from '../controllers/userController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { updateUserSchema } from '../validation/userSchemas';

const router = Router();

router.put('/users/me', authMiddleware, validate(updateUserSchema), updateMeHandler);

export default router;
