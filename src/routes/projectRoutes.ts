import { Router } from 'express';
import {
  createProjectHandler,
  deleteProjectHandler,
  getAllProjectsHandler,
  getProjectHandler,
  updateProjectHandler,
} from '../controllers/projectController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../validation/projectSchemas';

const router = Router();

router.get('/workspaces/:workspaceId/projects', authMiddleware, getAllProjectsHandler);
router.post(
  '/workspaces/:workspaceId/projects',
  authMiddleware,
  validate(createProjectSchema),
  createProjectHandler
);
router.get('/projects/:projectId', authMiddleware, getProjectHandler);
router.put(
  '/projects/:projectId',
  authMiddleware,
  validate(updateProjectSchema),
  updateProjectHandler
);
router.delete('/projects/:projectId', authMiddleware, deleteProjectHandler);

export default router;
