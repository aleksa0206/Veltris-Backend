import { Router } from 'express';
import {
  addMemberHandler,
  createWorkspaceHandler,
  getMembersHandler,
  getMyWorkspacesHandler,
  getOverviewHandler,
  getWorkspaceHandler,
  renameWorkspaceHandler,
} from '../controllers/workspaceController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { addMemberSchema, workspaceSchema } from '../validation/workspaceSchemas';

const router = Router();

router.get('/workspaces', authMiddleware, getMyWorkspacesHandler);
router.post('/workspaces', authMiddleware, validate(workspaceSchema), createWorkspaceHandler);
router.get('/workspaces/:workspaceId', authMiddleware, getWorkspaceHandler);
router.put(
  '/workspaces/:workspaceId',
  authMiddleware,
  validate(workspaceSchema),
  renameWorkspaceHandler
);
router.get('/workspaces/:workspaceId/members', authMiddleware, getMembersHandler);
router.post(
  '/workspaces/:workspaceId/members',
  authMiddleware,
  validate(addMemberSchema),
  addMemberHandler
);
router.get('/workspaces/:workspaceId/overview', authMiddleware, getOverviewHandler);

export default router;
