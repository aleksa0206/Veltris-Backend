import { Router } from 'express';
import { healthHandler } from '../controllers/healthController';

const router = Router();

router.get('/health', healthHandler);

export default router;
